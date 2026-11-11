import importlib.util
import http.client
import json
import os
import threading
import types
import unittest
from unittest import mock
from pathlib import Path

PAD = Path(__file__).resolve().parents[1] / 'agent' / 'onderzoek_lokaal.py'


def laad_module():
    if not PAD.is_file():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('onderzoek_lokaal', PAD)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def events(bronnen, eind):
    return [
        {'type': 'tool_result', 'name': 'web_extract', 'is_error': False,
         'output': json.dumps({'results': bronnen})},
        {'type': 'result', 'exit_code': 0, 'text': json.dumps(eind)},
    ]


class BroncontroleTest(unittest.TestCase):
    def test_alleen_echt_geopende_bron_met_letterlijk_citaat_wordt_getoond(self):
        agent = laad_module()
        self.assertTrue(callable(getattr(agent, 'verwerk_events', None)), 'broncontrole voor de onderzoeksagent ontbreekt')
        url = 'https://www.voorbeeld.be/regel'
        inhoud = 'Deze openbare bron beschrijft een maatregel. ' * 5
        uitvoer = {'bronnen': [
            {'titel': 'Gelezen bron', 'url': url, 'citaat': 'Deze openbare bron beschrijft een maatregel.', 'claim': 'Een controleerbare samenvatting.'},
            {'titel': 'Verzonnen bron', 'url': 'https://niet-geopend.example/', 'citaat': 'Dit is niet gelezen.', 'claim': 'Onjuist.'},
        ], 'open_vragen': ['Nog controleren.']}
        result = agent.verwerk_events(events([{'url': url, 'content': inhoud, 'error': None}], uitvoer))
        self.assertEqual(result['status'], 'klaar')
        self.assertEqual([b['url'] for b in result['bronnen']], [url])
        self.assertEqual(result['open_vragen'], ['Nog controleren.'])

    def test_een_verzonnen_citaat_wordt_geweigerd(self):
        agent = laad_module()
        self.assertTrue(callable(getattr(agent, 'verwerk_events', None)), 'broncontrole voor de onderzoeksagent ontbreekt')
        url = 'https://www.voorbeeld.be/regel'
        uitvoer = {'bronnen': [{'titel': 'Bron', 'url': url, 'citaat': 'Deze zin staat er niet.', 'claim': 'Niet controleerbaar.'}]}
        result = agent.verwerk_events(events([{'url': url, 'content': 'Echte inhoud. ' * 30, 'error': None}], uitvoer))
        self.assertEqual(result['status'], 'geen_bewijs')
        self.assertEqual(result['bronnen'], [])

    def test_een_paginatitel_is_geen_inhoudelijk_bewijs(self):
        agent = laad_module()
        url = 'https://www.voorbeeld.be/regel'
        kop = 'Taks op de beursverrichtingen (TOB)'
        uitvoer = {'bronnen': [{'titel': 'Bron', 'url': url, 'citaat': kop, 'claim': 'Samenvatting.'}]}
        result = agent.verwerk_events(events([{'url': url, 'content': (kop + '\n') * 8, 'error': None}], uitvoer))
        self.assertEqual(result['status'], 'geen_bewijs')
        self.assertEqual(result['bronnen'], [])

    def test_mislukte_extractie_en_interne_adressen_tellen_niet(self):
        agent = laad_module()
        self.assertTrue(callable(getattr(agent, 'verwerk_events', None)), 'broncontrole voor de onderzoeksagent ontbreekt')
        url = 'http://127.0.0.1/privé'
        uitvoer = {'bronnen': [{'titel': 'Privé', 'url': url, 'citaat': 'Geheime inhoud.', 'claim': 'Niet toelaten.'}]}
        result = agent.verwerk_events(events([{'url': url, 'content': 'Geheime inhoud. ' * 20, 'error': 'geweigerd'}], uitvoer))
        self.assertEqual(result['status'], 'geen_bewijs')
        self.assertEqual(result['bronnen'], [])

    def test_publieke_en_lokale_adressen_verschillen(self):
        agent = laad_module()
        self.assertTrue(agent.publiek_webadres('https://face.be/bron'))
        for url in ['http://localhost/test', 'http://127.1/test', 'http://0x7f000001/', 'file:///etc/passwd', 'https://u:p@example.org/']:
            self.assertFalse(agent.publiek_webadres(url), url)

    def test_afgekapt_toolresultaat_kan_een_zichtbaar_letterlijk_citaat_bewijzen(self):
        agent = laad_module()
        url = 'https://www.voorbeeld.be/regel'
        inhoud = 'Deze zin is zichtbaar aan het begin van de brontekst. ' + ('Aanvullende inhoud. ' * 100)
        ruwe_uitvoer = json.dumps({'results': [{'url': url, 'title': 'Bron', 'content': inhoud, 'error': None}]})[:400] + '...'
        stroom = [
            {'type': 'tool_result', 'name': 'web_extract', 'is_error': False, 'output': ruwe_uitvoer},
            {'type': 'result', 'exit_code': 0, 'text': json.dumps({'bronnen': [{'titel': 'Bron', 'url': url, 'citaat': 'Deze zin is zichtbaar aan het begin van de brontekst.', 'claim': 'Samenvatting.'}]})},
        ]
        resultaat = agent.verwerk_events(stroom)
        self.assertEqual(resultaat['status'], 'klaar')
        self.assertEqual(resultaat['bronnen'][0]['url'], url)

    def test_onbruikbare_uitvoer_leidt_tot_een_foutstatus(self):
        agent = laad_module()
        self.assertTrue(callable(getattr(agent, 'verwerk_events', None)), 'broncontrole voor de onderzoeksagent ontbreekt')
        result = agent.verwerk_events([{'type': 'result', 'exit_code': 0, 'text': 'geen JSON'}])
        self.assertEqual(result['status'], 'ongeldige_uitvoer')
        self.assertEqual(result['bronnen'], [])


class LokaleRunnerTest(unittest.TestCase):
    def test_de_werker_gebruikt_web_zonder_privecontext_of_safe_mode_die_web_uitschakelt(self):
        agent = laad_module()
        bron = 'https://www.voorbeeld.be/bron'
        stroom = events([{'url': bron, 'content': 'Letterlijk bewijs van de openbare bron. ' * 5, 'error': None}],
                         {'bronnen': [{'titel': 'Bron', 'url': bron, 'citaat': 'Letterlijk bewijs van de openbare bron.', 'claim': 'Controleer zelf.'}]})
        proces = mock.Mock(returncode=0)
        proces.communicate.return_value = ('\n'.join(map(json.dumps, stroom)), '')
        with mock.patch.object(agent.shutil, 'which', return_value='/test/hermes'), mock.patch.object(agent.subprocess, 'Popen', return_value=proces) as popen:
            resultaat = agent.voer_onderzoek_uit('Wat zegt deze openbare bron precies?')
        opdracht = popen.call_args.args[0]
        self.assertEqual(opdracht[opdracht.index('-t') + 1], 'web')
        self.assertIn('--ignore-rules', opdracht)
        self.assertNotIn('--safe-mode', opdracht)
        verwacht = str(Path(os.environ.get('HERMES_HOME', str(Path.home() / '.hermes'))) / 'cache' / 'scratch')
        self.assertEqual(popen.call_args.kwargs['env']['TMPDIR'], verwacht)
        self.assertEqual(resultaat['status'], 'klaar')


class LokaleServerTest(unittest.TestCase):
    def test_geen_betaalde_werker_zonder_veilige_runner(self):
        agent = laad_module()
        with self.assertRaisesRegex(RuntimeError, 'niet vrijgegeven'):
            agent.maak_server(0)

    def test_toegang_is_lokaal_alleen_met_juist_origin_en_toestemming(self):
        agent = laad_module()
        self.assertTrue(callable(getattr(agent, 'maak_server', None)), 'lokale onderzoeksserver ontbreekt')
        calls = []
        def runner(vraag):
            calls.append(vraag)
            return {'status': 'klaar', 'bronnen': [], 'open_vragen': []}
        server = agent.maak_server(0, runner=runner)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            def post(origin, akkoord=True, vraag='Wat is een publieke Belgische bron over ETF kosten?'):
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                body = json.dumps({'vraag': vraag, 'akkoord': akkoord})
                conn.request('POST', '/api/lokaal-onderzoek', body=body, headers={
                    'Origin': origin, 'Content-Type': 'application/json', 'X-Werkbank-Lokaal': '1',
                })
                response = conn.getresponse()
                status, data = response.status, response.read()
                conn.close()
                return status, json.loads(data)
            self.assertEqual(post('https://kwaadwillig.example')[0], 403)
            self.assertEqual(post('http://localhost:8982', akkoord=False)[0], 400)
            self.assertEqual(post('http://localhost:8982', vraag='x' * 601)[0], 400)
            self.assertEqual(post('http://localhost:8982')[0], 200)
            self.assertEqual(len(calls), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
