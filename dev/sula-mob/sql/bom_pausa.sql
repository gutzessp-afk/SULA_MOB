-- Pausar, reanudar y reiniciar el cronómetro de la explosión de material (/admin/bom/[id]).
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
--
--   acumulado_seg  segundos trabajados antes del tramo actual (se suma al pausar)
--   tramo_inicio   cuándo arrancó el tramo actual; NULL = pausada
--
-- Tiempo trabajado = acumulado_seg + (ahora - tramo_inicio, si no está pausada).

ALTER TABLE bom_explosiones ADD COLUMN IF NOT EXISTS acumulado_seg INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bom_explosiones ADD COLUMN IF NOT EXISTS tramo_inicio TIMESTAMPTZ;

-- Las que ya están en proceso siguen corriendo desde su inicio
UPDATE bom_explosiones
SET tramo_inicio = fecha_inicio
WHERE estado = 'en_proceso' AND tramo_inicio IS NULL AND fecha_inicio IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Comprobación: debe mostrar 2 filas
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bom_explosiones' AND column_name IN ('acumulado_seg', 'tramo_inicio');
