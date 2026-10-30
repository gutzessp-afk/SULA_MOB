-- Vínculo de cada plano del catálogo con su PDF en Google Drive (página Planos → "Plano").
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- Se llena solo al usar "Conectar y listar" en la migración desde Drive.

ALTER TABLE plantilla_despiece ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
CREATE INDEX IF NOT EXISTS plantilla_despiece_drive_file_id ON plantilla_despiece (drive_file_id);

NOTIFY pgrst, 'reload schema';

-- Comprobación: debe mostrar 1 fila
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'plantilla_despiece' AND column_name = 'drive_file_id';
