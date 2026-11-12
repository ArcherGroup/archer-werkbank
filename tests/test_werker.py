"""Werkercyclus met synthetische gegevens; geen netwerk of echte database."""
import unittest
from agent import gedeelde_agent, werker


class NepWachtrij:
    def __init__(self, opdracht):
        self.opdracht = opdracht
        self.voorstellen = []
        self.fouten = []
    def claim(self): return self.opdracht
    def klaar(self, opdracht, voorstel, gebruik):
        self.voorstellen.append((opdracht, voorstel, gebruik))
        return 'klaar'
    def fout(self, opdracht, code):
        self.fouten.append((opdracht, code))


def opdracht():
    return {'opdracht_id': 1, 'claim_token': 'testtoken', 'notitie_id': 8, 'document_id': 12,
            'document_versie': 2, 'document_pad': 'DAG 2/2.1/brief.md',
            'document_inhoud': 'Begin. Oude formulering. Einde.',
            'opmerking': 'Controleer deze formulering.', 'anker': 'Oude formulering.'}


class VerbindingTest(unittest.TestCase):
    def test_keychain_waarden_worden_zonder_shell_of_loggen_gelezen(self):
        calls = []
        class Resultaat:
            returncode = 0
            stdout = b'geheim\\nmet-nieuwe-regel\n'
        def run(args, **kwargs):
            calls.append((args, kwargs))
            return Resultaat()
        self.assertEqual(werker.lees_keychain('archer-werkbank-agent-model', run=run), 'geheim\\nmet-nieuwe-regel')
        self.assertEqual(calls[0][0][0], '/usr/bin/security')
        self.assertEqual(calls[0][0][-1], '-w')
        self.assertNotIn('shell', calls[0][1])
        self.assertEqual(calls[0][1]['stderr'], werker.subprocess.DEVNULL)

    def test_alleen_aparte_werkerrol_en_geverifieerde_tls(self):
        geldig = 'postgresql://werkbank_agent:test@db.example.supabase.co:5432/postgres?sslmode=verify-full'
        self.assertTrue(werker.veilige_database_url(geldig))
        self.assertFalse(werker.veilige_database_url(geldig.replace('werkbank_agent:', 'postgres:')))
        self.assertFalse(werker.veilige_database_url(geldig.replace('verify-full', 'require')))
        self.assertFalse(werker.veilige_database_url(geldig + '&sslmode=disable'))
        self.assertFalse(werker.veilige_database_url(geldig + '&host=andere.example'))
        self.assertFalse(werker.veilige_database_url(geldig.replace('db.example.supabase.co', '127.0.0.1')))


class WerkerTest(unittest.TestCase):
    def test_volledige_cyclus_levert_alleen_een_voorstel(self):
        bron = opdracht()
        wachtrij = NepWachtrij(bron)
        def model(voorbereid):
            self.assertNotIn('document_pad', voorbereid)
            return {'tekst': '{"soort":"wijziging","oorspronkelijk":"Oude formulering.","voorstel":"Nieuwe formulering.","uitleg":"Leesbaarder."}',
                    'model': gedeelde_agent.STANDAARD_MODEL, 'cost': 0.001, 'tokens_in': 20, 'tokens_uit': 10}
        self.assertEqual(werker.werk_een(wachtrij, model), 'klaar')
        self.assertEqual(len(wachtrij.voorstellen), 1)
        self.assertEqual(wachtrij.voorstellen[0][1]['voorstel'], 'Nieuwe formulering.')
        self.assertEqual(bron['document_inhoud'], 'Begin. Oude formulering. Einde.')
        self.assertEqual(wachtrij.fouten, [])

    def test_manuscript_wordt_niet_naar_model_verstuurd(self):
        bron = opdracht()
        bron['document_id'] = 78
        wachtrij = NepWachtrij(bron)
        def model(_): self.fail('manuscript mag niet naar het model')
        self.assertEqual(werker.werk_een(wachtrij, model), 'mislukt')
        self.assertEqual(wachtrij.fouten[0][1], 'vertrouwelijk_geweigerd')
        self.assertEqual(wachtrij.voorstellen, [])

    def test_leeg_wachtrij_kost_geen_modeloproep(self):
        self.assertEqual(werker.werk_een(NepWachtrij(None), lambda _: self.fail('geen model')), 'leeg')


if __name__ == '__main__':
    unittest.main()
