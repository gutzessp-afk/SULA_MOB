-- Importes y pagos de las órdenes de compra de la explosión (/admin/bom/[id] y /madera).
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
--
--   subtotal, iva, total  leídos del PDF de la OC al subirlo
--   monto_pagado          lo pagado (pagos parciales); se conserva si se vuelve a subir el PDF
--   fecha_pago            fecha del pago, a mano o la de hoy al palomear "Pagada"

ALTER TABLE bom_ordenes_compra ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2);
ALTER TABLE bom_ordenes_compra ADD COLUMN IF NOT EXISTS iva NUMERIC(14,2);
ALTER TABLE bom_ordenes_compra ADD COLUMN IF NOT EXISTS total NUMERIC(14,2);
ALTER TABLE bom_ordenes_compra ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bom_ordenes_compra ADD COLUMN IF NOT EXISTS fecha_pago DATE;

NOTIFY pgrst, 'reload schema';

-- Comprobación: debe mostrar 5 filas
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bom_ordenes_compra'
  AND column_name IN ('subtotal', 'iva', 'total', 'monto_pagado', 'fecha_pago');
