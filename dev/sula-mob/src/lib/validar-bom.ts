/**
 * validar-bom.ts
 * ──────────────
 * Reglas automáticas (sin IA, sin costo) que revisan que el despiece leído de un
 * plano sea coherente antes de cortar: medidas imposibles, calibre que no cuadra
 * con el espesor, tubos mandados a otra área, largo y ancho invertidos...
 * No corrige nada: marca lo sospechoso para que una persona lo revise.
 *
 * RUTA: src/lib/validar-bom.ts
 */

import type { ComponenteBOM, PlantillaBOM } from './types'

export interface Hallazgo {
  gravedad: 'error' | 'aviso'
  /** Índices de la pieza en el BOM; comp = null cuando el hallazgo es del producto o del subensamble */
  sub: number | null
  comp: number | null
  pieza: string
  mensaje: string
}

/** Espesor nominal en mm de la lámina de acero por calibre */
const ESPESOR_CALIBRE: Record<number, number> = {
  10: 3.42, 11: 3.04, 12: 2.66, 14: 1.9, 16: 1.52, 18: 1.21, 20: 0.91, 22: 0.76, 24: 0.61, 26: 0.45,
}
const TOLERANCIA_ESPESOR = 0.2

const esTubo = (c: ComponenteBOM) =>
  !!c.geometria?.startsWith('tubo_') || /^\s*(T\.?\s*(CUAD|RECT|RED|OVAL)|TUBO|PTR|PERFIL\s+(CUAD|RECT|TUB))/i.test(c.material)

/** Calibre escrito en el material: "C.20", "C-11", "CAL. 18", "CAL 14" */
function calibreDe(material: string): number | null {
  const m = material.match(/\bC(?:AL)?[.\-]?\s*(\d{1,2})\b/i)
  return m ? Number(m[1]) : null
}

const numero = (texto: string) => (/^\s*\d+(\.\d+)?\s*$/.test(texto) ? Number(texto) : null)

export function validarBOM(bom: PlantillaBOM): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  const agregar = (gravedad: Hallazgo['gravedad'], sub: number | null, comp: number | null, pieza: string, mensaje: string) =>
    hallazgos.push({ gravedad, sub, comp, pieza, mensaje })

  // Producto: dimensiones generales razonables para mobiliario
  const dims = { ancho: bom.ancho_mm ?? 0, alto: bom.alto_mm ?? 0, fondo: bom.profundidad_mm ?? 0 }
  if (dims.ancho && (dims.ancho < 100 || dims.ancho > 5000)) agregar('aviso', null, null, 'Producto', `Ancho general de ${dims.ancho} mm: fuera de lo normal para un mueble (100 a 5000 mm).`)
  if (dims.alto && (dims.alto < 100 || dims.alto > 3000)) agregar('aviso', null, null, 'Producto', `Alto general de ${dims.alto} mm: fuera de lo normal para un mueble (100 a 3000 mm).`)
  const mayor = Math.max(dims.ancho, dims.alto, dims.fondo)

  if (!bom.subensambles.length) agregar('error', null, null, 'Producto', 'El despiece no tiene subensambles: la lectura del plano falló.')

  bom.subensambles.forEach((sub, si) => {
    if (!(sub.cantidad > 0)) agregar('error', si, null, sub.nombre, `El subensamble tiene cantidad ${sub.cantidad}.`)
    if (!sub.componentes.length) agregar('aviso', si, null, sub.nombre, 'El subensamble no tiene piezas.')

    sub.componentes.forEach((c, ci) => {
      const de = (gravedad: Hallazgo['gravedad'], mensaje: string) => agregar(gravedad, si, ci, c.descripcion, mensaje)

      if (!(c.cantidad > 0)) de('error', `Cantidad ${c.cantidad}: toda pieza lleva al menos 1.`)
      if (c.largo_mm === null) de('aviso', 'No tiene largo de corte.')
      else if (c.largo_mm <= 0) de('error', `Largo de ${c.largo_mm} mm.`)
      else if (mayor && c.largo_mm > mayor * 1.1) de('aviso', `Mide ${c.largo_mm} mm de largo y el mueble completo mide ${mayor} mm en su lado mayor.`)

      if (c.verificada === false && c.largo_mm !== null) de('aviso', 'Su largo o su ancho no aparece impreso en el plano: compruébalo.')

      const ancho = numero(c.ancho)
      if (ancho !== null && c.largo_mm !== null && c.largo_mm > 0 && ancho > c.largo_mm) {
        de('aviso', `El ancho (${ancho} mm) es mayor que el largo (${c.largo_mm} mm): ¿están invertidos?`)
      }

      // En los tubos el calibre es la pared y el espesor guardado es el tamaño del perfil: solo aplica a lámina
      const calibre = esTubo(c) ? null : calibreDe(c.material)
      const esperado = calibre !== null ? ESPESOR_CALIBRE[calibre] : undefined
      if (esperado && c.espesor_mm && Math.abs(c.espesor_mm - esperado) > TOLERANCIA_ESPESOR) {
        de('aviso', `El material es calibre ${calibre} (${esperado} mm) pero el espesor dice ${c.espesor_mm} mm.`)
      }

      if (esTubo(c) && c.area !== 'Corte de tubo') de('aviso', `Es tubo o perfil pero está asignado a "${c.area}" en lugar de "Corte de tubo".`)
      else if (c.area === 'Sin área') de('aviso', 'No tiene área de producción asignada.')
    })
  })

  return hallazgos
}

/** Revisión mínima de la forma del despiece antes de guardarlo */
export function esBOM(bom: unknown): bom is PlantillaBOM {
  if (!bom || typeof bom !== 'object') return false
  const { subensambles, herrajes } = bom as Record<string, unknown>
  return (
    Array.isArray(subensambles) &&
    Array.isArray(herrajes) &&
    subensambles.every(
      (s) =>
        s && typeof s === 'object' && typeof s.nombre === 'string' && typeof s.cantidad === 'number' &&
        Array.isArray(s.componentes) &&
        s.componentes.every(
          (c: unknown) =>
            !!c && typeof c === 'object' &&
            typeof (c as ComponenteCrudo).descripcion === 'string' &&
            typeof (c as ComponenteCrudo).material === 'string' &&
            typeof (c as ComponenteCrudo).cantidad === 'number' &&
            ((c as ComponenteCrudo).largo_mm === null || typeof (c as ComponenteCrudo).largo_mm === 'number') &&
            typeof (c as ComponenteCrudo).ancho === 'string'
        )
    )
  )
}
type ComponenteCrudo = { descripcion: unknown; material: unknown; cantidad: unknown; largo_mm: unknown; ancho: unknown }
