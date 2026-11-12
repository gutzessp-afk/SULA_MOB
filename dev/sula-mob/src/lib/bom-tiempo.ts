/**
 * bom-tiempo.ts
 * ─────────────
 * Estatus y tiempos de una explosión de material (tabla bom_explosiones), compartidos por
 * /admin/bom, /admin/bom/[id], /admin/proyectos y las API de BOM.
 *
 *   tiempo trabajado = acumulado_seg + (ahora - tramo_inicio, si no está en pausa)
 *   checklist.pausas = cuántas veces se pausó (checklist también guarda los motivos del estatus)
 *
 * RUTA: src/lib/bom-tiempo.ts
 */

import { motivosSinResolver } from './bom-motivos'

export type EstatusBom = 'bloqueado' | 'pendiente' | 'en_proceso' | 'pausado' | 'completado'

export interface TiemposExplosion {
  estado: string
  fecha_inicio: string | null
  fecha_termino: string | null
  duracion_seg: number | null
  acumulado_seg?: number | null
  tramo_inicio?: string | null
  checklist?: unknown
}

export const ESTATUS_BOM: Record<EstatusBom, { txt: string; css: string }> = {
  bloqueado: { txt: 'BLOQUEADO', css: 'bg-red-500/15 text-red-300 border-red-400/30' },
  pendiente: { txt: 'PENDIENTE', css: 'bg-yellow-500/15 text-yellow-300 border-yellow-400/30' },
  en_proceso: { txt: 'EN PROCESO', css: 'bg-blue-500/15 text-blue-300 border-blue-400/30' },
  pausado: { txt: 'EN PAUSA', css: 'bg-amber-500/15 text-amber-300 border-amber-400/30' },
  completado: { txt: 'COMPLETADO', css: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' },
}

export function estatusBom(e: TiemposExplosion): EstatusBom {
  if (e.estado === 'completado') return 'completado'
  if (e.estado === 'en_proceso') return e.tramo_inicio ? 'en_proceso' : 'pausado'
  return motivosSinResolver(e.checklist).length > 0 ? 'bloqueado' : 'pendiente'
}

/** Segundos trabajados (sin pausas) hasta `ahora`; si ya terminó, la duración guardada */
export function segundosTrabajados(e: TiemposExplosion, ahora = Date.now()): number {
  if (e.estado === 'completado') return e.duracion_seg || 0
  const tramo = e.tramo_inicio ? Math.max(0, Math.round((ahora - new Date(e.tramo_inicio).getTime()) / 1000)) : 0
  return (e.acumulado_seg || 0) + tramo
}

export function pausasDe(checklist: unknown): number {
  const n = (checklist as { pausas?: unknown } | null)?.pausas
  return typeof n === 'number' && n > 0 ? Math.floor(n) : 0
}

/** "2h 45m", "1d 5h 30m", "45s" */
export function duracionLegible(seg: number): string {
  const total = Math.max(0, Math.round(seg || 0))
  if (total < 60) return `${total}s`
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m'
}

/** HH:MM:SS (las horas pueden pasar de 24) */
export function formatTiempo(seg: number): string {
  const total = Math.max(0, Math.round(seg || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const ZONA = 'America/Mexico_City'
const diaMexico = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** Días de calendario (hora de México) que abarca del inicio al término, contando ambos */
export function diasCalendario(inicio: string, fin: string): number {
  const a = Date.parse(`${diaMexico(inicio)}T00:00:00Z`)
  const b = Date.parse(`${diaMexico(fin)}T00:00:00Z`)
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

/** "El mismo día" o "Tomó 3 días" */
export function textoDias(inicio: string | null, fin: string | null): string {
  if (!inicio || !fin) return '—'
  const dias = diasCalendario(inicio, fin)
  return dias === 1 ? 'El mismo día' : `Tomó ${dias} días`
}
