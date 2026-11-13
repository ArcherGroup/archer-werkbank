"""Gedeelde commentaarwerker. Standaard niet gestart en niet met productie verbonden."""
import argparse
import os
import re
import subprocess
import sys
import time
from decimal import Decimal
from urllib.parse import parse_qs, unquote, urlsplit
from agent.gedeelde_agent import (AgentFout, STANDAARD_MODEL, TOEGESTANE_MODELLEN,
                                  bereid_voor, beoordeel_voorstel, vraag_model)


def lees_keychain(service, run=subprocess.run):
    if service not in ('archer-werkbank-agent-database', 'archer-werkbank-agent-model'):
        return ''
    try:
        resultaat = run(['/usr/bin/security', 'find-generic-password', '-a', 'werkbank-agent', '-s', service, '-w'],
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15, check=False)
        if resultaat.returncode != 0:
            return ''
        waarde = resultaat.stdout
        return (waarde[:-1] if waarde.endswith(b'\n') else waarde).decode('utf-8')
    except (OSError, UnicodeDecodeError, subprocess.TimeoutExpired):
        return ''


def veilige_database_url(url):
    try:
        adres = urlsplit(url)
        opties = parse_qs(adres.query, keep_blank_values=True, strict_parsing=True)
        gebruiker = unquote(adres.username or '')
        host = adres.hostname or ''
        direct = bool(re.fullmatch(r'db\.[a-z0-9-]+\.supabase\.co', host)) and gebruiker == 'werkbank_agent'
        pooler = bool(re.fullmatch(r'[a-z0-9-]+\.pooler\.supabase\.com', host)) and bool(re.fullmatch(r'werkbank_agent\.[a-z0-9]+', gebruiker))
        return bool(adres.scheme in ('postgres', 'postgresql') and (direct or pooler) and adres.password and
                    adres.path == '/postgres' and not adres.fragment and 0 < (adres.port or 5432) <= 65535 and
                    set(opties).issubset({'sslmode', 'sslrootcert', 'connect_timeout', 'application_name'}) and
                    opties.get('sslmode') == ['verify-full'] and all(len(x) == 1 for x in opties.values()))
    except (TypeError, ValueError):
        return False


class PostgresWachtrij:
    """Alleen de drie private databasefuncties; nooit directe tabelrechten."""
    def __init__(self, verbinding):
        self.verbinding = verbinding

    def claim(self):
        with self.verbinding.transaction():
            cursor = self.verbinding.execute('select * from werkbank_private.agent_claim()')
            rij = cursor.fetchone()
            return dict(zip((kolom.name for kolom in cursor.description), rij)) if rij else None

    def klaar(self, opdracht, voorstel, gebruik):
        kost = gebruik.get('cost')
        kost = Decimal(str(kost)) if kost is not None else None
        with self.verbinding.transaction():
            return self.verbinding.execute(
                'select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (opdracht['opdracht_id'], opdracht['claim_token'], voorstel['soort'], voorstel['oorspronkelijk'],
                 voorstel['voorstel'], voorstel['uitleg'], gebruik.get('model'), gebruik.get('tokens_in'),
                 gebruik.get('tokens_uit'), kost)).fetchone()[0]

    def fout(self, opdracht, code):
        with self.verbinding.transaction():
            self.verbinding.execute('select werkbank_private.agent_fout(%s,%s,%s)',
                                    (opdracht['opdracht_id'], opdracht['claim_token'], code))


def werk_een(wachtrij, model):
    opdracht = wachtrij.claim()
    if opdracht is None:
        return 'leeg'
    try:
        document = {'id': opdracht['document_id'], 'pad': opdracht['document_pad'],
                    'inhoud': opdracht['document_inhoud'], 'versie': opdracht['document_versie'],
                    'agent_toegelaten': True, 'vertrouwelijkheid': 'intern'}
        notitie = {'id': opdracht['notitie_id'], 'doel_type': 'document',
                   'doel_id': str(opdracht['document_id']), 'tekst': opdracht['opmerking'], 'anker': opdracht['anker'],
                   'gesprek': opdracht.get('gesprek'), 'gesprek_sha256': opdracht.get('gesprek_sha256'),
                   'anker_context': opdracht.get('anker_context')}
        voorbereid = bereid_voor(notitie, document)
        gebruik = model(voorbereid)
        voorstel = beoordeel_voorstel(voorbereid, document['inhoud'], gebruik['tekst'])
        return wachtrij.klaar(opdracht, voorstel, gebruik)
    except AgentFout as fout:
        wachtrij.fout(opdracht, fout.code)
        return 'mislukt'
    except Exception:
        wachtrij.fout(opdracht, 'interne_fout')
        return 'mislukt'


def main(argv=None):
    parser = argparse.ArgumentParser(description='Gedeelde commentaarwerker voor de Archer-werkbank')
    parser.add_argument('--eenmaal', action='store_true', help='verwerk maximaal één opdracht en stop')
    parser.add_argument('--keychain', action='store_true', help='lees de twee geheime waarden uit de macOS-sleutelhanger')
    parser.add_argument('--interval', type=int, default=15, help='seconden tussen lege controles (5–300)')
    opties = parser.parse_args(argv)
    dsn = lees_keychain('archer-werkbank-agent-database') if opties.keychain else os.environ.get('WERKBANK_AGENT_DATABASE_URL', '')
    sleutel = lees_keychain('archer-werkbank-agent-model') if opties.keychain else os.environ.get('WERKBANK_AGENT_OPENROUTER_KEY', '')
    model = os.environ.get('WERKBANK_AGENT_MODEL', STANDAARD_MODEL)
    if not veilige_database_url(dsn) or not sleutel or model not in TOEGESTANE_MODELLEN or not 5 <= opties.interval <= 300:
        print('Werker niet gestart: aparte databaseverbinding, modelsleutel of veilige instellingen ontbreken.', file=sys.stderr)
        return 2
    try:
        import psycopg
    except ImportError:
        print('Werker niet gestart: installeer agent/requirements.txt.', file=sys.stderr)
        return 2
    try:
        with psycopg.connect(dsn, connect_timeout=10) as db:
            with db.transaction():
                rol, sessie = db.execute('select current_user, session_user').fetchone()
            if rol != 'werkbank_agent' or sessie != 'werkbank_agent' or not db.pgconn.ssl_in_use:
                print('Werker niet gestart: database-identiteit of TLS klopt niet.', file=sys.stderr)
                return 2
            wachtrij = PostgresWachtrij(db)
            while True:
                status = werk_een(wachtrij, lambda opdracht: vraag_model(opdracht, sleutel, model=model))
                if status != 'leeg':
                    print('Opdrachtstatus:', status, flush=True)
                if opties.eenmaal:
                    return 1 if status == 'mislukt' else 0
                time.sleep(opties.interval)
    except KeyboardInterrupt:
        return 0
    except Exception:
        # Nooit ruwe databasefouten tonen: die kunnen verbindingen of inhoud bevatten.
        print('Werker gepauzeerd: controleer verbinding en veiligheidsvoorwaarden.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
