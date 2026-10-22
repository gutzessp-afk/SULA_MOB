/**
 * comparar-bom.ts
 * ───────────────
 * Qué cambió entre dos versiones del BOM de un mismo plano: piezas agregadas,
 * eliminadas y modificadas (campo por campo), por subensamble.
 *
 * Los subensambles y las piezas se emparejan por nombre (sin acentos, mayúsculas
 * ni signos). Si un subensamble repite un nombre de pieza, se emparejan en orden.
 * Los herrajes se comparan como un subensamble más: "HERRAJE DE ARMADO".
 *
 * RUTA: src/lib/comparar-bom.ts
 */

import { tipoMaterialDe } from './ensamble-3d'
import { areaDePieza } from './matriz-corte'
import type { ComponenteBOM, Diferencia, PlantillaBOM } from './types'

/** Nombre sin acentos, mayúsculas ni signos: así se emparejan piezas y subensambles */
export const normalizarNombre = (t: string | null | undefined) =>
  (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

const norm = normalizarNombre
const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

/** Campos que importan para cortar, con el nombre con que se muestran */
const CAMPOS: { campo: string; valor: (c: ComponenteBOM) => string }[] = [
  { campo: 'cantidad', valor: c => texto(c.cantidad) },
  { campo: 'largo_mm', valor: c => texto(c.largo_mm) },
  { campo: 'ancho', valor: c => texto(c.ancho) },
  { campo: 'material', valor: c => texto(c.material) },
  { campo: 'area', valor: c => areaDePieza(tipoMaterialDe(c), c.area) },
  { campo: 'notas', valor: c => texto(c.notas) },
]

/** Agrupa por nombre normalizado; "POSTE A" repetido queda como POSTE A#0, POSTE A#1 */
function porNombre<T>(lista: T[], nombre: (x: T) => string): Map<string, T> {
  const vistos = new Map<string, number>()
  const mapa = new Map<string, T>()
  for (const x of lista) {
    const base = norm(nombre(x))
    const n = vistos.get(base) ?? 0
    vistos.set(base, n + 1)
    mapa.set(`${base}#${n}`, x)
  }
  return mapa
}

export function compararBOMs(anterior: PlantillaBOM, nuevo: PlantillaBOM): Diferencia[] {
  const diferencias: Diferencia[] = []
  const subsAntes = porNombre(anterior.subensambles ?? [], s => s.nombre)
  const subsAhora = porNombre(nuevo.subensambles ?? [], s => s.nombre)

  for (const [k, sub] of subsAhora) {
    const previo = subsAntes.get(k)
    if (!previo) {
      for (const c of sub.componentes ?? []) diferencias.push({ tipo: 'agregado', subensamble: sub.nombre, componente: c.descripcion })
      continue
    }
    if ((previo.cantidad || 0) !== (sub.cantidad || 0)) {
      diferencias.push({ tipo: 'modificado', subensamble: sub.nombre, componente: '', campo: 'cantidad del subensamble', valor_anterior: texto(previo.cantidad), valor_nuevo: texto(sub.cantidad) })
    }
    const piezasAntes = porNombre(previo.componentes ?? [], c => c.descripcion)
    const piezasAhora = porNombre(sub.componentes ?? [], c => c.descripcion)
    for (const [kc, c] of piezasAhora) {
      const antes = piezasAntes.get(kc)
      if (!antes) {
        diferencias.push({ tipo: 'agregado', subensamble: sub.nombre, componente: c.descripcion })
        continue
      }
      for (const { campo, valor } of CAMPOS) {
        const a = valor(antes), b = valor(c)
        if (norm(a) !== norm(b)) diferencias.push({ tipo: 'modificado', subensamble: sub.nombre, componente: c.descripcion, campo, valor_anterior: a, valor_nuevo: b })
      }
    }
    for (const [kc, c] of piezasAntes) {
      if (!piezasAhora.has(kc)) diferencias.push({ tipo: 'eliminado', subensamble: sub.nombre, componente: c.descripcion })
    }
  }
  for (const [k, sub] of subsAntes) {
    if (subsAhora.has(k)) continue
    for (const c of sub.componentes ?? []) diferencias.push({ tipo: 'eliminado', subensamble: sub.nombre, componente: c.descripcion })
  }

  // Herraje de armado
  const HERRAJE = 'HERRAJE DE ARMADO'
  const herrAntes = porNombre(anterior.herrajes ?? [], h => h.descripcion)
  const herrAhora = porNombre(nuevo.herrajes ?? [], h => h.descripcion)
  for (const [k, h] of herrAhora) {
    const antes = herrAntes.get(k)
    if (!antes) diferencias.push({ tipo: 'agregado', subensamble: HERRAJE, componente: h.descripcion })
    else if ((antes.cantidad || 0) !== (h.cantidad || 0)) diferencias.push({ tipo: 'modificado', subensamble: HERRAJE, componente: h.descripcion, campo: 'cantidad', valor_anterior: texto(antes.cantidad), valor_nuevo: texto(h.cantidad) })
  }
  for (const [k, h] of herrAntes) {
    if (!herrAhora.has(k)) diferencias.push({ tipo: 'eliminado', subensamble: HERRAJE, componente: h.descripcion })
  }

  return diferencias
}
