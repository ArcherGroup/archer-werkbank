"""Tests voor de pure schema-migratiegenerator werkbank (geen netwerk, geen productie).

De optionele integratietest draait alleen met WERKBANK_MIGRATIE_PG_DSN en maakt dan
uitsluitend een eigen NIEUWE lokale database zonder data; niets wordt verwijderd.
"""
import importlib.util
import json
import os
import pathlib
import re
import sys
import unittest
import uuid

PAD = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "migratie_werkbank.py"


def laad_module():
    spec = importlib.util.spec_from_file_location("migratie_werkbank", PAD)
    assert spec is not None and spec.loader is not None, PAD
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


m = laad_module()

BRON = "thbjzrdogebyhbkkbxzp"
DOEL = "znqcljyroirxvvllhygu"
DEELNEMERS = "pgajmjeicrwxthkwwiei"

VOL = "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}"
VOL_SEQ = "{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}"
FUNCTIE_DEF = (
    "CREATE OR REPLACE FUNCTION werkbank.zoek_inhoud(q text)\n RETURNS SETOF json\n LANGUAGE sql\n STABLE\n"
    "AS $function$\n  select json_build_object(\n    'document_id', d.id,\n    'titel', d.titel,\n"
    "    'snippet', ts_headline('dutch', d.inhoud, websearch_to_tsquery('dutch', q), "
    "'MaxWords=28, MinWords=8, StartSel=<<, StopSel=>>')\n  )\n  from werkbank.documenten d\n"
    "  where d.inhoud is not null and to_tsvector('dutch', d.inhoud) @@ websearch_to_tsquery('dutch', q)\n"
    "  limit 25;\n$function$\n"
)


def maak_meta():
    """Kleine synthetische metadata met dezelfde structuur als source-metadata.json (geen data)."""

    def rel(naam, soort, acl=None, rls=False):
        return {"acl": acl, "eigenaar": "postgres", "relforcerowsecurity": False, "relkind": soort,
                "relname": naam, "relreplident": "d" if soort == "r" else "n", "relrowsecurity": rls,
                "reloptions": None}

    def kol(tabel, nr, naam, soort, nn=True, default=None, identity=None):
        udt = {"bigint": "int8", "integer": "int4", "text": "text", "timestamp with time zone": "timestamptz"}[soort]
        return {"column_default": default, "column_name": naam, "data_type": soort, "generation_expression": None,
                "identity_generation": identity, "is_generated": "NEVER", "is_identity": "YES" if identity else "NO",
                "is_nullable": "NO" if nn else "YES", "ordinal_position": nr, "table_name": tabel,
                "table_schema": "werkbank", "udt_name": udt, "udt_schema": "pg_catalog"}

    def seq(naam):
        return {"cache_size": 1, "cycle": False, "data_type": "bigint", "increment_by": 1, "last_value": 987654,
                "max_value": "9223372036854775807", "min_value": 1, "schemaname": "werkbank", "sequencename": naam,
                "start_value": 1}

    def con(tabel, naam, soort, definitie):
        return {"conname": naam, "contype": soort, "definitie": definitie, "relname": tabel}

    def idx(tabel, naam, definitie):
        return {"indexdef": definitie, "indexname": naam, "tablename": tabel}

    def pol(tabel, naam, cmd, rollen, qual, check):
        return {"cmd": cmd, "permissive": "PERMISSIVE", "policyname": naam, "qual": qual, "roles": rollen,
                "schemaname": "werkbank", "tablename": tabel, "with_check": check}

    nu = "now()"
    voorv = "nextval('werkbank.%s_id_seq'::regclass)"
    klik_acl = "{postgres=arwdDxtm/postgres,anon=ar/postgres,authenticated=ar/postgres}"
    policies = []
    for tabel in ("blokken", "documenten", "notities"):
        policies.append(pol(tabel, "intern_lezen", "SELECT", "{anon,authenticated}", "true", None))
        policies.append(pol(tabel, "intern_schrijven", "ALL", "{anon,authenticated}", "true", "true"))
    policies.append(pol("klikplekken", "klikplekken_lezen", "SELECT", "{public}", "true", None))
    policies.append(pol("klikplekken", "klikplekken_schrijven", "INSERT", "{public}", None, "true"))
    return {
        "relations": [
            rel("blokken", "r", VOL, True), rel("blokken_pkey", "i"),
            rel("documenten", "r", VOL, True), rel("documenten_fts", "i"), rel("documenten_pad_key", "i"),
            rel("documenten_pkey", "i"), rel("documenten_id_seq", "S", VOL_SEQ),
            rel("klikplekken", "r", klik_acl, True), rel("klikplekken_doc_tijd", "i"), rel("klikplekken_pkey", "i"),
            rel("klikplekken_id_seq", "S", None),
            rel("notities", "r", VOL, True), rel("notities_pkey", "i"), rel("notities_id_seq", "S", VOL_SEQ),
        ],
        "columns": [
            kol("blokken", 1, "id", "text"), kol("blokken", 2, "titel", "text"),
            kol("blokken", 3, "status", "text", default="'Leeg'::text"),
            kol("documenten", 1, "id", "bigint", default=voorv % "documenten"),
            kol("documenten", 2, "blok_id", "text"), kol("documenten", 3, "titel", "text"),
            kol("documenten", 4, "pad", "text", nn=False), kol("documenten", 5, "inhoud", "text", nn=False),
            kol("documenten", 6, "updated_at", "timestamp with time zone", default=nu),
            kol("documenten", 7, "versie", "integer", default="1"),
            kol("klikplekken", 1, "id", "bigint", identity="ALWAYS"),
            kol("klikplekken", 2, "document_id", "text"),
            kol("klikplekken", 3, "created_at", "timestamp with time zone", default=nu),
            kol("notities", 1, "id", "bigint", default=voorv % "notities"),
            kol("notities", 2, "parent_id", "bigint", nn=False), kol("notities", 3, "tekst", "text"),
        ],
        "constraints": [
            con("blokken", "blokken_pkey", "p", "PRIMARY KEY (id)"),
            con("documenten", "documenten_blok_id_fkey", "f",
                "FOREIGN KEY (blok_id) REFERENCES werkbank.blokken(id) ON DELETE CASCADE"),
            con("documenten", "documenten_pad_key", "u", "UNIQUE (pad)"),
            con("documenten", "documenten_pkey", "p", "PRIMARY KEY (id)"),
            con("klikplekken", "klikplekken_pkey", "p", "PRIMARY KEY (id)"),
            con("notities", "notities_parent_id_fkey", "f",
                "FOREIGN KEY (parent_id) REFERENCES werkbank.notities(id) ON DELETE CASCADE"),
            con("notities", "notities_pkey", "p", "PRIMARY KEY (id)"),
        ],
        "indexes": [
            idx("blokken", "blokken_pkey", "CREATE UNIQUE INDEX blokken_pkey ON werkbank.blokken USING btree (id)"),
            idx("documenten", "documenten_fts", "CREATE INDEX documenten_fts ON werkbank.documenten USING gin "
                "(to_tsvector('dutch'::regconfig, COALESCE(inhoud, ''::text)))"),
            idx("documenten", "documenten_pad_key",
                "CREATE UNIQUE INDEX documenten_pad_key ON werkbank.documenten USING btree (pad)"),
            idx("documenten", "documenten_pkey",
                "CREATE UNIQUE INDEX documenten_pkey ON werkbank.documenten USING btree (id)"),
            idx("klikplekken", "klikplekken_doc_tijd", "CREATE INDEX klikplekken_doc_tijd ON werkbank.klikplekken "
                "USING btree (document_id, created_at DESC)"),
            idx("klikplekken", "klikplekken_pkey",
                "CREATE UNIQUE INDEX klikplekken_pkey ON werkbank.klikplekken USING btree (id)"),
            idx("notities", "notities_pkey", "CREATE UNIQUE INDEX notities_pkey ON werkbank.notities USING btree (id)"),
        ],
        "sequences": [seq("documenten_id_seq"), seq("klikplekken_id_seq"), seq("notities_id_seq")],
        "functions": [{"acl": "{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,"
                              "service_role=X/postgres}", "args": "q text", "definitie": FUNCTIE_DEF,
                       "proname": "zoek_inhoud"}],
        "policies": policies,
        "publication": [{"pubname": "supabase_realtime", "schemaname": "werkbank", "tablename": "documenten"}],
        "grants": [], "triggers": [], "types": [], "extension_dependencies": [],
    }


class ControleerProjectenTest(unittest.TestCase):
    def test_exacte_bron_en_doel_zijn_toegestaan(self):
        self.assertIs(m.controleer_projecten(BRON, DOEL), True)

    def test_alles_anders_wordt_fail_closed_geweigerd(self):
        geweigerd = [
            (DOEL, BRON),  # omgekeerd
            (BRON, BRON),
            (DOEL, DOEL),
            (BRON, DEELNEMERS),  # deelnemersbron is nooit schrijfdoel
            (DEELNEMERS, DOEL),
            (BRON, "Invest V0"),
            ("Invest V0", DOEL),
            (BRON, "invest-v0"),
            (BRON.upper(), DOEL),  # geen case-folding
            (" " + BRON, DOEL),  # geen trimmen
            (BRON, DOEL + "\n"),
            (BRON[:-1], DOEL),
            (BRON, DOEL + "x"),
            (BRON, ""),
            ("", ""),
            (None, DOEL),
            (BRON, None),
            (BRON.encode(), DOEL),
            ([BRON], DOEL),
        ]
        for bron, doel in geweigerd:
            with self.subTest(bron=bron, doel=doel):
                with self.assertRaises(m.MigratieFout):
                    m.controleer_projecten(bron, doel)

    def test_deelnemersbron_als_doel_krijgt_expliciete_melding(self):
        with self.assertRaisesRegex(m.MigratieFout, "read-only"):
            m.controleer_projecten(BRON, DEELNEMERS)


class ApiSchemaPatchTest(unittest.TestCase):
    def test_voegt_werkbank_toe_en_behoudt_bestaande_schemata_in_volgorde(self):
        patch = m.api_schema_patch({"db_schema": "public, storage,graphql_public"})
        self.assertEqual(patch, {"db_schema": "public,storage,graphql_public,werkbank"})

    def test_payload_bevat_alleen_db_schema_en_geen_andere_config(self):
        huidig = {"db_schema": "public", "max_rows": 1000, "jwt_secret": "geheim", "db_pool": None}
        self.assertEqual(list(m.api_schema_patch(huidig)), ["db_schema"])

    def test_werkbank_komt_precies_een_keer_voor_en_verschuift_niet(self):
        eerder = m.api_schema_patch({"db_schema": "public,werkbank,storage"})
        self.assertEqual(eerder, {"db_schema": "public,werkbank,storage"})
        dubbel = m.api_schema_patch({"db_schema": "werkbank, public,werkbank"})
        self.assertEqual(dubbel, {"db_schema": "werkbank,public"})
        herhaald = m.api_schema_patch(m.api_schema_patch({"db_schema": "public"}))
        self.assertEqual(herhaald, {"db_schema": "public,werkbank"})

    def test_lijstvorm_wordt_ondersteund_en_invoer_blijft_ongewijzigd(self):
        huidig = {"db_schema": ["public", "storage"]}
        self.assertEqual(m.api_schema_patch(huidig), {"db_schema": "public,storage,werkbank"})
        self.assertEqual(huidig, {"db_schema": ["public", "storage"]})

    def test_onbekende_of_onveilige_config_wordt_geweigerd_in_plaats_van_public_te_verliezen(self):
        onveilig = [None, [], "public", {}, {"db_schema": None}, {"db_schema": ""}, {"db_schema": " , "},
                    {"db_schema": 5}, {"db_schema": "public;drop"}, {"db_schema": "pub lic"},
                    {"db_schema": ["public", ""]}, {"db_schema": 'pub"lic'}]
        for config in onveilig:
            with self.subTest(config=config):
                with self.assertRaises(m.MigratieFout):
                    m.api_schema_patch(config)


class SchemaSkeletTest(unittest.TestCase):
    def setUp(self):
        self.meta = maak_meta()
        self.stmts = m.maak_schema_statements(self.meta)
        self.sql = m.maak_schema_sql(self.meta)

    def test_een_transactie_met_lokale_timeouts_direct_na_begin(self):
        self.assertEqual(self.stmts[0], "BEGIN")
        self.assertEqual(self.stmts[-1], "COMMIT")
        self.assertEqual(self.stmts.count("BEGIN"), 1)
        self.assertEqual(self.stmts.count("COMMIT"), 1)
        self.assertEqual(self.stmts[1], "SET LOCAL lock_timeout = '1s'")
        self.assertEqual(self.stmts[2], "SET LOCAL statement_timeout = '30s'")
        andere_set = [s for s in self.stmts if s.upper().startswith("SET ") and not s.startswith("SET LOCAL")]
        self.assertEqual(andere_set, [])

    def test_schema_wordt_zonder_if_not_exists_gemaakt_zodat_bestaand_doel_faalt(self):
        self.assertEqual(self.stmts.count("CREATE SCHEMA werkbank"), 1)
        self.assertEqual(self.stmts[3], "CREATE SCHEMA werkbank")
        for verboden in ("IF NOT EXISTS", "IF EXISTS", "OR REPLACE"):
            self.assertNotIn(verboden, self.sql.upper())

    def test_sql_is_exact_de_statements_gescheiden_door_puntkomma(self):
        self.assertEqual(self.sql, "".join(s + ";\n" for s in self.stmts))
        self.assertTrue(self.sql.startswith("BEGIN;\n"))
        self.assertTrue(self.sql.endswith("COMMIT;\n"))

    def test_generator_is_deterministisch_en_wijzigt_de_metadata_niet(self):
        voor = maak_meta()
        self.assertEqual(m.maak_schema_sql(self.meta), self.sql)
        self.assertEqual(self.meta, voor)


def regels(statement):
    return [regel.strip().rstrip(",") for regel in statement.splitlines()]


def vind(statements, voorvoegsel):
    gevonden = [s for s in statements if s.startswith(voorvoegsel)]
    assert len(gevonden) == 1, (voorvoegsel, gevonden)
    return gevonden[0]


IDENTITEIT = ("GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME werkbank.klikplekken_id_seq START WITH 1 INCREMENT BY 1 "
              "MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE)")


class TabellenEnSequencesTest(unittest.TestCase):
    def setUp(self):
        self.meta = maak_meta()
        self.stmts = m.maak_schema_statements(self.meta)

    def test_alle_brontabellen_worden_in_werkbank_gemaakt_met_kolommen_in_volgorde(self):
        tabellen = sorted(s.split()[2] for s in self.stmts if s.startswith("CREATE TABLE "))
        self.assertEqual(tabellen, ["werkbank.blokken", "werkbank.documenten", "werkbank.klikplekken",
                                    "werkbank.notities"])
        blokken = regels(vind(self.stmts, "CREATE TABLE werkbank.blokken "))
        self.assertIn("id text NOT NULL", blokken)
        self.assertIn("status text DEFAULT 'Leeg'::text NOT NULL", blokken)
        self.assertLess(blokken.index("id text NOT NULL"), blokken.index("titel text NOT NULL"))
        documenten = regels(vind(self.stmts, "CREATE TABLE werkbank.documenten "))
        self.assertIn("pad text", documenten)
        self.assertIn("updated_at timestamp with time zone DEFAULT now() NOT NULL", documenten)
        self.assertIn("versie integer DEFAULT 1 NOT NULL", documenten)

    def test_serial_default_verwijst_naar_werkbank_sequence(self):
        documenten = regels(vind(self.stmts, "CREATE TABLE werkbank.documenten "))
        self.assertIn("id bigint DEFAULT nextval('werkbank.documenten_id_seq'::regclass) NOT NULL", documenten)

    def test_identity_always_wordt_in_de_kolom_gemaakt(self):
        klik = regels(vind(self.stmts, "CREATE TABLE werkbank.klikplekken "))
        self.assertIn("id bigint %s NOT NULL" % IDENTITEIT, klik)

    def test_identity_sequence_wordt_niet_dubbel_gemaakt_en_serial_sequences_wel_een_keer(self):
        seqs = [s for s in self.stmts if s.startswith("CREATE SEQUENCE ")]
        namen = sorted(s.split()[2] for s in seqs)
        self.assertEqual(namen, ["werkbank.documenten_id_seq", "werkbank.notities_id_seq"])
        self.assertEqual(
            vind(self.stmts, "CREATE SEQUENCE werkbank.documenten_id_seq "),
            "CREATE SEQUENCE werkbank.documenten_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 "
            "MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE")
        for s in self.stmts:
            self.assertNotIn("ALTER SEQUENCE werkbank.klikplekken_id_seq", s)

    def test_sequences_bestaan_voor_de_tabellen_en_owned_by_komt_erna_met_juiste_kolom(self):
        positie = {s: i for i, s in enumerate(self.stmts)}
        tabel = vind(self.stmts, "CREATE TABLE werkbank.documenten ")
        seq = vind(self.stmts, "CREATE SEQUENCE werkbank.documenten_id_seq ")
        eigen = "ALTER SEQUENCE werkbank.documenten_id_seq OWNED BY werkbank.documenten.id"
        self.assertLess(positie[seq], positie[tabel])
        self.assertLess(positie[tabel], positie[eigen])
        self.assertIn("ALTER SEQUENCE werkbank.notities_id_seq OWNED BY werkbank.notities.id", self.stmts)
        self.assertEqual(len([s for s in self.stmts if " OWNED BY " in s]), 2)

    def test_geen_sequencestand_of_datawaarde_in_de_sql(self):
        sql = m.maak_schema_sql(self.meta)
        self.assertNotIn("987654", sql)
        for verboden in ("setval", "last_value"):
            self.assertNotIn(verboden, sql)
        eerste_woorden = {s.split()[0] for s in self.stmts}
        self.assertFalse(eerste_woorden & {"INSERT", "COPY", "UPDATE", "DELETE", "TRUNCATE", "DROP", "MERGE"})


class ConstraintsEnIndexesTest(unittest.TestCase):
    def setUp(self):
        self.meta = maak_meta()
        self.stmts = m.maak_schema_statements(self.meta)

    def test_primary_en_unique_constraints_staan_in_de_tabel(self):
        documenten = regels(vind(self.stmts, "CREATE TABLE werkbank.documenten "))
        self.assertIn("CONSTRAINT documenten_pkey PRIMARY KEY (id)", documenten)
        self.assertIn("CONSTRAINT documenten_pad_key UNIQUE (pad)", documenten)
        self.assertIn("CONSTRAINT klikplekken_pkey PRIMARY KEY (id)",
                      regels(vind(self.stmts, "CREATE TABLE werkbank.klikplekken ")))

    def test_foreign_keys_komen_na_alle_tabellen_en_blijven_binnen_werkbank(self):
        fk = ("ALTER TABLE werkbank.documenten ADD CONSTRAINT documenten_blok_id_fkey FOREIGN KEY (blok_id) "
              "REFERENCES werkbank.blokken(id) ON DELETE CASCADE")
        zelf = ("ALTER TABLE werkbank.notities ADD CONSTRAINT notities_parent_id_fkey FOREIGN KEY (parent_id) "
                "REFERENCES werkbank.notities(id) ON DELETE CASCADE")
        self.assertIn(fk, self.stmts)
        self.assertIn(zelf, self.stmts)
        laatste_tabel = max(i for i, s in enumerate(self.stmts) if s.startswith("CREATE TABLE "))
        self.assertGreater(self.stmts.index(fk), laatste_tabel)
        self.assertGreater(self.stmts.index(zelf), laatste_tabel)
        self.assertEqual(len([s for s in self.stmts if "FOREIGN KEY" in s]), 2)

    def test_indexen_die_al_door_constraints_ontstaan_worden_niet_dubbel_gemaakt(self):
        indexen = [s for s in self.stmts if s.startswith(("CREATE INDEX", "CREATE UNIQUE INDEX"))]
        self.assertEqual(sorted(indexen), sorted([
            "CREATE INDEX documenten_fts ON werkbank.documenten USING gin "
            "(to_tsvector('dutch'::regconfig, COALESCE(inhoud, ''::text)))",
            "CREATE INDEX klikplekken_doc_tijd ON werkbank.klikplekken USING btree (document_id, created_at DESC)",
        ]))

    def test_unieke_index_zonder_constraint_blijft_behouden(self):
        self.meta["indexes"].append({
            "indexdef": "CREATE UNIQUE INDEX notities_tekst_uniek ON werkbank.notities USING btree (tekst)",
            "indexname": "notities_tekst_uniek", "tablename": "notities"})
        stmts = m.maak_schema_statements(self.meta)
        self.assertIn("CREATE UNIQUE INDEX notities_tekst_uniek ON werkbank.notities USING btree (tekst)", stmts)

    def test_cross_schema_of_ongekwalificeerde_foreign_key_wordt_geweigerd(self):
        for verwijzing in ("auth.users(id)", "public.blokken(id)", "storage.objects(id)", "blokken(id)",
                           '"public".blokken(id)', "werkbank.bestaat_niet(id)"):
            meta = maak_meta()
            for con in meta["constraints"]:
                if con["conname"] == "documenten_blok_id_fkey":
                    con["definitie"] = "FOREIGN KEY (blok_id) REFERENCES %s ON DELETE CASCADE" % verwijzing
            with self.subTest(verwijzing=verwijzing):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)

    def test_cross_schema_fk_melding_noemt_het_schema(self):
        for con in self.meta["constraints"]:
            if con["conname"] == "documenten_blok_id_fkey":
                con["definitie"] = "FOREIGN KEY (blok_id) REFERENCES auth.users(id)"
        with self.assertRaisesRegex(m.MigratieFout, "cross-schema.*auth"):
            m.maak_schema_statements(self.meta)

    def test_onbekende_constraintsoort_en_index_op_ander_schema_worden_geweigerd(self):
        meta = maak_meta()
        meta["constraints"].append({"conname": "uitsluiting", "contype": "x", "relname": "blokken",
                                    "definitie": "EXCLUDE USING gist (id WITH =)"})
        with self.assertRaises(m.MigratieFout):
            m.maak_schema_statements(meta)
        meta = maak_meta()
        meta["indexes"].append({"indexdef": "CREATE INDEX vreemd ON public.blokken USING btree (titel)",
                                "indexname": "vreemd", "tablename": "blokken"})
        with self.assertRaises(m.MigratieFout):
            m.maak_schema_statements(meta)


class FunctieTest(unittest.TestCase):
    def setUp(self):
        self.meta = maak_meta()
        self.stmts = m.maak_schema_statements(self.meta)

    def test_zoek_inhoud_wordt_als_nieuwe_invoker_functie_in_werkbank_gemaakt(self):
        functies = [s for s in self.stmts if s.startswith("CREATE FUNCTION ")]
        self.assertEqual(functies, [FUNCTIE_DEF.replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION").rstrip()])
        self.assertNotIn("SECURITY DEFINER", functies[0])
        self.assertIn("LANGUAGE sql\n STABLE", functies[0])

    def test_functie_komt_na_de_tabellen_waar_de_body_naar_verwijst(self):
        laatste_tabel = max(i for i, s in enumerate(self.stmts) if s.startswith("CREATE TABLE "))
        functie = next(i for i, s in enumerate(self.stmts) if s.startswith("CREATE FUNCTION "))
        self.assertGreater(functie, laatste_tabel)

    def test_onveilige_of_vreemde_functiekoppen_worden_geweigerd(self):
        koppen = {
            "security definer": lambda d: d.replace("STABLE\n", "STABLE\n SECURITY DEFINER\n"),
            "andere taal": lambda d: d.replace("LANGUAGE sql", "LANGUAGE plpgsql"),
            "ander schema": lambda d: d.replace("FUNCTION werkbank.zoek_inhoud", "FUNCTION public.zoek_inhoud"),
            "andere naam": lambda d: d.replace("werkbank.zoek_inhoud(", "werkbank.ander(", 1),
            "ongeldig type": lambda d: d.replace("RETURNS SETOF json", "RETURNS SETOF public.mijn_type"),
            "config": lambda d: d.replace("STABLE\n", "STABLE\n SET search_path TO 'public'\n"),
            "geen create": lambda d: d.replace("CREATE OR REPLACE FUNCTION", "DROP FUNCTION"),
        }
        for naam, wijzig in koppen.items():
            meta = maak_meta()
            meta["functions"][0]["definitie"] = wijzig(FUNCTIE_DEF)
            with self.subTest(naam):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)

    def test_ongeldige_argumenten_en_dollar_quote_manipulatie_worden_geweigerd(self):
        for args in ("q text) RETURNS void AS $$ select 1 $$ LANGUAGE sql; --", "q public.mijn_type", "q text, ", ""):
            meta = maak_meta()
            meta["functions"][0]["args"] = args
            with self.subTest(args=args):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)
        meta = maak_meta()
        meta["functions"][0]["definitie"] = FUNCTIE_DEF.replace("limit 25;", "limit 25; $function$ ; drop schema x;")
        with self.assertRaises(m.MigratieFout):
            m.maak_schema_statements(meta)


class CrossSchemaReferentiesTest(unittest.TestCase):
    def met_default(self, default):
        meta = maak_meta()
        for kolom in meta["columns"]:
            if (kolom["table_name"], kolom["column_name"]) == ("blokken", "status"):
                kolom["column_default"] = default
        return meta

    def met_body(self, body):
        meta = maak_meta()
        meta["functions"][0]["definitie"] = FUNCTIE_DEF.replace(
            "select json_build_object(", body + "\n  select json_build_object(", 1)
        return meta

    def test_defaults_met_verwijzing_buiten_werkbank_worden_geweigerd(self):
        geweigerd = [
            "nextval('public.x_seq'::regclass)", "nextval('x_seq'::regclass)", "nextval('x_seq')",
            "nextval('\"public\".x_seq'::regclass)", "nextval('werkbank.onbekend_seq'::regclass)",
            "nextval('werkbank.documenten_id_seq'::regclass) + 1", "public.nieuw_id()", "auth.uid()::text",
            "'x'::public.mijn_type", "extensions.uuid_generate_v4()", "'a'::text; drop schema public",
            "'a'::text -- opmerking", "pg_catalog.now()", "'x\\\\'::text", "'open",
            "to_regclass('storage.objects')::text", "'public.x'::regclass",
        ]
        for default in geweigerd:
            with self.subTest(default=default):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(self.met_default(default))

    def test_melding_noemt_cross_schema_en_de_plek(self):
        with self.assertRaisesRegex(m.MigratieFout, r"cross-schema.*blokken\.status.*public"):
            m.maak_schema_statements(self.met_default("nextval('public.x_seq'::regclass)"))

    def test_legitieme_defaults_blijven_toegestaan(self):
        for default in ("now()", "'Leeg'::text", "0", "false", "'a.b'::text", "'storage.objects'::text",
                        "CURRENT_TIMESTAMP", "(1 + 2)", "'dutch'::regconfig"):
            with self.subTest(default=default):
                stmts = m.maak_schema_statements(self.met_default(default))
                self.assertIn("status text DEFAULT %s NOT NULL" % default,
                              regels(vind(stmts, "CREATE TABLE werkbank.blokken ")))

    def test_functie_met_cross_schema_lees_of_schrijfverwijzing_wordt_geweigerd(self):
        geweigerd = [
            "insert into public.audit(x) select 1;", "delete from auth.users;", "update storage.objects set name = 'x';",
            "select * from public.documenten;", "select * from documenten;", "insert into documenten select 1;",
            "select public.helper(1);", "select auth.uid();", "select 1::public.mijn_type;",
            'select * from "public".documenten;', "select * from werkbank.documenten, public.x;",
            "select * from werkbank.documenten join auth.users u on true;", "select x.y.z from werkbank.documenten;",
            "select * from werkbank.documenten d where d.id in (select id from storage.objects);",
            "drop table werkbank.documenten;", "truncate werkbank.documenten;", "create table werkbank.x();",
            "grant all on schema werkbank to public;", "alter role postgres set x = 1;", "set search_path = public;",
            "copy werkbank.documenten to stdin;", "select nextval('public.s');", "select 1 operator(public.+) 2;",
            "select public.documenten.id from werkbank.documenten;", "select * from werkbank.documenten into nieuw;",
            "select * from werkbank.documenten \\\\ ;",
        ]
        for body in geweigerd:
            with self.subTest(body=body):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(self.met_body(body))

    def test_functie_cross_schema_melding_noemt_schema_en_functie(self):
        with self.assertRaisesRegex(m.MigratieFout, r"cross-schema.*zoek_inhoud.*public"):
            m.maak_schema_statements(self.met_body("insert into public.audit(x) select 1;"))

    def test_functie_met_schrijf_naar_werkbank_en_gewone_aliassen_blijft_toegestaan(self):
        toegestaan = [
            "select 'public.x', 'auth.uid()' from werkbank.documenten d where d.id > 0;  -- from public.x",
            "/* public.x */ select d.id, documenten.titel from werkbank.documenten as d, werkbank.documenten;",
            "insert into werkbank.documenten(blok_id, soort, titel) select 'a', 'b', 'c';",
            "with t as (select 1 as n) select t.n from t;",
            "select s.n from (select 1 as n) s;",
            "select * from generate_series(1, 3);",
            'select * from "werkbank".documenten;',
            "select 'x' is distinct from 'y';",
        ]
        for body in toegestaan:
            with self.subTest(body=body):
                stmts = m.maak_schema_statements(self.met_body(body))
                self.assertTrue(any(s.startswith("CREATE FUNCTION werkbank.zoek_inhoud") for s in stmts))

    def test_dollar_quotes_en_commentaar_verbergen_geen_verwijzingen_of_statements(self):
        toegestaan = [
            "select $q$ public.x; drop table y $q$ from werkbank.documenten d;",
            "select $$a.b$$ from werkbank.documenten d;",
            "select 1 /* ; drop table x */ from werkbank.documenten d;",
            "with x as (delete from werkbank.documenten returning id) select id from x;",
        ]
        for body in toegestaan:
            with self.subTest(toegestaan=body):
                m.maak_schema_statements(self.met_body(body))
        geweigerd = [
            "select 1; drop table werkbank.documenten;",
            "select 1; grant all on all tables in schema werkbank to anon;",
            "select 1 /* niet afgesloten ; select public.x from werkbank.documenten d;",
            "with x as (delete from auth.users returning id) select id from x;",
            "select 1 from werkbank.documenten d; select * from werkbank.documenten, public.x;",
            "select * from /* verbergt de tabel */ documenten;",
            "insert into -- verbergt de tabel\n documenten select 1;",
        ]
        for body in geweigerd:
            with self.subTest(geweigerd=body):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(self.met_body(body))
        with self.assertRaises(m.MigratieFout):
            m.maak_schema_statements(self.met_default("$$x$$::text"))

    def test_index_met_functie_of_type_buiten_werkbank_wordt_geweigerd(self):
        for staart in ("(public.f(titel))", "(titel) WHERE auth.uid() IS NOT NULL", "(titel::public.t)",
                       "(titel); DROP SCHEMA public"):
            meta = maak_meta()
            meta["indexes"].append({"indexdef": "CREATE INDEX x_idx ON werkbank.blokken USING btree " + staart,
                                    "indexname": "x_idx", "tablename": "blokken"})
            with self.subTest(staart=staart):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)


class RlsEnPoliciesTest(unittest.TestCase):
    def setUp(self):
        self.meta = maak_meta()
        self.stmts = m.maak_schema_statements(self.meta)

    def test_row_level_security_wordt_per_tabel_aangezet_zoals_in_de_bron(self):
        rls = sorted(s for s in self.stmts if "ROW LEVEL SECURITY" in s)
        self.assertEqual(rls, ["ALTER TABLE werkbank.%s ENABLE ROW LEVEL SECURITY" % t
                               for t in ("blokken", "documenten", "klikplekken", "notities")])
        meta = maak_meta()
        for rel in meta["relations"]:
            if rel["relname"] == "notities":
                rel["relrowsecurity"] = False
            if rel["relname"] == "blokken":
                rel["relforcerowsecurity"] = True
        stmts = m.maak_schema_statements(meta)
        self.assertNotIn("ALTER TABLE werkbank.notities ENABLE ROW LEVEL SECURITY", stmts)
        self.assertIn("ALTER TABLE werkbank.blokken FORCE ROW LEVEL SECURITY", stmts)

    def test_alle_policies_worden_exact_overgenomen_met_rollenlijst(self):
        policies = [s for s in self.stmts if s.startswith("CREATE POLICY ")]
        self.assertEqual(len(policies), 8)
        self.assertIn("CREATE POLICY intern_lezen ON werkbank.blokken AS PERMISSIVE FOR SELECT "
                      "TO anon, authenticated USING (true)", policies)
        self.assertIn("CREATE POLICY intern_schrijven ON werkbank.documenten AS PERMISSIVE FOR ALL "
                      "TO anon, authenticated USING (true) WITH CHECK (true)", policies)
        self.assertIn("CREATE POLICY klikplekken_lezen ON werkbank.klikplekken AS PERMISSIVE FOR SELECT "
                      "TO PUBLIC USING (true)", policies)
        self.assertIn("CREATE POLICY klikplekken_schrijven ON werkbank.klikplekken AS PERMISSIVE FOR INSERT "
                      "TO PUBLIC WITH CHECK (true)", policies)

    def test_policies_komen_na_tabellen_en_rls_en_roles_mogen_ook_een_lijst_zijn(self):
        eerste_policy = min(i for i, s in enumerate(self.stmts) if s.startswith("CREATE POLICY "))
        laatste_rls = max(i for i, s in enumerate(self.stmts) if "ROW LEVEL SECURITY" in s)
        self.assertGreater(eerste_policy, laatste_rls)
        meta = maak_meta()
        meta["policies"][0]["roles"] = ["anon", "authenticated"]
        self.assertIn("CREATE POLICY intern_lezen ON werkbank.blokken AS PERMISSIVE FOR SELECT "
                      "TO anon, authenticated USING (true)", m.maak_schema_statements(meta))

    def test_restrictive_policy_blijft_restrictive(self):
        meta = maak_meta()
        meta["policies"][0]["permissive"] = "RESTRICTIVE"
        stmts = m.maak_schema_statements(meta)
        self.assertIn("CREATE POLICY intern_lezen ON werkbank.blokken AS RESTRICTIVE FOR SELECT "
                      "TO anon, authenticated USING (true)", stmts)

    def test_ongeldige_of_vreemde_policies_worden_geweigerd(self):
        wijzigingen = {
            "ander schema": {"schemaname": "public"},
            "onbekende tabel": {"tablename": "bestaat_niet"},
            "tabel met punt": {"tablename": "public.blokken"},
            "onbekend commando": {"cmd": "DROP"},
            "onbekend type": {"permissive": "MAYBE"},
            "rolnaam met quote": {"roles": '{"a b"}'},
            "rolnaam met sql": {"roles": "{anon;drop}"},
            "lege rollen": {"roles": "{}"},
            "policynaam": {"policyname": "naam met spatie"},
            "cross-schema expressie": {"qual": "auth.uid() IS NOT NULL"},
            "cross-schema check": {"with_check": "EXISTS (SELECT 1 FROM public.leden)"},
            "meerdere statements": {"qual": "true); DROP SCHEMA public; --"},
            "geen expressie": {"qual": None, "with_check": None},
        }
        for naam, wijziging in wijzigingen.items():
            meta = maak_meta()
            meta["policies"][1].update(wijziging)
            with self.subTest(naam):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)

    def test_dubbele_policynaam_op_dezelfde_tabel_wordt_geweigerd(self):
        meta = maak_meta()
        meta["policies"].append(dict(meta["policies"][0]))
        with self.assertRaises(m.MigratieFout):
            m.maak_schema_statements(meta)

    def test_replica_identity_en_reloptions(self):
        meta = maak_meta()
        for rel in meta["relations"]:
            if rel["relname"] == "blokken":
                rel["relreplident"] = "f"
            if rel["relname"] == "notities":
                rel["relreplident"] = "n"
        stmts = m.maak_schema_statements(meta)
        self.assertIn("ALTER TABLE werkbank.blokken REPLICA IDENTITY FULL", stmts)
        self.assertIn("ALTER TABLE werkbank.notities REPLICA IDENTITY NOTHING", stmts)
        self.assertEqual(len([s for s in stmts if "REPLICA IDENTITY" in s]), 2)
        for wijziging in ({"relreplident": "i"}, {"relreplident": "x"}, {"reloptions": ["fillfactor=70"]},
                          {"eigenaar": "iemand_anders"}):
            meta = maak_meta()
            meta["relations"][0].update(wijziging)
            with self.subTest(wijziging=wijziging):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)


REVOKE_LIJST = "PUBLIC, anon, authenticated, service_role"


class AclScopingTest(unittest.TestCase):
    def setUp(self):
        self.meta = maak_meta()
        self.stmts = m.maak_schema_statements(self.meta)

    def test_schema_usage_wordt_expliciet_ingetrokken_en_daarna_aan_bronrollen_gegeven(self):
        self.assertIn("REVOKE ALL ON SCHEMA werkbank FROM " + REVOKE_LIJST, self.stmts)
        self.assertIn("GRANT USAGE ON SCHEMA werkbank TO anon, authenticated, service_role", self.stmts)
        self.assertLess(self.stmts.index("REVOKE ALL ON SCHEMA werkbank FROM " + REVOKE_LIJST),
                        self.stmts.index("GRANT USAGE ON SCHEMA werkbank TO anon, authenticated, service_role"))

    def test_tabel_acl_wordt_per_tabel_gerepliceerd_met_eerst_revoke(self):
        revoke = "REVOKE ALL ON TABLE werkbank.blokken FROM " + REVOKE_LIJST
        grant = "GRANT ALL ON TABLE werkbank.blokken TO anon, authenticated, service_role"
        self.assertIn(revoke, self.stmts)
        self.assertIn(grant, self.stmts)
        self.assertLess(self.stmts.index(revoke), self.stmts.index(grant))

    def test_beperkte_tabelrechten_blijven_beperkt_en_service_role_krijgt_niets_extra(self):
        self.assertIn("REVOKE ALL ON TABLE werkbank.klikplekken FROM " + REVOKE_LIJST, self.stmts)
        self.assertIn("GRANT SELECT, INSERT ON TABLE werkbank.klikplekken TO anon, authenticated", self.stmts)
        klik = [s for s in self.stmts if s.startswith("GRANT") and "werkbank.klikplekken " in s]
        self.assertEqual(len(klik), 1)
        self.assertNotIn("service_role", klik[0])
        self.meta["relations"][7]["acl"] = "{postgres=arwdDxtm/postgres,anon=arw/postgres}"
        stmts = m.maak_schema_statements(self.meta)
        self.assertIn("GRANT SELECT, INSERT, UPDATE ON TABLE werkbank.klikplekken TO anon", stmts)

    def test_sequence_acl_en_identity_sequence_zonder_grants(self):
        self.assertIn("REVOKE ALL ON SEQUENCE werkbank.documenten_id_seq FROM " + REVOKE_LIJST, self.stmts)
        self.assertIn("GRANT USAGE, SELECT, UPDATE ON SEQUENCE werkbank.documenten_id_seq "
                      "TO anon, authenticated, service_role", self.stmts)
        self.assertIn("REVOKE ALL ON SEQUENCE werkbank.klikplekken_id_seq FROM " + REVOKE_LIJST, self.stmts)
        self.assertEqual([s for s in self.stmts if s.startswith("GRANT") and "klikplekken_id_seq" in s], [])

    def test_functie_acl_inclusief_public_execute(self):
        self.assertIn("REVOKE ALL ON FUNCTION werkbank.zoek_inhoud(q text) FROM " + REVOKE_LIJST, self.stmts)
        self.assertIn("GRANT EXECUTE ON FUNCTION werkbank.zoek_inhoud(q text) "
                      "TO PUBLIC, anon, authenticated, service_role", self.stmts)

    def test_acl_none_van_functie_is_default_public_execute(self):
        self.meta["functions"][0]["acl"] = None
        stmts = m.maak_schema_statements(self.meta)
        self.assertIn("GRANT EXECUTE ON FUNCTION werkbank.zoek_inhoud(q text) TO PUBLIC", stmts)

    def test_geen_globale_of_vreemde_rechten_en_nooit_de_eigenaarsrol(self):
        rechten = [s for s in self.stmts if s.split()[0] in ("GRANT", "REVOKE")]
        self.assertEqual(len(rechten), 17)  # schema 2 + tabellen 8 + sequences 5 + functie 2
        for s in rechten:
            self.assertRegex(s, r" ON (SCHEMA|TABLE|SEQUENCE|FUNCTION) werkbank(\.|\s|$)")
            self.assertNotIn("postgres", s)
            self.assertNotIn("GRANT OPTION", s)
            self.assertNotIn("ALL TABLES", s)
            self.assertNotIn("ALL SEQUENCES", s)
        sql = m.maak_schema_sql(self.meta)
        for verboden in ("ALTER DEFAULT PRIVILEGES", "ALTER ROLE", "CREATE ROLE", "CREATE EXTENSION", "ALTER SYSTEM",
                         "postgres"):
            self.assertNotIn(verboden, sql)

    def test_acl_statements_staan_na_de_objecten_en_vlak_voor_commit(self):
        eerste = next(i for i, s in enumerate(self.stmts) if s.split()[0] in ("GRANT", "REVOKE"))
        laatste_ddl = max(i for i, s in enumerate(self.stmts) if s.startswith(("CREATE POLICY", "CREATE FUNCTION")))
        self.assertGreater(eerste, laatste_ddl)
        self.assertTrue(all(s.split()[0] in ("GRANT", "REVOKE") for s in self.stmts[eerste:-1]))

    def test_extra_rol_uit_de_bron_acl_wordt_ook_ingetrokken_en_expliciet_schema_acl_wint(self):
        self.meta["relations"][0]["acl"] = "{postgres=arwdDxtm/postgres,leesrol=r/postgres}"
        stmts = m.maak_schema_statements(self.meta, api_rollen=("anon", "authenticated"))
        lijst = "PUBLIC, anon, authenticated, leesrol, service_role"
        self.assertIn("REVOKE ALL ON TABLE werkbank.blokken FROM " + lijst, stmts)
        self.assertIn("GRANT SELECT ON TABLE werkbank.blokken TO leesrol", stmts)
        self.meta["schema_acl"] = "{postgres=UC/postgres,anon=U/postgres}"
        stmts = m.maak_schema_statements(self.meta)
        self.assertIn("GRANT USAGE ON SCHEMA werkbank TO anon", stmts)
        self.assertEqual(len([s for s in stmts if " ON SCHEMA " in s and s.startswith("GRANT")]), 1)

    def test_onveilige_of_onbegrepen_acl_wordt_geweigerd(self):
        slecht = [
            "{postgres=arwdDxtm/postgres,anon=r*/postgres}",  # grant option
            "{postgres=arwdDxtm/postgres,anon=r/iemand}",  # andere grantor
            "{postgres=r/postgres}",  # eigenaar niet volledig
            "{postgres=arwdDxtm/postgres,anon=q/postgres}",  # onbekend recht
            "{postgres=arwdDxtm/postgres,anon=X/postgres}",  # functierecht op een tabel
            '{postgres=arwdDxtm/postgres,"a b"=r/postgres}',
            "{postgres=arwdDxtm/postgres,pg_write_all_data=r/postgres}",
            "postgres=arwdDxtm/postgres",
            "{postgres=arwdDxtm/postgres,anon}",
            "{}",
        ]
        for acl in slecht:
            meta = maak_meta()
            meta["relations"][0]["acl"] = acl
            with self.subTest(acl=acl):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)

    def test_sequences_en_sequence_relaties_moeten_overeenkomen(self):
        meta = maak_meta()
        meta["relations"] = [r for r in meta["relations"] if r["relname"] != "notities_id_seq"]
        with self.assertRaises(m.MigratieFout):
            m.maak_schema_statements(meta)
        meta = maak_meta()
        meta["sequences"] = [q for q in meta["sequences"] if q["sequencename"] != "notities_id_seq"]
        with self.assertRaises(m.MigratieFout):
            m.maak_schema_statements(meta)


TOEGESTAAN = [
    r"BEGIN$", r"COMMIT$", r"SET LOCAL (lock_timeout = '1s'|statement_timeout = '30s')$", r"CREATE SCHEMA werkbank$",
    r"CREATE SEQUENCE werkbank\.\w+ ", r"CREATE TABLE werkbank\.\w+ \(", r"ALTER SEQUENCE werkbank\.\w+ OWNED BY ",
    r"ALTER TABLE werkbank\.\w+ (ADD CONSTRAINT|ENABLE ROW|FORCE ROW|REPLICA IDENTITY)",
    r"CREATE (UNIQUE )?INDEX \w+ ON werkbank\.\w+ USING ", r"CREATE FUNCTION werkbank\.\w+\(",
    r"CREATE POLICY \w+ ON werkbank\.\w+ AS ",
    r"(GRANT|REVOKE) [A-Z, ]+ ON (SCHEMA|TABLE|SEQUENCE|FUNCTION) werkbank(\.\w+)?(\(.*?\))? (TO|FROM) ",
]


class VeiligheidEnValidatieTest(unittest.TestCase):
    def setUp(self):
        self.meta = maak_meta()
        self.stmts = m.maak_schema_statements(self.meta)

    def test_elk_statement_is_een_bekende_vorm_binnen_werkbank(self):
        for s in self.stmts:
            with self.subTest(statement=s[:70]):
                self.assertTrue(any(re.match(patroon, s) for patroon in TOEGESTAAN), s[:120])

    def test_geen_drop_truncate_delete_statements_en_geen_bestaande_schemas(self):
        sql = m.maak_schema_sql(self.meta)
        self.assertIsNone(re.search(r"\b(DROP|TRUNCATE)\b", sql))
        self.assertIsNone(re.search(r"(?i)\b(public|auth|storage|extensions|realtime)\.", sql))
        self.assertEqual({s.split()[0] for s in self.stmts} & {"DELETE", "DROP", "TRUNCATE", "INSERT", "UPDATE"}, set())
        self.assertNotIn("CREATE EXTENSION", sql)
        self.assertNotIn("ALTER SCHEMA", sql)

    def test_realtime_publicatie_wordt_niet_door_de_generator_toegevoegd(self):
        sql = m.maak_schema_sql(self.meta)
        self.assertNotIn("PUBLICATION", sql.upper())
        self.assertNotIn("supabase_realtime", sql)
        self.meta["publication"] = []
        self.assertEqual(m.maak_schema_sql(self.meta), sql)

    def test_sequence_opties_worden_overgenomen_en_identity_by_default_wordt_ondersteund(self):
        for seq in self.meta["sequences"]:
            if seq["sequencename"] == "notities_id_seq":
                seq.update({"start_value": 5, "increment_by": 2, "min_value": 1, "max_value": "100",
                            "cache_size": 3, "cycle": True})
            if seq["sequencename"] == "klikplekken_id_seq":
                seq.update({"start_value": 10, "increment_by": 5})
        for kolom in self.meta["columns"]:
            if kolom["table_name"] == "klikplekken" and kolom["column_name"] == "id":
                kolom["identity_generation"] = "BY DEFAULT"
        stmts = m.maak_schema_statements(self.meta)
        self.assertEqual(vind(stmts, "CREATE SEQUENCE werkbank.notities_id_seq "),
                         "CREATE SEQUENCE werkbank.notities_id_seq AS bigint START WITH 5 INCREMENT BY 2 "
                         "MINVALUE 1 MAXVALUE 100 CACHE 3 CYCLE")
        self.assertIn("id bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME werkbank.klikplekken_id_seq "
                      "START WITH 10 INCREMENT BY 5 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL",
                      regels(vind(stmts, "CREATE TABLE werkbank.klikplekken ")))

    def test_niet_ondersteunde_bronfuncties_worden_fail_closed_geweigerd(self):
        def zet(sleutel, waarde):
            return lambda meta: meta.__setitem__(sleutel, waarde)

        def kolom(**velden):
            return lambda meta: meta["columns"][0].update(velden)

        def relatie(**velden):
            return lambda meta: meta["relations"][0].update(velden)

        gevallen = {
            "trigger": zet("triggers", [{"tgname": "t"}]),
            "eigen type": zet("types", [{"typname": "mijn_enum"}]),
            "extensie-afhankelijkheid": zet("extension_dependencies", [{"extname": "pg_trgm"}]),
            "view": relatie(relkind="v"),
            "gegenereerde kolom": kolom(is_generated="ALWAYS", generation_expression="1"),
            "varchar zonder lengte": kolom(data_type="character varying", udt_name="varchar"),
            "type uit ander schema": kolom(udt_schema="public"),
            "kolom in ander schema": kolom(table_schema="public"),
            "hoofdletters": kolom(column_name="Titel"),
            "gereserveerd woord": kolom(column_name="order"),
            "pg_-prefix": kolom(column_name="pg_x"),
            "te lang": kolom(column_name="a" * 64),
            "quote in naam": kolom(column_name='x"y'),
            "puntkomma in naam": kolom(column_name="x;y"),
            "identity en default": lambda meta: [k.update(column_default="1") for k in meta["columns"]
                                                  if k["table_name"] == "klikplekken" and k["column_name"] == "id"],
            "identity zonder sequence": lambda meta: meta.__setitem__(
                "sequences", [q for q in meta["sequences"] if q["sequencename"] != "klikplekken_id_seq"]),
            "sequence in ander schema": lambda meta: meta["sequences"][0].update(schemaname="public"),
            "sequence-optie geen getal": lambda meta: meta["sequences"][0].update(increment_by="1; DROP"),
            "sequence max geen getal": lambda meta: meta["sequences"][0].update(max_value="9; DROP"),
            "kolom zonder tabel": lambda meta: meta["columns"].append(dict(meta["columns"][0], table_name="spook")),
            "tabel zonder kolommen": lambda meta: meta["relations"].append(
                dict(meta["relations"][0], relname="leeg", acl=None)),
            "dubbele tabel": lambda meta: meta["relations"].append(dict(meta["relations"][0])),
            "pk op onbekende kolom": lambda meta: meta["constraints"][0].update(definitie="PRIMARY KEY (bestaat_niet)"),
            "constraint op onbekende tabel": lambda meta: meta["constraints"][0].update(relname="spook"),
            "index met verkeerde naam": lambda meta: meta["indexes"][1].update(indexname="anders"),
            "indexmethode": lambda meta: meta["indexes"][1].update(
                indexdef=meta["indexes"][1]["indexdef"].replace("USING gin", "USING hnsw")),
            "nextval op andere kolom gedeeld": lambda meta: [
                k.update(column_default="nextval('werkbank.documenten_id_seq'::regclass)")
                for k in meta["columns"] if k["table_name"] == "notities" and k["column_name"] == "id"],
        }
        for naam, wijzig in gevallen.items():
            meta = maak_meta()
            wijzig(meta)
            with self.subTest(naam):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)

    def test_ontbrekende_of_verkeerde_metadata_is_een_migratiefout_geen_keyerror(self):
        for sleutel in ("relations", "columns", "constraints", "indexes", "sequences", "functions", "policies",
                        "triggers", "types", "extension_dependencies"):
            meta = maak_meta()
            del meta[sleutel]
            with self.subTest(ontbreekt=sleutel):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)
        for meta in (None, [], "tekst", 5):
            with self.subTest(meta=meta):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(meta)
        meta = maak_meta()
        del meta["columns"][0]["column_name"]
        with self.assertRaises(m.MigratieFout):
            m.maak_schema_statements(meta)

    def test_api_rollen_worden_gevalideerd(self):
        for rollen in (("anon;drop",), ("Anon",), ("",), ("pg_monitor",), "anon"):
            with self.subTest(rollen=rollen):
                with self.assertRaises(m.MigratieFout):
                    m.maak_schema_statements(self.meta, api_rollen=rollen)


BRONMETADATA = pathlib.Path(os.environ.get(
    "WERKBANK_BRONMETADATA", "/Users/matheussen/.hermes/backups/archer-werkbank/20261113T094540/source-metadata.json"))


def laad_bronmetadata():
    with open(BRONMETADATA, encoding="utf-8") as bestand:
        return json.load(bestand)


@unittest.skipUnless(BRONMETADATA.exists(), "lokale bronmetadata ontbreekt")
class EchteBronMetadataTest(unittest.TestCase):
    """Acceptatie op de echte catalogus-export (alleen schema, geen documenteninhoud)."""

    @classmethod
    def setUpClass(cls):
        cls.meta = laad_bronmetadata()
        cls.stmts = m.maak_schema_statements(cls.meta)

    def telling(self, voorvoegsel):
        return len([s for s in self.stmts if s.startswith(voorvoegsel)])

    def test_aantallen_komen_overeen_met_de_bron(self):
        self.assertEqual(self.telling("CREATE TABLE "), 11)
        self.assertEqual(self.telling("CREATE SEQUENCE "), 8)  # 10 sequences min 2 identity
        self.assertEqual(len([s for s in self.stmts if "GENERATED ALWAYS AS IDENTITY" in s]), 2)
        self.assertEqual(self.telling("ALTER SEQUENCE "), 8)
        foreign_keys = len([s for s in self.stmts if s.startswith("ALTER TABLE") and "FOREIGN KEY" in s])
        self.assertEqual(foreign_keys, 4)
        inline = sum(s.count("CONSTRAINT ") for s in self.stmts if s.startswith("CREATE TABLE "))
        self.assertEqual(inline, 14)  # 11 primary keys + 3 unique
        self.assertEqual(inline + 4, 18)
        self.assertEqual(len([s for s in self.stmts if s.startswith(("CREATE INDEX", "CREATE UNIQUE INDEX"))]), 4)
        self.assertEqual(self.telling("CREATE FUNCTION werkbank.zoek_inhoud(q text)"), 1)
        self.assertEqual(self.telling("CREATE POLICY "), 23)
        self.assertEqual(len([s for s in self.stmts if s.endswith("ENABLE ROW LEVEL SECURITY")]), 11)

    def test_geen_realtime_geen_data_geen_eigenaarsrol_en_alleen_werkbank(self):
        sql = m.maak_schema_sql(self.meta)
        self.assertEqual(len(self.meta["publication"]), 9)
        for verboden in ("PUBLICATION", "supabase_realtime", "postgres", "INSERT INTO", "setval", "COPY "):
            self.assertNotIn(verboden, sql)
        for s in self.stmts:
            self.assertTrue(any(re.match(patroon, s) for patroon in TOEGESTAAN), s[:100])

    def test_zelfde_invoer_geeft_byte_identieke_sql(self):
        self.assertEqual(m.maak_schema_sql(laad_bronmetadata()), m.maak_schema_sql(self.meta))


PG_DSN = os.environ.get("WERKBANK_MIGRATIE_PG_DSN")


def laad_psycopg():
    try:
        import psycopg
        from psycopg import conninfo
        return psycopg, conninfo
    except ImportError:
        return None, None


def _filter(kolom, inclusief_werkbank):
    tekst = "%s !~ '^pg_' AND %s <> 'information_schema'" % (kolom, kolom)
    return tekst if inclusief_werkbank else tekst + " AND %s <> 'werkbank'" % kolom


def maak_snapshot(conn, inclusief_werkbank):
    """Leesbare staat van alles wat de migratie NIET mag wijzigen (of, inclusief werkbank, van het hele schema)."""
    f = lambda kolom: _filter(kolom, inclusief_werkbank)  # noqa: E731
    vragen = {
        "schemas": "select nspname, nspacl::text, nspowner::regrole::text from pg_namespace where %s order by 1" % f("nspname"),
        "relaties": ("select n.nspname, c.relname, c.relkind, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, "
                     "c.reloptions::text, c.relowner::regrole::text from pg_class c join pg_namespace n "
                     "on n.oid = c.relnamespace where %s order by 1, 2" % f("n.nspname")),
        "kolommen": ("select table_schema, table_name, column_name, ordinal_position, data_type, column_default, "
                     "is_nullable from information_schema.columns where %s order by 1, 2, 4" % f("table_schema")),
        "constraints": ("select n.nspname, c.conname, pg_get_constraintdef(c.oid) from pg_constraint c join "
                        "pg_namespace n on n.oid = c.connamespace where %s order by 1, 2" % f("n.nspname")),
        "policies": ("select schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check "
                     "from pg_policies where %s order by 1, 2, 3" % f("schemaname")),
        "functies": ("select n.nspname, p.proname, pg_get_functiondef(p.oid), p.proacl::text from pg_proc p join "
                     "pg_namespace n on n.oid = p.pronamespace where %s order by 1, 2" % f("n.nspname")),
        "rollen": ("select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, "
                   "rolbypassrls, rolconnlimit, rolconfig::text, rolvaliduntil::text from pg_roles order by 1"),
        "rol_instellingen": "select setdatabase, setrole, setconfig::text from pg_db_role_setting order by 1, 2",
        "default_privileges": ("select defaclrole::regrole::text, defaclnamespace, defaclobjtype, defaclacl::text "
                               "from pg_default_acl order by 1, 2, 3"),
        "extensies": "select extname, extversion from pg_extension order by 1",
        "publicaties": "select pubname, puballtables from pg_publication order by 1",
        "event_triggers": "select evtname from pg_event_trigger order by 1",
    }
    return {naam: conn.execute(vraag).fetchall() for naam, vraag in vragen.items()}


def pg_acl(tekst, eigenaar_lokaal, vervanging, volledig):
    """ACL-tekst -> verzameling (grantee, rechten, grantor), lokale rolnamen terugvertaald naar de bronnamen."""
    if tekst is None:
        return frozenset([("postgres", "".join(sorted(volledig)), "postgres")])
    vertaal = {eigenaar_lokaal: "postgres", vervanging: "service_role"}
    items = set()
    for ingang in tekst.strip("{}").split(","):
        grantee, rest = ingang.split("=")
        rechten, grantor = rest.split("/")
        items.add((vertaal.get(grantee, grantee), "".join(sorted(rechten)), vertaal.get(grantor, grantor)))
    return frozenset(items)


@unittest.skipUnless(PG_DSN and BRONMETADATA.exists() and laad_psycopg()[0],
                     "alleen met WERKBANK_MIGRATIE_PG_DSN, psycopg en de lokale bronmetadata")
class LokaleDatabaseIntegratieTest(unittest.TestCase):
    """Draait de gegenereerde SQL op een eigen NIEUWE lokale database (zonder data) en verwijdert niets."""

    @classmethod
    def setUpClass(cls):
        psycopg, conninfo = laad_psycopg()
        cls.psycopg = psycopg
        cls.admin = psycopg.connect(PG_DSN, autocommit=True)
        rollen = {rij[0] for rij in cls.admin.execute("select rolname from pg_roles").fetchall()}
        cls.vervanging = "service_role" if "service_role" in rollen else os.environ.get(
            "WERKBANK_MIGRATIE_PG_PLAATSVERVANGER", "werkbank_agent")
        if not {"anon", "authenticated", cls.vervanging} <= rollen:
            raise unittest.SkipTest("lokale server mist de rollen anon/authenticated/%s" % cls.vervanging)
        cls.dbnaam = "werkbank_migratie_" + uuid.uuid4().hex[:10]
        cls.admin.execute('CREATE DATABASE "%s" TEMPLATE template0' % cls.dbnaam)
        sys.stderr.write("\n[integratie] eigen nieuwe testdatabase: %s (blijft staan)\n" % cls.dbnaam)
        cls.conn = psycopg.connect(conninfo.make_conninfo(PG_DSN, dbname=cls.dbnaam), autocommit=True)
        cls.eigenaar = cls.conn.execute("select current_user").fetchone()[0]

        cls.meta = laad_bronmetadata()
        tekst = json.dumps(cls.meta).replace("service_role", cls.vervanging)
        cls.lokale_meta = json.loads(tekst)
        cls.rollen = ("anon", "authenticated", cls.vervanging)
        cls.sql = m.maak_schema_sql(cls.lokale_meta, api_rollen=cls.rollen)

        # worst case zoals Supabase: standaardrechten geven nieuwe objecten automatisch rechten aan de API-rollen
        # (pg_default_acl is per database; alleen in deze eigen testdatabase)
        api = "anon, authenticated, %s" % cls.vervanging
        cls.conn.execute(
            "alter default privileges for role %s grant all on tables to %s; "
            "alter default privileges for role %s grant all on sequences to %s; "
            "alter default privileges for role %s grant all on functions to %s; "
            "alter default privileges for role %s grant usage on schemas to public"
            % (cls.eigenaar, api, cls.eigenaar, api, cls.eigenaar, api, cls.eigenaar))
        # bestaande omgeving: public + nagebootste auth/storage met tabel, RLS, policy, functie en rechten
        cls.conn.execute("""
            create schema auth; create schema storage;
            create table public.bestaand (id int primary key, naam text);
            create table auth.bestaand (id int primary key);
            create table storage.bestaand (id int primary key);
            alter table public.bestaand enable row level security;
            create policy bestaand_lezen on public.bestaand for select to anon using (true);
            create function public.bestaand_fn() returns int language sql stable as $$ select 1 $$;
            grant select on public.bestaand to anon;
            grant usage on schema auth to authenticated;
            create schema werkbank; create table werkbank.marker (x int);""")
        cls.snapshot_marker = maak_snapshot(cls.conn, True)
        cls.botsing_marker = cls.voer_uit_en_vang_fout()
        cls.snapshot_na_botsing_marker = maak_snapshot(cls.conn, True)

        cls.conn.execute("alter schema werkbank rename to botsing_marker")  # geen DROP: marker blijft bestaan
        cls.snapshot_voor = maak_snapshot(cls.conn, False)
        cls.conn.execute(cls.sql)
        cls.snapshot_na = maak_snapshot(cls.conn, False)
        cls.timeouts_na = (cls.conn.execute("show lock_timeout").fetchone()[0],
                           cls.conn.execute("show statement_timeout").fetchone()[0])
        cls.snapshot_werkbank_na_succes = maak_snapshot(cls.conn, True)
        cls.botsing_tweede_run = cls.voer_uit_en_vang_fout()
        cls.snapshot_werkbank_na_tweede_run = maak_snapshot(cls.conn, True)

    @classmethod
    def voer_uit_en_vang_fout(cls):
        try:
            cls.conn.execute(cls.sql)
        except cls.psycopg.Error as fout:
            cls.conn.execute("ROLLBACK")  # de expliciete BEGIN staat nog open na de fout
            return fout
        return None

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()  # database zelf blijft staan: niets verwijderen
        cls.admin.close()

    def rijen(self, vraag):
        return self.conn.execute(vraag).fetchall()

    def test_bestaand_schema_werkbank_laat_de_migratie_falen_zonder_iets_te_wijzigen(self):
        self.assertIsInstance(self.botsing_marker, self.psycopg.errors.DuplicateSchema)
        self.assertEqual(self.snapshot_na_botsing_marker, self.snapshot_marker)
        self.assertEqual(self.rijen("select count(*) from botsing_marker.marker"), [(0,)])

    def test_tweede_run_na_succes_faalt_en_laat_alles_gelijk(self):
        self.assertIsInstance(self.botsing_tweede_run, self.psycopg.errors.DuplicateSchema)
        self.assertEqual(self.snapshot_werkbank_na_tweede_run, self.snapshot_werkbank_na_succes)

    def test_public_auth_storage_rollen_en_globale_instellingen_zijn_onveranderd(self):
        self.assertEqual(self.snapshot_na, self.snapshot_voor)
        schemas = [rij[0] for rij in self.snapshot_na["schemas"]]
        self.assertTrue({"auth", "storage", "public", "botsing_marker"} <= set(schemas))

    def test_lock_en_statement_timeout_lekken_niet_uit_de_transactie(self):
        self.assertEqual(self.timeouts_na, ("0", "0"))

    def test_kolommen_defaults_en_identity_komen_exact_overeen_met_de_bron(self):
        verwacht = sorted((k["table_name"], k["column_name"], k["ordinal_position"], k["data_type"], k["is_nullable"],
                           k["column_default"], k["is_identity"], k["identity_generation"], k["udt_name"])
                          for k in self.meta["columns"])
        werkelijk = self.rijen("select table_name, column_name, ordinal_position, data_type, is_nullable, "
                               "column_default, is_identity, identity_generation, udt_name "
                               "from information_schema.columns where table_schema = 'werkbank'")
        self.assertEqual(sorted(werkelijk), verwacht)
        self.assertEqual(len(verwacht), 102)

    def test_constraints_indexen_en_sequences_komen_exact_overeen_met_de_bron(self):
        constraints = self.rijen(
            "select c.conname, c.contype, r.relname, pg_get_constraintdef(c.oid) from pg_constraint c join pg_class r "
            "on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace "
            "where n.nspname = 'werkbank' and c.contype in ('p', 'u', 'f', 'c', 'x')")
        self.assertEqual(sorted(constraints), sorted((c["conname"], c["contype"], c["relname"], c["definitie"])
                                                     for c in self.meta["constraints"]))
        indexen = self.rijen("select indexname, tablename, indexdef from pg_indexes where schemaname = 'werkbank'")
        self.assertEqual(sorted(indexen), sorted((i["indexname"], i["tablename"], i["indexdef"])
                                                 for i in self.meta["indexes"]))
        self.assertEqual(len(indexen), 18)
        sequences = self.rijen(
            "select sequencename, data_type::text, start_value, min_value, max_value, increment_by, cycle, cache_size, "
            "last_value from pg_sequences where schemaname = 'werkbank'")
        self.assertEqual(sorted(sequences), sorted(
            (q["sequencename"], q["data_type"], q["start_value"], q["min_value"], int(q["max_value"]),
             q["increment_by"], q["cycle"], q["cache_size"], None) for q in self.meta["sequences"]))

    def test_serial_sequences_zijn_owned_by_de_kolom_en_identity_sequences_niet_dubbel(self):
        rijen = self.rijen(
            "select s.relname, d.deptype, c.relname, a.attname, a.attidentity from pg_class s "
            "join pg_namespace n on n.oid = s.relnamespace join pg_depend d on d.objid = s.oid "
            "and d.classid = 'pg_class'::regclass and d.refclassid = 'pg_class'::regclass "
            "join pg_class c on c.oid = d.refobjid join pg_attribute a on a.attrelid = c.oid and a.attnum = d.refobjsubid "
            "where s.relkind = 'S' and n.nspname = 'werkbank' order by 1")
        self.assertEqual(len(rijen), 10)
        for sequence, soort, tabel, kolom, identity in rijen:
            self.assertEqual(sequence, "%s_%s_seq" % (tabel, kolom))
            if tabel in ("actualiteit", "klikplekken"):
                self.assertEqual((soort, identity), ("i", "a"))  # GENERATED ALWAYS, sequence hoort bij de identity
            else:
                self.assertEqual((soort, identity), ("a", ""))  # serial: OWNED BY tabel.kolom
        self.assertEqual(len([r for r in rijen if r[1] == "a"]), 8)

    def test_functie_policies_rls_en_replica_identity_komen_overeen_met_de_bron(self):
        functie = self.rijen("select p.proname, pg_get_functiondef(p.oid), p.prosecdef, p.provolatile from pg_proc p "
                             "join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'werkbank'")
        self.assertEqual(len(functie), 1)
        self.assertEqual(functie[0][0], "zoek_inhoud")
        self.assertEqual(functie[0][1].strip(), self.meta["functions"][0]["definitie"].strip())
        self.assertEqual((functie[0][2], functie[0][3]), (False, "s"))  # SECURITY INVOKER, STABLE
        policies = self.rijen("select tablename, policyname, cmd, permissive, roles::text, qual, with_check "
                              "from pg_policies where schemaname = 'werkbank'")
        self.assertEqual(sorted(policies, key=str), sorted(
            ((p["tablename"], p["policyname"], p["cmd"], p["permissive"], p["roles"], p["qual"], p["with_check"])
             for p in self.meta["policies"]), key=str))
        self.assertEqual(len(policies), 23)
        relaties = self.rijen("select c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relreplident from pg_class c "
                              "join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'werkbank' "
                              "and c.relkind = 'r'")
        self.assertEqual(sorted(relaties), sorted((r["relname"], r["relrowsecurity"], r["relforcerowsecurity"],
                                                   r["relreplident"]) for r in self.meta["relations"]
                                                  if r["relkind"] == "r"))

    def test_acl_van_elk_object_is_gelijk_aan_de_bron_en_gescoped_op_werkbank(self):
        volledig = {"r": "arwdDxtm", "S": "rwU"}
        relaties = self.rijen("select c.relname, c.relkind, c.relacl::text from pg_class c join pg_namespace n "
                              "on n.oid = c.relnamespace where n.nspname = 'werkbank' and c.relkind in ('r', 'S')")
        verwacht = {r["relname"]: pg_acl(r["acl"], "postgres", "service_role", volledig[r["relkind"]])
                    for r in self.meta["relations"] if r["relkind"] in ("r", "S")}
        werkelijk = {naam: pg_acl(acl, self.eigenaar, self.vervanging, volledig[soort]) for naam, soort, acl in relaties}
        self.assertEqual(werkelijk, verwacht)
        self.assertEqual(len(werkelijk), 21)
        functie = self.rijen("select p.proacl::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                             "where n.nspname = 'werkbank'")[0][0]
        self.assertEqual(pg_acl(functie, self.eigenaar, self.vervanging, "X"),
                         pg_acl(self.meta["functions"][0]["acl"], "postgres", "service_role", "X"))
        schema = self.rijen("select nspacl::text from pg_namespace where nspname = 'werkbank'")[0][0]
        self.assertEqual(pg_acl(schema, self.eigenaar, self.vervanging, "UC"), frozenset([
            ("postgres", "CU", "postgres"), ("anon", "U", "postgres"), ("authenticated", "U", "postgres"),
            ("service_role", "U", "postgres")]))

    def test_schema_bevat_geen_data_en_de_zoekfunctie_draait(self):
        tabellen = [rij[0] for rij in self.rijen("select tablename from pg_tables where schemaname = 'werkbank'")]
        self.assertEqual(len(tabellen), 11)
        for tabel in tabellen:
            self.assertEqual(self.rijen("select count(*) from werkbank.%s" % tabel), [(0,)])
        self.assertEqual(self.rijen("select * from werkbank.zoek_inhoud('iets')"), [])


if __name__ == "__main__":
    unittest.main()
