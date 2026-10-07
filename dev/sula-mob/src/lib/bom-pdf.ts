/**
 * bom-pdf.ts
 * ──────────
 * Lee el BOM directamente del PDF de un plano de SULA, sin IA.
 *
 * Usa la posición (x, y) de cada texto del PDF para reconstruir las tablas
 * de partes (NO. | DESCRIPCIÓN | MATERIAL | CANTIDAD | LARGO | ANCHO):
 *   - La tabla del ensamble general trae los subensambles (material "VARIOS"),
 *     piezas sueltas y herrajes.
 *   - Cada hoja "SUB-ENS <nombre>" trae la tabla de piezas de ese subensamble.
 *   - Las hojas de detalle de cada pieza dan su número de hoja y sus notas.
 * Es "best-effort": si el plano no sigue ese formato, devuelve lo que pudo
 * leer con advertencias, y el usuario puede usar el template de Excel.
 *
 * Solo se usa en el servidor (lo importa /api/analizar-plano).
 *
 * RUTA: src/lib/bom-pdf.ts
 */

import type { AreaProduccion, ComponenteBOM, PlantillaBOM, SubensambeBOM } from './types'

/* ═══════════════════════════════════════
   ÁREA POR MATERIAL (reglas fijas, sin IA)
   ═══════════════════════════════════════ */

export function asignarArea(material: string, notas: string, descripcion: string): AreaProduccion | 'Sin área' {
  const mat = material.toLowerCase()
  const not = notas.toLowerCase()
  const desc = descripcion.toLowerCase()
  if (/troquel/.test(not)) return 'Troquel'
  if (/punteo|puntear|soldadura de punto/.test(not)) return 'Punteado'
  if (/ptr|tubo|\bt[ -]?(cuad|rect|red)|solera|[aá]ngulo|barra|alambr/.test(mat)) return 'Corte de tubo'
  if (/l[aá]mina|laminia|crs|cal\.?\s*\d|c\.\s*\d|desplegad/.test(mat)) {
    if (/l[aá]ser|barreno|ranura/.test(not)) return 'Corte de Laser'
    if (/doblez|doblar/.test(not)) return 'Doblez'
    return 'Corte de Lamina'
  }
  if (/tornillo|tuerca|nivelador|remache|pija/.test(desc)) return 'Empaque'
  return 'Sin área'
}

/* ═══════════════════════════════════════
   TEXTO CON POSICIÓN
   ═══════════════════════════════════════ */

interface Item { s: string; x: number; y: number; w: number }

async function leerPaginas(buffer: Buffer): Promise<Item[][]> {
  const paginas: Item[][] = []
  // pdf-parse v1: pagerender recibe cada página de pdf.js y devuelve su texto;
  // aquí además se guardan las posiciones de cada fragmento
  const pagerender = async (page: { getTextContent: () => Promise<{ items: { str: string; transform: number[]; width: number }[] }> }) => {
    const tc = await page.getTextContent()
    paginas.push(
      tc.items
        .filter(i => i.str.trim())
        .map(i => ({ s: i.str.replace(/\s+/g, ' ').trim(), x: i.transform[4], y: i.transform[5], w: i.width }))
    )
    return ''
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  await pdfParse(buffer, { pagerender })
  return paginas
}

/** Texto de cada hoja del plano, tal como viene impreso (cotas, tablas y cajetín) */
export async function leerTextoPlano(buffer: Buffer): Promise<string[][]> {
  return (await leerPaginas(buffer)).map(items => items.map(i => i.s))
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim()

const numero = (s: string) => {
  const t = s.replace(/,/g, '').trim()
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

/* ═══════════════════════════════════════
   TABLAS DE PARTES
   ═══════════════════════════════════════ */

interface Fila { descripcion: string; material: string; cantidad: number | null; largo: number | null; ancho: string }
interface Tabla { pagina: number; subensamble: string | null; filas: Fila[] }

const COLUMNAS = [
  { campo: 'descripcion', re: /^DESCRIPCI/ },
  { campo: 'material', re: /^MATERIAL$/ },
  { campo: 'cantidad', re: /^CANTIDAD$/ },
  { campo: 'largo', re: /^LARGO$/ },
  { campo: 'ancho', re: /^ANCHO$/ },
] as const

function tablasDePagina(items: Item[], pagina: number): Tabla[] {
  const tablas: Tabla[] = []
  const titulo = items.map(i => i.s.match(/SUB-ENS\s+(.+?)\s*(\/\/|$)/i)?.[1]).find(Boolean) ?? null

  for (const no of items.filter(i => /^NO\.?$/i.test(i.s))) {
    // Encabezados en la misma línea que "NO."
    const mismaLinea = items.filter(i => Math.abs(i.y - no.y) <= 3 && i.x > no.x)
    const cols = COLUMNAS.map(c => {
      const h = mismaLinea.find(i => c.re.test(normalizar(i.s)))
      return h ? { campo: c.campo, centro: h.x + h.w / 2 } : null
    }).filter((c): c is { campo: (typeof COLUMNAS)[number]['campo']; centro: number } => c !== null)
    if (!cols.some(c => c.campo === 'descripcion') || !cols.some(c => c.campo === 'cantidad')) continue
    cols.sort((a, b) => a.centro - b.centro)

    const ultimo = cols[cols.length - 1].centro
    const penultimo = cols.length > 1 ? cols[cols.length - 2].centro : ultimo - 60
    const izquierda = no.x - 15
    const derecha = ultimo + (ultimo - penultimo)
    const enTabla = items.filter(i => i.y < no.y - 3 && i.y > no.y - 450 && i.x >= izquierda && i.x + i.w / 2 <= derecha)

    // Cada fila empieza con su número en la columna NO.; se corta al primer hueco grande
    const anclas: Item[] = []
    for (const a of enTabla.filter(i => /^\d{1,3}$/.test(i.s) && i.x <= no.x + no.w + 12).sort((p, q) => q.y - p.y)) {
      const anterior = anclas.length ? anclas[anclas.length - 1].y : no.y
      if (anterior - a.y > 32) break
      anclas.push(a)
    }
    if (anclas.length === 0) continue

    const celdas = new Map<Item, Item[]>(anclas.map(a => [a, []]))
    for (const it of enTabla) {
      if (anclas.includes(it)) continue
      let mejor: Item | null = null
      for (const a of anclas) if (Math.abs(a.y - it.y) <= 9 && (!mejor || Math.abs(a.y - it.y) < Math.abs(mejor.y - it.y))) mejor = a
      if (mejor) celdas.get(mejor)!.push(it)
    }

    // Columna de cada celda: la del encabezado cuyo centro queda más cerca
    const filas: Fila[] = anclas.map(a => {
      const porCampo: Record<string, Item[]> = {}
      for (const c of celdas.get(a)!) {
        const centro = c.x + c.w / 2
        const col = cols.reduce((m, k) => (Math.abs(k.centro - centro) < Math.abs(m.centro - centro) ? k : m))
        ;(porCampo[col.campo] ??= []).push(c)
      }
      const val = (campo: string) =>
        (porCampo[campo] ?? []).sort((p, q) => q.y - p.y || p.x - q.x).map(i => i.s).join(' ').trim()
      return {
        descripcion: val('descripcion'),
        material: val('material'),
        cantidad: numero(val('cantidad')),
        largo: numero(val('largo')),
        ancho: val('ancho'),
      }
    }).filter(f => f.descripcion)

    if (filas.length) tablas.push({ pagina, subensamble: titulo, filas })
  }
  return tablas
}

/* ═══════════════════════════════════════
   CLASIFICACIÓN
   ═══════════════════════════════════════ */

const COMERCIAL = /TORNILL|TUERCA|PIJA|REMACHE|NIVELADOR|CORREDERA|CERRADURA|CHAPA|BISAGRA|RODAJA|ARANDELA|GRAPA DE PLASTICO/

function esHerraje(f: Fila) {
  const t = normalizar(`${f.descripcion} ${f.material}`)
  if (/HERRAJE|SKU/.test(t)) return true
  return f.largo === null && !f.ancho && COMERCIAL.test(t)
}

function herrajeDeFila(f: Fila, multiplicador: number): PlantillaBOM['herrajes'][number] {
  const sku = (f.material.match(/SKU\s*[:\-]?\s*(.+)$/i)?.[1] ?? f.descripcion.match(/SKU\s*[:\-]?\s*(.+)$/i)?.[1] ?? '').trim()
  const descripcion = f.descripcion.replace(/\s*SKU\s*[:\-]?.*$/i, '').trim()
  return { descripcion: descripcion || f.descripcion, sku, cantidad: (f.cantidad ?? 1) * multiplicador }
}

/** Palabras en común entre el título "SUB-ENS CUERPO GAVETA" y "GAVETA ARCHIVADORA" */
function parecido(a: string, b: string) {
  const pa = new Set(normalizar(a).split(/[^A-Z0-9]+/).filter(w => w.length > 2))
  const pb = normalizar(b).split(/[^A-Z0-9]+/).filter(w => w.length > 2)
  if (normalizar(a) === normalizar(b)) return 100
  return pb.filter(w => pa.has(w)).length
}

/* ═══════════════════════════════════════
   PLANO COMPLETO
   ═══════════════════════════════════════ */

export async function leerPlanoPDF(buffer: Buffer, descripcionPedido = ''): Promise<{ bom: PlantillaBOM; advertencias: string[] }> {
  const paginas = await leerPaginas(buffer)
  const advertencias: string[] = []
  const tablas = paginas.flatMap((items, i) => tablasDePagina(items, i + 1))
  const paginasConTabla = new Set(tablas.map(t => t.pagina))

  // ── Datos generales ──
  const todo = paginas.flat()
  const modelo = todo.map(i => i.s.match(/\b\d-\d-\d{4}-\d{4}\b/)?.[0]).find(Boolean) ?? ''

  /** Textos debajo de una etiqueta del cajetín (ej. "CLIENTE:" → "VENTO") */
  const debajoDe = (etiqueta: RegExp) => {
    for (const items of paginas) {
      const e = items.find(i => etiqueta.test(normalizar(i.s)))
      if (!e) continue
      const valores = items
        .filter(i => i !== e && i.y < e.y && e.y - i.y < 40 && Math.abs(i.x + i.w / 2 - (e.x + 60)) < 110 && !/:$/.test(i.s))
        .sort((p, q) => q.y - p.y)
      const linea: string[] = []
      for (const v of valores) {
        if (linea.length && e.y - v.y > 34) break
        linea.push(v.s)
      }
      if (linea.length) return linea.join(' ').trim()
    }
    return ''
  }

  /** Título de las hojas: "<LÍNEA> - <DESCRIPCIÓN> FT" */
  const tituloProducto = todo.map(i => i.s.match(/^(.+?) - (.+?) FT$/)).find(Boolean)

  const materiales: PlantillaBOM['materiales'] = []
  for (const items of paginas) {
    for (const c of items.filter(i => /^LM\d+$/i.test(i.s))) {
      const d = items.filter(i => i !== c && Math.abs(i.y - c.y) <= 2 && i.x > c.x && i.x - c.x < 160).sort((p, q) => p.x - q.x)[0]
      if (d && !materiales.some(m => m.codigo === c.s.toUpperCase())) materiales.push({ codigo: c.s.toUpperCase(), descripcion: d.s })
    }
    if (materiales.length) break
  }

  const acabadoItem = paginas.map(items => {
    const i = items.findIndex(t => /^ACABADO:?$/.test(normalizar(t.s)))
    return i >= 0 ? items[i + 1]?.s : null
  }).find(Boolean)

  // ── Página y notas de cada pieza ──
  // Las hojas de detalle (sin tabla y sin "SUB-ENS") traen en el cajetín "VENTO - ARCH - <PIEZA> //"
  const hojasDetalle = paginas
    .map((items, i) => ({
      pagina: i + 1,
      items,
      pieza: items.map(t => t.s.match(/ - ([^-]+?)\s*\/\/\s*$/)?.[1]).find(Boolean) ?? '',
    }))
    .filter(h => !paginasConTabla.has(h.pagina) && !h.items.some(t => /SUB-ENS/i.test(t.s)))

  /** Parecido entre nombres de pieza; acepta abreviaturas ("ARCH" = "ARCHIVADORA") */
  const similitud = (a: string, b: string) => {
    const ta = normalizar(a).split(/[^A-Z0-9]+/).filter(Boolean)
    const tb = normalizar(b).split(/[^A-Z0-9]+/).filter(Boolean)
    if (!ta.length || !tb.length) return 0
    // Misma palabra, abreviatura ("ARCH" de "ARCHIVADORA") o mismo inicio largo ("ARCHIVERO" / "ARCHIVADORA")
    const prefijo = (x: string, y: string) => { let k = 0; while (k < x.length && x[k] === y[k]) k++; return k }
    const igual = (x: string, y: string) =>
      x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x))) || prefijo(x, y) >= 5
    const iguales = ta.filter(x => tb.some(y => igual(x, y))).length
    // La primera palabra suele ser el tipo de pieza (FRENTE, COSTADO, CUERPO): pesa más
    return iguales / Math.max(ta.length, tb.length) + (igual(ta[0], tb[0]) ? 0.25 : 0)
  }

  const notasDe = (items: Item[]) => {
    const notas: string[] = []
    const nota = items.find(t => /^NOTAS?:?$/.test(normalizar(t.s)))
    if (nota) {
      let ultimaY = nota.y
      for (const t of items.filter(t => Math.abs(t.x - nota.x) < 40 && t.y < nota.y && nota.y - t.y <= 60).sort((p, q) => q.y - p.y)) {
        if (ultimaY - t.y > 14) break
        notas.push(t.s)
        ultimaY = t.y
      }
    }
    for (const t of items) {
      if (t.y > 100 && /BARRENO|LASER|TROQUEL|DOBLE|PUNTE|SOLDA|AVELLAN|CIZALLA|RANURA|CORTE A/.test(normalizar(t.s)) && !notas.includes(t.s)) notas.push(t.s)
    }
    return notas.join(' ').replace(/\s+/g, ' ').trim().slice(0, 160)
  }

  const detalleDe = (descripcion: string) => {
    const buscada = normalizar(descripcion)
    let mejor: { pagina: number; items: Item[]; puntos: number } | null = null
    for (const h of hojasDetalle) {
      const puntos = h.items.some(t => normalizar(t.s) === buscada) ? 2 : similitud(descripcion, h.pieza)
      if (puntos >= 0.6 && (!mejor || puntos > mejor.puntos)) mejor = { pagina: h.pagina, items: h.items, puntos }
    }
    return mejor ? { pagina: mejor.pagina, notas: notasDe(mejor.items) } : { pagina: null, notas: '' }
  }

  const aComponente = (f: Fila): ComponenteBOM => {
    const det = detalleDe(f.descripcion)
    return {
      descripcion: f.descripcion,
      material: f.material,
      cantidad: f.cantidad ?? 1,
      largo_mm: f.largo,
      ancho: f.ancho,
      notas: det.notas,
      pagina: det.pagina,
      area: asignarArea(f.material, det.notas, f.descripcion),
    }
  }

  // ── Armar subensambles ──
  const subensambles: SubensambeBOM[] = []
  const herrajes: PlantillaBOM['herrajes'] = []
  const sumarHerraje = (h: PlantillaBOM['herrajes'][number]) => {
    const igual = herrajes.find(x => normalizar(x.descripcion) === normalizar(h.descripcion) && x.sku === h.sku)
    if (igual) igual.cantidad += h.cantidad
    else herrajes.push(h)
  }

  const general = tablas.find(t => t.filas.some(f => /^VARIOS$/i.test(f.material.trim())))

  if (general) {
    // La tabla general define los subensambles y su cantidad por unidad
    const subsGenerales = general.filas.filter(f => /^VARIOS$/i.test(f.material.trim()))
    const tablasSub = tablas.filter(t => t !== general && t.subensamble)

    for (const s of subsGenerales) {
      const candidatos = tablasSub
        .map(t => ({ t, puntos: parecido(t.subensamble!, s.descripcion) }))
        .filter(c => c.puntos > 0)
        .sort((a, b) => b.puntos - a.puntos)
      const tabla = candidatos[0]?.t
      const cantidad = s.cantidad ?? 1
      if (!tabla) {
        advertencias.push(`No se encontró la hoja con la tabla del subensamble "${s.descripcion}".`)
        continue
      }
      tablasSub.splice(tablasSub.indexOf(tabla), 1)
      subensambles.push({
        nombre: s.descripcion,
        cantidad,
        pagina: tabla.pagina,
        componentes: tabla.filas.filter(f => !esHerraje(f)).map(aComponente),
      })
      // Herrajes dentro del subensamble: se pasan a cantidad por producto
      tabla.filas.filter(esHerraje).forEach(f => sumarHerraje(herrajeDeFila(f, cantidad)))
    }

    for (const t of tablasSub) advertencias.push(`La tabla de la hoja ${t.pagina} ("${t.subensamble}") no corresponde a ningún subensamble de la lista general.`)

    // Piezas sueltas del ensamble general
    const sueltas = general.filas.filter(f => !/^VARIOS$/i.test(f.material.trim()) && !esHerraje(f))
    if (sueltas.length) subensambles.push({ nombre: 'ENSAMBLE GENERAL', cantidad: 1, pagina: general.pagina, componentes: sueltas.map(aComponente) })
    general.filas.filter(esHerraje).forEach(f => sumarHerraje(herrajeDeFila(f, 1)))
  } else if (tablas.length) {
    // Sin lista de subensambles: se toma la tabla más grande como lista total del producto
    const mayor = tablas.reduce((m, t) => (t.filas.length > m.filas.length ? t : m))
    advertencias.push('El plano no trae lista de subensambles (material "VARIOS"); todas las piezas quedaron en GENERAL con la cantidad total del producto.')
    subensambles.push({ nombre: 'GENERAL', cantidad: 1, pagina: mayor.pagina, componentes: mayor.filas.filter(f => !esHerraje(f)).map(aComponente) })
    mayor.filas.filter(esHerraje).forEach(f => sumarHerraje(herrajeDeFila(f, 1)))
  } else {
    advertencias.push('No se encontró ninguna tabla de partes (NO. | DESCRIPCIÓN | MATERIAL | CANTIDAD) en el PDF.')
  }

  const sinMedidas = subensambles.flatMap(s => s.componentes).filter(c => c.largo_mm === null).length
  if (sinMedidas) advertencias.push(`${sinMedidas} pieza(s) sin largo en la tabla del plano; revisa la matriz.`)
  const sinArea = subensambles.flatMap(s => s.componentes).filter(c => c.area === 'Sin área').length
  if (sinArea) advertencias.push(`${sinArea} pieza(s) quedaron "Sin área" porque su material no se reconoció.`)

  const bom: PlantillaBOM = {
    modelo,
    descripcion: tituloProducto?.[2].trim() || descripcionPedido,
    linea: debajoDe(/^CLIENTE:?$/) || tituloProducto?.[1].trim() || '',
    materiales,
    acabado: acabadoItem ?? '',
    dimensiones: '',
    subensambles: subensambles.filter(s => s.componentes.length > 0),
    herrajes,
  }
  return { bom, advertencias }
}
