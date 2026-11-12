/**
 * bom-motivos.ts
 * ──────────────
 * Estatus del pedido en la explosión de material (/admin/bom/[id]): los motivos por los que
 * todavía no se puede explosionar. Se guardan en bom_explosiones.checklist como
 * { motivos: MotivoBloqueo[] } y la descripción libre en bom_explosiones.notas.
 *
 * Mientras haya un motivo sin resolver, la explosión no se puede iniciar.
 * Lo usan la página, /api/bom y /api/bom/exportar.
 *
 * RUTA: src/lib/bom-motivos.ts
 */

export const MOTIVOS_PREDEFINIDOS = [
  { id: 'sin_acabados', texto: 'No tengo acabados (colores, laminados, cantos)' },
  { id: 'sin_plano', texto: 'Falta el plano o está incompleto' },
  { id: 'sin_medidas', texto: 'Faltan medidas o especificaciones' },
  { id: 'sin_info_cliente', texto: 'Falta información o confirmación del cliente' },
  { id: 'cambios_cliente', texto: 'Hay cambios pendientes del cliente' },
  { id: 'sin_material', texto: 'No hay material o herraje disponible' },
  { id: 'sin_autorizacion', texto: 'Falta autorización o anticipo' },
] as const

export interface MotivoBloqueo {
  /** id de MOTIVOS_PREDEFINIDOS, u 'otro-…' para un motivo escrito a mano */
  id: string
  texto: string
  detalle: string
  resuelto: boolean
  reportado_en: string
  reportado_por: string
  resuelto_en: string | null
  resuelto_por: string | null
}

/** Motivos guardados en el campo checklist (tolera filas viejas con {} o null) */
export function motivosDe(checklist: unknown): MotivoBloqueo[] {
  const lista = (checklist as { motivos?: unknown } | null)?.motivos
  return Array.isArray(lista) ? (lista as MotivoBloqueo[]) : []
}

export const motivosSinResolver = (checklist: unknown) => motivosDe(checklist).filter(m => !m.resuelto)
