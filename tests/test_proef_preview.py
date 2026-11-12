"""Lokale proefpreview: test het aanzetten van de demo en het behoud van de bestaande testhek."""
import importlib
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    module = importlib.import_module('agent.proef_preview')
except ModuleNotFoundError as fout:
    if fout.name != 'agent.proef_preview':
        raise
    module = None


class ProefPreviewTest(unittest.TestCase):
    def test_alleen_de_proef_mag_schrijven_en_de_app_wacht_op_het_testhek(self):
        self.assertIsNotNone(module, 'preview-implementatie ontbreekt')
        bron = '<html><head><script type="module" crossorigin src="/archer-werkbank/assets/index-AbC123.js"></script></head><body><div id="root"></div></body></html>'
        html = module.maak_preview_html(bron)
        self.assertIn("Object.defineProperty(window, '__agentProef'", html)
        self.assertIn("Object.defineProperty(window, '__previewVeilig'", html)
        self.assertIn('agent-proef', html)
        self.assertIn("import('/archer-werkbank/assets/index-AbC123.js')", html)
        self.assertNotIn('<script type="module" crossorigin src=', html)
        self.assertLess(html.index("Object.defineProperty(window, '__previewVeilig'"), html.index("import('/archer-werkbank/assets/index-AbC123.js')"))

    def test_ontbrekende_of_externe_module_start_de_app_niet(self):
        self.assertIsNotNone(module, 'preview-implementatie ontbreekt')
        for html in ('<html><head></head></html>', '<html><head><script type="module" crossorigin src="https://example.org/a.js"></script></head></html>'):
            with self.assertRaises(ValueError):
                module.maak_preview_html(html)

class ProefProxyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert module is not None
        cls.calls = []
        class FakeAgent(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                cls.calls.append(('GET', self.path))
                body = json.dumps({'beschikbaar': True}).encode()
                self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            def do_POST(self):
                content = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                cls.calls.append(('POST', self.path, self.headers.get('Origin'), self.headers.get('X-Werkbank-Lokaal'), content.decode()))
                body = json.dumps({'opdracht_id': 1}).encode()
                self.send_response(202); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
        cls.backend = ThreadingHTTPServer(('127.0.0.1', 0), FakeAgent)
        threading.Thread(target=cls.backend.serve_forever, daemon=True).start()
        scratch = Path.home() / '.hermes/cache/scratch'
        root = Path(tempfile.mkdtemp(prefix='werkbank-previewtest-', dir=str(scratch)))
        (root / 'archer-werkbank').mkdir()
        (root / 'archer-werkbank' / 'index.html').write_text('<html><head><script type="module" crossorigin src="/archer-werkbank/assets/index-AbC123.js"></script></head><body><div id="root"></div></body></html>')
        cls.preview = module.maak_server(root, ('127.0.0.1', 0), backend_poort=cls.backend.server_port)
        threading.Thread(target=cls.preview.serve_forever, daemon=True).start()
        cls.base = 'http://127.0.0.1:' + str(cls.preview.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.preview.shutdown(); cls.preview.server_close()
        cls.backend.shutdown(); cls.backend.server_close()

    def test_html_is_echt_voorzien_van_het_testhek(self):
        with urllib.request.urlopen(self.base + '/archer-werkbank/') as r:
            html = r.read().decode()
            self.assertEqual(r.status, 200)
            self.assertIn("Object.defineProperty(window, '__agentProef'", html)
            self.assertIn('no-store', r.headers['Cache-Control'])

    def test_status_en_start_worden_alleen_naar_de_fictieve_werker_geleid(self):
        with urllib.request.urlopen(self.base + '/archer-werkbank/api/agent-proef/status') as r:
            self.assertTrue(json.load(r)['beschikbaar'])
        req = urllib.request.Request(self.base + '/archer-werkbank/api/agent-proef/start', data=b'{}', method='POST', headers={
            'Origin': 'http://127.0.0.1:8982', 'X-Werkbank-Lokaal': '1', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as r:
            self.assertEqual(r.status, 202)
            self.assertEqual(json.load(r)['opdracht_id'], 1)
        self.assertIn(('GET', '/api/agent-proef/status'), self.calls)
        self.assertIn(('POST', '/api/agent-proef/start', 'http://127.0.0.1:8982', '1', '{}'), self.calls)

    def test_andere_schrijfverzoeken_worden_niet_doorgestuurd(self):
        req = urllib.request.Request(self.base + '/rest/v1/notities', data=b'{}', method='POST')
        with self.assertRaises(urllib.error.HTTPError) as fout:
            urllib.request.urlopen(req)
        self.assertEqual(fout.exception.code, 405)
        self.assertFalse(any('/rest/v1/notities' in str(call) for call in self.calls))


if __name__ == '__main__':
    unittest.main(verbosity=2)
