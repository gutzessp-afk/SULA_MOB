-- Revisiones de la explosión de materiales (/admin/bom/[id] → "Hoja de explosión").
-- Correr UNA vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
--
-- Cada explosión (bom_explosiones) tiene revisiones REV-00, REV-01, REV-02...
--   bom_revisiones        una fila por revisión: número, estado y encabezado del formato SULA
--   bom_revision_lineas   los materiales de cada revisión (columnas del Excel de SULA + OC + Compra)
--
-- Reglas (las aplica la API, no la base):
--   · Importar un Excel crea una revisión CERRADA (el archivo es el original).
--   · Editar una revisión cerrada crea automáticamente la siguiente (REV-01, REV-02...) como BORRADOR,
--     copiando sus líneas; origen_id apunta a la línea de la revisión anterior (para pintar los cambios).
--   · Mientras sea borrador se sigue editando la misma revisión. "Cerrar revisión" o "Terminar
--     explosión" la congelan.

CREATE TABLE IF NOT EXISTS bom_revisiones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  explosion_id   UUID NOT NULL REFERENCES bom_explosiones(id) ON DELETE CASCADE,
  numero         INT  NOT NULL CHECK (numero >= 0),
  estado         TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'cerrada')),
  -- { fecha, cliente, proyecto, pedido, orden_produccion, usuario }
  encabezado     JSONB NOT NULL DEFAULT '{}'::jsonb,
  motivo         TEXT NOT NULL DEFAULT '',
  origen         TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('importado', 'manual')),
  archivo_nombre TEXT,
  creado_por     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_en     TIMESTAMPTZ,
  cerrada_por    TEXT,
  UNIQUE (explosion_id, numero)
);

CREATE TABLE IF NOT EXISTS bom_revision_lineas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id    UUID NOT NULL REFERENCES bom_revisiones(id) ON DELETE CASCADE,
  -- Repetido a propósito: permite filtrar el tiempo real por explosión
  explosion_id   UUID NOT NULL REFERENCES bom_explosiones(id) ON DELETE CASCADE,
  -- Línea equivalente en la revisión anterior (NULL = material nuevo). Sin FK a propósito.
  origen_id      UUID,
  orden          INT NOT NULL DEFAULT 0,
  clave          TEXT NOT NULL DEFAULT '',
  descripcion    TEXT NOT NULL DEFAULT '',
  unidad         TEXT NOT NULL DEFAULT 'Pieza',
  clasificacion  TEXT NOT NULL DEFAULT '',
  moneda         TEXT NOT NULL DEFAULT 'Peso Mexicano',
  costo          NUMERIC(14,4) NOT NULL DEFAULT 0,
  cantidad       NUMERIC(14,4) NOT NULL DEFAULT 0,
  -- Compras (se definen después; por ahora van vacíos)
  oc             TEXT NOT NULL DEFAULT '',
  comprado       BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bom_revisiones_explosion ON bom_revisiones(explosion_id, numero);
CREATE INDEX IF NOT EXISTS idx_bom_revision_lineas_revision ON bom_revision_lineas(revision_id, orden);
CREATE INDEX IF NOT EXISTS idx_bom_revision_lineas_explosion ON bom_revision_lineas(explosion_id);
CREATE INDEX IF NOT EXISTS idx_bom_revision_lineas_origen ON bom_revision_lineas(origen_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION update_bom_revision_lineas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bom_revision_lineas_updated_at ON bom_revision_lineas;
CREATE TRIGGER trg_bom_revision_lineas_updated_at
  BEFORE UPDATE ON bom_revision_lineas
  FOR EACH ROW EXECUTE FUNCTION update_bom_revision_lineas_updated_at();

-- RLS (mismo criterio que bom_detalles: las API usan la service role; el navegador solo escucha el tiempo real)
ALTER TABLE bom_revisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_revision_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bom_revisiones_all" ON bom_revisiones;
CREATE POLICY "bom_revisiones_all" ON bom_revisiones FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bom_revision_lineas_all" ON bom_revision_lineas;
CREATE POLICY "bom_revision_lineas_all" ON bom_revision_lineas FOR ALL USING (true) WITH CHECK (true);

-- Tiempo real (si ya están en la publicación, el bloque no hace nada)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bom_revisiones') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bom_revisiones;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bom_revision_lineas') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bom_revision_lineas;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Comprobación: debe mostrar 2 filas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('bom_revisiones', 'bom_revision_lineas');
