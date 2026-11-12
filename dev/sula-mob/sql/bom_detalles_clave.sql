-- Clave propia en las líneas de material de la explosión (/admin/bom/[id], columna "Partida / Clave").
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- Vacía = material general; si la línea es de una partida del pedido se usa partida_id.

ALTER TABLE bom_detalles ADD COLUMN IF NOT EXISTS clave TEXT NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';

-- Comprobación: debe mostrar 1 fila
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bom_detalles' AND column_name = 'clave';
