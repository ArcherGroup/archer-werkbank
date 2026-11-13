import unittest
from agent.proef_preview import maak_preview_html

class CommentPreviewTest(unittest.TestCase):
    def test_technische_preview_is_onmiskenbaar_en_linkt_naar_gedeelde_werkplek(self):
        html = '<html><head><script type="module" crossorigin src="/archer-werkbank/assets/index-demo.js"></script></head><body><div id="root"></div></body></html>'
        preview = maak_preview_html(html)
        self.assertIn('Technische testweergave', preview)
        self.assertIn('https://archergroup.github.io/archer-werkbank/', preview)
        self.assertIn('Open de online werkbank', preview)
        self.assertIn('Alleen op dit toestel', preview)
        self.assertIn('Alleen-lezen testweergave', preview)
