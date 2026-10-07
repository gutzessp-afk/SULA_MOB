/**
 * matriz-corte.ts
 * ───────────────
 * Arma la MATRIZ DE CORTE de UN plano (un producto) a partir de su BOM:
 * la lista de piezas por subensamble, con la cantidad total a fabricar, y
 * el mismo contenido agrupado por área de producción.
 *
 * Aquí solo se calculan los datos. El archivo lo escriben:
 *   - Excel: src/app/api/matriz-corte-plano/route.ts
 *   - PDF:   src/lib/matriz-corte-pdf.ts
 * Así los dos formatos siempre dicen lo mismo.
 *
 *   CANT. TOTAL = piezas por subensamble × subensambles por producto × productos a fabricar
 *
 * No usa IA: el BOM ya está guardado como plantilla.
 *
 * RUTA: src/lib/matriz-corte.ts
 */

import { tipoMaterialDe } from './ensamble-3d'
import { AREAS_PRODUCCION, type ComponenteBOM, type PlantillaBOM, type TipoMaterial } from './types'

export interface DatosMatriz {
  clave: string
  descripcion: string
  cantidad: number        // productos a fabricar
  cliente: string
  proyecto: string        // ej. "PED-3401"
  fecha: string           // fecha de emisión, ya con formato
}

export interface FilaMatriz {
  n: number
  descripcion: string
  material: string
  cantidad: number        // por subensamble
  largo: number | null
  ancho: string
  notas: string
  pagina: number | null
  area: string
  total: number
  subensamble: string
  revisar: boolean        // su medida no aparece impresa en el plano
}

export interface SeccionMatriz {
  nombre: string
  pagina: number | null
  cantidad: number        // subensambles por producto
  filas: FilaMatriz[]
}

export interface Matriz {
  modelo: string
  descripcion: string
  revision: string
  dibujo: string
  cliente: string
  proyecto: string
  acabado: string
  dimensiones: string
  fecha: string
  total: number
  secciones: SeccionMatriz[]
  porArea: { area: string; filas: FilaMatriz[]; piezas: number }[]
  resumen: { subensambles: number; componentes: number; piezas: number }
  /** Aviso para imprimir cuando el plano tiene problemas ('' si está bien) */
  avisoPlano: string
}

/** Colores de cada área (hex sin #): encabezado oscuro y fondo claro de sus filas */
export const COLOR_AREA: Record<string, { fuerte: string; claro: string }> = {
  'Corte de tubo': { fuerte: '1E40AF', claro: 'DBEAFE' },
  'Corte de Laser': { fuerte: '991B1B', claro: 'FEE2E2' },
  'Corte de Lamina': { fuerte: '9A3412', claro: 'FFEDD5' },
  'Doblez': { fuerte: '065F46', claro: 'D1FAE5' },
  'Troquel': { fuerte: '6B21A8', claro: 'F3E8FF' },
  'Punteado': { fuerte: '854D0E', claro: 'FEF9C3' },
  'Soldadura Y Pulido': { fuerte: '9F1239', claro: 'FFE4E6' },
  'Pintura': { fuerte: '3730A3', claro: 'E0E7FF' },
  'Empaque': { fuerte: '4338CA', claro: 'E0E7FF' },
  'Vidrio': { fuerte: '0369A1', claro: 'E0F2FE' },
  'Melamina': { fuerte: '44403C', claro: 'F5F5F4' },
  'Aluminio': { fuerte: '57534E', claro: 'FAFAF9' },
  'Hule': { fuerte: '1F2937', claro: 'E5E7EB' },
  'Herraje': { fuerte: '64748B', claro: 'F1F5F9' },
}
export const colorArea = (area: string) => COLOR_AREA[area] ?? { fuerte: '475569', claro: 'F1F5F9' }

const ORDEN_AREAS = [...AREAS_PRODUCCION, 'Vidrio', 'Melamina', 'Aluminio', 'Hule', 'Herraje'] as string[]

/**
 * Área que se imprime en la matriz. Lo que no es acero no pasa por las áreas
 * de corte de la planta, así que se agrupa por su material (vidrio, melamina,
 * aluminio, hule) para que quede claro quién lo surte.
 */
export function areaDePieza(tipo: TipoMaterial, area: string): string {
  if (tipo === 'vidrio') return 'Vidrio'
  if (tipo === 'melamina' || tipo === 'madera') return 'Melamina'
  if (tipo === 'aluminio') return 'Aluminio'
  if (tipo === 'hule') return 'Hule'
  return area || 'Sin área'
}
const areaDe = (c: ComponenteBOM) => areaDePieza(tipoMaterialDe(c), c.area)

export function construirMatriz(bom: PlantillaBOM, datos: DatosMatriz): Matriz {
  const total = Math.max(1, Math.round(datos.cantidad || 1))
  let n = 0
  const secciones: SeccionMatriz[] = []

  // Filas que en realidad son un subensamble completo ("MODULO A", material "VARIOS"): no se cortan
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
  const nombres = new Set((bom.subensambles ?? []).map(s => norm(s.nombre)))
  const esPieza = (c: ComponenteBOM) => norm(c.material) !== 'VARIOS' && !(c.largo_mm === null && nombres.has(norm(c.descripcion)))

  for (const sub of bom.subensambles ?? []) {
    const componentes = (sub.componentes ?? []).filter(esPieza)
    // Un subensamble sin piezas propias solo agrupa a otros: no se corta
    if (!componentes.length) continue
    const nombre = sub.dentro_de ? `${sub.dentro_de} — ${sub.nombre}` : sub.nombre
    const cantidad = Math.max(1, sub.cantidad || 1)
    secciones.push({
      nombre,
      pagina: sub.pagina,
      cantidad,
      filas: componentes.map(c => ({
        n: ++n,
        descripcion: c.descripcion,
        material: c.material,
        cantidad: c.cantidad || 0,
        largo: c.largo_mm,
        ancho: c.ancho || '',
        notas: c.notas || '',
        pagina: c.pagina,
        area: areaDe(c),
        total: (c.cantidad || 0) * cantidad * total,
        subensamble: nombre,
        revisar: c.verificada === false,
      })),
    })
  }

  if (bom.herrajes?.length) {
    secciones.push({
      nombre: 'HERRAJE DE ARMADO',
      pagina: null,
      cantidad: 1,
      filas: bom.herrajes.map(h => ({
        n: ++n,
        descripcion: h.descripcion,
        material: h.sku || '',
        cantidad: h.cantidad || 0,
        largo: null,
        ancho: '',
        notas: '',
        pagina: null,
        area: 'Herraje',
        total: (h.cantidad || 0) * total,
        subensamble: 'HERRAJE DE ARMADO',
        revisar: false,
      })),
    })
  }

  const filas = secciones.flatMap(s => s.filas)
  const areas = [...new Set(filas.map(f => f.area))].sort((a, b) => {
    const ia = ORDEN_AREAS.indexOf(a), ib = ORDEN_AREAS.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const fabricadas = filas.filter(f => f.area !== 'Herraje')

  const acabado = bom.acabados?.length
    ? bom.acabados.map(a => [a.codigo, a.descripcion].filter(Boolean).join(' - ')).join(' · ')
    : bom.acabado || ''
  const dimensiones = bom.ancho_mm && bom.alto_mm && bom.profundidad_mm
    ? `${bom.ancho_mm} × ${bom.alto_mm} × ${bom.profundidad_mm} mm`
    : bom.dimensiones || ''

  return {
    modelo: bom.modelo || datos.clave,
    descripcion: bom.descripcion || datos.descripcion,
    revision: bom.revision || '',
    dibujo: bom.dibujante || '',
    cliente: datos.cliente || bom.linea || '',
    proyecto: datos.proyecto,
    acabado,
    dimensiones,
    fecha: datos.fecha,
    total,
    secciones,
    porArea: areas.map(area => {
      const suyas = filas.filter(f => f.area === area)
      return { area, filas: suyas, piezas: suyas.reduce((s, f) => s + f.total, 0) }
    }),
    avisoPlano: bom.calidad?.nivel === 'deficiente'
      ? `PLANO DEFICIENTE: ${bom.calidad.problemas.length} problema(s) detectados. Confirmar con ingeniería antes de cortar.`
      : bom.calidad?.nivel === 'con_observaciones'
      ? `Plano con ${bom.calidad.problemas.length} observación(es): revisarlas en el sistema antes de cortar.`
      : '',
    resumen: {
      subensambles: secciones.filter(s => s.nombre !== 'HERRAJE DE ARMADO').length,
      componentes: fabricadas.length,
      piezas: fabricadas.reduce((s, f) => s + f.total, 0),
    },
  }
}

/** Notas que se imprimen: avisa cuando la medida no se pudo comprobar contra el plano */
export const notasDe = (f: FilaMatriz) => (f.revisar ? ['REVISAR MEDIDA EN PLANO', f.notas].filter(Boolean).join(' · ') : f.notas)

/** Nombre del archivo sin extensión: MATRIZ_DE_CORTE_2-1-0072-0003_VITRINA_PARA_REFACCIONES */
export function nombreArchivoMatriz(m: Matriz): string {
  const limpio = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '')
  return `MATRIZ_DE_CORTE_${limpio(m.modelo)}_${limpio(m.descripcion).slice(0, 40)}`
}
