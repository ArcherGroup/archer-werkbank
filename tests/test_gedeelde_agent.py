"""Tests voor commentaargebonden agent: geen netwerk, geen echte documenten."""
import importlib.util
import json
import unittest
import types
from pathlib import Path

PAD = Path(__file__).resolve().parents[1] / 'agent' / 'gedeelde_agent.py'


def laad():
    if not PAD.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('gedeelde_agent', PAD)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def voorbeeld():
    return ({'id': 8, 'doel_type': 'document', 'doel_id': '12', 'tekst': 'Controleer deze formulering.', 'anker': 'Oude formulering.'},
            {'id': 12, 'blok_id': '2.1', 'pad': 'DAG 2/2.1/brief.md', 'versie': 2, 'inhoud': 'Begin. Oude formulering. Einde.', 'agent_toegelaten': True, 'vertrouwelijkheid': 'intern'})


class VoorbereidingTest(unittest.TestCase):
    def test_alleen_de_juiste_opmerking_en_afgebakende_documentcontext_gaan_mee(self):
        agent = laad()
        notitie, document = voorbeeld()
        document['verborgen'] = 'niet meesturen'
        resultaat = agent.bereid_voor(notitie, document)
        self.assertEqual(resultaat['document_id'], 12)
        self.assertEqual(resultaat['document_versie'], 2)
        self.assertEqual(resultaat['notitie_id'], 8)
        self.assertEqual(resultaat['opmerking'], 'Controleer deze formulering.')
        self.assertEqual(resultaat['context'], 'Begin. Oude formulering. Einde.')
        self.assertNotIn('verborgen', str(resultaat))

    def test_notitie_moet_bij_het_juiste_document_horen(self):
        agent = laad()
        notitie, document = voorbeeld()
        notitie['doel_id'] = '13'
        with self.assertRaisesRegex(agent.AgentFout, 'ongeldige_opdracht'):
            agent.bereid_voor(notitie, document)

    def test_lang_document_zonder_tekstselectie_wordt_niet_meegestuurd(self):
        agent = laad()
        notitie, document = voorbeeld()
        notitie['anker'] = None
        document['inhoud'] = 'Een zin. ' * 4000
        with self.assertRaisesRegex(agent.AgentFout, 'anker_vereist'):
            agent.bereid_voor(notitie, document)

    def test_selectie_in_lang_document_geeft_alleen_beperkte_context(self):
        agent = laad()
        notitie, document = voorbeeld()
        document['inhoud'] = 'A' * 20000 + 'Oude formulering.' + 'B' * 20000
        resultaat = agent.bereid_voor(notitie, document)
        self.assertLessEqual(len(resultaat['context']), agent.MAX_CONTEXT)
        self.assertIn('Oude formulering.', resultaat['context'])
        self.assertNotEqual(resultaat['context'], document['inhoud'])

    def test_overlappende_tekstselectie_is_niet_uniek(self):
        agent = laad()
        notitie, document = voorbeeld()
        notitie['anker'] = 'aa'
        document['inhoud'] = 'aaa'
        with self.assertRaisesRegex(agent.AgentFout, 'anker_niet_uniek'):
            agent.bereid_voor(notitie, document)

    def test_een_herhaalde_selectie_is_niet_eenduidig(self):
        agent = laad()
        notitie, document = voorbeeld()
        document['inhoud'] = 'Oude formulering. Dan opnieuw Oude formulering.'
        with self.assertRaisesRegex(agent.AgentFout, 'anker_niet_uniek'):
            agent.bereid_voor(notitie, document)

    def test_manuscript_blijft_geblokkeerd_ook_bij_foutieve_toestemming(self):
        agent = laad()
        self.assertIsNotNone(agent, 'gedeelde agent ontbreekt')
        self.assertTrue(callable(getattr(agent, 'bereid_voor', None)))
        notitie, document = voorbeeld()
        document.update(id=78, pad='01 Bronnen/anthony-swolfs-een-leven-lang-geld/manuscript.md')
        notitie['doel_id'] = '78'
        with self.assertRaisesRegex(agent.AgentFout, 'vertrouwelijk'):
            agent.bereid_voor(notitie, document)
        document.update(id='78', pad='algemeen/onschuldig.md')
        with self.assertRaisesRegex(agent.AgentFout, 'vertrouwelijk'):
            agent.bereid_voor(notitie, document)


class ModelTest(unittest.TestCase):
    def test_modelaanroep_gebruikt_alleen_de_bedoelde_provider_en_zonder_tools(self):
        agent = laad()
        self.assertTrue(callable(getattr(agent, 'vraag_model', None)))
        notitie, document = voorbeeld()
        voorbereid = agent.bereid_voor(notitie, document)
        vastgelegd = {}
        class Antwoord:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, grootte):
                return json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': '{"soort":"antwoord","uitleg":"Controle nodig."}'}}], 'usage': {'prompt_tokens': 20, 'completion_tokens': 10, 'cost': 0.0001}}).encode()
        def openen(verzoek, timeout):
            vastgelegd.update(url=verzoek.full_url, data=json.loads(verzoek.data), timeout=timeout)
            return Antwoord()
        resultaat = agent.vraag_model(voorbereid, 'test-sleutel', opener=openen)
        self.assertEqual(vastgelegd['url'], 'https://openrouter.ai/api/v1/chat/completions')
        self.assertNotIn('tools', vastgelegd['data'])
        self.assertEqual(resultaat['cost'], 0.0001)
        self.assertIn('Controle nodig', resultaat['tekst'])

    def test_api_redirect_mag_geen_sleutel_doorsturen(self):
        agent = laad()
        self.assertTrue(callable(getattr(agent, 'NietDoorverwijzen', None)))
        handler = agent.NietDoorverwijzen()
        with self.assertRaisesRegex(agent.AgentFout, 'redirect_geweigerd'):
            handler.redirect_request(None, None, 302, 'Found', {}, 'https://ongewenst.example')

    def test_afgekapt_modelantwoord_wordt_niet_als_voorstel_geaccepteerd(self):
        agent = laad()
        notitie, document = voorbeeld()
        class Antwoord:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, grootte):
                return json.dumps({'choices': [{'finish_reason': 'length', 'message': {'content': '{}'}}]}).encode()
        with self.assertRaisesRegex(agent.AgentFout, 'ongeldige_uitvoer'):
            agent.vraag_model(agent.bereid_voor(notitie, document), 'test-sleutel', opener=lambda *args, **kw: Antwoord())

    def test_tweede_model_krijgt_geen_niet_ondersteunde_temperatuur(self):
        agent = laad()
        notitie, document = voorbeeld()
        verzoek = agent.maak_modelverzoek(agent.bereid_voor(notitie, document), 'anthropic/claude-sonnet-5.5')
        self.assertTrue(verzoek['provider']['require_parameters'])
        self.assertNotIn('temperature', verzoek)
        self.assertEqual(verzoek['max_tokens'], 1000)

    def test_eenvoudige_redactie_verbruikt_geen_denkbudget_voor_het_antwoord(self):
        agent = laad()
        notitie, document = voorbeeld()
        verzoek = agent.maak_modelverzoek(agent.bereid_voor(notitie, document))
        self.assertEqual(verzoek.get('reasoning'), {'effort': 'none'})
        self.assertEqual(verzoek['max_tokens'], 1000)

    def test_modelverzoek_geeft_geen_tools_en_beperkt_dataverwerking(self):
        agent = laad()
        self.assertTrue(callable(getattr(agent, 'maak_modelverzoek', None)))
        notitie, document = voorbeeld()
        verzoek = agent.maak_modelverzoek(agent.bereid_voor(notitie, document))
        self.assertNotIn('tools', verzoek)
        self.assertNotIn('plugins', verzoek)
        self.assertEqual(verzoek['provider']['data_collection'], 'deny')
        self.assertTrue(verzoek['provider']['zdr'])
        self.assertTrue(verzoek['provider']['require_parameters'])
        self.assertLessEqual(verzoek['provider']['max_price']['completion'], 1.5)
        self.assertLessEqual(verzoek['max_tokens'], 1000)
        self.assertNotIn('max_completion_tokens', verzoek)
        self.assertNotIn('pad', json.loads(verzoek['messages'][1]['content']))


class VoorstelTest(unittest.TestCase):
    def test_de_agent_mag_ook_veilig_antwoord_zonder_tekstwijziging_geven(self):
        agent = laad()
        notitie, document = voorbeeld()
        voorbereid = agent.bereid_voor(notitie, document)
        uitvoer = '{"soort":"antwoord","oorspronkelijk":"","voorstel":"","uitleg":"Ik kan dit zonder bron niet bevestigen."}'
        resultaat = agent.beoordeel_voorstel(voorbereid, document['inhoud'], uitvoer)
        self.assertEqual(resultaat['soort'], 'antwoord')
        self.assertEqual(resultaat['status'], 'voorgesteld')
        self.assertEqual(resultaat['bronstatus'], 'niet_opgezocht')

    def test_verzonnen_of_dubbele_fragmenten_worden_geweigerd(self):
        agent = laad()
        notitie, document = voorbeeld()
        voorbereid = agent.bereid_voor(notitie, document)
        for oud, inhoud in [('Staat er niet.', document['inhoud']), ('Oude formulering.', document['inhoud'] + ' Oude formulering.')]:
            uitvoer = json.dumps({'oorspronkelijk': oud, 'voorstel': 'Aanpassing.', 'uitleg': 'Toelichting.'})
            with self.assertRaisesRegex(agent.AgentFout, 'tekst_niet_uniek'):
                agent.beoordeel_voorstel(voorbereid, inhoud, uitvoer)

    def test_voorstel_verandert_niets_automatisch_en_komt_uit_echte_tekst(self):
        agent = laad()
        self.assertTrue(callable(getattr(agent, 'beoordeel_voorstel', None)))
        notitie, document = voorbeeld()
        voorbereid = agent.bereid_voor(notitie, document)
        uitvoer = '{"oorspronkelijk":"Oude formulering.","voorstel":"Nieuwe formulering.","uitleg":"Beter leesbaar."}'
        voorstel = agent.beoordeel_voorstel(voorbereid, document['inhoud'], uitvoer)
        self.assertEqual(voorstel['status'], 'voorgesteld')
        self.assertEqual(voorstel['oorspronkelijk'], 'Oude formulering.')
        self.assertEqual(voorstel['voorstel'], 'Nieuwe formulering.')
        self.assertEqual(voorstel['bronstatus'], 'niet_opgezocht')
        self.assertEqual(document['inhoud'], 'Begin. Oude formulering. Einde.')


if __name__ == '__main__':
    unittest.main()
