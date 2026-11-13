-- ONTWIKKELING: NIET uitvoeren op de gedeelde database zonder afzonderlijk akkoord.
-- Een aparte migratie voor echte login/RLS en beveiliging van lees-bron is eerst vereist.
-- Nieuwe tabellen hebben geen anonieme rechten. De werker blijft standaard uit.
BEGIN;
-- Voorwaarde voor de volledige commentconversatie: de bestaande commentkolommen van werkbank.notities moeten er
-- al zijn; de migratie stopt anders. Alleen de quote-ankercontext (anker_context jsonb: exact, prefix, suffix,
-- docversie) wordt idempotent bijgezet; dezelfde kolomdefinitie als 20261113_comment_ervaring.sql, in elke volgorde veilig.
ALTER TABLE werkbank.notities ADD COLUMN IF NOT EXISTS anker_context jsonb;
DO $$
DECLARE ontbreekt text;
BEGIN
  SELECT string_agg(k, ', ') INTO ontbreekt
    FROM unnest(ARRAY['parent_id','afgewezen','opgelost','afwijs_reden','anker_context','auteur','created_at','anker']) AS k
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                      WHERE a.attrelid = to_regclass('werkbank.notities') AND a.attname = k AND a.attnum > 0 AND NOT a.attisdropped);
  IF ontbreekt IS NOT NULL THEN RAISE EXCEPTION 'notities_kolommen_ontbreken: %', ontbreekt; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS werkbank_private;
REVOKE ALL ON SCHEMA werkbank_private FROM PUBLIC, anon, authenticated;

CREATE TABLE werkbank_private.agent_leden (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  naam text NOT NULL UNIQUE CHECK (naam IN ('Victor', 'Anthony')),
  actief boolean NOT NULL DEFAULT true
);
CREATE TABLE werkbank_private.agent_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  actief boolean NOT NULL DEFAULT false,
  kostenlimiet_gecontroleerd boolean NOT NULL DEFAULT false,
  brongateway_veilig boolean NOT NULL DEFAULT false
);
INSERT INTO werkbank_private.agent_config(id) VALUES (true);
CREATE TABLE werkbank_private.agent_document_toelating (
  document_id bigint PRIMARY KEY REFERENCES werkbank.documenten(id),
  verwacht_pad text NOT NULL,
  verwacht_blok_id text NOT NULL REFERENCES werkbank.blokken(id),
  eigenaar_user_id uuid NOT NULL REFERENCES auth.users(id),
  toegestaan boolean NOT NULL DEFAULT false,
  CHECK (document_id NOT IN (30, 31, 77, 78, 79))
);

CREATE TABLE werkbank.agent_opdrachten (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notitie_id bigint NOT NULL REFERENCES werkbank.notities(id),
  document_id bigint NOT NULL REFERENCES werkbank.documenten(id),
  document_versie integer NOT NULL CHECK (document_versie > 0),
  document_updated_at timestamptz NOT NULL,
  document_sha256 bytea NOT NULL CHECK (octet_length(document_sha256) = 32),
  opmerking_snapshot text NOT NULL CHECK (length(opmerking_snapshot) BETWEEN 3 AND 2000),
  anker_snapshot text CHECK (anker_snapshot IS NULL OR length(anker_snapshot) BETWEEN 1 AND 2000),
  -- Volledige conversatie op het aanvraagmoment: root + alle reacties, root eerst, daarna created_at,id.
  -- Elk bericht: {id,parent_id,auteur,tijd,tekst,status,reden}. De hash wordt bij claim, opslag en review
  -- opnieuw vergeleken met de live thread.
  gesprek_snapshot jsonb NOT NULL CHECK (jsonb_typeof(gesprek_snapshot) = 'array' AND jsonb_array_length(gesprek_snapshot) BETWEEN 1 AND 40),
  gesprek_sha256 text NOT NULL CHECK (gesprek_sha256 ~ '^[0-9a-f]{64}$'),
  anker_context_snapshot jsonb CHECK (anker_context_snapshot IS NULL OR jsonb_typeof(anker_context_snapshot) = 'object'),
  aangevraagd_door uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'wachtrij' CHECK (status IN ('wachtrij', 'bezig', 'klaar', 'mislukt', 'geannuleerd')),
  poging integer NOT NULL DEFAULT 0 CHECK (poging BETWEEN 0 AND 2),
  claim_token uuid,
  geclaimd_op timestamptz,
  lease_tot timestamptz,
  fout_code text,
  model text,
  tokens_in integer,
  tokens_uit integer,
  kost_usd numeric(12,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  klaar_op timestamptz
);
CREATE UNIQUE INDEX agent_een_actieve_opdracht_per_notitie ON werkbank.agent_opdrachten (notitie_id, document_id)
  WHERE status IN ('wachtrij', 'bezig');
CREATE INDEX agent_wachtrij ON werkbank.agent_opdrachten (created_at, id) WHERE status = 'wachtrij';

CREATE TABLE werkbank.agent_voorstellen (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opdracht_id bigint NOT NULL UNIQUE REFERENCES werkbank.agent_opdrachten(id),
  soort text NOT NULL CHECK (soort IN ('wijziging', 'antwoord')),
  oorspronkelijk text NOT NULL DEFAULT '',
  voorstel text NOT NULL DEFAULT '',
  uitleg text NOT NULL CHECK (length(uitleg) BETWEEN 1 AND 1500),
  bronstatus text NOT NULL DEFAULT 'niet_opgezocht' CHECK (bronstatus IN ('niet_opgezocht')),
  status text NOT NULL DEFAULT 'voorgesteld' CHECK (status IN ('voorgesteld', 'toegepast', 'afgewezen')),
  beoordeeld_door uuid REFERENCES auth.users(id),
  beoordeeld_op timestamptz,
  beoordelingsreden text CHECK (beoordelingsreden IS NULL OR length(beoordelingsreden) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((soort = 'antwoord' AND oorspronkelijk = '' AND voorstel = '') OR
         (soort = 'wijziging' AND length(oorspronkelijk) BETWEEN 1 AND 2000 AND length(voorstel) BETWEEN 1 AND 4000))
);
ALTER TABLE werkbank.agent_opdrachten ENABLE ROW LEVEL SECURITY;
ALTER TABLE werkbank.agent_voorstellen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON werkbank.agent_opdrachten, werkbank.agent_voorstellen FROM PUBLIC, anon, authenticated;

CREATE FUNCTION werkbank_private.agent_is_lid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM werkbank_private.agent_leden WHERE user_id = (SELECT auth.uid()) AND actief) $$;
REVOKE ALL ON FUNCTION werkbank_private.agent_is_lid() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA werkbank_private TO authenticated;
GRANT EXECUTE ON FUNCTION werkbank_private.agent_is_lid() TO authenticated;

-- Fail-closed: anonieme rechten moeten weg zijn én elke bestaande tabel moet
-- een beperkende ledenpolicy hebben. Deze migratie zelf verandert oude rechten niet.
CREATE FUNCTION werkbank_private.agent_basis_veilig() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(*) >= 4 AND bool_and(
    c.relrowsecurity
    AND NOT pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
    AND NOT pg_catalog.has_any_column_privilege('anon', c.oid, 'SELECT')
    AND NOT pg_catalog.has_any_column_privilege('anon', c.oid, 'INSERT')
    AND NOT pg_catalog.has_any_column_privilege('anon', c.oid, 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('anon', c.oid, 'INSERT')
    AND NOT pg_catalog.has_table_privilege('anon', c.oid, 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('anon', c.oid, 'DELETE')
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy p
      WHERE p.polrelid = c.oid AND NOT p.polpermissive AND p.polcmd = '*'
        AND p.polname = 'wb_agent_leden_grens'
        AND (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') = ANY(p.polroles)
        AND pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'werkbank_private.agent_is_lid()'
        AND pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) = 'werkbank_private.agent_is_lid()'
    )
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class ac JOIN pg_catalog.pg_namespace an ON an.oid = ac.relnamespace
    WHERE an.nspname = 'werkbank' AND ac.relkind IN ('r', 'p') AND ac.relname LIKE 'agent\_%' ESCAPE '\'
      AND (NOT ac.relrowsecurity OR NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_policy ap WHERE ap.polrelid=ac.oid AND NOT ap.polpermissive AND ap.polcmd='*'
               AND ap.polname='wb_agent_leden_grens'
               AND (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticated') = ANY(ap.polroles)
               AND pg_catalog.pg_get_expr(ap.polqual,ap.polrelid)='werkbank_private.agent_is_lid()'
               AND pg_catalog.pg_get_expr(ap.polwithcheck,ap.polrelid)='werkbank_private.agent_is_lid()'
           ) OR pg_catalog.has_any_column_privilege('anon', ac.oid, 'SELECT') OR
           pg_catalog.has_any_column_privilege('anon', ac.oid, 'INSERT') OR
           pg_catalog.has_any_column_privilege('anon', ac.oid, 'UPDATE') OR
           pg_catalog.has_table_privilege('anon', ac.oid, 'DELETE') OR
           pg_catalog.has_any_column_privilege('authenticated', ac.oid, 'INSERT') OR
           pg_catalog.has_any_column_privilege('authenticated', ac.oid, 'UPDATE') OR
           pg_catalog.has_table_privilege('authenticated', ac.oid, 'DELETE') OR
           pg_catalog.has_table_privilege('authenticated', ac.oid, 'TRUNCATE') OR
           pg_catalog.has_table_privilege('authenticated', ac.oid, 'TRIGGER'))
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class pc JOIN pg_catalog.pg_namespace pn ON pn.oid = pc.relnamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated'), ('werkbank_agent')) AS personen(rol)
    WHERE pn.nspname = 'werkbank_private' AND pc.relkind IN ('r','p','v','m','f')
      AND (pg_catalog.has_any_column_privilege(personen.rol, pc.oid, 'SELECT') OR
           pg_catalog.has_any_column_privilege(personen.rol, pc.oid, 'INSERT') OR
           pg_catalog.has_any_column_privilege(personen.rol, pc.oid, 'UPDATE') OR
           pg_catalog.has_table_privilege(personen.rol, pc.oid, 'DELETE') OR
           pg_catalog.has_table_privilege(personen.rol, pc.oid, 'TRUNCATE') OR
           pg_catalog.has_table_privilege(personen.rol, pc.oid, 'TRIGGER'))
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc fn JOIN pg_catalog.pg_namespace sn ON sn.oid = fn.pronamespace
    WHERE sn.nspname NOT IN ('pg_catalog','information_schema') AND sn.nspname NOT LIKE 'pg_toast%'
      AND fn.prosecdef AND pg_catalog.has_schema_privilege('anon', sn.oid, 'USAGE')
      AND pg_catalog.has_function_privilege('anon', fn.oid, 'EXECUTE')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc af JOIN pg_catalog.pg_namespace axs ON axs.oid = af.pronamespace
    WHERE axs.nspname NOT IN ('pg_catalog','information_schema') AND axs.nspname NOT LIKE 'pg_toast%'
      AND af.prosecdef AND pg_catalog.has_schema_privilege('authenticated', axs.oid, 'USAGE')
      AND pg_catalog.has_function_privilege('authenticated', af.oid, 'EXECUTE')
      AND NOT (axs.nspname = 'werkbank_private' AND af.proname IN ('agent_is_lid','agent_is_actief','agent_maak_opdracht','agent_beoordeel'))
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class av JOIN pg_catalog.pg_namespace ans ON ans.oid = av.relnamespace
    WHERE ans.nspname NOT IN ('pg_catalog','information_schema') AND ans.nspname NOT LIKE 'pg_toast%'
      AND NOT (ans.nspname = 'extensions' AND av.relname IN ('pg_stat_statements','pg_stat_statements_info'))
      AND av.relkind IN ('v','m') AND (
        (pg_catalog.has_schema_privilege('anon', ans.oid, 'USAGE') AND pg_catalog.has_any_column_privilege('anon', av.oid, 'SELECT')) OR
        (pg_catalog.has_schema_privilege('authenticated', ans.oid, 'USAGE') AND pg_catalog.has_any_column_privilege('authenticated', av.oid, 'SELECT'))
      )
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = 'werkbank_agent'
      AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreaterole AND NOT r.rolcreatedb
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid OR m.roleid = r.oid)
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class wc JOIN pg_catalog.pg_namespace wn ON wn.oid = wc.relnamespace
    WHERE wn.nspname NOT IN ('pg_catalog', 'information_schema') AND wn.nspname NOT LIKE 'pg_toast%'
      AND NOT (wn.nspname = 'extensions' AND wc.relname IN ('pg_stat_statements','pg_stat_statements_info'))
      AND wc.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (pg_catalog.has_any_column_privilege('werkbank_agent', wc.oid, 'SELECT') OR
           pg_catalog.has_any_column_privilege('werkbank_agent', wc.oid, 'INSERT') OR
           pg_catalog.has_any_column_privilege('werkbank_agent', wc.oid, 'UPDATE') OR
           pg_catalog.has_table_privilege('werkbank_agent', wc.oid, 'DELETE'))
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc wf JOIN pg_catalog.pg_namespace ws ON ws.oid = wf.pronamespace
    WHERE wf.prosecdef AND ws.nspname NOT IN ('pg_catalog', 'information_schema')
      AND pg_catalog.has_schema_privilege('werkbank_agent', ws.oid, 'USAGE')
      AND pg_catalog.has_function_privilege('werkbank_agent', wf.oid, 'EXECUTE')
      AND NOT (ws.nspname = 'werkbank_private' AND wf.proname IN ('agent_claim', 'agent_klaar', 'agent_fout'))
  )
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'werkbank' AND c.relkind IN ('r', 'p') AND c.relname NOT LIKE 'agent\_%' ESCAPE '\';
$$;
REVOKE ALL ON FUNCTION werkbank_private.agent_basis_veilig() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION werkbank_private.agent_is_actief() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT werkbank_private.agent_is_lid() AND werkbank_private.agent_basis_veilig()
  AND EXISTS (SELECT 1 FROM werkbank_private.agent_config WHERE id AND actief AND kostenlimiet_gecontroleerd AND brongateway_veilig) $$;
REVOKE ALL ON FUNCTION werkbank_private.agent_is_actief() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank_private.agent_is_actief() TO authenticated;
CREATE FUNCTION werkbank.agent_status() RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT werkbank_private.agent_is_actief() $$;
REVOKE ALL ON FUNCTION werkbank.agent_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank.agent_status() TO authenticated;

CREATE FUNCTION werkbank_private.agent_maak_opdracht(p_notitie bigint, p_document bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE gebruiker uuid := auth.uid(); doc werkbank.documenten%ROWTYPE; notitie werkbank.notities%ROWTYPE; lopend werkbank.agent_opdrachten%ROWTYPE; nieuw bigint; gesprek jsonb;
BEGIN
  IF gebruiker IS NULL OR NOT werkbank_private.agent_is_lid() THEN RAISE EXCEPTION 'niet_toegelaten' USING ERRCODE = '42501'; END IF;
  IF NOT werkbank_private.agent_basis_veilig() THEN RAISE EXCEPTION 'werkbank_onveilig' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM werkbank_private.agent_config WHERE id AND actief AND kostenlimiet_gecontroleerd AND brongateway_veilig) THEN
    RAISE EXCEPTION 'agent_niet_vrijgegeven' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO doc FROM werkbank.documenten WHERE id = p_document;
  SELECT * INTO notitie FROM werkbank.notities WHERE id = p_notitie;
  IF doc.id IS NULL OR notitie.id IS NULL OR notitie.doel_type <> 'document' OR notitie.doel_id <> p_document::text THEN
    RAISE EXCEPTION 'notitie_hoort_niet_bij_document';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM werkbank_private.agent_document_toelating t JOIN werkbank_private.agent_leden l ON l.user_id=t.eigenaar_user_id AND l.actief
                 WHERE t.document_id = doc.id AND t.toegestaan AND t.verwacht_pad = doc.pad AND t.verwacht_blok_id = doc.blok_id)
     OR doc.id IN (30,31,77,78,79) OR lower(coalesce(doc.pad,'')) LIKE '%anthony-swolfs-een-leven-lang-geld%'
     OR lower(coalesce(doc.pad,'')) LIKE '%van-eesbeeck%' THEN RAISE EXCEPTION 'vertrouwelijk_geweigerd'; END IF;
  IF length(btrim(notitie.tekst)) NOT BETWEEN 3 AND 2000 OR doc.inhoud IS NULL OR length(doc.inhoud) = 0 THEN RAISE EXCEPTION 'ongeldige_opdracht'; END IF;
  IF notitie.parent_id IS NOT NULL THEN RAISE EXCEPTION 'notitie_is_reactie'; END IF;
  -- Hele conversatie als input: te veel is een eerlijke fout, nooit stille afkapping (grenzen gelijk aan agent/gedeelde_agent.py).
  gesprek := werkbank_private.agent_gesprek(notitie.id);
  IF gesprek IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(gesprek) e WHERE length(btrim(e->>'tekst')) = 0) THEN RAISE EXCEPTION 'ongeldig_gesprek'; END IF;
  IF jsonb_array_length(gesprek) > 40
     OR (SELECT coalesce(sum(length(e->>'tekst') + length(e->>'reden')), 0) FROM jsonb_array_elements(gesprek) e) > 8000 THEN
    RAISE EXCEPTION 'gesprek_te_lang';
  END IF;
  IF notitie.anker_context IS NOT NULL AND NOT (
       jsonb_typeof(notitie.anker_context) = 'object'
       AND jsonb_typeof(notitie.anker_context->'exact') = 'string' AND length(btrim(notitie.anker_context->>'exact')) BETWEEN 1 AND 2000
       AND jsonb_typeof(notitie.anker_context->'prefix') = 'string' AND length(notitie.anker_context->>'prefix') <= 500
       AND jsonb_typeof(notitie.anker_context->'suffix') = 'string' AND length(notitie.anker_context->>'suffix') <= 500
       AND jsonb_typeof(notitie.anker_context->'docversie') = 'number' AND (notitie.anker_context->>'docversie') ~ '^[1-9][0-9]{0,8}$') THEN
    RAISE EXCEPTION 'anker_ongekoppeld';
  END IF;
  IF length(doc.inhoud) > 12000 AND notitie.anker IS NULL AND notitie.anker_context IS NULL THEN RAISE EXCEPTION 'anker_vereist'; END IF;
  -- Een ruw gevonden anker moet uniek zijn. Staat het niet letterlijk in de markdown maar is er een ankercontext
  -- (selectie over vet/links), dan lost de werker dat zonder gok op of meldt 'anker_ongekoppeld'.
  IF notitie.anker IS NOT NULL THEN
    IF length(notitie.anker) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'anker_niet_uniek'; END IF;
    IF strpos(doc.inhoud, notitie.anker) > 0 THEN
      IF strpos(substring(doc.inhoud FROM strpos(doc.inhoud, notitie.anker) + 1), notitie.anker) > 0 THEN RAISE EXCEPTION 'anker_niet_uniek'; END IF;
    ELSIF notitie.anker_context IS NULL THEN
      RAISE EXCEPTION 'anker_niet_uniek';
    END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7120712026);
  SELECT * INTO lopend FROM werkbank.agent_opdrachten WHERE notitie_id = p_notitie AND document_id = p_document AND status IN ('wachtrij','bezig') ORDER BY id DESC LIMIT 1;
  IF lopend.id IS NOT NULL THEN
    IF werkbank_private.agent_gesprek_actueel(notitie.id, doc.id, lopend.gesprek_sha256, lopend.anker_snapshot, lopend.anker_context_snapshot) THEN RETURN lopend.id; END IF;
    -- Het gesprek is intussen veranderd: de oude opdracht kan nooit meer een voorstel opleveren.
    UPDATE werkbank.agent_opdrachten SET status='geannuleerd', fout_code='gesprek_gewijzigd', claim_token=NULL, lease_tot=NULL, klaar_op=now() WHERE id = lopend.id;
  END IF;
  IF (SELECT count(*) FROM werkbank.agent_opdrachten WHERE aangevraagd_door = gebruiker AND created_at >= now() - interval '24 hours') >= 10
      OR (SELECT count(*) FROM werkbank.agent_opdrachten WHERE status IN ('wachtrij','bezig')) >= 5 THEN
    RAISE EXCEPTION 'limiet_bereikt';
  END IF;
  INSERT INTO werkbank.agent_opdrachten(notitie_id, document_id, document_versie, document_updated_at, document_sha256, opmerking_snapshot, anker_snapshot, anker_context_snapshot, gesprek_snapshot, gesprek_sha256, aangevraagd_door)
    VALUES (notitie.id, doc.id, doc.versie, doc.updated_at, pg_catalog.sha256(pg_catalog.convert_to(doc.inhoud,'UTF8')), btrim(notitie.tekst), notitie.anker,
            notitie.anker_context, gesprek, werkbank_private.agent_gesprek_hash(gesprek), gebruiker) RETURNING id INTO nieuw;
  RETURN nieuw;
END $$;
REVOKE ALL ON FUNCTION werkbank_private.agent_maak_opdracht(bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank_private.agent_maak_opdracht(bigint,bigint) TO authenticated;

CREATE FUNCTION werkbank.vraag_agent(p_notitie bigint, p_document bigint) RETURNS bigint
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT werkbank_private.agent_maak_opdracht(p_notitie, p_document) $$;
REVOKE ALL ON FUNCTION werkbank.vraag_agent(bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank.vraag_agent(bigint,bigint) TO authenticated;

CREATE POLICY agent_leden_lezen ON werkbank.agent_opdrachten FOR SELECT TO authenticated USING (werkbank_private.agent_is_lid());
CREATE POLICY agent_leden_lezen ON werkbank.agent_voorstellen FOR SELECT TO authenticated USING (werkbank_private.agent_is_lid());
CREATE POLICY wb_agent_leden_grens ON werkbank.agent_opdrachten AS RESTRICTIVE FOR ALL TO authenticated USING (werkbank_private.agent_is_lid()) WITH CHECK (werkbank_private.agent_is_lid());
CREATE POLICY wb_agent_leden_grens ON werkbank.agent_voorstellen AS RESTRICTIVE FOR ALL TO authenticated USING (werkbank_private.agent_is_lid()) WITH CHECK (werkbank_private.agent_is_lid());
GRANT SELECT (id,notitie_id,document_id,document_versie,status,fout_code,model,tokens_in,tokens_uit,kost_usd,created_at,klaar_op)
  ON werkbank.agent_opdrachten TO authenticated;
GRANT SELECT (id,opdracht_id,soort,oorspronkelijk,voorstel,uitleg,bronstatus,status,beoordeeld_door,beoordeeld_op,beoordelingsreden,created_at)
  ON werkbank.agent_voorstellen TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'werkbank_agent') THEN
    CREATE ROLE werkbank_agent NOLOGIN NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'werkbank_agent' AND (rolsuper OR rolbypassrls OR rolinherit OR rolcanlogin)) THEN
    RAISE EXCEPTION 'bestaande_werkbank_agent_rol_onveilig';
  END IF;
END $$;
GRANT USAGE ON SCHEMA werkbank_private TO werkbank_agent;

CREATE FUNCTION werkbank_private.agent_gesprek(p_root bigint) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = ''
AS $$
  -- Geen dieptegrens: de hele conversatie hoort mee, hoe diep ook. Een lus in de
  -- parent-ketting (kan alleen bij corrupte data) wordt afgebroken met het pad van
  -- al bezochte id's, nooit door stil af te kappen. Te veel blijft een eerlijke
  -- fout bij de aanroeper (agent_maak_opdracht: >40 berichten of >8000 tekens).
  WITH RECURSIVE draad AS (
    SELECT n.id, n.parent_id, n.auteur, n.created_at, n.tekst, n.afgewezen, n.opgelost, n.afwijs_reden, 0 AS diepte, ARRAY[n.id] AS pad
      FROM werkbank.notities n WHERE n.id = p_root AND n.parent_id IS NULL
    UNION ALL
    SELECT k.id, k.parent_id, k.auteur, k.created_at, k.tekst, k.afgewezen, k.opgelost, k.afwijs_reden, d.diepte + 1, d.pad || k.id
      FROM werkbank.notities k JOIN draad d ON k.parent_id = d.id WHERE NOT (k.id = ANY(d.pad))
  )
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'parent_id', parent_id, 'auteur', auteur,
    'tijd', coalesce(to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
    'tekst', tekst,
    'status', CASE WHEN afgewezen IS TRUE THEN 'afgewezen' WHEN opgelost IS TRUE THEN 'opgelost' ELSE 'open' END,
    'reden', coalesce(afwijs_reden, '')) ORDER BY (diepte > 0), created_at, id)
  FROM draad
$$;
CREATE FUNCTION werkbank_private.agent_gesprek_hash(p_gesprek jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    'n' || jsonb_array_length(p_gesprek)::text || ';' || coalesce((
      SELECT string_agg(octet_length(coalesce(f.waarde, ''))::text || ':' || coalesce(f.waarde, ''), '' ORDER BY x.ord, f.nr)
      FROM jsonb_array_elements(p_gesprek) WITH ORDINALITY AS x(e, ord)
      CROSS JOIN LATERAL unnest(ARRAY[x.e->>'id', x.e->>'parent_id', x.e->>'auteur', x.e->>'tijd', x.e->>'tekst', x.e->>'status', x.e->>'reden'])
        WITH ORDINALITY AS f(waarde, nr)
    ), ''), 'UTF8')), 'hex')
$$;
CREATE FUNCTION werkbank_private.agent_gesprek_actueel(p_notitie bigint, p_document bigint, p_sha text, p_anker text, p_context jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT n.doel_type = 'document' AND n.doel_id = p_document::text AND n.parent_id IS NULL
       AND n.anker IS NOT DISTINCT FROM p_anker AND n.anker_context IS NOT DISTINCT FROM p_context
       AND werkbank_private.agent_gesprek_hash(werkbank_private.agent_gesprek(n.id)) = p_sha
    FROM werkbank.notities n WHERE n.id = p_notitie), false)
$$;
REVOKE ALL ON FUNCTION werkbank_private.agent_gesprek(bigint) FROM PUBLIC, anon, authenticated, werkbank_agent;
REVOKE ALL ON FUNCTION werkbank_private.agent_gesprek_hash(jsonb) FROM PUBLIC, anon, authenticated, werkbank_agent;
REVOKE ALL ON FUNCTION werkbank_private.agent_gesprek_actueel(bigint,bigint,text,text,jsonb) FROM PUBLIC, anon, authenticated, werkbank_agent;

CREATE FUNCTION werkbank_private.agent_claim()
RETURNS TABLE(opdracht_id bigint, claim_token uuid, notitie_id bigint, document_id bigint,
              document_versie integer, document_updated_at timestamptz, opmerking text, anker text,
              document_pad text, document_inhoud text, gesprek jsonb, gesprek_sha256 text, anker_context jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE taak werkbank.agent_opdrachten%ROWTYPE; doc werkbank.documenten%ROWTYPE; token uuid;
BEGIN
  IF NOT werkbank_private.agent_basis_veilig() OR NOT EXISTS (
    SELECT 1 FROM werkbank_private.agent_config WHERE id AND actief AND kostenlimiet_gecontroleerd AND brongateway_veilig
  ) THEN RAISE EXCEPTION 'agent_niet_vrijgegeven' USING ERRCODE='42501'; END IF;
  UPDATE werkbank.agent_opdrachten SET
    status = CASE WHEN poging < 2 THEN 'wachtrij' ELSE 'mislukt' END,
    fout_code = CASE WHEN poging < 2 THEN NULL ELSE 'lease_verlopen' END,
    claim_token = NULL, lease_tot = NULL
    WHERE status = 'bezig' AND lease_tot < now();
  SELECT * INTO taak FROM werkbank.agent_opdrachten WHERE status = 'wachtrij'
    ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF taak.id IS NULL THEN RETURN; END IF;
  SELECT d.* INTO doc FROM werkbank.documenten d
    JOIN werkbank_private.agent_document_toelating t ON t.document_id = d.id AND t.toegestaan AND t.verwacht_pad = d.pad AND t.verwacht_blok_id = d.blok_id
    JOIN werkbank_private.agent_leden l ON l.user_id=t.eigenaar_user_id AND l.actief
    JOIN werkbank_private.agent_leden aanvrager ON aanvrager.user_id=taak.aangevraagd_door AND aanvrager.actief
    WHERE d.id = taak.document_id AND d.id NOT IN (30,31,77,78,79)
      AND lower(coalesce(d.pad,'')) NOT LIKE '%anthony-swolfs-een-leven-lang-geld%'
      AND lower(coalesce(d.pad,'')) NOT LIKE '%van-eesbeeck%';
  IF doc.id IS NULL OR doc.versie <> taak.document_versie OR doc.updated_at <> taak.document_updated_at OR
     pg_catalog.sha256(pg_catalog.convert_to(doc.inhoud,'UTF8')) IS DISTINCT FROM taak.document_sha256 THEN
    UPDATE werkbank.agent_opdrachten SET status='mislukt', fout_code='document_gewijzigd_of_geweigerd', klaar_op=now() WHERE id=taak.id;
    RETURN;
  END IF;
  IF NOT werkbank_private.agent_gesprek_actueel(taak.notitie_id, taak.document_id, taak.gesprek_sha256, taak.anker_snapshot, taak.anker_context_snapshot) THEN
    UPDATE werkbank.agent_opdrachten SET status='mislukt', fout_code='gesprek_gewijzigd', klaar_op=now() WHERE id=taak.id;
    RETURN;
  END IF;
  token := pg_catalog.gen_random_uuid();
  UPDATE werkbank.agent_opdrachten SET status='bezig', poging=poging+1, claim_token=token, geclaimd_op=now(), lease_tot=now()+interval '3 minutes'
    WHERE id=taak.id;
  RETURN QUERY SELECT taak.id, token, taak.notitie_id, doc.id, doc.versie, doc.updated_at,
                      taak.opmerking_snapshot, taak.anker_snapshot, doc.pad, doc.inhoud,
                      taak.gesprek_snapshot, taak.gesprek_sha256, taak.anker_context_snapshot;
END $$;
REVOKE ALL ON FUNCTION werkbank_private.agent_claim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank_private.agent_claim() TO werkbank_agent;

CREATE FUNCTION werkbank_private.agent_klaar(p_opdracht bigint, p_token uuid, p_soort text,
  p_oud text, p_nieuw text, p_uitleg text, p_model text, p_tokens_in integer, p_tokens_uit integer, p_kost numeric)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE taak werkbank.agent_opdrachten%ROWTYPE; doc werkbank.documenten%ROWTYPE;
BEGIN
  IF NOT werkbank_private.agent_basis_veilig() OR NOT EXISTS (
    SELECT 1 FROM werkbank_private.agent_config WHERE id AND actief AND kostenlimiet_gecontroleerd AND brongateway_veilig
  ) THEN RAISE EXCEPTION 'agent_niet_vrijgegeven' USING ERRCODE='42501'; END IF;
  SELECT * INTO taak FROM werkbank.agent_opdrachten WHERE id=p_opdracht FOR UPDATE;
  IF taak.id IS NULL OR taak.status <> 'bezig' OR taak.claim_token IS DISTINCT FROM p_token OR taak.lease_tot <= now() THEN
    RAISE EXCEPTION 'claim_verlopen';
  END IF;
  IF p_kost IS NULL OR p_kost < 0 OR p_kost > 0.25 OR p_tokens_in IS NULL OR p_tokens_uit IS NULL
      OR p_tokens_in NOT BETWEEN 0 AND 20000 OR p_tokens_uit NOT BETWEEN 0 AND 1000 THEN
    UPDATE werkbank_private.agent_config SET actief=false WHERE id;
    UPDATE werkbank.agent_opdrachten SET status='mislukt', fout_code='kosten_onbekend_of_te_hoog', klaar_op=now() WHERE id=taak.id;
    RETURN 'mislukt';
  END IF;
  IF p_model IS NULL OR p_model NOT IN ('deepseek/deepseek-v4.1-flash','anthropic/claude-sonnet-5.5') OR p_soort IS NULL OR p_soort NOT IN ('wijziging','antwoord')
      OR p_uitleg IS NULL OR length(btrim(p_uitleg)) NOT BETWEEN 1 AND 1500 THEN RAISE EXCEPTION 'ongeldige_uitvoer'; END IF;
  SELECT d.* INTO doc FROM werkbank.documenten d JOIN werkbank_private.agent_document_toelating t
    ON t.document_id=d.id AND t.toegestaan AND t.verwacht_pad=d.pad AND t.verwacht_blok_id=d.blok_id
    JOIN werkbank_private.agent_leden l ON l.user_id=t.eigenaar_user_id AND l.actief
    JOIN werkbank_private.agent_leden aanvrager ON aanvrager.user_id=taak.aangevraagd_door AND aanvrager.actief
    WHERE d.id=taak.document_id AND d.id NOT IN (30,31,77,78,79)
      AND lower(coalesce(d.pad,'')) NOT LIKE '%anthony-swolfs-een-leven-lang-geld%'
      AND lower(coalesce(d.pad,'')) NOT LIKE '%van-eesbeeck%';
  IF doc.id IS NULL OR doc.versie <> taak.document_versie OR doc.updated_at <> taak.document_updated_at OR
     pg_catalog.sha256(pg_catalog.convert_to(doc.inhoud,'UTF8')) IS DISTINCT FROM taak.document_sha256 THEN
    UPDATE werkbank.agent_opdrachten SET status='mislukt', fout_code='document_gewijzigd_of_geweigerd', klaar_op=now() WHERE id=taak.id;
    RETURN 'mislukt';
  END IF;
  IF NOT werkbank_private.agent_gesprek_actueel(taak.notitie_id, taak.document_id, taak.gesprek_sha256, taak.anker_snapshot, taak.anker_context_snapshot) THEN
    UPDATE werkbank.agent_opdrachten SET status='mislukt', fout_code='gesprek_gewijzigd', klaar_op=now() WHERE id=taak.id;
    RETURN 'mislukt';
  END IF;
  IF p_soort='antwoord' AND (coalesce(p_oud,'') <> '' OR coalesce(p_nieuw,'') <> '') THEN RAISE EXCEPTION 'ongeldige_uitvoer'; END IF;
  IF p_soort='wijziging' AND (
      p_oud IS NULL OR length(btrim(p_oud)) = 0 OR length(p_oud) > 2000 OR
      p_nieuw IS NULL OR length(btrim(p_nieuw)) = 0 OR length(p_nieuw) > 4000 OR p_oud=p_nieuw OR
      strpos(doc.inhoud,p_oud)=0 OR strpos(substring(doc.inhoud FROM strpos(doc.inhoud,p_oud)+1),p_oud)>0
  ) THEN RAISE EXCEPTION 'tekst_niet_uniek'; END IF;
  INSERT INTO werkbank.agent_voorstellen(opdracht_id,soort,oorspronkelijk,voorstel,uitleg)
    VALUES (taak.id,p_soort,coalesce(p_oud,''),coalesce(p_nieuw,''),btrim(p_uitleg));
  UPDATE werkbank.agent_opdrachten SET status='klaar', model=p_model, tokens_in=p_tokens_in,
    tokens_uit=p_tokens_uit, kost_usd=p_kost, klaar_op=now() WHERE id=taak.id;
  RETURN 'klaar';
END $$;
REVOKE ALL ON FUNCTION werkbank_private.agent_klaar(bigint,uuid,text,text,text,text,text,integer,integer,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank_private.agent_klaar(bigint,uuid,text,text,text,text,text,integer,integer,numeric) TO werkbank_agent;

CREATE FUNCTION werkbank_private.agent_fout(p_opdracht bigint, p_token uuid, p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE code text;
BEGIN
  code := CASE WHEN p_code IN ('vertrouwelijk_geweigerd','notitie_hoort_niet_bij_document','anker_vereist','anker_niet_uniek',
    'ongeldige_opdracht','ongeldige_uitvoer','tekst_niet_uniek','modelsleutel_ontbreekt','model_niet_toegelaten',
    'model_fout','timeout','budget_op','limiet_bereikt','redirect_geweigerd','interne_fout',
    'gesprek_te_lang','gesprek_gewijzigd','ongeldig_gesprek','anker_ongekoppeld') THEN p_code ELSE 'interne_fout' END;
  UPDATE werkbank.agent_opdrachten SET status='mislukt', fout_code=code, klaar_op=now()
    WHERE id=p_opdracht AND status='bezig' AND claim_token=p_token AND lease_tot>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'claim_verlopen'; END IF;
  IF code IN ('budget_op','modelsleutel_ontbreekt') THEN UPDATE werkbank_private.agent_config SET actief=false WHERE id; END IF;
END $$;
REVOKE ALL ON FUNCTION werkbank_private.agent_fout(bigint,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank_private.agent_fout(bigint,uuid,text) TO werkbank_agent;

CREATE FUNCTION werkbank_private.agent_beoordeel(p_voorstel bigint, p_actie text, p_reden text, p_review_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE gebruiker uuid := auth.uid(); naam text; eigenaar uuid; concept werkbank.agent_voorstellen%ROWTYPE;
        taak werkbank.agent_opdrachten%ROWTYPE; doc werkbank.documenten%ROWTYPE; nieuwe_inhoud text; verwacht_hash text;
BEGIN
  SELECT l.naam INTO naam FROM werkbank_private.agent_leden l WHERE l.user_id=gebruiker AND l.actief;
  IF naam IS NULL THEN RAISE EXCEPTION 'niet_toegelaten' USING ERRCODE='42501'; END IF;
  IF NOT werkbank_private.agent_basis_veilig() THEN RAISE EXCEPTION 'werkbank_onveilig' USING ERRCODE='42501'; END IF;
  IF p_actie IS NULL OR p_actie NOT IN ('toepassen','afwijzen') OR length(coalesce(p_reden,'')) > 2000 THEN RAISE EXCEPTION 'ongeldige_beoordeling'; END IF;
  SELECT * INTO concept FROM werkbank.agent_voorstellen WHERE id=p_voorstel FOR UPDATE;
  IF concept.id IS NULL OR concept.status <> 'voorgesteld' THEN RAISE EXCEPTION 'voorstel_al_beoordeeld'; END IF;
  SELECT * INTO taak FROM werkbank.agent_opdrachten WHERE id=concept.opdracht_id;
  SELECT * INTO doc FROM werkbank.documenten WHERE id=taak.document_id FOR UPDATE;
  SELECT t.eigenaar_user_id INTO eigenaar FROM werkbank_private.agent_document_toelating t
    WHERE t.document_id=doc.id AND t.toegestaan AND t.verwacht_blok_id=doc.blok_id AND t.verwacht_pad=doc.pad FOR SHARE;
  IF eigenaar IS DISTINCT FROM gebruiker THEN RAISE EXCEPTION 'niet_de_eigenaar' USING ERRCODE='42501'; END IF;
  IF (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'extra_verificatie_vereist' USING ERRCODE='42501'; END IF;
  verwacht_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.concat(
    octet_length(concept.id::text)::text, ':', concept.id::text,
    octet_length(taak.document_versie::text)::text, ':', taak.document_versie::text,
    octet_length(concept.oorspronkelijk)::text, ':', concept.oorspronkelijk,
    octet_length(concept.voorstel)::text, ':', concept.voorstel,
    octet_length(concept.uitleg)::text, ':', concept.uitleg
  ), 'UTF8')), 'hex');
  IF p_review_hash IS NULL OR p_review_hash !~ '^[0-9a-f]{64}$' OR p_review_hash IS DISTINCT FROM verwacht_hash THEN
    RAISE EXCEPTION 'voorstel_gewijzigd';
  END IF;
  IF p_actie='afwijzen' THEN
    UPDATE werkbank.agent_voorstellen SET status='afgewezen', beoordeeld_door=gebruiker, beoordeeld_op=now(), beoordelingsreden=nullif(btrim(p_reden),'') WHERE id=concept.id;
    RETURN 'afgewezen';
  END IF;
  IF concept.soort <> 'wijziging' THEN RAISE EXCEPTION 'geen_tekstvoorstel'; END IF;
  -- Toepassen alleen als het gesprek (reacties, status, reden, anker) nog exact is zoals het voorstel het zag.
  IF NOT werkbank_private.agent_gesprek_actueel(taak.notitie_id, taak.document_id, taak.gesprek_sha256, taak.anker_snapshot, taak.anker_context_snapshot) THEN
    RAISE EXCEPTION 'gesprek_gewijzigd';
  END IF;
  IF doc.id IS NULL OR doc.versie <> taak.document_versie OR doc.updated_at <> taak.document_updated_at OR
      pg_catalog.sha256(pg_catalog.convert_to(doc.inhoud,'UTF8')) IS DISTINCT FROM taak.document_sha256 OR
      strpos(doc.inhoud,concept.oorspronkelijk)=0 OR
      strpos(substring(doc.inhoud FROM strpos(doc.inhoud,concept.oorspronkelijk)+1),concept.oorspronkelijk)>0
      THEN RAISE EXCEPTION 'document_gewijzigd'; END IF;
  nieuwe_inhoud := replace(doc.inhoud,concept.oorspronkelijk,concept.voorstel);
  INSERT INTO werkbank.documenten_historiek(document_id,versie,inhoud,bewerkt_door)
    VALUES (doc.id,doc.versie,doc.inhoud,doc.bewerkt_door);
  UPDATE werkbank.documenten SET inhoud=nieuwe_inhoud, bytes=octet_length(nieuwe_inhoud), versie=doc.versie+1,
    bewerkt_door=naam, updated_at=clock_timestamp() WHERE id=doc.id;
  UPDATE werkbank.agent_voorstellen SET status='toegepast', beoordeeld_door=gebruiker, beoordeeld_op=now(), beoordelingsreden=nullif(btrim(p_reden),'') WHERE id=concept.id;
  RETURN 'toegepast';
END $$;
REVOKE ALL ON FUNCTION werkbank_private.agent_beoordeel(bigint,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank_private.agent_beoordeel(bigint,text,text,text) TO authenticated;
CREATE FUNCTION werkbank.beoordeel_agentvoorstel(p_voorstel bigint, p_actie text, p_reden text, p_review_hash text) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT werkbank_private.agent_beoordeel(p_voorstel,p_actie,p_reden,p_review_hash) $$;
REVOKE ALL ON FUNCTION werkbank.beoordeel_agentvoorstel(bigint,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION werkbank.beoordeel_agentvoorstel(bigint,text,text,text) TO authenticated;
COMMIT;
