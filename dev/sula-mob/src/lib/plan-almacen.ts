/**
 * plan-almacen.ts
 * ───────────────
 * Dónde se guarda el plan de tiempos de cada proyecto (opcional): en el localStorage
 * de este navegador. Es el ÚNICO módulo que sabe eso; para pasarlo a una tabla de la
 * base basta con cambiar este archivo.
 *
 * Todo va en try/catch: el almacenamiento puede fallar o venir vacío (modo privado,
 * sitio bloqueado). Si falla, la app sigue como si el proyecto no tuviera plan.
 * En el servidor nunca se toca window: ahí no hay planes.
 *
 * RUTA: src/lib/plan-almacen.ts
 */

export interface AreaPlaneada {
  areaId: string
  /** Días estimados (puede ser decimal) */
  dias: number
  /** Posición en la secuencia (la de areas.orden) */
  orden: number
}

export interface Plan {
  /** "AAAA-MM-DD" */
  fechaInicio: string
  contarFinesSemana: boolean
  areas: AreaPlaneada[]
  /** ISO de la última vez que se guardó */
  actualizadoEn: string
}

export type Planes = Record<string, Plan>

const CLAVE = 'sula-plan-tiempos:v1'
/** Evento propio para avisar a la misma pestaña (el evento "storage" solo llega a las demás) */
export const EVENTO_PLANES = 'sula-plan-tiempos:cambio'
const enNavegador = typeof window !== 'undefined'

/** Descarta lo que no tenga la forma de un plan (datos viejos o editados a mano) */
function esPlan(valor: unknown): valor is Plan {
  const p = valor as Plan
  return (
    !!p && typeof p === 'object' &&
    typeof p.fechaInicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.fechaInicio) &&
    typeof p.contarFinesSemana === 'boolean' &&
    Array.isArray(p.areas) &&
    p.areas.every(a => a && typeof a.areaId === 'string' && Number.isFinite(a.dias) && a.dias > 0 && Number.isFinite(a.orden))
  )
}

/** Texto tal cual está guardado ('' si no hay o no se puede leer) */
export function leerTextoPlanes(): string {
  if (!enNavegador) return ''
  try {
    return localStorage.getItem(CLAVE) ?? ''
  } catch {
    return ''
  }
}

/** Convierte el texto guardado en planes válidos (sin planes si está dañado) */
export function interpretarPlanes(texto: string): Planes {
  if (!texto) return {}
  try {
    const crudo = JSON.parse(texto) as unknown
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return {}
    const planes: Planes = {}
    for (const [id, plan] of Object.entries(crudo)) if (esPlan(plan)) planes[id] = plan
    return planes
  } catch {
    return {}
  }
}

/** Guarda todos los planes y avisa a las pantallas abiertas. false si no se pudo. */
function escribir(planes: Planes): boolean {
  if (!enNavegador) return false
  try {
    if (Object.keys(planes).length === 0) localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, JSON.stringify(planes))
  } catch {
    return false
  }
  window.dispatchEvent(new Event(EVENTO_PLANES))
  return true
}

/** true si este navegador deja guardar (falso en algunos modos privados o sitios bloqueados) */
export function almacenDisponible(): boolean {
  if (!enNavegador) return false
  try {
    const prueba = `${CLAVE}:prueba`
    localStorage.setItem(prueba, '1')
    localStorage.removeItem(prueba)
    return true
  } catch {
    return false
  }
}

/** Todos los planes, por proyectoId */
export function listarPlanes(): Planes {
  return interpretarPlanes(leerTextoPlanes())
}

/** Plan de un proyecto o null si no tiene */
export function leerPlan(proyectoId: string): Plan | null {
  return listarPlanes()[proyectoId] ?? null
}

/** Guarda (o reemplaza) el plan de un proyecto. false si el navegador no lo permitió. */
export function guardarPlan(proyectoId: string, plan: Plan): boolean {
  return escribir({ ...listarPlanes(), [proyectoId]: plan })
}

/** Quita el plan de un proyecto: vuelve a verse como antes */
export function quitarPlan(proyectoId: string): boolean {
  const planes = listarPlanes()
  if (!(proyectoId in planes)) return true
  delete planes[proyectoId]
  return escribir(planes)
}

/** Borra los planes de proyectos que ya no existen */
export function limpiarHuerfanos(idsValidos: string[]) {
  const validos = new Set(idsValidos)
  const planes = listarPlanes()
  const huerfanos = Object.keys(planes).filter(id => !validos.has(id))
  if (huerfanos.length === 0) return
  for (const id of huerfanos) delete planes[id]
  escribir(planes)
}
