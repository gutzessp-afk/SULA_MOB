/**
 * plan-tiempos.ts
 * ───────────────
 * Cálculos del plan de tiempos de un proyecto: fechas por área, avance esperado,
 * semáforo y fecha estimada de término. Funciones puras: no leen la base ni el
 * navegador, solo reciben datos. Fechas "AAAA-MM-DD" como en lib/entregas.ts.
 *
 * RUTA: src/lib/plan-tiempos.ts
 */

import { diasEntre } from './entregas'

export interface AreaConDias {
  areaId: string
  dias: number
  orden: number
}

/** Una área dentro del plan: ocupa ceil(dias) días (hábiles si no se cuentan fines de semana) */
export interface TramoPlan {
  areaId: string
  dias: number
  ocupa: number
  inicio: string
  fin: string
}

export interface PlanArmado {
  inicio: string
  fin: string
  contarFinesSemana: boolean
  tramos: TramoPlan[]
}

export type Semaforo = 'completada' | 'pendiente' | 'verde' | 'ambar' | 'rojo'

export interface Estimacion {
  estado: 'terminado' | 'por_iniciar' | 'en_curso'
  /** Fecha estimada de término "AAAA-MM-DD" */
  fin: string
  /** Días entre el término estimado y la entrega (negativo = riesgo); null sin entrega o ya terminado */
  margen: number | null
  /** Ritmo aplicado: >1 va más lento que el plan, <1 más rápido */
  factor: number
}

/* ── Fechas ── */

// A mediodía para que el cambio de horario o la zona nunca muevan el día
const aFecha = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`)
const aTexto = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function sumarDias(fecha: string, dias: number): string {
  const d = aFecha(fecha)
  d.setDate(d.getDate() + dias)
  return aTexto(d)
}

export function esFinDeSemana(fecha: string): boolean {
  const dia = aFecha(fecha).getDay()
  return dia === 0 || dia === 6
}

/** La misma fecha o, si cae en fin de semana y no se cuentan, el lunes siguiente */
export function siguienteHabil(fecha: string, contarFinesSemana: boolean): string {
  let f = fecha
  if (!contarFinesSemana) while (esFinDeSemana(f)) f = sumarDias(f, 1)
  return f
}

/** Avanza `dias` días (redondeados hacia arriba); sin fines de semana se brincan sábados y domingos */
export function sumarDiasHabiles(fecha: string, dias: number, contarFinesSemana: boolean): string {
  const n = Math.ceil(dias)
  if (n <= 0) return fecha
  if (contarFinesSemana) return sumarDias(fecha, n)
  let f = fecha
  for (let i = 0; i < n; i++) {
    f = sumarDias(f, 1)
    while (esFinDeSemana(f)) f = sumarDias(f, 1)
  }
  return f
}

/** Días (hábiles si no se cuentan fines de semana) desde `desde` hasta el día antes de `hasta` */
function diasTrabajados(desde: string, hasta: string, contarFinesSemana: boolean): number {
  if (hasta <= desde) return 0
  if (contarFinesSemana) return diasEntre(desde, hasta)
  let n = 0
  for (let f = desde; f < hasta; f = sumarDias(f, 1)) if (!esFinDeSemana(f)) n++
  return n
}

/* ── Plan ── */

/** Fechas de cada área, una tras otra en el orden dado */
export function armarPlan(fechaInicio: string, contarFinesSemana: boolean, areas: AreaConDias[]): PlanArmado {
  const ordenadas = [...areas].sort((a, b) => a.orden - b.orden)
  const inicioPlan = siguienteHabil(fechaInicio, contarFinesSemana)
  const tramos: TramoPlan[] = []
  let inicio = inicioPlan
  for (const a of ordenadas) {
    const ocupa = Math.max(1, Math.ceil(a.dias))
    const fin = sumarDiasHabiles(inicio, ocupa - 1, contarFinesSemana)
    tramos.push({ areaId: a.areaId, dias: a.dias, ocupa, inicio, fin })
    inicio = sumarDiasHabiles(fin, 1, contarFinesSemana)
  }
  return { inicio: inicioPlan, fin: tramos.at(-1)?.fin ?? inicioPlan, contarFinesSemana, tramos }
}

/**
 * Qué parte del área ya debería ir hecha hoy (0 a 1): 0 antes de su inicio, 1 después
 * de su fin y, en medio, los días completos ya trabajados entre sus días estimados.
 */
export function avanceEsperado(tramo: TramoPlan, hoy: string, contarFinesSemana = false): number {
  if (hoy < tramo.inicio) return 0
  if (hoy > tramo.fin) return 1
  return Math.min(1, diasTrabajados(tramo.inicio, hoy, contarFinesSemana) / tramo.dias)
}

/** Color del área según lo esperado contra lo real (ambos de 0 a 1) */
export function semaforo(esperado: number, real: number): Semaforo {
  if (real >= 1) return 'completada'
  if (esperado === 0 && real === 0) return 'pendiente'
  const atraso = esperado - real
  if (atraso <= 0.05) return 'verde'
  if (atraso <= 0.2) return 'ambar'
  return 'rojo'
}

/**
 * Término estimado al ritmo real. Lo que falta (días × lo no hecho de cada área) se
 * ajusta con el ritmo: lo esperado entre lo real, entre 0.5 y 2, y solo cuando ya hay
 * al menos 10% de avance (antes es muy pronto para medir el ritmo).
 */
export function estimarTermino(plan: PlanArmado, avancesReales: Record<string, number>, hoy: string, entrega: string): Estimacion {
  const real = (areaId: string) => Math.max(0, Math.min(1, avancesReales[areaId] ?? 0))
  const margenContra = (fin: string) => (entrega ? diasEntre(fin, entrega) : null)

  if (plan.tramos.length > 0 && plan.tramos.every(t => real(t.areaId) >= 1)) {
    return { estado: 'terminado', fin: hoy, margen: null, factor: 1 }
  }
  if (hoy < plan.inicio) {
    return { estado: 'por_iniciar', fin: plan.fin, margen: margenContra(plan.fin), factor: 1 }
  }

  let total = 0
  let restante = 0
  let esperado = 0
  let hecho = 0
  for (const t of plan.tramos) {
    const r = real(t.areaId)
    total += t.dias
    restante += t.dias * (1 - r)
    esperado += t.dias * avanceEsperado(t, hoy, plan.contarFinesSemana)
    hecho += t.dias * r
  }
  const factor = total > 0 && hecho / total >= 0.1 ? Math.max(0.5, Math.min(2, esperado / hecho)) : 1
  const fin = sumarDiasHabiles(hoy, Math.ceil(restante * factor), plan.contarFinesSemana)
  return { estado: 'en_curso', fin, margen: margenContra(fin), factor }
}

/* ── Presentación ── */

export type NivelMargen = 'verde' | 'ambar' | 'rojo'

/** Rojo si el estimado pasa la entrega, ámbar si queda muy justo (≤ 2 días), verde si hay margen */
export function nivelMargen(margen: number): NivelMargen {
  if (margen < 0) return 'rojo'
  if (margen <= 2) return 'ambar'
  return 'verde'
}

/** "25 nov" (sin año, para indicadores pequeños) */
export function fechaCorta(iso: string): string {
  const d = aFecha(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export interface EvaluacionPlan {
  plan: PlanArmado
  estimacion: Estimacion
  areas: { tramo: TramoPlan; esperado: number; real: number; semaforo: Semaforo }[]
}

/**
 * Todo lo que muestran las pantallas para un plan guardado: fechas, término estimado
 * y semáforo por área. Con `areasValidas` se ignoran las áreas que ya no existen.
 */
export function evaluarPlan(
  guardado: { fechaInicio: string; contarFinesSemana: boolean; areas: AreaConDias[] },
  avancesReales: Record<string, number>,
  hoy: string,
  entrega: string,
  areasValidas?: Set<string>,
): EvaluacionPlan {
  const areas = areasValidas ? guardado.areas.filter(a => areasValidas.has(a.areaId)) : guardado.areas
  const plan = armarPlan(guardado.fechaInicio, guardado.contarFinesSemana, areas)
  return {
    plan,
    estimacion: estimarTermino(plan, avancesReales, hoy, entrega),
    areas: plan.tramos.map(tramo => {
      const esperado = avanceEsperado(tramo, hoy, plan.contarFinesSemana)
      const real = Math.max(0, Math.min(1, avancesReales[tramo.areaId] ?? 0))
      return { tramo, esperado, real, semaforo: semaforo(esperado, real) }
    }),
  }
}
