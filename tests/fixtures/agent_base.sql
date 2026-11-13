-- Synthetische fixture, uitsluitend voor een lokale geïsoleerde testdatabase.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA werkbank;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
GRANT USAGE ON SCHEMA auth, werkbank TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated;
CREATE TABLE werkbank.blokken (id text PRIMARY KEY, eigenaar text);
CREATE TABLE werkbank.documenten (
  id bigint PRIMARY KEY, blok_id text NOT NULL REFERENCES werkbank.blokken(id),
  titel text NOT NULL, pad text, inhoud text, versie integer NOT NULL DEFAULT 1,
  bytes integer, bewerkt_door text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE werkbank.notities (
  id bigint PRIMARY KEY, doel_type text NOT NULL, doel_id text NOT NULL,
  tekst text NOT NULL, auteur text NOT NULL, anker text, created_at timestamptz NOT NULL DEFAULT now(),
  parent_id bigint REFERENCES werkbank.notities(id) ON DELETE CASCADE,
  afgewezen boolean NOT NULL DEFAULT false, opgelost boolean NOT NULL DEFAULT false,
  afwijs_reden text, afgewezen_door text, anker_context jsonb
);
CREATE TABLE werkbank.documenten_historiek (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, document_id bigint NOT NULL,
  versie integer NOT NULL, inhoud text, bewerkt_door text, bewaard_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE werkbank.documenten ENABLE ROW LEVEL SECURITY;
ALTER TABLE werkbank.notities ENABLE ROW LEVEL SECURITY;
ALTER TABLE werkbank.documenten_historiek ENABLE ROW LEVEL SECURITY;
ALTER TABLE werkbank.blokken ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA werkbank TO anon, authenticated;
CREATE POLICY intern_lezen ON werkbank.documenten FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY intern_schrijven ON werkbank.documenten FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY intern_lezen ON werkbank.notities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY intern_schrijven ON werkbank.notities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY intern_lezen ON werkbank.documenten_historiek FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY intern_schrijven ON werkbank.documenten_historiek FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY intern_lezen ON werkbank.blokken FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY intern_schrijven ON werkbank.blokken FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
