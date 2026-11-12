"""Lokale proefserver voor de gedeelde agent: echte werk_een-cyclus, in-memory wachtrij, HTTP-API.

Starten (vanuit de repo-root):  python3 -m agent.demo_server   (127.0.0.1:8990)

Veiligheid van deze proef:
- Alleen een ingebouwde, fictieve voorbeeldtekst en notitie. Er wordt nooit een werkbankdocument,
  bestand of database gelezen of geschreven; de toestand bestaat alleen in het geheugen.
- Eén echte modelaanroep per opdracht, één opdracht tegelijk, hoogstens MAX_OPDRACHTEN per sessie
  (de teller blijft staan na een reset en verdwijnt pas bij een herstart van de server).
- De sleutel komt alleen uit WERKBANK_AGENT_OPENROUTER_KEY of OPENROUTER_API_KEY en wordt nooit getoond.
- Een voorstel verandert het voorbeeld pas na een expliciete beoordeling 'goedgekeurd'.
- Luistert alleen op 127.0.0.1; elke schrijfactie vraagt de lokale Origin en de header X-Werkbank-Lokaal.
"""
import argparse
import json
import math
import os
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import cast
from urllib.parse import urlsplit

if __package__ in (None, ''):  # direct gestart als script: maak 'agent' importeerbaar
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent.gedeelde_agent import AgentFout, STANDAARD_MODEL, TOEGESTANE_MODELLEN, bereid_voor, vraag_model  # noqa: E402
from agent.werker import werk_een  # noqa: E402

POORT = 8990
MAX_OPDRACHTEN = 10
LEASE_SECONDEN = 180
MAX_BODY = 4096
TOEGESTANE_ORIGINS = frozenset({'http://localhost:8982', 'http://127.0.0.1:8982'})
PAD = '/api/agent-proef/'

DOCUMENT_ID = 12
NOTITIE_ID = 8
DOCUMENT_PAD = 'proef/voorbeeld.md'  # fictief; geen echt pad
DOCUMENT_TEKST = 'Een belegger kiest eerst zijn doel. Daarna kiest hij een voertuig.'
NOTITIE_TEKST = 'Herschrijf de geselecteerde zin helder in de je-vorm, zonder nieuwe feiten toe te voegen.'
NOTITIE_ANKER = 'Een belegger kiest eerst zijn doel.'

# Zelfde grenzen en codes als werkbank_private.agent_klaar en agent_fout in de migratie.
MAX_KOST, MAX_TOKENS_IN, MAX_TOKENS_UIT = 0.25, 20000, 1000
FOUTCODES = frozenset({'vertrouwelijk_geweigerd', 'notitie_hoort_niet_bij_document', 'anker_vereist', 'anker_niet_uniek',
                       'ongeldige_opdracht', 'ongeldige_uitvoer', 'tekst_niet_uniek', 'modelsleutel_ontbreekt',
                       'model_niet_toegelaten', 'model_fout', 'timeout', 'budget_op', 'limiet_bereikt',
                       'redirect_geweigerd', 'interne_fout'})
BESLUITEN = ('goedgekeurd', 'afgewezen')


class DemoWeigering(Exception):
    """Een bekende weigering: alleen een code en een HTTP-status, nooit ruwe foutteksten."""
    def __init__(self, code, status=409):
        self.code = code
        self.status = status
        super().__init__(code)


def _eenmaal(inhoud, fragment):
    # Zelfde regel als de agent: overlappende treffers tellen als dubbel.
    eerste = inhoud.find(fragment) if fragment else -1
    return eerste >= 0 and inhoud.find(fragment, eerste + 1) < 0


def _iso(tijd):
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(tijd))


def _kost_ok(waarde):
    return (isinstance(waarde, (int, float)) and not isinstance(waarde, bool) and math.isfinite(waarde)
            and 0 <= waarde <= MAX_KOST)


def _tokens_ok(waarde, maximum):
    return type(waarde) is int and 0 <= waarde <= maximum


class DemoWachtrij:
    """In-memory wachtrij met de interface van PostgresWachtrij (claim, klaar, fout) plus de proef-API.

    Alle toestand staat achter één lock. Het model wordt nooit onder de lock aangeroepen, zodat
    statusverzoeken tijdens een opdracht blijven antwoorden.
    """

    def __init__(self, model, klok=time.time, maximum=MAX_OPDRACHTEN):
        if not callable(model):
            raise TypeError('model moet aanroepbaar zijn')
        self._model = model
        self._klok = klok
        self._maximum = maximum
        self._lock = threading.RLock()
        self._volgende_opdracht = 1
        self._volgend_voorstel = 1
        self._gestart = 0
        self._draad = None
        self._zet_terug()

    def _zet_terug(self):
        self._document = {'inhoud': DOCUMENT_TEKST, 'versie': 1}
        self._opdracht = None
        self._voorstel = None

    # --- PostgresWachtrij-interface -------------------------------------------------------------

    def claim(self):
        with self._lock:
            self._verval()
            taak = self._opdracht
            if taak is None or taak['status'] != 'wachtrij':
                return None
            nu = self._klok()
            taak.update(status='bezig', poging=taak['poging'] + 1, claim_token=uuid.uuid4().hex, lease_tot=nu + LEASE_SECONDEN)
            return {'opdracht_id': taak['id'], 'claim_token': taak['claim_token'], 'notitie_id': taak['notitie_id'],
                    'document_id': taak['document_id'], 'document_versie': taak['document_versie'],
                    'opmerking': taak['_opmerking'], 'anker': taak['_anker'],
                    'document_pad': DOCUMENT_PAD, 'document_inhoud': taak['_inhoud']}

    def klaar(self, opdracht, voorstel, gebruik):
        with self._lock:
            taak = self._eigen_claim(opdracht)
            if not (_kost_ok(gebruik.get('cost')) and _tokens_ok(gebruik.get('tokens_in'), MAX_TOKENS_IN)
                    and _tokens_ok(gebruik.get('tokens_uit'), MAX_TOKENS_UIT)):
                self._sluit(taak, 'mislukt', 'kosten_onbekend_of_te_hoog')
                return 'mislukt'
            if gebruik.get('model') not in TOEGESTANE_MODELLEN or voorstel.get('soort') not in ('wijziging', 'antwoord'):
                raise AgentFout('ongeldige_uitvoer')
            record = {'id': self._volgend_voorstel, 'opdracht_id': taak['id'], 'soort': voorstel['soort'],
                      'oorspronkelijk': voorstel['oorspronkelijk'], 'voorstel': voorstel['voorstel'],
                      'uitleg': voorstel['uitleg'], 'bronstatus': voorstel['bronstatus'], 'status': 'voorgesteld'}
            self._volgend_voorstel += 1
            self._voorstel = record
            taak.update(voorstel_id=record['id'], model=gebruik['model'], tokens_in=gebruik['tokens_in'],
                        tokens_uit=gebruik['tokens_uit'], kost_usd=gebruik['cost'])
            self._sluit(taak, 'klaar')
            return 'klaar'

    def fout(self, opdracht, code):
        with self._lock:
            taak = self._eigen_claim(opdracht)
            self._sluit(taak, 'mislukt', code if code in FOUTCODES else 'interne_fout')

    # --- hulpfuncties (alleen onder de lock) ----------------------------------------------------

    def _actief(self):
        return self._opdracht is not None and self._opdracht['status'] in ('wachtrij', 'bezig')

    def _verval(self):
        taak = self._opdracht
        if taak is not None and taak['status'] == 'bezig' and taak['lease_tot'] <= self._klok():
            self._sluit(taak, 'mislukt', 'lease_verlopen')

    def _sluit(self, taak, status, fout_code=None):
        taak.update(status=status, fout_code=fout_code, claim_token=None, lease_tot=None, klaar_op=_iso(self._klok()))

    def _eigen_claim(self, opdracht):
        self._verval()
        taak = self._opdracht
        if (taak is None or taak['id'] != opdracht.get('opdracht_id') or taak['status'] != 'bezig'
                or taak['claim_token'] is None or taak['claim_token'] != opdracht.get('claim_token')):
            raise RuntimeError('claim_verlopen')
        return taak

    def _maak_opdracht(self, notitie_id=None, document_id=None):
        with self._lock:
            for gevraagd, echt in ((notitie_id, NOTITIE_ID), (document_id, DOCUMENT_ID)):
                if gevraagd is not None and (type(gevraagd) is not int or gevraagd != echt):
                    raise DemoWeigering('ongeldige_opdracht', 400)
            self._verval()
            if self._actief():
                raise DemoWeigering('bezig', 409)
            if self._gestart >= self._maximum:
                raise DemoWeigering('limiet_bereikt', 429)
            try:  # dezelfde controle als bij het aanvragen in de database: een ongeldige opdracht komt niet in de wachtrij
                bereid_voor({'id': NOTITIE_ID, 'doel_type': 'document', 'doel_id': str(DOCUMENT_ID), 'tekst': NOTITIE_TEKST, 'anker': NOTITIE_ANKER},
                            {'id': DOCUMENT_ID, 'pad': DOCUMENT_PAD, 'inhoud': self._document['inhoud'], 'versie': self._document['versie'],
                             'agent_toegelaten': True, 'vertrouwelijkheid': 'intern'})
            except AgentFout as fout:
                raise DemoWeigering(fout.code, 422)
            opdracht_id = self._volgende_opdracht
            self._volgende_opdracht += 1
            self._gestart += 1
            self._voorstel = None
            self._opdracht = {'id': opdracht_id, 'notitie_id': NOTITIE_ID, 'document_id': DOCUMENT_ID,
                              'document_versie': self._document['versie'], 'status': 'wachtrij', 'poging': 0,
                              'claim_token': None, 'lease_tot': None, 'fout_code': None, 'voorstel_id': None,
                              'model': None, 'tokens_in': None, 'tokens_uit': None, 'kost_usd': None,
                              'created_at': _iso(self._klok()), 'klaar_op': None,
                              '_opmerking': NOTITIE_TEKST, '_anker': NOTITIE_ANKER, '_inhoud': self._document['inhoud']}
            return opdracht_id

    def _werk(self, opdracht_id):
        try:
            werk_een(self, self._model)
        except Exception:
            # Een werker die zelf struikelt (bijvoorbeeld een verlopen claim) mag de proef niet blokkeren.
            with self._lock:
                taak = self._opdracht
                if taak is not None and taak['id'] == opdracht_id and taak['status'] in ('wachtrij', 'bezig'):
                    self._sluit(taak, 'mislukt', 'interne_fout')

    def _opdracht_json(self):
        taak = self._opdracht
        if taak is None:
            return None
        voorstel = self._voorstel or {}
        if voorstel.get('opdracht_id') != taak['id']:
            voorstel = {}  # nog geen voorstel bij deze opdracht
        besluit = voorstel.get('status') if voorstel.get('status') in ('toegepast', 'afgewezen') else None
        return {'id': taak['id'], 'notitie_id': taak['notitie_id'], 'document_id': taak['document_id'],
                'document_versie': taak['document_versie'], 'status': taak['status'],
                'voorstel_id': voorstel.get('id'), 'soort': voorstel.get('soort'),
                'oorspronkelijk': voorstel.get('oorspronkelijk'), 'voorstel': voorstel.get('voorstel'),
                'uitleg': voorstel.get('uitleg'), 'bronstatus': voorstel.get('bronstatus'),
                'beoordeling': {'besluit': besluit} if besluit else None,
                'fout_code': taak['fout_code'], 'model': taak['model'], 'tokens_in': taak['tokens_in'],
                'tokens_uit': taak['tokens_uit'], 'kost_usd': taak['kost_usd'],
                'created_at': taak['created_at'], 'klaar_op': taak['klaar_op']}

    # --- proef-API ------------------------------------------------------------------------------

    def start(self, notitie_id=None, document_id=None):
        """Zet één opdracht klaar en laat een achtergronddraad hem met werk_een afhandelen."""
        with self._lock:
            opdracht_id = self._maak_opdracht(notitie_id, document_id)
            try:
                draad = threading.Thread(target=self._werk, args=(opdracht_id,), name='agent-proef-%d' % opdracht_id, daemon=True)
                draad.start()
            except RuntimeError:
                self._opdracht = None
                self._gestart -= 1
                raise DemoWeigering('interne_fout', 500)
            self._draad = draad
            return opdracht_id

    def status(self):
        with self._lock:
            self._verval()
            return {'beschikbaar': True,
                    'document': {'id': DOCUMENT_ID, 'inhoud': self._document['inhoud'], 'versie': self._document['versie']},
                    'notitie': {'id': NOTITIE_ID, 'tekst': NOTITIE_TEKST, 'anker': NOTITIE_ANKER},
                    'opdracht': self._opdracht_json(),
                    'resterend': max(0, self._maximum - self._gestart)}

    def beoordeel(self, voorstel_id, besluit):
        """Alleen een expliciete beslissing van een mens past het voorbeeld aan. Geeft 'toegepast' of 'afgewezen'."""
        if besluit not in BESLUITEN or type(voorstel_id) is not int or voorstel_id <= 0:
            raise DemoWeigering('ongeldige_beoordeling', 400)
        with self._lock:
            self._verval()
            voorstel, taak = self._voorstel, self._opdracht
            if voorstel is None or taak is None or voorstel['id'] != voorstel_id or voorstel['opdracht_id'] != taak['id']:
                raise DemoWeigering('voorstel_onbekend', 404)
            if voorstel['status'] != 'voorgesteld':
                raise DemoWeigering('voorstel_al_beoordeeld', 409)
            if voorstel['soort'] != 'wijziging':
                raise DemoWeigering('geen_tekstvoorstel', 409)
            if besluit == 'afgewezen':
                voorstel['status'] = 'afgewezen'
                return 'afgewezen'
            inhoud, oud = self._document['inhoud'], voorstel['oorspronkelijk']
            if self._document['versie'] != taak['document_versie'] or not _eenmaal(inhoud, oud):
                raise DemoWeigering('document_gewijzigd', 409)
            self._document = {'inhoud': inhoud.replace(oud, voorstel['voorstel'], 1), 'versie': self._document['versie'] + 1}
            voorstel['status'] = 'toegepast'
            return 'toegepast'

    def reset(self):
        """Herstelt voorbeeldtekst en resultaat. Weigert zolang er een opdracht loopt; de teller blijft staan."""
        with self._lock:
            self._verval()
            if self._actief():
                raise DemoWeigering('bezig', 409)
            self._zet_terug()
            return self.status()


class DemoHandler(BaseHTTPRequestHandler):
    server_version = 'WerkbankAgentProef'
    sys_version = ''
    timeout = 15

    def log_message(self, format, *args):
        pass  # geen verzoeken, teksten of sleutels in de serverlog

    @property
    def proef(self):
        return cast('DemoServer', self.server).proef

    def _origin(self):
        origin = self.headers.get('Origin')
        return origin if origin in TOEGESTANE_ORIGINS else None

    def _antwoord(self, code, payload=None):
        data = b'' if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        if code != 204:  # een 204 heeft per definitie geen body en geen Content-Length
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        origin = self._origin()
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        if code == 204:
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Werkbank-Lokaal')
            self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()
        if data:
            self.wfile.write(data)

    def _toegestaan(self, schrijvend):
        """Alleen lokale hosts (tegen DNS-rebinding) en alleen de lokale werkbank als Origin."""
        if self.headers.get('Host', '').split(':', 1)[0].lower() not in ('localhost', '127.0.0.1'):
            return False
        origin = self.headers.get('Origin')
        if origin is not None and origin not in TOEGESTANE_ORIGINS:
            return False
        if schrijvend and (origin is None or self.headers.get('X-Werkbank-Lokaal') != '1'):
            return False
        return True

    def _lees_json(self):
        """Een optionele, kleine JSON-body. Geeft None bij geen body; anders de gedecodeerde waarde."""
        if self.headers.get('Transfer-Encoding'):
            raise DemoWeigering('ongeldig_verzoek', 400)
        try:
            lengte = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            raise DemoWeigering('ongeldig_verzoek', 400)
        if lengte < 0:
            raise DemoWeigering('ongeldig_verzoek', 400)
        if lengte > MAX_BODY:
            raise DemoWeigering('te_groot', 413)
        ruw = self.rfile.read(lengte) if lengte else b''
        if not ruw.strip():
            return None
        if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
            raise DemoWeigering('ongeldig_verzoek', 400)
        try:
            return json.loads(ruw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            raise DemoWeigering('ongeldig_verzoek', 400)

    def _pad(self):
        return urlsplit(self.path).path

    def do_OPTIONS(self):
        if not self._toegestaan(False) or self._origin() is None:
            return self._antwoord(403, {'fout': 'geweigerd'})
        return self._antwoord(204)

    def do_GET(self):
        if not self._toegestaan(False):
            return self._antwoord(403, {'fout': 'geweigerd'})
        if self._pad() != PAD + 'status':
            return self._antwoord(404, {'fout': 'niet_gevonden'})
        try:
            return self._antwoord(200, self.proef.status())
        except Exception:
            return self._antwoord(500, {'fout': 'interne_fout'})

    def do_POST(self):
        if not self._toegestaan(True):
            return self._antwoord(403, {'fout': 'geweigerd'})
        actie = self._pad()[len(PAD):] if self._pad().startswith(PAD) else ''
        if actie not in ('start', 'beoordeel', 'reset'):
            return self._antwoord(404, {'fout': 'niet_gevonden'})
        try:
            body = self._lees_json()
            if actie == 'start':
                if body is not None and not isinstance(body, dict):
                    raise DemoWeigering('ongeldig_verzoek', 400)
                body = body or {}
                return self._antwoord(202, {'opdracht_id': self.proef.start(body.get('notitieId'), body.get('documentId'))})
            if actie == 'beoordeel':
                if not isinstance(body, dict):
                    raise DemoWeigering('ongeldige_beoordeling', 400)
                return self._antwoord(200, {'besluit': self.proef.beoordeel(body.get('voorstelId'), body.get('besluit'))})
            try:
                return self._antwoord(200, self.proef.reset())
            except DemoWeigering as fout:  # lopende opdracht: niets gewijzigd, wel het echte statusobject terug
                return self._antwoord(fout.status, dict(self.proef.status(), fout=fout.code))
        except DemoWeigering as fout:
            return self._antwoord(fout.status, {'fout': fout.code})
        except Exception:
            return self._antwoord(500, {'fout': 'interne_fout'})  # nooit ruwe foutteksten


class DemoServer(ThreadingHTTPServer):
    def __init__(self, poort, proef):
        self.proef = proef
        super().__init__(('127.0.0.1', poort), DemoHandler)


def maak_server(poort=POORT, model=None, klok=time.time):
    """Bindt alleen loopback en start nooit zonder expliciet model (in main: de echte vraag_model)."""
    if model is None:
        raise RuntimeError('De agentproef is niet vrijgegeven zonder expliciet opgegeven model.')
    return DemoServer(poort, DemoWachtrij(model, klok=klok))


def maak_model(omgeving, vraag=vraag_model):
    """Echte modelaanroep met de sleutel uit de omgeving; None als sleutel of model niet toegelaten is."""
    sleutel = (omgeving.get('WERKBANK_AGENT_OPENROUTER_KEY') or '').strip() or (omgeving.get('OPENROUTER_API_KEY') or '').strip()
    modelnaam = omgeving.get('WERKBANK_AGENT_MODEL') or STANDAARD_MODEL
    if not sleutel or modelnaam not in TOEGESTANE_MODELLEN:
        return None

    def model(voorbereid):
        return vraag(voorbereid, sleutel, model=modelnaam)
    return model


def main(argv=None, omgeving=None):
    parser = argparse.ArgumentParser(description='Lokale agentproef voor de Archer-werkbank (fictieve voorbeeldtekst)')
    parser.add_argument('--poort', type=int, default=POORT, help='poort op 127.0.0.1 (standaard %d)' % POORT)
    opties = parser.parse_args(argv)
    if not 0 <= opties.poort <= 65535:
        print('Proefserver niet gestart: ongeldige poort.', file=sys.stderr)
        return 2
    model = maak_model(os.environ if omgeving is None else omgeving)
    if model is None:
        print('Proefserver niet gestart: zet WERKBANK_AGENT_OPENROUTER_KEY (of OPENROUTER_API_KEY) en, '
              'als je dit instelt, een toegelaten WERKBANK_AGENT_MODEL.', file=sys.stderr)
        return 2
    try:
        server = maak_server(opties.poort, model=model)
    except OSError:
        print('Proefserver niet gestart: poort %d is niet beschikbaar.' % opties.poort, file=sys.stderr)
        return 1
    print('Lokale agentproef actief op 127.0.0.1:%d. Fictieve voorbeeldtekst, geen database, hoogstens %d echte opdrachten.'
          % (server.server_port, MAX_OPDRACHTEN), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
