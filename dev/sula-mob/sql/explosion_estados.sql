-- ════════════════════════════════════════════════════════════════════════════
-- EXPLOSIÓN — estados de FINANZAS y ALMACÉN por material (partida)
-- Correr UNA vez en Supabase → SQL Editor. Se puede volver a correr. No borra datos.
--
--  FINANZAS: estado_pago   = PENDIENTE DE PAGO | PARCIALMENTE PAGADO | PAGADO
--            fecha_estado_pago (se pone sola cada vez que cambia el estado)
--  ALMACÉN:  estado_almacen = PENDIENTE DE RECIBIR | PARCIALMENTE RECIBIDO | RECIBIDO
--            cantidad_recibida, y la fecha va en fecha_almacen (columna que ya existe)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.bom_revision_lineas
  ADD COLUMN IF NOT EXISTS estado_pago        text NOT NULL DEFAULT 'PENDIENTE DE PAGO',
  ADD COLUMN IF NOT EXISTS fecha_estado_pago  date,
  ADD COLUMN IF NOT EXISTS estado_almacen     text NOT NULL DEFAULT 'PENDIENTE DE RECIBIR',
  ADD COLUMN IF NOT EXISTS cantidad_recibida  numeric(14,3);

-- Solo se aceptan los 3 estados de cada sección
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bom_lineas_estado_pago_chk') THEN
    ALTER TABLE public.bom_revision_lineas ADD CONSTRAINT bom_lineas_estado_pago_chk
      CHECK (estado_pago IN ('PENDIENTE DE PAGO', 'PARCIALMENTE PAGADO', 'PAGADO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bom_lineas_estado_almacen_chk') THEN
    ALTER TABLE public.bom_revision_lineas ADD CONSTRAINT bom_lineas_estado_almacen_chk
      CHECK (estado_almacen IN ('PENDIENTE DE RECIBIR', 'PARCIALMENTE RECIBIDO', 'RECIBIDO'));
  END IF;
END $$;

-- Lo que ya estaba palomeado como "Almacén" queda como RECIBIDO (no se pierde nada)
UPDATE public.bom_revision_lineas
SET estado_almacen = 'RECIBIDO'
WHERE almacen = true AND estado_almacen = 'PENDIENTE DE RECIBIR';

-- Para que la campana de finanzas/almacén encuentre rápido sus avisos
CREATE INDEX IF NOT EXISTS notificaciones_destinatario_leida_idx
  ON public.notificaciones (destinatario_id, leida, created_at DESC);

NOTIFY pgrst, 'reload schema';

-- Comprobación: 4 columnas nuevas
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'bom_revision_lineas'
  AND column_name IN ('estado_pago', 'fecha_estado_pago', 'estado_almacen', 'cantidad_recibida')
ORDER BY column_name;
