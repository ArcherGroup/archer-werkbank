"""Lokale preview van de werkbank met uitsluitend de fictieve agentproef als schrijfdoel.

De preview is niet voor publicatie: gewone app-schrijfacties en realtime worden
geblokkeerd. Alleen de drie lokale proefacties mogen naar de proefserver.
"""
import argparse
import http.client
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

GUARD = r'''<script>
(() => {
  window.__previewGeblokkeerd = [];
  try { localStorage.setItem('werkbank_naam', 'Preview'); } catch {}
  const isProef = (url, methode) => methode === 'POST' && url.origin === location.origin &&
    /^\/archer-werkbank\/api\/agent-proef\/(start|beoordeel|reset)$/.test(url.pathname);
  const origineel = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const adres = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    const methode = String(init.method || input?.method || 'GET').toUpperCase();
    const url = new URL(adres, location.href);
    if (!['GET', 'HEAD'].includes(methode) && !isProef(url, methode)) {
      window.__previewGeblokkeerd.push(methode);
      return Promise.resolve(new Response(JSON.stringify({ message: 'Alleen-lezen testweergave' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }
    return origineel(input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(methode, adres, ...rest) {
    const m = String(methode).toUpperCase();
    if (!['GET', 'HEAD'].includes(m) && !isProef(new URL(adres, location.href), m)) throw new Error('Alleen-lezen testweergave');
    return open.call(this, methode, adres, ...rest);
  };
  navigator.sendBeacon = () => false;
  window.WebSocket = class { constructor() { this.readyState = 3; setTimeout(() => this.onclose?.({ code: 1000 }), 0); } close() {} send() {} addEventListener() {} removeEventListener() {} };
  Object.defineProperty(window, '__agentProef', { value: true, writable: false, configurable: false });
  Object.defineProperty(window, '__previewVeilig', { value: true, writable: false, configurable: false });
})();
</script>'''

MODULE = re.compile(r'<script\s+type="module"\s+crossorigin\s+src="(/archer-werkbank/assets/index-[A-Za-z0-9_-]+\.js)"></script>')


def maak_preview_html(html):
    """Zet de testhek vóór de enige toegestane appmodule, of weiger de hele pagina."""
    if not isinstance(html, str) or '</head>' not in html:
        raise ValueError('Preview mist een geldige head')
    matches = list(MODULE.finditer(html))
    if len(matches) != 1 or len(re.findall(r'<script\s+type="module"', html)) != 1:
        raise ValueError('Preview mist exact één lokale appmodule')
    pad = matches[0].group(1)
    loader = "<script type=\"module\">if (window.__previewVeilig === true) import('%s');</script>" % pad
    html = html[:matches[0].start()] + GUARD + loader + html[matches[0].end():]
    banner = '<div role="status" style="position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:9999;padding:7px 12px;border-radius:999px;background:#f4cb56;color:#1d1d1f;font:600 12px system-ui;white-space:nowrap;">Lokale proef · fictieve agenttekst · geen gedeelde wijzigingen</div>'
    return html.replace('</body>', banner + '</body>', 1)


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory, backend_poort, **kwargs):
        self.backend_poort = backend_poort
        super().__init__(*args, directory=str(directory), **kwargs)

    def log_message(self, format, *args):
        # De testserver verwerkt geen vertrouwelijke gegevens; houd de terminal rustig.
        return

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def _json(self, status, inhoud):
        payload = json.dumps(inhoud, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _proxy(self, pad, methode):
        lengte = 0
        if methode == 'POST':
            try:
                lengte = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                return self._json(400, {'fout': 'ongeldig_verzoek'})
            if not 0 <= lengte <= 4096:
                return self._json(413, {'fout': 'ongeldig_verzoek'})
        body = self.rfile.read(lengte) if lengte else None
        headers = {k: self.headers[k] for k in ('Origin', 'X-Werkbank-Lokaal', 'Content-Type') if k in self.headers}
        verbinding = http.client.HTTPConnection('127.0.0.1', self.backend_poort, timeout=10)
        try:
            verbinding.request(methode, pad, body=body, headers=headers)
            antwoord = verbinding.getresponse()
            data = antwoord.read(131073)
            if len(data) > 131072:
                return self._json(502, {'fout': 'ongeldig_antwoord'})
            self.send_response(antwoord.status)
            self.send_header('Content-Type', antwoord.getheader('Content-Type', 'application/json'))
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except OSError:
            self._json(503, {'fout': 'niet_bereikbaar'})
        finally:
            verbinding.close()

    def do_GET(self):
        pad = urlsplit(self.path).path
        if pad == '/archer-werkbank/api/agent-proef/status':
            return self._proxy('/api/agent-proef/status', 'GET')
        if pad in ('/archer-werkbank/', '/archer-werkbank/index.html'):
            try:
                bestand = Path(self.directory) / 'archer-werkbank' / 'index.html'
                inhoud = maak_preview_html(bestand.read_text(encoding='utf-8')).encode('utf-8')
            except (OSError, ValueError):
                return self._json(500, {'fout': 'preview_ontbreekt'})
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(inhoud)))
            self.end_headers()
            self.wfile.write(inhoud)
            return
        return super().do_GET()

    def do_POST(self):
        pad = urlsplit(self.path).path
        if pad in {f'/archer-werkbank/api/agent-proef/{actie}' for actie in ('start', 'beoordeel', 'reset')}:
            return self._proxy(pad.removeprefix('/archer-werkbank'), 'POST')
        return self._json(405, {'fout': 'alleen_lezen'})

    do_PUT = do_DELETE = do_PATCH = lambda self: self._json(405, {'fout': 'alleen_lezen'})


def maak_server(root, adres=('127.0.0.1', 8982), backend_poort=8990):
    if adres[0] != '127.0.0.1':
        raise ValueError('Preview luistert uitsluitend lokaal')
    handler = partial(PreviewHandler, directory=Path(root), backend_poort=backend_poort)
    return ThreadingHTTPServer(adres, handler)


def main():
    parser = argparse.ArgumentParser(description='Lokale werkbankpreview met fictieve agentproef')
    parser.add_argument('--root', required=True, help='map met de map archer-werkbank')
    parser.add_argument('--poort', type=int, default=8982)
    parser.add_argument('--agent-poort', type=int, default=8990)
    opties = parser.parse_args()
    server = maak_server(opties.root, ('127.0.0.1', opties.poort), opties.agent_poort)
    print(f'Lokale proefpreview: http://127.0.0.1:{opties.poort}/archer-werkbank/#/agent-proef', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
