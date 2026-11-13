-- Alleen de commentfunctie in het bestaande, eigen werkbankschema.
-- Geen gegevenswijzigingen, rollen, policies of andere schema's.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '20s';
ALTER TABLE werkbank.notities
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS anker_context jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS werkbank_notities_client_id_uniek
  ON werkbank.notities (client_id);
DO $comment_controle$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='werkbank' AND table_name='notities'
      AND column_name='client_id' AND data_type='text' AND is_nullable='YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='werkbank' AND table_name='notities'
      AND column_name='anker_context' AND data_type='jsonb' AND is_nullable='YES'
  ) THEN RAISE EXCEPTION 'Onverwacht commentkolomtype; niets vastgelegd'; END IF;
END
$comment_controle$;
COMMIT;
