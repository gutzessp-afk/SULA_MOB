-- ═══════════════════════════════════════════════════════════════
-- plantilla_despiece — BOMs importados (Excel o PDF del plano), reutilizables por clave
-- Se puede ejecutar más de una vez: no borra nada que ya exista.
-- Ejecutar en Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plantilla_despiece (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave          TEXT NOT NULL,          -- clave de la partida del pedido (ej. 2-1-0072-0009)
  clave_completa TEXT,                   -- modelo tal como aparece en el plano
  descripcion    TEXT,
  linea          TEXT,
  bom            JSONB NOT NULL,         -- subensambles, componentes, herrajes, materiales
  plano_nombre   TEXT,                   -- nombre del PDF analizado
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- De dónde se importó el BOM: 'excel' | 'pdf' | 'ia' | 'manual'
ALTER TABLE plantilla_despiece ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'excel';

-- Una plantilla por clave (necesario para el upsert de /api/analizar-plano)
CREATE UNIQUE INDEX IF NOT EXISTS plantilla_despiece_clave_key ON plantilla_despiece (clave);

-- updated_at automático
CREATE OR REPLACE FUNCTION plantilla_despiece_touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plantilla_despiece_updated_at ON plantilla_despiece;
CREATE TRIGGER plantilla_despiece_updated_at
  BEFORE UPDATE ON plantilla_despiece
  FOR EACH ROW EXECUTE FUNCTION plantilla_despiece_touch();

-- RLS: mismo criterio que el resto de las tablas de la app (acceso con la anon key)
ALTER TABLE plantilla_despiece ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plantilla_despiece_acceso ON plantilla_despiece;
CREATE POLICY plantilla_despiece_acceso ON plantilla_despiece
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
