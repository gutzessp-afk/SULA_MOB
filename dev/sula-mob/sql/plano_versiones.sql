-- ═══════════════════════════════════════════════════════════════
-- plano_versiones — historial de cada plano analizado o corregido, por clave
-- (Despiece → Subir Plano, /admin/despiece/plano).
-- Se puede ejecutar más de una vez: no borra nada que ya exista.
-- Ejecutar en Supabase → SQL Editor, DESPUÉS de sql/plantilla_despiece.sql.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plano_versiones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave          TEXT NOT NULL,              -- misma clave que plantilla_despiece
  version        INTEGER NOT NULL DEFAULT 1, -- 1, 2, 3...
  bom_snapshot   JSONB NOT NULL,             -- copia del BOM en ese momento
  archivo_nombre TEXT,                       -- nombre del PDF ('' si fue una corrección a mano)
  archivo_hash   TEXT,                       -- SHA-256 del PDF: el mismo archivo no se vuelve a analizar
  cambios        JSONB,                      -- diferencias contra la versión anterior (null en la primera)
  analizado_por  TEXT DEFAULT 'ia',          -- 'ia' | 'pdf' | 'manual'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clave, version)
);

CREATE INDEX IF NOT EXISTS idx_plano_versiones_clave ON plano_versiones (clave);
CREATE INDEX IF NOT EXISTS idx_plano_versiones_hash ON plano_versiones (archivo_hash);

-- Datos de la versión vigente, para comparar rápido sin leer el historial
ALTER TABLE plantilla_despiece
  ADD COLUMN IF NOT EXISTS archivo_hash TEXT,
  ADD COLUMN IF NOT EXISTS version_actual INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS editado_manualmente BOOLEAN DEFAULT false;

-- RLS: mismo criterio que el resto de las tablas de la app (acceso con la anon key)
ALTER TABLE plano_versiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plano_versiones_acceso ON plano_versiones;
CREATE POLICY plano_versiones_acceso ON plano_versiones
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- Comprobación: debe mostrar 3 filas
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'plantilla_despiece'
  AND column_name IN ('archivo_hash', 'version_actual', 'editado_manualmente');
