"""Lokale agentproef: echte werk_een-cyclus, in-memory wachtrij, HTTP-API.

Geen netwerk, geen database, geen echte modelcall: het model is overal geinjecteerd.
"""
import contextlib
import http.client
import io
import json
import threading
import time
import unittest
from typing import Any, Tuple

from agent import demo_server, gedeelde_agent
from agent.gedeelde_agent import AgentFout
from agent.werker import werk_een

ORIGIN = 'http://localhost:8982'
ANKER = 'Een belegger kiest eerst zijn doel.'
ORIGINEEL = 'Een belegger kiest eerst zijn doel. Daarna kiest hij een voertuig.'
VOORSTEL = 'Je kiest eerst je doel.'


def gebruik(tekst, **extra):
    resultaat = {'tekst': tekst, 'model': gedeelde_agent.STANDAARD_MODEL, 'cost': 0.0004, 'tokens_in': 300, 'tokens_uit': 60}
    resultaat.update(extra)
    return resultaat


def wijziging(oud=ANKER, nieuw=VOORSTEL):
    return json.dumps({'soort': 'wijziging', 'oorspronkelijk': oud, 'voorstel': nieuw, 'uitleg': 'Directer, in de je-vorm.'})


def goed_model(voorbereid):
    return gebruik(wijziging())


def antwoord_model(voorbereid):
    return gebruik(json.dumps({'soort': 'antwoord', 'oorspronkelijk': '', 'voorstel': '', 'uitleg': 'Dit kan ik zo niet verbeteren.'}))


class SlotModel:
    """Houdt een opdracht in 'bezig' tot de test hem vrijgeeft."""
    def __init__(self):
        self.binnen = threading.Event()
        self.vrij = threading.Event()
        self.aanroepen = 0

    def __call__(self, voorbereid):
        self.aanroepen += 1
        self.binnen.set()
        assert self.vrij.wait(10), 'test gaf het model niet vrij'
        return gebruik(wijziging())


def wacht_op_einde(proef, timeout=5):
    einde = time.time() + timeout
    while time.time() < einde:
        opdracht = proef.status()['opdracht']
        if opdracht and opdracht['status'] in ('klaar', 'mislukt'):
            return opdracht
        time.sleep(0.01)
    raise AssertionError('opdracht werd niet afgerond: %r' % (proef.status()['opdracht'],))


class WachtrijTest(unittest.TestCase):
    def test_beginstatus_is_synthetisch_en_zonder_opdracht(self):
        status = demo_server.DemoWachtrij(goed_model).status()
        self.assertTrue(status['beschikbaar'])
        self.assertEqual(status['document'], {'id': 12, 'inhoud': ORIGINEEL, 'versie': 1})
        self.assertEqual(status['notitie'], {'id': 8, 'anker': ANKER,
                         'tekst': 'Herschrijf de geselecteerde zin helder in de je-vorm, zonder nieuwe feiten toe te voegen.'})
        self.assertIsNone(status['opdracht'])
        self.assertEqual(status['resterend'], 10)

    def test_succesvolle_cyclus_via_echte_werk_een(self):
        proef = demo_server.DemoWachtrij(goed_model)
        opdracht_id = proef.start()
        self.assertIsInstance(opdracht_id, int)
        opdracht = wacht_op_einde(proef)
        self.assertEqual(opdracht['id'], opdracht_id)
        self.assertEqual(opdracht['status'], 'klaar')
        self.assertEqual((opdracht['notitie_id'], opdracht['document_id'], opdracht['document_versie']), (8, 12, 1))
        self.assertEqual(opdracht['soort'], 'wijziging')
        self.assertEqual((opdracht['oorspronkelijk'], opdracht['voorstel']), (ANKER, VOORSTEL))
        self.assertEqual(opdracht['bronstatus'], 'niet_opgezocht')
        self.assertIsInstance(opdracht['voorstel_id'], int)
        self.assertIsNone(opdracht['beoordeling'])
        self.assertEqual(proef.status()['resterend'], 9)

    def test_werk_een_en_wachtrij_hebben_dezelfde_interface_als_de_werker(self):
        proef = demo_server.DemoWachtrij(goed_model)
        self.assertEqual(werk_een(proef, goed_model), 'leeg')
        proef._maak_opdracht()  # zonder thread: de test draait werk_een zelf
        self.assertEqual(werk_een(proef, goed_model), 'klaar')
        self.assertEqual(proef.status()['opdracht']['status'], 'klaar')

    def test_claim_klaar_en_fout_volgen_de_postgres_interface_en_eisen_het_juiste_token(self):
        proef = demo_server.DemoWachtrij(goed_model)
        self.assertIsNone(proef.claim())  # niets in de wachtrij
        opdracht_id = proef._maak_opdracht()
        opdracht = proef.claim()
        for sleutel in ('opdracht_id', 'claim_token', 'notitie_id', 'document_id', 'document_versie',
                        'opmerking', 'anker', 'document_pad', 'document_inhoud'):
            self.assertIn(sleutel, opdracht)
        self.assertEqual((opdracht['opdracht_id'], opdracht['document_inhoud']), (opdracht_id, ORIGINEEL))
        self.assertIsNone(proef.claim())  # een opdracht wordt maar een keer geclaimd
        self.assertNotIn(opdracht['claim_token'], json.dumps(proef.status()))  # het token blijft intern
        voorstel = {'soort': 'antwoord', 'oorspronkelijk': '', 'voorstel': '', 'uitleg': 'Ok.', 'bronstatus': 'niet_opgezocht'}
        fout_token = dict(opdracht, claim_token='verkeerd')
        with self.assertRaisesRegex(RuntimeError, 'claim_verlopen'):
            proef.klaar(fout_token, voorstel, gebruik('{}'))
        with self.assertRaisesRegex(RuntimeError, 'claim_verlopen'):
            proef.fout(fout_token, 'timeout')
        self.assertEqual(proef.status()['opdracht']['status'], 'bezig')
        proef.fout(opdracht, 'niet_bestaande_code')  # onbekende codes worden interne_fout, zoals in de database
        self.assertEqual(proef.status()['opdracht']['fout_code'], 'interne_fout')
        with self.assertRaisesRegex(RuntimeError, 'claim_verlopen'):  # een afgesloten claim kan niet opnieuw schrijven
            proef.klaar(opdracht, voorstel, gebruik('{}'))

    def test_modelfout_geeft_echte_foutcode_en_geen_verzonnen_voorstel(self):
        def kapot(voorbereid):
            raise AgentFout('timeout')
        proef = demo_server.DemoWachtrij(kapot)
        proef.start()
        opdracht = wacht_op_einde(proef)
        self.assertEqual((opdracht['status'], opdracht['fout_code']), ('mislukt', 'timeout'))
        self.assertIsNone(opdracht['voorstel_id'])
        self.assertIsNone(opdracht['voorstel'])
        self.assertEqual(proef.status()['document']['inhoud'], ORIGINEEL)

    def test_onverwachte_fout_en_ongeldige_uitvoer_krijgen_veilige_codes(self):
        def explosie(voorbereid):
            raise ValueError('geheim detail dat niet getoond mag worden')
        proef = demo_server.DemoWachtrij(explosie)
        proef.start()
        opdracht = wacht_op_einde(proef)
        self.assertEqual(opdracht['fout_code'], 'interne_fout')
        self.assertNotIn('geheim', json.dumps(proef.status()))
        proef = demo_server.DemoWachtrij(lambda v: gebruik('geen json'))
        proef.start()
        self.assertEqual(wacht_op_einde(proef)['fout_code'], 'ongeldige_uitvoer')
        proef = demo_server.DemoWachtrij(lambda v: gebruik(wijziging('Staat er niet.', 'Iets.')))
        proef.start()
        self.assertEqual(wacht_op_einde(proef)['fout_code'], 'tekst_niet_uniek')

    def test_onbekende_of_te_hoge_kosten_mislukken_zoals_in_de_database(self):
        for extra in ({'cost': None}, {'cost': 0.5}, {'tokens_uit': 5000}, {'tokens_in': None}):
            proef = demo_server.DemoWachtrij(lambda v, extra=extra: gebruik(wijziging(), **extra))
            proef.start()
            opdracht = wacht_op_einde(proef)
            self.assertEqual((opdracht['status'], opdracht['fout_code']), ('mislukt', 'kosten_onbekend_of_te_hoog'), extra)
            self.assertIsNone(opdracht['voorstel_id'])

    def test_een_voorstel_wordt_nooit_automatisch_toegepast(self):
        proef = demo_server.DemoWachtrij(goed_model)
        proef.start()
        wacht_op_einde(proef)
        time.sleep(0.05)
        status = proef.status()
        self.assertEqual(status['document'], {'id': 12, 'inhoud': ORIGINEEL, 'versie': 1})
        self.assertIsNone(status['opdracht']['beoordeling'])

    def test_expliciete_goedkeuring_past_precies_een_keer_toe(self):
        proef = demo_server.DemoWachtrij(goed_model)
        proef.start()
        voorstel_id = wacht_op_einde(proef)['voorstel_id']
        self.assertEqual(proef.beoordeel(voorstel_id, 'goedgekeurd'), 'toegepast')
        status = proef.status()
        self.assertEqual(status['document'], {'id': 12, 'inhoud': VOORSTEL + ' Daarna kiest hij een voertuig.', 'versie': 2})
        self.assertEqual(status['opdracht']['beoordeling'], {'besluit': 'toegepast'})
        with self.assertRaises(demo_server.DemoWeigering) as ctx:
            proef.beoordeel(voorstel_id, 'goedgekeurd')
        self.assertEqual(ctx.exception.code, 'voorstel_al_beoordeeld')
        self.assertEqual(proef.status()['document']['versie'], 2)

    def test_afwijzing_laat_het_document_ongemoeid(self):
        proef = demo_server.DemoWachtrij(goed_model)
        proef.start()
        voorstel_id = wacht_op_einde(proef)['voorstel_id']
        self.assertEqual(proef.beoordeel(voorstel_id, 'afgewezen'), 'afgewezen')
        status = proef.status()
        self.assertEqual(status['document'], {'id': 12, 'inhoud': ORIGINEEL, 'versie': 1})
        self.assertEqual(status['opdracht']['beoordeling'], {'besluit': 'afgewezen'})

    def test_goedkeuren_weigert_als_het_document_ondertussen_wijzigde(self):
        proef = demo_server.DemoWachtrij(goed_model)
        proef.start()
        voorstel_id = wacht_op_einde(proef)['voorstel_id']
        for nieuw in ({'inhoud': ORIGINEEL + ' Extra zin.', 'versie': 2},      # andere versie
                      {'inhoud': ORIGINEEL + ' ' + ANKER, 'versie': 1}):       # zelfde versie, maar de zin staat nu twee keer
            with proef._lock:  # simuleert een wijziging van het voorbeeld buiten dit voorstel om
                proef._document = dict(nieuw)
            with self.assertRaises(demo_server.DemoWeigering) as ctx:
                proef.beoordeel(voorstel_id, 'goedgekeurd')
            self.assertEqual(ctx.exception.code, 'document_gewijzigd')
            self.assertEqual(proef.status()['document']['inhoud'], nieuw['inhoud'])
            self.assertIsNone(proef.status()['opdracht']['beoordeling'])
        self.assertEqual(proef.beoordeel(voorstel_id, 'afgewezen'), 'afgewezen')  # afwijzen blijft kunnen

    def test_een_werker_die_zelf_struikelt_laat_de_proef_niet_vastlopen(self):
        class Struikelend(demo_server.DemoWachtrij):
            def klaar(self, opdracht, voorstel, gebruik):
                raise RuntimeError('boem')

            def fout(self, opdracht, code):
                raise RuntimeError('boem')
        proef = Struikelend(goed_model)
        eerste = proef.start()
        opdracht = wacht_op_einde(proef)
        self.assertEqual((opdracht['id'], opdracht['status'], opdracht['fout_code']), (eerste, 'mislukt', 'interne_fout'))
        tweede = proef.start()  # niet blijven hangen in 'bezig': een nieuwe start mag
        self.assertGreater(tweede, eerste)
        self.assertEqual(wacht_op_einde(proef)['id'], tweede)

    def test_beoordeling_vraagt_een_geldig_id_en_een_expliciet_besluit(self):
        proef = demo_server.DemoWachtrij(goed_model)
        proef.start()
        voorstel_id = wacht_op_einde(proef)['voorstel_id']
        for besluit in (None, '', 'toepassen', 'toegepast', 'GOEDGEKEURD', True):
            with self.assertRaises(demo_server.DemoWeigering) as ctx:
                proef.beoordeel(voorstel_id, besluit)
            self.assertEqual(ctx.exception.code, 'ongeldige_beoordeling')
        for kapot_id in (None, 'x', True, 0, -1, 1.5):
            with self.assertRaises(demo_server.DemoWeigering) as ctx:
                proef.beoordeel(kapot_id, 'goedgekeurd')
            self.assertEqual(ctx.exception.code, 'ongeldige_beoordeling')
        with self.assertRaises(demo_server.DemoWeigering) as ctx:
            proef.beoordeel(voorstel_id + 100, 'goedgekeurd')
        self.assertEqual(ctx.exception.code, 'voorstel_onbekend')
        self.assertEqual(proef.status()['document']['versie'], 1)
        self.assertIsNone(proef.status()['opdracht']['beoordeling'])

    def test_een_antwoord_zonder_tekstwijziging_valt_niet_te_beoordelen(self):
        proef = demo_server.DemoWachtrij(antwoord_model)
        proef.start()
        opdracht = wacht_op_einde(proef)
        self.assertEqual((opdracht['status'], opdracht['soort']), ('klaar', 'antwoord'))
        for besluit in ('goedgekeurd', 'afgewezen'):
            with self.assertRaises(demo_server.DemoWeigering) as ctx:
                proef.beoordeel(opdracht['voorstel_id'], besluit)
            self.assertEqual(ctx.exception.code, 'geen_tekstvoorstel')
        self.assertEqual(proef.status()['document']['versie'], 1)

    def test_gelijktijdige_start_laat_precies_een_opdracht_toe(self):
        model = SlotModel()
        proef = demo_server.DemoWachtrij(model)
        poort = threading.Barrier(8)
        uitkomsten, lock = [], threading.Lock()

        def start():
            poort.wait()
            try:
                uitkomst = ('ok', proef.start())
            except demo_server.DemoWeigering as fout:
                uitkomst = ('weigering', fout.code)
            with lock:
                uitkomsten.append(uitkomst)
        draden = [threading.Thread(target=start) for _ in range(8)]
        for draad in draden:
            draad.start()
        for draad in draden:
            draad.join(5)
        self.assertEqual(sorted(u[0] for u in uitkomsten), ['ok'] + ['weigering'] * 7)
        self.assertEqual({u[1] for u in uitkomsten if u[0] == 'weigering'}, {'bezig'})
        self.assertTrue(model.binnen.wait(5))
        self.assertEqual(proef.status()['opdracht']['status'], 'bezig')
        self.assertEqual(proef.status()['resterend'], 9)
        model.vrij.set()
        self.assertEqual(wacht_op_einde(proef)['status'], 'klaar')
        self.assertEqual(model.aanroepen, 1)

    def test_maximaal_tien_echte_opdrachten_per_sessie_ook_na_reset(self):
        aanroepen = []
        proef = demo_server.DemoWachtrij(lambda v: aanroepen.append(1) or gebruik(wijziging()))
        for _ in range(10):
            proef.start()
            wacht_op_einde(proef)
            proef.reset()
        self.assertEqual(proef.status()['resterend'], 0)
        with self.assertRaises(demo_server.DemoWeigering) as ctx:
            proef.start()
        self.assertEqual(ctx.exception.code, 'limiet_bereikt')
        self.assertEqual(len(aanroepen), 10)

    def test_reset_herstelt_voorbeeld_maar_niet_het_budget_en_hergebruikt_geen_ids(self):
        proef = demo_server.DemoWachtrij(goed_model)
        proef.start()
        eerste = wacht_op_einde(proef)
        proef.beoordeel(eerste['voorstel_id'], 'goedgekeurd')
        status = proef.reset()
        self.assertEqual(status['document'], {'id': 12, 'inhoud': ORIGINEEL, 'versie': 1})
        self.assertEqual(status['notitie']['anker'], ANKER)
        self.assertIsNone(status['opdracht'])
        self.assertEqual(status['resterend'], 9)
        proef.start()
        tweede = wacht_op_einde(proef)
        self.assertGreater(tweede['id'], eerste['id'])
        self.assertGreater(tweede['voorstel_id'], eerste['voorstel_id'])
        with self.assertRaises(demo_server.DemoWeigering) as ctx:  # een verouderd voorstel raakt niets
            proef.beoordeel(eerste['voorstel_id'], 'goedgekeurd')
        self.assertEqual(ctx.exception.code, 'voorstel_onbekend')
        self.assertEqual(proef.status()['document']['versie'], 1)

    def test_reset_verstoort_geen_lopende_opdracht(self):
        model = SlotModel()
        proef = demo_server.DemoWachtrij(model)
        opdracht_id = proef.start()
        self.assertTrue(model.binnen.wait(5))
        with self.assertRaises(demo_server.DemoWeigering) as ctx:
            proef.reset()
        self.assertEqual(ctx.exception.code, 'bezig')
        self.assertEqual(proef.status()['opdracht']['status'], 'bezig')
        model.vrij.set()
        opdracht = wacht_op_einde(proef)
        self.assertEqual((opdracht['id'], opdracht['status']), (opdracht_id, 'klaar'))
        self.assertEqual(proef.reset()['opdracht'], None)

    def test_start_weigert_synchroon_als_de_selectie_niet_meer_bestaat(self):
        proef = demo_server.DemoWachtrij(goed_model)
        proef.start()
        proef.beoordeel(wacht_op_einde(proef)['voorstel_id'], 'goedgekeurd')
        with self.assertRaises(demo_server.DemoWeigering) as ctx:
            proef.start()
        self.assertEqual(ctx.exception.code, 'anker_niet_uniek')
        self.assertEqual(proef.status()['resterend'], 9)  # geweigerde start kost niets

    def test_verlopen_claim_wordt_mislukt_en_laat_een_trage_werker_niets_meer_schrijven(self):
        tijd = [1000.0]
        model = SlotModel()
        proef = demo_server.DemoWachtrij(model, klok=lambda: tijd[0])
        proef.start()
        self.assertTrue(model.binnen.wait(5))
        tijd[0] += demo_server.LEASE_SECONDEN + 1
        opdracht = proef.status()['opdracht']
        self.assertEqual((opdracht['status'], opdracht['fout_code']), ('mislukt', 'lease_verlopen'))
        model.vrij.set()
        time.sleep(0.1)
        proef._draad.join(5)
        opdracht = proef.status()['opdracht']
        self.assertEqual((opdracht['status'], opdracht['fout_code']), ('mislukt', 'lease_verlopen'))
        self.assertIsNone(opdracht['voorstel_id'])


class Verbinding:
    def __init__(self, server):
        self.poort = server.server_port

    def vraag(self, methode, pad, body=None, origin=ORIGIN, host=None, extra=None, ruw=None) -> Tuple[int, Any, Any]:
        conn = http.client.HTTPConnection('127.0.0.1', self.poort, timeout=5)
        try:
            headers = {'Host': host or ('localhost:%d' % self.poort)}
            if origin:
                headers['Origin'] = origin
            if methode == 'POST':
                headers.update({'Content-Type': 'application/json', 'X-Werkbank-Lokaal': '1'})
            headers.update(extra or {})
            data = ruw if ruw is not None else (json.dumps(body).encode() if body is not None else None)
            conn.request(methode, pad, body=data, headers=headers)
            antwoord = conn.getresponse()
            ruwe = antwoord.read()
            return antwoord.status, (json.loads(ruwe) if ruwe else None), antwoord
        finally:
            conn.close()

    def status(self, **kw) -> Tuple[int, Any, Any]:
        return self.vraag('GET', '/api/agent-proef/status', **kw)

    def wacht_op_einde(self, timeout=5) -> Any:
        einde = time.time() + timeout
        while time.time() < einde:
            opdracht = self.status()[1]['opdracht']
            if opdracht and opdracht['status'] in ('klaar', 'mislukt'):
                return opdracht
            time.sleep(0.01)
        raise AssertionError('opdracht werd niet afgerond')


class ServerTest(unittest.TestCase):
    def maak(self, model=goed_model):
        server = demo_server.maak_server(0, model=model)
        draad = threading.Thread(target=server.serve_forever, daemon=True)
        draad.start()

        def ruim_op():
            server.shutdown()
            server.server_close()
            draad.join(2)
        self.addCleanup(ruim_op)
        return server, Verbinding(server)

    def test_zonder_geinjecteerd_model_geen_server(self):
        with self.assertRaisesRegex(RuntimeError, 'niet vrijgegeven'):
            demo_server.maak_server(0)

    def test_server_bindt_alleen_op_loopback(self):
        server, _ = self.maak()
        self.assertEqual(server.server_address[0], '127.0.0.1')

    def test_status_heeft_het_ui_contract(self):
        _, api = self.maak()
        code, data, antwoord = api.status()
        self.assertEqual(code, 200)
        self.assertEqual(set(data), {'beschikbaar', 'document', 'notitie', 'opdracht', 'resterend'})
        self.assertIs(data['beschikbaar'], True)
        self.assertEqual(data['document'], {'id': 12, 'inhoud': ORIGINEEL, 'versie': 1})
        self.assertIsNone(data['opdracht'])
        self.assertEqual(data['resterend'], 10)
        self.assertIn('no-store', antwoord.getheader('Cache-Control'))
        self.assertEqual(antwoord.getheader('Access-Control-Allow-Origin'), ORIGIN)

    def test_volledige_http_cyclus_start_status_goedkeuren_reset(self):
        _, api = self.maak()
        code, data, _ = api.vraag('POST', '/api/agent-proef/start', {'notitieId': 8, 'documentId': 12})
        self.assertEqual(code, 202)
        self.assertEqual(set(data), {'opdracht_id'})
        self.assertIsInstance(data['opdracht_id'], int)
        opdracht = api.wacht_op_einde()
        self.assertEqual(opdracht['id'], data['opdracht_id'])
        self.assertEqual(opdracht['status'], 'klaar')
        for sleutel in ('id', 'notitie_id', 'document_id', 'document_versie', 'status', 'voorstel_id', 'soort',
                        'oorspronkelijk', 'voorstel', 'uitleg', 'bronstatus', 'beoordeling'):
            self.assertIn(sleutel, opdracht)
        self.assertEqual(api.status()[1]['document']['inhoud'], ORIGINEEL)  # niet automatisch toegepast
        code, data, _ = api.vraag('POST', '/api/agent-proef/beoordeel', {'voorstelId': opdracht['voorstel_id'], 'besluit': 'goedgekeurd'})
        self.assertEqual((code, data), (200, {'besluit': 'toegepast'}))
        status = api.status()[1]
        self.assertEqual(status['document']['inhoud'], VOORSTEL + ' Daarna kiest hij een voertuig.')
        self.assertEqual(status['opdracht']['beoordeling'], {'besluit': 'toegepast'})
        code, data, _ = api.vraag('POST', '/api/agent-proef/beoordeel', {'voorstelId': opdracht['voorstel_id'], 'besluit': 'afgewezen'})
        self.assertEqual((code, data), (409, {'fout': 'voorstel_al_beoordeeld'}))
        code, data, _ = api.vraag('POST', '/api/agent-proef/reset')
        self.assertEqual(code, 200)
        self.assertEqual(data['document'], {'id': 12, 'inhoud': ORIGINEEL, 'versie': 1})
        self.assertIsNone(data['opdracht'])
        self.assertEqual(data['resterend'], 9)

    def test_afwijzing_via_http(self):
        _, api = self.maak()
        api.vraag('POST', '/api/agent-proef/start')
        opdracht = api.wacht_op_einde()
        code, data, _ = api.vraag('POST', '/api/agent-proef/beoordeel', {'voorstelId': opdracht['voorstel_id'], 'besluit': 'afgewezen'})
        self.assertEqual((code, data), (200, {'besluit': 'afgewezen'}))
        self.assertEqual(api.status()[1]['document']['inhoud'], ORIGINEEL)

    def test_modelfout_komt_als_echte_foutstatus_door(self):
        def kapot(voorbereid):
            raise AgentFout('modelsleutel_ontbreekt')
        _, api = self.maak(kapot)
        api.vraag('POST', '/api/agent-proef/start')
        opdracht = api.wacht_op_einde()
        self.assertEqual((opdracht['status'], opdracht['fout_code']), ('mislukt', 'modelsleutel_ontbreekt'))
        self.assertIsNone(opdracht['voorstel_id'])

    def test_gelijktijdige_http_starts_en_reset_tijdens_lopende_opdracht(self):
        model = SlotModel()
        _, api = self.maak(model)
        poort = threading.Barrier(4)
        codes = []

        def start():
            poort.wait()
            codes.append(api.vraag('POST', '/api/agent-proef/start')[:2])
        draden = [threading.Thread(target=start) for _ in range(4)]
        for draad in draden:
            draad.start()
        for draad in draden:
            draad.join(5)
        self.assertEqual(sorted(c for c, _ in codes), [202, 409, 409, 409])
        self.assertEqual([d for c, d in codes if c == 409], [{'fout': 'bezig'}] * 3)
        self.assertTrue(model.binnen.wait(5))
        code, data, _ = api.vraag('POST', '/api/agent-proef/reset')
        self.assertEqual(code, 409)
        self.assertEqual(data['fout'], 'bezig')
        self.assertEqual(data['opdracht']['status'], 'bezig')  # statusobject, onaangetast
        model.vrij.set()
        self.assertEqual(api.wacht_op_einde()['status'], 'klaar')
        self.assertEqual(model.aanroepen, 1)

    def test_limiet_van_tien_geeft_429(self):
        _, api = self.maak()
        for _ in range(10):
            self.assertEqual(api.vraag('POST', '/api/agent-proef/start')[0], 202)
            api.wacht_op_einde()
            api.vraag('POST', '/api/agent-proef/reset')
        code, data, _ = api.vraag('POST', '/api/agent-proef/start')
        self.assertEqual((code, data), (429, {'fout': 'limiet_bereikt'}))
        self.assertEqual(api.status()[1]['resterend'], 0)

    def test_ongeldige_verzoeken_worden_geweigerd_zonder_iets_te_wijzigen(self):
        server, api = self.maak()
        vraag = api.vraag
        self.assertEqual(vraag('GET', '/api/agent-proef/status', host='evil.example')[0], 403)
        self.assertEqual(vraag('GET', '/api/agent-proef/status', origin='https://evil.example')[0], 403)
        self.assertEqual(vraag('GET', '/api/agent-proef/onbekend')[0], 404)
        self.assertEqual(vraag('POST', '/api/agent-proef/start', origin='https://evil.example')[0], 403)
        self.assertEqual(vraag('POST', '/api/agent-proef/start', origin=None)[0], 403)
        self.assertEqual(vraag('POST', '/api/agent-proef/start', host='evil.example')[0], 403)
        zonder_kop = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
        zonder_kop.request('POST', '/api/agent-proef/start', headers={'Origin': ORIGIN})
        self.assertEqual(zonder_kop.getresponse().status, 403)
        zonder_kop.close()
        self.assertEqual(vraag('GET', '/api/agent-proef/start')[0], 404)
        self.assertEqual(vraag('POST', '/api/agent-proef/start', {'notitieId': 99, 'documentId': 12})[1], {'fout': 'ongeldige_opdracht'})
        self.assertEqual(vraag('POST', '/api/agent-proef/start', {'notitieId': 8, 'documentId': 78})[0], 400)
        self.assertEqual(vraag('POST', '/api/agent-proef/start', ruw=b'{kapot')[0], 400)
        self.assertEqual(vraag('POST', '/api/agent-proef/start', ruw=b'x' * 5000)[0], 413)
        self.assertEqual(vraag('POST', '/api/agent-proef/start', extra={'Content-Type': 'text/plain'}, ruw=b'{}')[0], 400)
        for body in ({}, {'voorstelId': 1}, {'besluit': 'goedgekeurd'}, {'voorstelId': '1', 'besluit': 'goedgekeurd'},
                     {'voorstelId': 1, 'besluit': 'toepassen'}, [1]):
            code, data, _ = vraag('POST', '/api/agent-proef/beoordeel', body)
            self.assertEqual((code, data), (400, {'fout': 'ongeldige_beoordeling'}), body)
        self.assertEqual(vraag('POST', '/api/agent-proef/beoordeel', {'voorstelId': 1, 'besluit': 'goedgekeurd'})[:2], (404, {'fout': 'voorstel_onbekend'}))
        status = api.status()[1]
        self.assertIsNone(status['opdracht'])
        self.assertEqual(status['resterend'], 10)
        self.assertEqual(status['document']['versie'], 1)

    def test_een_onverwachte_serverfout_geeft_alleen_een_code_en_geen_details(self):
        server, api = self.maak()

        def boem(*args, **kwargs):
            raise ValueError('geheim detail dat niet getoond mag worden')
        server.proef.start = boem
        code, data, _ = api.vraag('POST', '/api/agent-proef/start')
        self.assertEqual((code, data), (500, {'fout': 'interne_fout'}))
        server.proef.status = boem
        code, data, _ = api.status()
        self.assertEqual((code, data), (500, {'fout': 'interne_fout'}))

    def test_cors_preflight_alleen_voor_toegestane_origins(self):
        _, api = self.maak()
        code, _, antwoord = api.vraag('OPTIONS', '/api/agent-proef/start', extra={
            'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-werkbank-lokaal'})
        self.assertEqual(code, 204)
        self.assertIsNone(antwoord.getheader('Content-Length'))  # een 204 heeft geen body en geen lengte
        self.assertEqual(antwoord.getheader('Access-Control-Allow-Origin'), ORIGIN)
        self.assertIn('X-Werkbank-Lokaal', antwoord.getheader('Access-Control-Allow-Headers'))
        code, _, antwoord = api.vraag('OPTIONS', '/api/agent-proef/start', origin='https://evil.example')
        self.assertEqual(code, 403)
        self.assertIsNone(antwoord.getheader('Access-Control-Allow-Origin'))


class MainTest(unittest.TestCase):
    def test_zonder_sleutel_start_niets_en_wordt_geen_sleutel_geprint(self):
        uit, fout = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(uit), contextlib.redirect_stderr(fout):
            code = demo_server.main(['--poort', '0'], omgeving={})
        self.assertEqual(code, 2)
        self.assertIn('WERKBANK_AGENT_OPENROUTER_KEY', fout.getvalue())

    def test_sleutel_uit_omgeving_wordt_gebruikt_maar_nooit_getoond(self):
        sleutel, aangeroepen = 'sk-test-geheim-123', {}

        def nep_vraag_model(voorbereid, gebruikte_sleutel, model):
            aangeroepen.update(sleutel=gebruikte_sleutel, model=model)
            return gebruik(wijziging())
        model = demo_server.maak_model({'OPENROUTER_API_KEY': sleutel}, vraag=nep_vraag_model)
        model({'x': 1})
        self.assertEqual(aangeroepen, {'sleutel': sleutel, 'model': gedeelde_agent.STANDAARD_MODEL})
        model = demo_server.maak_model({'WERKBANK_AGENT_OPENROUTER_KEY': 'voorrang', 'OPENROUTER_API_KEY': sleutel}, vraag=nep_vraag_model)
        model({'x': 1})
        self.assertEqual(aangeroepen['sleutel'], 'voorrang')
        self.assertNotIn(sleutel, repr(model))
        self.assertIsNone(demo_server.maak_model({}, vraag=nep_vraag_model))
        self.assertIsNone(demo_server.maak_model({'OPENROUTER_API_KEY': '  '}, vraag=nep_vraag_model))
        self.assertIsNone(demo_server.maak_model({'OPENROUTER_API_KEY': sleutel, 'WERKBANK_AGENT_MODEL': 'onbekend/model'}, vraag=nep_vraag_model))


if __name__ == '__main__':
    unittest.main()
