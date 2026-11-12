"""Integratietests: uitsluitend de eigen tijdelijke PostgreSQL in scratch.

Zonder WERKBANK_TEST_PG_DSN worden deze tests overgeslagen. Het script weigert
iedere andere host, poort of data_directory vóór het iets aanmaakt.
"""
import hashlib
import os
import unittest
import uuid
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit

try:
    import psycopg
    from psycopg import sql
except ImportError:
    psycopg = None
    sql = None

ROOT = Path(__file__).resolve().parents[1]
MIGRATIE = ROOT / 'supabase' / 'migrations' / '20261112_gedeelde_agent.sql'
FIXTURE = ROOT / 'tests' / 'fixtures' / 'agent_base.sql'
DSN = os.environ.get('WERKBANK_TEST_PG_DSN', '')


def review_hash(voorstel_id, versie, oud, nieuw, uitleg):
    velden = [str(voorstel_id), str(versie), oud, nieuw, uitleg]
    bericht = b''.join(str(len(veld.encode('utf-8'))).encode('ascii') + b':' + veld.encode('utf-8') for veld in velden)
    return hashlib.sha256(bericht).hexdigest()


@unittest.skipUnless(psycopg and DSN, 'lokale PostgreSQL-test en psycopg zijn niet ingesteld')
class AgentDatabaseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        adres = urlsplit(DSN)
        if adres.scheme not in ('postgresql', 'postgres') or adres.hostname != '127.0.0.1' or adres.port != 65439 or adres.path != '/postgres':
            raise RuntimeError('Test weigert een niet-lokale database.')
        naam = 'wbtest_' + uuid.uuid4().hex[:16]
        with psycopg.connect(DSN, autocommit=True) as admin:
            data_dir = Path(admin.execute("select current_setting('data_directory')").fetchone()[0]).resolve()
            verwacht = (Path.home() / '.hermes/cache/scratch/werkbank-agent-pg-20261112').resolve()
            if data_dir != verwacht:
                raise RuntimeError('Test weigert een andere databasecluster.')
            admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(naam)))
        cls.dsn = DSN.rsplit('/', 1)[0] + '/' + naam
        if not MIGRATIE.is_file():
            raise RuntimeError('de lokale agentmigratie ontbreekt')
        with psycopg.connect(cls.dsn, autocommit=True) as db:
            db.execute(FIXTURE.read_text())
            db.execute(MIGRATIE.read_text())
            db.execute("insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003')")
            db.execute("insert into werkbank_private.agent_leden(user_id,naam) values ('00000000-0000-0000-0000-000000000001','Victor'), ('00000000-0000-0000-0000-000000000002','Anthony')")
            db.execute("insert into werkbank.blokken(id,eigenaar) values ('2.1','Victor')")
            db.execute("insert into werkbank.documenten(id,blok_id,titel,pad,inhoud,versie) values (12,'2.1','brief','DAG 2/2.1/brief.md','Begin. Oude formulering. Einde.',2)")
            db.execute("insert into werkbank.notities(id,doel_type,doel_id,tekst,auteur,anker) values (8,'document','12','Controleer deze formulering.','Victor','Oude formulering.')")
            db.execute("insert into werkbank_private.agent_document_toelating(document_id,verwacht_pad,verwacht_blok_id,eigenaar_user_id,toegestaan) values (12,'DAG 2/2.1/brief.md','2.1','00000000-0000-0000-0000-000000000001',true)")

    def test_agent_weigert_opdrachten_zolang_werkbank_anoniem_open_is(self):
        with psycopg.connect(self.dsn, autocommit=True) as db:
            functie = db.execute("select to_regprocedure('werkbank.vraag_agent(bigint,bigint)')").fetchone()[0]
            self.assertIsNotNone(functie, 'de opdrachtfunctie ontbreekt')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            with self.assertRaisesRegex(psycopg.Error, 'werkbank_onveilig'):
                db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12))
            db.execute('RESET ROLE')
            self.assertEqual(db.execute('select count(*) from werkbank.agent_opdrachten').fetchone()[0], 0)

    @staticmethod
    def beveilig_testtabellen(db):
        for tabel in ('blokken', 'documenten', 'notities', 'documenten_historiek'):
            db.execute(sql.SQL('REVOKE ALL ON werkbank.{} FROM anon').format(sql.Identifier(tabel)))
            db.execute(sql.SQL('CREATE POLICY wb_agent_leden_grens ON werkbank.{} AS RESTRICTIVE FOR ALL TO authenticated USING (werkbank_private.agent_is_lid()) WITH CHECK (werkbank_private.agent_is_lid())').format(sql.Identifier(tabel)))

    def test_beveiligde_omgeving_blijft_uit_tot_uitdrukkelijk_vrijgegeven(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            with self.assertRaisesRegex(psycopg.Error, 'agent_niet_vrijgegeven'):
                db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12))
            db.rollback()

    def test_lid_kan_veilige_opdracht_indienen_en_dubbelklikken_geeft_geen_dubbel(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            eerste = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            tweede = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            self.assertEqual(eerste, tweede)
            self.assertEqual(db.execute('select count(*) from werkbank.agent_opdrachten').fetchone()[0], 1)
            db.execute('SAVEPOINT token_lezen')
            with self.assertRaises(psycopg.Error):
                db.execute('select claim_token from werkbank.agent_opdrachten where id=%s', (eerste,))
            db.execute('ROLLBACK TO SAVEPOINT token_lezen')
            db.rollback()

    def test_opdracht_bewaart_de_gevraagde_notitie_als_snapshot(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            opdracht_id = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute("update werkbank.notities set tekst='Later gewijzigd' where id=8")
            tekst = db.execute('select opmerking_snapshot from werkbank.agent_opdrachten where id=%s', (opdracht_id,)).fetchone()[0]
            self.assertEqual(tekst, 'Controleer deze formulering.')
            db.rollback()

    def test_anonieme_toegang_op_een_enkele_kolom_houdt_agent_uit(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('GRANT SELECT (inhoud) ON werkbank.documenten TO anon')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_anonieme_toegang_tot_wachtrij_houdt_agent_uit(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('GRANT SELECT ON werkbank.agent_opdrachten TO anon')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_anoniem_uitvoerbare_security_definer_houdt_agent_uit(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute("CREATE FUNCTION werkbank.onveilige_test() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'select ''test''::text'")
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_werker_claimt_alleen_een_veilige_opdracht_zonder_directe_documentrechten(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            opdracht_id = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            fn = db.execute("select to_regprocedure('werkbank_private.agent_claim()')").fetchone()[0]
            self.assertIsNotNone(fn, 'de worker-claim ontbreekt')
            db.execute('SET ROLE werkbank_agent')
            geclaimd = db.execute('select opdracht_id,document_id,opmerking from werkbank_private.agent_claim()').fetchone()
            self.assertEqual(geclaimd, (opdracht_id, 12, 'Controleer deze formulering.'))
            self.assertIsNone(db.execute('select opdracht_id from werkbank_private.agent_claim()').fetchone())
            with self.assertRaises(psycopg.Error):
                db.execute('select inhoud from werkbank.documenten where id=12')
            db.rollback()

    def test_werker_mag_geen_directe_leestoegang_tot_tabellen_hebben(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('GRANT SELECT (inhoud) ON werkbank.documenten TO werkbank_agent')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_werker_mag_geen_security_definer_van_een_andere_app_aanroepen(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute("CREATE FUNCTION public.andere_app_test() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'select ''test''::text'")
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_werker_schrijft_voorstel_maar_wijzigt_het_document_niet(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            opdracht_id = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            claim = db.execute('select opdracht_id,claim_token from werkbank_private.agent_claim()').fetchone()
            self.assertEqual(claim[0], opdracht_id)
            status = db.execute('select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (opdracht_id, claim[1], 'wijziging', 'Oude formulering.', 'Nieuwe formulering.', 'Leesbaarder.', 'deepseek/deepseek-v4.1-flash', 20, 10, Decimal('0.001'))).fetchone()[0]
            self.assertEqual(status, 'klaar')
            db.execute('RESET ROLE')
            self.assertEqual(db.execute('select inhoud from werkbank.documenten where id=12').fetchone()[0], 'Begin. Oude formulering. Einde.')
            self.assertEqual(db.execute('select status from werkbank.agent_voorstellen where opdracht_id=%s', (opdracht_id,)).fetchone()[0], 'voorgesteld')
            db.rollback()

    def test_alleen_blokeigenaar_kan_voorstel_toepassen_met_historiek(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            token = db.execute('select claim_token from werkbank_private.agent_claim()').fetchone()[0]
            db.execute('select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                       (taak, token, 'wijziging', 'Oude formulering.', 'Nieuwe formulering.', 'Leesbaarder.', 'deepseek/deepseek-v4.1-flash', 20, 10, Decimal('0.001')))
            db.execute('RESET ROLE')
            voorstel = db.execute('select id from werkbank.agent_voorstellen where opdracht_id=%s', (taak,)).fetchone()[0]
            vingerafdruk = review_hash(voorstel, 2, 'Oude formulering.', 'Nieuwe formulering.', 'Leesbaarder.')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000002',))
            db.execute('SET ROLE authenticated')
            db.execute('SAVEPOINT verkeerde_eigenaar')
            with self.assertRaisesRegex(psycopg.Error, 'niet_de_eigenaar'):
                db.execute('select werkbank.beoordeel_agentvoorstel(%s,%s,%s,%s)', (voorstel, 'toepassen', '', vingerafdruk))
            db.execute('ROLLBACK TO SAVEPOINT verkeerde_eigenaar')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SAVEPOINT geen_keuze')
            with self.assertRaisesRegex(psycopg.Error, 'ongeldige_beoordeling'):
                db.execute('select werkbank.beoordeel_agentvoorstel(%s,%s,%s,%s)', (voorstel, None, '', vingerafdruk))
            db.execute('ROLLBACK TO SAVEPOINT geen_keuze')
            db.execute("select set_config('request.jwt.claims', %s, false)", ('{"aal":"aal2"}',))
            db.execute('SAVEPOINT andere_review')
            with self.assertRaisesRegex(psycopg.Error, 'voorstel_gewijzigd'):
                db.execute('select werkbank.beoordeel_agentvoorstel(%s,%s,%s,%s)', (voorstel, 'toepassen', '', '0' * 64))
            db.execute('ROLLBACK TO SAVEPOINT andere_review')
            self.assertEqual(db.execute('select werkbank.beoordeel_agentvoorstel(%s,%s,%s,%s)', (voorstel, 'toepassen', '', vingerafdruk)).fetchone()[0], 'toegepast')
            db.execute('RESET ROLE')
            doc = db.execute('select inhoud,versie from werkbank.documenten where id=12').fetchone()
            self.assertEqual(doc, ('Begin. Nieuwe formulering. Einde.', 3))
            self.assertEqual(db.execute('select inhoud from werkbank.documenten_historiek where document_id=12').fetchone()[0], 'Begin. Oude formulering. Einde.')
            db.rollback()

    def test_gewijzigde_inhoud_zonder_versieverhoging_belandt_nooit_bij_model(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute("update werkbank.documenten set inhoud='Andere inhoud zonder nieuwe versie' where id=12")
            db.execute('SET ROLE werkbank_agent')
            self.assertIsNone(db.execute('select opdracht_id from werkbank_private.agent_claim()').fetchone())
            db.execute('RESET ROLE')
            self.assertEqual(db.execute('select status from werkbank.agent_opdrachten where id=%s', (taak,)).fetchone()[0], 'mislukt')
            db.rollback()

    def test_onbekende_kost_pauzeert_de_werker_automatisch(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            token = db.execute('select claim_token from werkbank_private.agent_claim()').fetchone()[0]
            status = db.execute('select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (taak, token, 'antwoord', '', '', 'Controle nodig.', 'deepseek/deepseek-v4.1-flash', 20, 10, None)).fetchone()[0]
            self.assertEqual(status, 'mislukt')
            db.execute('RESET ROLE')
            self.assertFalse(db.execute('select actief from werkbank_private.agent_config').fetchone()[0])
            self.assertEqual(db.execute('select count(*) from werkbank.agent_voorstellen').fetchone()[0], 0)
            db.rollback()

    def test_werker_kan_fout_veilig_melden_zonder_vrije_tekst(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            token = db.execute('select claim_token from werkbank_private.agent_claim()').fetchone()[0]
            db.execute('select werkbank_private.agent_fout(%s,%s,%s)', (taak, token, 'model_fout'))
            db.execute('RESET ROLE')
            self.assertEqual(db.execute('select status,fout_code from werkbank.agent_opdrachten where id=%s', (taak,)).fetchone(), ('mislukt','model_fout'))
            db.rollback()

    def test_python_werker_draait_een_volledige_cyclus_op_lokale_postgres(self):
        from agent.werker import PostgresWachtrij, werk_een
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            def model(_):
                return {'tekst':'{"soort":"wijziging","oorspronkelijk":"Oude formulering.","voorstel":"Nieuwe formulering.","uitleg":"Leesbaarder."}',
                        'model':'deepseek/deepseek-v4.1-flash','tokens_in':20,'tokens_uit':10,'cost':0.001}
            self.assertEqual(werk_een(PostgresWachtrij(db), model), 'klaar')
            db.execute('RESET ROLE')
            self.assertEqual(db.execute('select status from werkbank.agent_opdrachten where id=%s',(taak,)).fetchone()[0], 'klaar')
            self.assertEqual(db.execute('select inhoud from werkbank.documenten where id=12').fetchone()[0], 'Begin. Oude formulering. Einde.')
            db.rollback()

    def test_een_verlopen_claim_kan_geen_resultaat_meer_plaatsen(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            oud = db.execute('select claim_token from werkbank_private.agent_claim()').fetchone()[0]
            db.execute('RESET ROLE')
            db.execute("update werkbank.agent_opdrachten set lease_tot=now()-interval '1 second' where id=%s", (taak,))
            db.execute('SET ROLE werkbank_agent')
            nieuw = db.execute('select claim_token from werkbank_private.agent_claim()').fetchone()[0]
            self.assertNotEqual(oud, nieuw)
            db.execute('SAVEPOINT oud_token')
            with self.assertRaisesRegex(psycopg.Error, 'claim_verlopen'):
                db.execute('select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                    (taak, oud, 'antwoord', '', '', 'Controle nodig.', 'deepseek/deepseek-v4.1-flash', 20, 10, Decimal('0.001')))
            db.execute('ROLLBACK TO SAVEPOINT oud_token')
            self.assertEqual(db.execute('select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                    (taak, nieuw, 'antwoord', '', '', 'Controle nodig.', 'deepseek/deepseek-v4.1-flash', 20, 10, Decimal('0.001'))).fetchone()[0], 'klaar')
            db.rollback()

    def test_z_twee_werkers_claimen_niet_dezelfde_opdracht(self):
        # Geïsoleerde scratchdatabase: deze laatste test commit de synthetische fixture
        # zodat twee onafhankelijke PostgreSQL-sessies werkelijk tegelijk kunnen lezen.
        with psycopg.connect(self.dsn) as setup:
            self.beveilig_testtabellen(setup)
            setup.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            setup.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            setup.execute('SET ROLE authenticated')
            taak = setup.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            setup.execute('RESET ROLE')
            setup.commit()
        with psycopg.connect(self.dsn) as eerste, psycopg.connect(self.dsn) as tweede:
            eerste.execute('SET ROLE werkbank_agent')
            tweede.execute('SET ROLE werkbank_agent')
            self.assertEqual(eerste.execute('select opdracht_id from werkbank_private.agent_claim()').fetchone()[0], taak)
            self.assertIsNone(tweede.execute('select opdracht_id from werkbank_private.agent_claim()').fetchone())
            eerste.rollback()
            tweede.rollback()

    def test_agentstatus_is_uit_zonder_vrijgave(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            self.assertFalse(db.execute('select werkbank.agent_status()').fetchone()[0])
            db.rollback()

    def test_anon_via_andere_schema_definer_houdt_agent_uit(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute("CREATE FUNCTION public.anon_lekt() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'select ''test''::text'")
            db.execute('REVOKE ALL ON FUNCTION public.anon_lekt() FROM PUBLIC')
            db.execute('GRANT EXECUTE ON FUNCTION public.anon_lekt() TO anon')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_anon_via_public_view_houdt_agent_uit(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('CREATE VIEW public.anon_view AS SELECT inhoud FROM werkbank.documenten')
            db.execute('GRANT SELECT ON public.anon_view TO anon')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_niet_lid_kan_niet_via_authenticated_definer_om_toegang_heen(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute("CREATE FUNCTION public.nietlid_lekt() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'select ''test''::text'")
            db.execute('REVOKE ALL ON FUNCTION public.nietlid_lekt() FROM PUBLIC')
            db.execute('GRANT EXECUTE ON FUNCTION public.nietlid_lekt() TO authenticated')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_niet_lid_kan_niet_via_authenticated_view_om_toegang_heen(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('CREATE VIEW public.nietlid_view AS SELECT inhoud FROM werkbank.documenten')
            db.execute('GRANT SELECT ON public.nietlid_view TO authenticated')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_auth_mag_geen_privé_toelatingslijst_aanpassen(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('GRANT UPDATE ON werkbank_private.agent_document_toelating TO authenticated')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_auth_mag_voorstellen_niet_rechtstreeks_bewerken(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('GRANT UPDATE (voorstel) ON werkbank.agent_voorstellen TO authenticated')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_agenttabellen_vereisen_een_beperkende_ledenpolicy(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            for tabel in ('agent_opdrachten','agent_voorstellen'):
                policy = db.execute("select 1 from pg_policies where schemaname='werkbank' and tablename=%s and policyname='wb_agent_leden_grens' and permissive='RESTRICTIVE'", (tabel,)).fetchone()
                self.assertIsNotNone(policy, f'{tabel} mist een beperkende ledenpolicy')
            db.rollback()

    def test_lid_kan_niet_zichzelf_eigenaar_maken_via_open_blokveld(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            token = db.execute('select claim_token from werkbank_private.agent_claim()').fetchone()[0]
            db.execute('select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                       (taak, token, 'wijziging', 'Oude formulering.', 'Nieuwe formulering.', 'Leesbaarder.', 'deepseek/deepseek-v4.1-flash', 20, 10, Decimal('0.001')))
            db.execute('RESET ROLE')
            voorstel = db.execute('select id from werkbank.agent_voorstellen where opdracht_id=%s', (taak,)).fetchone()[0]
            vingerafdruk = review_hash(voorstel, 2, 'Oude formulering.', 'Nieuwe formulering.', 'Leesbaarder.')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000002',))
            db.execute('SET ROLE authenticated')
            db.execute("update werkbank.blokken set eigenaar='Anthony' where id='2.1'")
            db.execute('SAVEPOINT vervalste_eigenaar')
            with self.assertRaisesRegex(psycopg.Error, 'niet_de_eigenaar'):
                db.execute('select werkbank.beoordeel_agentvoorstel(%s,%s,%s,%s)', (voorstel, 'toepassen', '', vingerafdruk))
            db.execute('ROLLBACK TO SAVEPOINT vervalste_eigenaar')
            db.execute('RESET ROLE')
            db.execute("insert into werkbank.blokken(id,eigenaar) values ('1.1','Anthony')")
            db.execute('SET ROLE authenticated')
            db.execute("update werkbank.documenten set blok_id='1.1' where id=12")
            db.execute('SAVEPOINT verplaatst_stuk')
            with self.assertRaisesRegex(psycopg.Error, 'niet_de_eigenaar'):
                db.execute('select werkbank.beoordeel_agentvoorstel(%s,%s,%s,%s)', (voorstel, 'toepassen', '', vingerafdruk))
            db.execute('ROLLBACK TO SAVEPOINT verplaatst_stuk')
            db.rollback()

    def test_werknemersrol_mag_niet_aan_een_andere_rol_zijn_uitgedeeld(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('CREATE ROLE andere_testwerker NOLOGIN')
            db.execute('GRANT werkbank_agent TO andere_testwerker')
            self.assertFalse(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_werkerrol_mag_rechtstreeks_login_krijgen_zonder_grant_aan_andere_rol(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('ALTER ROLE werkbank_agent LOGIN')
            self.assertTrue(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.rollback()

    def test_eigenaar_zonder_mfa_mag_niet_toepassen(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            token = db.execute('select claim_token from werkbank_private.agent_claim()').fetchone()[0]
            db.execute('select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                       (taak, token, 'wijziging', 'Oude formulering.', 'Nieuwe formulering.', 'Leesbaarder.', 'deepseek/deepseek-v4.1-flash', 20, 10, Decimal('0.001')))
            db.execute('RESET ROLE')
            voorstel = db.execute('select id from werkbank.agent_voorstellen where opdracht_id=%s', (taak,)).fetchone()[0]
            vingerafdruk = review_hash(voorstel, 2, 'Oude formulering.', 'Nieuwe formulering.', 'Leesbaarder.')
            db.execute("select set_config('request.jwt.claims', %s, false)", ('{"aal":"aal1"}',))
            db.execute('SET ROLE authenticated')
            with self.assertRaisesRegex(psycopg.Error, 'extra_verificatie_vereist'):
                db.execute('select werkbank.beoordeel_agentvoorstel(%s,%s,%s,%s)', (voorstel, 'toepassen', '', vingerafdruk))
            db.rollback()

    def test_review_moet_de_bekeken_voorstelinhoud_vastleggen(self):
        with psycopg.connect(self.dsn) as db:
            functie = db.execute("select to_regprocedure('werkbank.beoordeel_agentvoorstel(bigint,text,text,text)')").fetchone()[0]
            self.assertIsNotNone(functie, 'review moet een inhoudsvingerafdruk eisen')
            self.assertIsNone(db.execute("select to_regprocedure('werkbank.beoordeel_agentvoorstel(bigint,text,text)')").fetchone()[0], 'oude RPC zonder reviewcontrole mag niet bestaan')
            db.rollback()

    def test_reviewvingerafdruk_werkt_ook_met_unicode_in_postgres(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("update werkbank.documenten set inhoud='Begin. oud €. Einde.' where id=12")
            db.execute("update werkbank.notities set anker='oud €' where id=8")
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8,12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute('SET ROLE werkbank_agent')
            token = db.execute('select claim_token from werkbank_private.agent_claim()').fetchone()[0]
            db.execute('select werkbank_private.agent_klaar(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                       (taak,token,'wijziging','oud €','nieuw 🌱','Aanpassing.','deepseek/deepseek-v4.1-flash',20,10,Decimal('0.001')))
            db.execute('RESET ROLE')
            voorstel = db.execute('select id from werkbank.agent_voorstellen where opdracht_id=%s',(taak,)).fetchone()[0]
            vingerafdruk = review_hash(voorstel,2,'oud €','nieuw 🌱','Aanpassing.')
            db.execute("select set_config('request.jwt.claims', %s, false)", ('{"aal":"aal2"}',))
            db.execute('SET ROLE authenticated')
            self.assertEqual(db.execute('select werkbank.beoordeel_agentvoorstel(%s,%s,%s,%s)',(voorstel,'toepassen','',vingerafdruk)).fetchone()[0],'toegepast')
            db.execute('RESET ROLE')
            self.assertEqual(db.execute('select inhoud from werkbank.documenten where id=12').fetchone()[0],'Begin. nieuw 🌱. Einde.')
            db.rollback()

    def test_werker_leest_niet_meer_na_het_deactiveren_van_de_eigenaar(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000001',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute("update werkbank_private.agent_leden set actief=false where naam='Victor'")
            db.execute('SET ROLE werkbank_agent')
            self.assertIsNone(db.execute('select opdracht_id from werkbank_private.agent_claim()').fetchone())
            db.execute('RESET ROLE')
            self.assertEqual(db.execute('select status from werkbank.agent_opdrachten where id=%s',(taak,)).fetchone()[0], 'mislukt')
            db.rollback()

    def test_werker_leest_niet_meer_na_het_deactiveren_van_de_aanvrager(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            db.execute('update werkbank_private.agent_config set actief=true, kostenlimiet_gecontroleerd=true, brongateway_veilig=true')
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000002',))
            db.execute('SET ROLE authenticated')
            taak = db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12)).fetchone()[0]
            db.execute('RESET ROLE')
            db.execute("update werkbank_private.agent_leden set actief=false where naam='Anthony'")
            db.execute('SET ROLE werkbank_agent')
            self.assertIsNone(db.execute('select opdracht_id from werkbank_private.agent_claim()').fetchone())
            db.execute('RESET ROLE')
            self.assertEqual(db.execute('select status from werkbank.agent_opdrachten where id=%s',(taak,)).fetchone()[0], 'mislukt')
            db.rollback()

    def test_niet_lid_en_anon_kunnen_geen_opdracht_starten(self):
        with psycopg.connect(self.dsn) as db:
            self.beveilig_testtabellen(db)
            self.assertTrue(db.execute('select werkbank_private.agent_basis_veilig()').fetchone()[0])
            db.execute("select set_config('request.jwt.claim.sub', %s, false)", ('00000000-0000-0000-0000-000000000003',))
            db.execute('SET ROLE authenticated')
            with self.assertRaisesRegex(psycopg.Error, 'niet_toegelaten'):
                db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12))
            db.rollback()
        with psycopg.connect(self.dsn, autocommit=True) as db:
            db.execute('SET ROLE anon')
            with self.assertRaises(psycopg.Error):
                db.execute('select werkbank.vraag_agent(%s,%s)', (8, 12))

    def test_migratie_bestaat_en_kan_lokaal_worden_uitgevoerd(self):
        with psycopg.connect(self.dsn, autocommit=True) as db:
            tabel = db.execute("select to_regclass('werkbank.agent_opdrachten')").fetchone()[0]
        self.assertIsNotNone(tabel)


if __name__ == '__main__':
    unittest.main()
