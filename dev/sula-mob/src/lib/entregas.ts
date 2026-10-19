/**
 * entregas.ts
 * ───────────
 * Fecha de entrega y estado de un proyecto, con la misma regla en todo el
 * sistema (calendario, alertas y detalle). Sirve en servidor y en cliente.
 *
 * RUTA: src/lib/entregas.ts
 */

export const ZONA_HORARIA = 'America/Mexico_City'

export type EstadoEntrega = 'completado' | 'cancelado' | 'atrasado' | 'en_proceso' | 'pendiente'

export const ETIQUETA_ESTADO: Record<EstadoEntrega, string> = {
  completado: 'Completado',
  cancelado: 'Cancelado',
  atrasado: 'Atrasado',
  en_proceso: 'En proceso',
  pendiente: 'Pendiente',
}

/** Fecha de hoy en México como "2026-10-13" */
export function fechaHoy(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA })
}

/** Días completos entre dos fechas "AAAA-MM-DD" (negativo si `hasta` es anterior) */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)
}

/** "2026-10-21" → "21 oct 2026" */
export function fechaLegible(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Fecha de entrega "AAAA-MM-DD" o '' si no tiene. Se toma de fecha_maxima y, si no hay,
 * de la descripción, donde la guarda el alta desde el PDF del pedido ("Entrega: 2026-05-19").
 */
export function fechaEntrega(p: { fecha_maxima?: string | null; descripcion?: string | null }): string {
  return (
    (typeof p.fecha_maxima === 'string' && p.fecha_maxima.slice(0, 10)) ||
    p.descripcion?.match(/Entrega:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ||
    ''
  )
}

/** Estado de un proyecto según su avance, su estado guardado y su fecha de entrega */
export function estadoEntrega(progreso: number, entrega: string, estadoGuardado = '', hoy = fechaHoy()): EstadoEntrega {
  const guardado = estadoGuardado.toLowerCase()
  if (progreso >= 100 || guardado === 'completado') return 'completado'
  if (guardado === 'cancelado') return 'cancelado'
  if (entrega && entrega < hoy) return 'atrasado'
  return progreso > 0 ? 'en_proceso' : 'pendiente'
}
