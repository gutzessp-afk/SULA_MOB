/**
 * explosion-excel.ts
 * ──────────────────
 * Lee y escribe el Excel de "EXPLOSION DE MATERIALES" con el formato de SULA (GRUPO AVANT CIM).
 * Solo servidor (usa exceljs): lo importan las rutas de /api/bom/revisiones.
 *
 *   leerExcelExplosion(buffer)  → encabezado + líneas de la hoja "EXPLOSION DE MATERIALES"
 *   crearExcelExplosion(datos)  → .xlsx con el mismo formato + columnas OC y Compra, colores de
 *                                 revisión, hoja REPORTE (tiempos, estatus, revisiones) y las hojas
 *                                 REGISTRO y FORMATO DE CONTROL en blanco, como el original.
 *
 * Formato original (las dos muestras: P-0002 REV-00 y P-3492 REV-01):
 *   A1 REV-xx · B1:G1 GRUPO AVANT CIM · A2 FECHA: · A3 fecha · B3:G3 REPORTE DE EXPLOSIÓN …
 *   A5 CLIENTE: B5 cliente · G5 PEDIDO: H5 pedido · B6 proyecto · G6 ORDEN PRODUCCIÓN: H6 OP
 *   Fila 8 encabezados: Clave | Descripción | Unidad | Clasificación | Moneda | Costo |
 *                       Cantidad Necesaria | Costo Estimado
 *   Secciones por unidad ("Kilo", "Pieza") con "Totales Kilo:" al final de cada una.
 *   "Usuario: …" al final. Las columnas J en adelante (calendario) NO se importan.
 *
 * RUTA: src/lib/explosion-excel.ts
 */

import ExcelJS from 'exceljs'
import {
  agruparPorUnidad, colorClasificacion, colorMarca, etiquetaRev, LEYENDA, normalizar,
  type EncabezadoRev, type LineaRev, type Marca, type Revision,
} from './explosion-revisiones'

/* ═══════════════════════ LEER ═══════════════════════ */

export interface LineaImportada {
  clave: string
  descripcion: string
  unidad: string
  clasificacion: string
  moneda: string
  costo: number
  cantidad: number
}

export interface ExplosionImportada {
  /** Número de revisión que trae el archivo en A1 ("REV-01" → 1); null si no trae */
  numero: number | null
  encabezado: Partial<EncabezadoRev>
  lineas: LineaImportada[]
  avisos: string[]
}

const MAX_LINEAS = 2000

/** Valor "plano" de una celda: resultado de fórmulas, texto de rich text, fechas tal cual */
function valorDe(v: ExcelJS.CellValue): string | number | Date | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map(t => t.text).join('')
    if ('result' in v) {
      const r = (v as { result?: unknown }).result
      if (typeof r === 'string' || typeof r === 'number' || r instanceof Date) return r
      return null
    }
    if ('text' in v && typeof (v as { text?: unknown }).text === 'string') return (v as { text: string }).text
  }
  return null
}

function texto(v: ExcelJS.CellValue): string {
  const x = valorDe(v)
  if (x === null) return ''
  if (x instanceof Date) return x.toISOString().slice(0, 10)
  return String(x).replace(/\s+/g, ' ').trim()
}

/** Número de una celda; acepta "1,234.50" y "$ 12.00"; null si no es número */
function numero(v: ExcelJS.CellValue): number | null {
  const x = valorDe(v)
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  if (typeof x === 'string') {
    const limpio = x.replace(/[$,\s]/g, '')
    if (!limpio) return null
    const n = Number(limpio)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** ¿El valor tiene fórmula sin resultado guardado? (pasa con archivos generados por programas) */
const formulaSinResultado = (v: ExcelJS.CellValue) =>
  !!v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v) && (v as { result?: unknown }).result === undefined

/** Lee el Excel de explosión. Lanza Error con mensaje claro si el archivo no tiene el formato. */
export async function leerExcelExplosion(buffer: ArrayBuffer): Promise<ExplosionImportada> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch {
    throw new Error('No se pudo abrir el archivo. Debe ser un Excel .xlsx.')
  }

  const hoja = wb.worksheets.find(w => normalizar(w.name).includes('explosion')) ?? wb.worksheets[0]
  if (!hoja) throw new Error('El archivo no tiene hojas.')

  const avisos: string[] = []
  // En celdas combinadas exceljs repite el valor en todas; aquí solo cuenta la celda principal
  const celda = (fila: number, col: number): ExcelJS.CellValue => {
    const c = hoja.getRow(fila).getCell(col)
    return c.isMerged && c.master.address !== c.address ? null : c.value
  }

  /* ── 1. Fila de encabezados (la que dice "Clave" y "Descripción") ── */
  let filaEnc = 0
  for (let f = 1; f <= Math.min(hoja.rowCount, 60) && !filaEnc; f++) {
    for (let c = 1; c <= 6; c++) {
      if (normalizar(texto(celda(f, c))) === 'clave' && normalizar(texto(celda(f, c + 1))).startsWith('descrip')) {
        filaEnc = f
        break
      }
    }
  }
  if (!filaEnc) throw new Error('No encontré la fila de encabezados ("Clave", "Descripción"…). ¿Es un Excel de explosión de materiales?')

  // Columna de cada campo según el texto del encabezado (por si mueven columnas)
  const columnas: Partial<Record<keyof LineaImportada, number>> = {}
  // Columna OC: las filas que el sistema exportó como "QUITADO" no se vuelven a importar
  let colOc = 0
  hoja.getRow(filaEnc).eachCell({ includeEmpty: false }, (cell, col) => {
    const t = normalizar(texto(cell.value))
    if (t === 'oc') colOc ||= col
    else if (t === 'clave') columnas.clave ??= col
    else if (t.startsWith('descrip')) columnas.descripcion ??= col
    else if (t === 'unidad') columnas.unidad ??= col
    else if (t.startsWith('clasif')) columnas.clasificacion ??= col
    else if (t === 'moneda') columnas.moneda ??= col
    else if (t === 'costo' || t === 'costo unitario') columnas.costo ??= col
    else if (t.startsWith('cantidad')) columnas.cantidad ??= col
  })
  if (!columnas.clave || !columnas.descripcion || !columnas.cantidad)
    throw new Error('Faltan columnas obligatorias: Clave, Descripción y Cantidad Necesaria.')

  /* ── 2. Encabezado del formato (arriba de la fila de encabezados) ── */
  const encabezado: Partial<EncabezadoRev> = {}
  let numeroRev: number | null = null

  /** Primer valor no vacío a la derecha de (fila, col) */
  const siguiente = (fila: number, col: number): ExcelJS.CellValue => {
    for (let c = col + 1; c <= col + 8; c++) {
      const v = celda(fila, c)
      if (texto(v)) return v
    }
    return null
  }

  for (let f = 1; f < filaEnc; f++) {
    for (let c = 1; c <= 12; c++) {
      const t = normalizar(texto(celda(f, c)))
      if (!t) continue
      const rev = /^rev\s*-?\s*(\d{1,3})$/.exec(t)
      if (rev && numeroRev === null) numeroRev = Number(rev[1])
      else if (t === 'cliente:' || t === 'cliente') {
        const v = siguiente(f, c)
        encabezado.cliente = texto(v)
        // El renglón de abajo, en la misma columna que el cliente, es el proyecto
        for (let cc = c + 1; cc <= c + 8; cc++) {
          if (texto(celda(f, cc))) { encabezado.proyecto = texto(celda(f + 1, cc)); break }
        }
      } else if (t === 'pedido:' || t === 'pedido') {
        const v = valorDe(siguiente(f, c))
        // Se conserva tal cual ("0002" se queda "0002")
        encabezado.pedido = v === null ? '' : typeof v === 'number' ? String(v) : texto(v)
      } else if (t.startsWith('orden produccion') || t.startsWith('orden de produccion')) {
        const v = valorDe(siguiente(f, c))
        encabezado.orden_produccion = v === null ? '' : typeof v === 'number' ? String(v) : texto(v)
      } else if (t === 'fecha:' || t === 'fecha') {
        // La fecha va abajo (A3) o a la derecha
        const abajo = valorDe(celda(f + 1, c))
        const lado = valorDe(siguiente(f, c))
        const fecha = abajo instanceof Date ? abajo : lado instanceof Date ? lado : null
        if (fecha) encabezado.fecha = fecha.toISOString().slice(0, 10)
      }
    }
  }

  /* ── 3. Líneas de material ── */
  const lineas: LineaImportada[] = []
  let unidadSeccion = ''
  let sinResultado = 0
  const colMax = Math.max(...Object.values(columnas).map(Number))

  for (let f = filaEnc + 1; f <= hoja.rowCount; f++) {
    const primera = texto(celda(f, columnas.clave))
    const t = normalizar(primera)

    if (t.startsWith('usuario:')) {
      encabezado.usuario = primera.replace(/^usuario:\s*/i, '').trim()
      break
    }
    if (t.startsWith('totales')) continue

    const clave = primera
    const descripcion = texto(celda(f, columnas.descripcion))
    const vCantidad = celda(f, columnas.cantidad)
    const cantidad = numero(vCantidad)
    const costo = columnas.costo ? numero(celda(f, columnas.costo)) : null

    // Fila de sección: solo trae texto en la primera columna ("Kilo", "Pieza")
    let otrasVacias = true
    for (let c = 1; c <= colMax; c++) {
      if (c !== columnas.clave && texto(celda(f, c))) { otrasVacias = false; break }
    }
    if (clave && otrasVacias) { unidadSeccion = clave; continue }

    if (!clave && !descripcion) continue
    if (colOc && normalizar(texto(celda(f, colOc))) === 'quitado') continue

    if (formulaSinResultado(vCantidad)) sinResultado++
    if (lineas.length >= MAX_LINEAS) { avisos.push(`Solo se importaron las primeras ${MAX_LINEAS} líneas.`); break }

    lineas.push({
      clave,
      descripcion,
      unidad: (columnas.unidad && texto(celda(f, columnas.unidad))) || unidadSeccion || 'Pieza',
      clasificacion: columnas.clasificacion ? texto(celda(f, columnas.clasificacion)) : '',
      moneda: (columnas.moneda && texto(celda(f, columnas.moneda))) || 'Peso Mexicano',
      costo: costo ?? 0,
      cantidad: cantidad ?? 0,
    })
  }

  if (!lineas.length) throw new Error('El archivo no tiene materiales debajo de los encabezados.')
  if (sinResultado) avisos.push(`${sinResultado} cantidad(es) eran fórmulas sin valor guardado y quedaron en 0: revísalas.`)

  return { numero: numeroRev, encabezado, lineas, avisos }
}

/* ═══════════════════════ ESCRIBIR ═══════════════════════ */

export interface DatosReporte {
  estado: string
  fecha_inicio: string | null
  fecha_termino: string | null
  tiempo_trabajado: string
  tiempo_legible: string
  dias: string
  pausas: number
  motivos: { texto: string; detalle: string; resuelto: boolean; reportado_en: string; reportado_por: string; resuelto_en: string | null; resuelto_por: string | null }[]
  notas: string
}

export interface DatosExcel {
  revision: Revision
  /** Todas las revisiones de la explosión (para el historial) */
  revisiones: Revision[]
  marcas: Record<string, Marca>
  eliminadas: LineaRev[]
  reporte: DatosReporte
  /** "PED-3518 · Chedraui Supercito" para títulos */
  referencia: string
  /** Órdenes de compra (PDF) subidas a la hoja */
  ordenes?: { folio: string; referencia: string; proveedor: string; fecha: string; archivo_nombre: string | null; partidas: { encontrada?: boolean }[] }[]
}

const ARGB = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`
const relleno = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(hex) } })
const DELGADO: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFBFBFBF' } }
const BORDES: Partial<ExcelJS.Borders> = { top: DELGADO, left: DELGADO, bottom: DELGADO, right: DELGADO }
const NUM = '#,##0.00'
const ZONA = 'America/Mexico_City'

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso))
}

/** "2026-11-13" → Date a mediodía UTC (para que Excel no la recorra un día por zona horaria) */
function fechaExcel(ymd: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : ymd || ''
}

/* ── Hoja 1: EXPLOSION DE MATERIALES ── */
function hojaExplosion(wb: ExcelJS.Workbook, d: DatosExcel) {
  const ws = wb.addWorksheet('EXPLOSION DE MATERIALES', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', ySplit: 8 }],
  })
  ws.columns = [
    { width: 28.3 }, { width: 54 }, { width: 16.4 }, { width: 16.4 }, { width: 15 },
    { width: 16.6 }, { width: 22 }, { width: 17 }, { width: 14 }, { width: 10 },
  ]
  const enc = d.revision.encabezado
  const arial = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 11, ...extra })

  // Fila 1: REV + razón social
  ws.getCell('A1').value = etiquetaRev(d.revision.numero)
  ws.getCell('A1').font = { name: 'Arial Black', size: 18, bold: true }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.mergeCells('B1:G1')
  ws.getCell('B1').value = 'GRUPO AVANT CIM, S.A. DE C.V.'
  ws.getCell('B1').font = { name: 'Calibri', size: 20, bold: true }
  ws.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 27

  // Filas 2-3: fecha, título, página
  ws.getCell('A2').value = 'FECHA:'
  ws.getCell('A2').font = arial({ bold: true })
  ws.getCell('H2').value = 'PAGINA:'
  ws.getCell('H2').font = arial({ bold: true })
  ws.getCell('A3').value = fechaExcel(enc.fecha)
  ws.getCell('A3').numFmt = 'dd/mm/yyyy'
  ws.getCell('A3').font = arial({ bold: true })
  ws.getCell('A3').alignment = { horizontal: 'center' }
  ws.mergeCells('B3:G3')
  ws.getCell('B3').value = 'REPORTE DE EXPLOSIÓN DE MATERIALES'
  ws.getCell('B3').font = { name: 'Calibri', size: 20, bold: true }
  ws.getCell('B3').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('H3').value = '1/1'
  ws.getCell('H3').font = arial({ bold: true })
  ws.getCell('H3').alignment = { horizontal: 'center' }
  ws.getRow(3).height = 26.25
  ws.mergeCells('A4:H4')

  // Filas 5-7: cliente, pedido, proyecto, orden de producción
  ws.getCell('A5').value = 'CLIENTE:'
  ws.getCell('A5').font = arial({ bold: true })
  ws.mergeCells('B5:F5')
  ws.getCell('B5').value = enc.cliente || ''
  ws.getCell('B5').font = arial({ bold: true, size: 16 })
  ws.getCell('G5').value = 'PEDIDO:'
  ws.getCell('G5').font = arial({ bold: true })
  ws.getCell('G5').alignment = { horizontal: 'right' }
  ws.getCell('H5').value = enc.pedido || ''
  ws.getCell('H5').font = arial({ bold: true, size: 16 })
  ws.getCell('H5').alignment = { horizontal: 'center' }
  ws.getRow(5).height = 18.75
  ws.mergeCells('B6:F6')
  ws.getCell('B6').value = enc.proyecto || ''
  ws.getCell('B6').font = arial({ bold: true })
  ws.getCell('G6').value = 'ORDEN PRODUCCIÓN:'
  ws.getCell('G6').font = arial({ bold: true })
  ws.getCell('G6').alignment = { horizontal: 'right' }
  ws.getCell('H6').value = enc.orden_produccion || ''
  ws.getCell('H6').font = arial({ bold: true })
  ws.getCell('H6').alignment = { horizontal: 'center' }
  ws.mergeCells('B7:F7')

  // Fila 8: encabezados de columna (+ OC y Compra, nuevas)
  const titulos = ['Clave', 'Descripción', 'Unidad', 'Clasificación', 'Moneda', 'Costo', 'Cantidad Necesaria', 'Costo Estimado', 'OC', 'Compra']
  const filaEnc = ws.getRow(8)
  titulos.forEach((t, i) => {
    const c = filaEnc.getCell(i + 1)
    c.value = t
    c.font = arial({ bold: true })
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
    if (i >= 8) c.fill = relleno('#F2F2F2')
  })
  filaEnc.height = 18.75

  // Secciones por unidad; las líneas que se quitaron van al final de su sección en rojo con cantidad 0
  const eliminadasPorUnidad = new Map<string, LineaRev[]>()
  for (const l of d.eliminadas) {
    const u = l.unidad.trim() || 'Pieza'
    eliminadasPorUnidad.set(u, [...(eliminadasPorUnidad.get(u) ?? []), l])
  }
  const grupos = agruparPorUnidad(d.revision.lineas.filter(l => l.clave.trim() || l.descripcion.trim()))
  for (const u of eliminadasPorUnidad.keys()) {
    if (!grupos.some(g => g.unidad === u)) grupos.push({ unidad: u, lineas: [], totalCantidad: 0, totalCosto: 0 })
  }

  let fila = 9
  for (const g of grupos) {
    ws.mergeCells(fila, 1, fila, 8)
    const sec = ws.getCell(fila, 1)
    sec.value = g.unidad
    sec.font = arial({ bold: true })
    sec.alignment = { horizontal: 'left' }
    ws.getRow(fila).height = 15.75
    fila++

    const primera = fila
    const filas: { l: LineaRev; marca: Marca | null; quitada: boolean }[] = [
      ...g.lineas.map(l => ({ l, marca: d.marcas[l.id] ?? null, quitada: false })),
      ...(eliminadasPorUnidad.get(g.unidad) ?? []).map(l => ({ l, marca: 'disminucion' as Marca, quitada: true })),
    ]
    for (const { l, marca, quitada } of filas) {
      const r = ws.getRow(fila)
      r.getCell(1).value = l.clave
      r.getCell(2).value = l.descripcion
      r.getCell(3).value = l.unidad
      r.getCell(4).value = l.clasificacion
      r.getCell(5).value = l.moneda
      r.getCell(6).value = Number(l.costo) || 0
      r.getCell(7).value = quitada ? 0 : Number(l.cantidad) || 0
      r.getCell(8).value = { formula: `F${fila}*G${fila}`, result: quitada ? 0 : Math.round(Number(l.costo) * Number(l.cantidad) * 100) / 100 }
      r.getCell(9).value = quitada ? 'QUITADO' : l.oc || ''
      r.getCell(10).value = !quitada && l.comprado ? '✓' : ''
      for (let c = 1; c <= 10; c++) {
        const cell = r.getCell(c)
        cell.font = arial(marca === 'disminucion' ? { color: { argb: 'FFFFFFFF' }, bold: true } : {})
        cell.border = BORDES
        cell.alignment = { vertical: 'middle', horizontal: c >= 6 && c <= 8 ? 'right' : c >= 9 ? 'center' : 'left', wrapText: c === 2 }
        if (c >= 6 && c <= 8) cell.numFmt = NUM
        // La clasificación conserva su color; el resto de la fila lleva el color de la revisión
        if (c === 4) cell.fill = relleno(colorClasificacion(l.clasificacion))
        else if (marca && c <= 8) cell.fill = relleno(colorMarca(marca))
      }
      fila++
    }

    // Totales de la sección
    ws.mergeCells(fila, 1, fila, 6)
    const tot = ws.getCell(fila, 1)
    tot.value = `Totales ${g.unidad}:`
    tot.font = arial({ bold: true })
    tot.alignment = { horizontal: 'right' }
    const ultima = fila - 1
    const sumaCant = filas.reduce((s, x) => s + (x.quitada ? 0 : Number(x.l.cantidad) || 0), 0)
    const sumaCosto = filas.reduce((s, x) => s + (x.quitada ? 0 : Math.round(Number(x.l.costo) * Number(x.l.cantidad) * 100) / 100), 0)
    ws.getCell(fila, 7).value = filas.length ? { formula: `SUM(G${primera}:G${ultima})`, result: sumaCant } : 0
    ws.getCell(fila, 8).value = filas.length ? { formula: `SUM(H${primera}:H${ultima})`, result: sumaCosto } : 0
    for (const c of [7, 8]) {
      ws.getCell(fila, c).font = arial({ bold: true })
      ws.getCell(fila, c).numFmt = NUM
      ws.getCell(fila, c).border = { top: { style: 'thin' } }
    }
    fila += 2
  }

  // Usuario y leyenda de colores
  ws.mergeCells(fila, 1, fila, 8)
  ws.getCell(fila, 1).value = `Usuario: ${enc.usuario || ''}`
  ws.getCell(fila, 1).font = arial({ bold: true })
  fila += 2
  for (const l of LEYENDA) {
    ws.getCell(fila, 1).fill = relleno(l.color)
    ws.getCell(fila, 1).border = BORDES
    ws.getCell(fila, 2).value = l.texto.toUpperCase()
    ws.getCell(fila, 2).font = arial({ size: 9, bold: true })
    fila++
  }
  if (d.revision.motivo.trim()) {
    fila++
    ws.mergeCells(fila, 1, fila, 8)
    ws.getCell(fila, 1).value = `Cambios en ${etiquetaRev(d.revision.numero)}: ${d.revision.motivo.trim()}`
    ws.getCell(fila, 1).font = arial({ italic: true, size: 10 })
    ws.getCell(fila, 1).alignment = { wrapText: true }
  }

  ws.pageSetup.printArea = `A1:J${fila}`
  ws.pageSetup.printTitlesRow = '8:8'
}

/* ── Hoja 2: REPORTE (tiempos, estatus del pedido e historial de revisiones) ── */
function hojaReporte(wb: ExcelJS.Workbook, d: DatosExcel) {
  const ws = wb.addWorksheet('REPORTE')
  ws.columns = [{ width: 30 }, { width: 46 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 14 }]
  const titulo = (fila: number, t: string) => {
    ws.mergeCells(fila, 1, fila, 7)
    const c = ws.getCell(fila, 1)
    c.value = t
    c.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = relleno('#1F3864')
    c.alignment = { vertical: 'middle' }
    ws.getRow(fila).height = 20
  }
  const par = (fila: number, k: string, v: string | number) => {
    ws.getCell(fila, 1).value = k
    ws.getCell(fila, 1).font = { name: 'Arial', size: 10, bold: true }
    ws.getCell(fila, 2).value = v
    ws.getCell(fila, 2).font = { name: 'Arial', size: 10 }
  }

  let f = 1
  ws.mergeCells(f, 1, f, 7)
  ws.getCell(f, 1).value = `REPORTE DE EXPLOSIÓN — ${d.referencia} — ${etiquetaRev(d.revision.numero)}`
  ws.getCell(f, 1).font = { name: 'Arial', size: 14, bold: true }
  f += 2

  titulo(f++, 'TIEMPOS DE LA EXPLOSIÓN')
  const r = d.reporte
  par(f++, 'Estado', r.estado)
  par(f++, 'Inicio', fechaHora(r.fecha_inicio))
  par(f++, 'Término', fechaHora(r.fecha_termino))
  par(f++, 'Tiempo trabajado', `${r.tiempo_trabajado} (${r.tiempo_legible})`)
  par(f++, 'Días', r.dias)
  par(f++, 'Pausas', r.pausas)
  f++

  titulo(f++, 'ESTATUS DEL PEDIDO — MOTIVOS POR LOS QUE NO SE PODÍA EXPLOSIONAR')
  const encMot = ['Motivo', 'Detalle', 'Reportado', 'Reportó', 'Resuelto', 'Resolvió', 'Estado']
  encMot.forEach((t, i) => { const c = ws.getCell(f, i + 1); c.value = t; c.font = { name: 'Arial', size: 10, bold: true }; c.fill = relleno('#D9E1F2'); c.border = BORDES })
  f++
  if (!r.motivos.length) { ws.getCell(f, 1).value = 'Sin motivos registrados.'; f++ }
  for (const m of r.motivos) {
    const vals = [m.texto, m.detalle, fechaHora(m.reportado_en), m.reportado_por, fechaHora(m.resuelto_en), m.resuelto_por ?? '—', m.resuelto ? 'RESUELTO' : 'PENDIENTE']
    vals.forEach((v, i) => {
      const c = ws.getCell(f, i + 1)
      c.value = v
      c.font = { name: 'Arial', size: 10, color: i === 6 ? { argb: m.resuelto ? 'FF2E7D32' : 'FFC62828' } : undefined, bold: i === 6 }
      c.border = BORDES
      c.alignment = { wrapText: true, vertical: 'top' }
    })
    f++
  }
  if (r.notas.trim()) { f++; par(f++, 'Descripción / reporte', r.notas.trim()); ws.getCell(f - 1, 2).alignment = { wrapText: true } }
  f++

  titulo(f++, 'ÓRDENES DE COMPRA')
  const encOc = ['Folio OC', 'Proveedor', 'Fecha', 'Referencia', 'Archivo', 'Partidas en la hoja', 'Partidas OC']
  encOc.forEach((t, i) => { const c = ws.getCell(f, i + 1); c.value = t; c.font = { name: 'Arial', size: 10, bold: true }; c.fill = relleno('#D9E1F2'); c.border = BORDES })
  f++
  if (!d.ordenes?.length) { ws.getCell(f, 1).value = 'Sin órdenes de compra.'; f++ }
  for (const o of d.ordenes ?? []) {
    const vals = [o.folio, o.proveedor || '—', o.fecha || '—', o.referencia || '—', o.archivo_nombre ?? '—', o.partidas.filter(p => p.encontrada).length, o.partidas.length]
    vals.forEach((v, i) => { const c = ws.getCell(f, i + 1); c.value = v; c.font = { name: 'Arial', size: 10, bold: i === 0 }; c.border = BORDES; c.alignment = { wrapText: true, vertical: 'top' } })
    f++
  }
  f++

  titulo(f++, 'HISTORIAL DE REVISIONES')
  const encRev = ['Revisión', 'Qué cambió', 'Creada', 'Creó', 'Cerrada', 'Cerró', 'Materiales']
  encRev.forEach((t, i) => { const c = ws.getCell(f, i + 1); c.value = t; c.font = { name: 'Arial', size: 10, bold: true }; c.fill = relleno('#D9E1F2'); c.border = BORDES })
  f++
  for (const rev of d.revisiones) {
    const origen = rev.origen === 'importado' ? `Importado${rev.archivo_nombre ? `: ${rev.archivo_nombre}` : ''}` : ''
    const vals = [
      `${etiquetaRev(rev.numero)}${rev.estado === 'borrador' ? ' (borrador)' : ''}`,
      [rev.motivo.trim(), origen].filter(Boolean).join(' · ') || '—',
      fechaHora(rev.created_at), rev.creado_por ?? '—', fechaHora(rev.cerrada_en), rev.cerrada_por ?? '—',
      rev.lineas.filter(l => l.clave.trim() || l.descripcion.trim()).length,
    ]
    vals.forEach((v, i) => { const c = ws.getCell(f, i + 1); c.value = v; c.font = { name: 'Arial', size: 10 }; c.border = BORDES; c.alignment = { wrapText: true, vertical: 'top' } })
    f++
  }
}

/* ── Hojas 3 y 4: formatos de control en blanco (como el Excel original) ── */
function hojaRegistro(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('REGISTRO')
  ws.columns = [{ width: 3 }, { width: 10 }, { width: 10.6 }, { width: 15.6 }, { width: 9.4 }, { width: 12.3 }, { width: 13.7 }, { width: 11.9 }, { width: 9.3 }]
  ws.mergeCells('B2:I2')
  ws.getCell('B2').value = 'REGISTRO DE CONTROL DE PRODUCCIÓN'
  ws.getCell('B2').font = { name: 'Arial', size: 12, bold: true }
  ws.getCell('B2').alignment = { horizontal: 'center' }
  for (const [rango, t] of [['B3:B4', 'FECHA'], ['C3:C4', 'No. OP'], ['D3:D4', 'PRODUCTO'], ['E3:F3', 'ENTREGAS'], ['G3:G4', 'ENTREGÓ'], ['H3:H4', 'RECIBIÓ'], ['I3:I4', 'FIRMA']] as const) {
    ws.mergeCells(rango)
    ws.getCell(rango.split(':')[0]).value = t
  }
  ws.getCell('E4').value = 'TOTAL'
  ws.getCell('F4').value = 'PARCIAL'
  for (let f = 3; f <= 20; f++) for (let c = 2; c <= 9; c++) {
    const cell = ws.getCell(f, c)
    cell.border = BORDES
    if (f <= 4) { cell.font = { name: 'Arial', size: 9, bold: true }; cell.alignment = { horizontal: 'center', vertical: 'middle' } }
  }
  ws.mergeCells('B22:D22')
  ws.getCell('B22').value = 'OBSERVACIONES:'
  ws.getCell('B22').font = { name: 'Arial', size: 10, bold: true }
}

function hojaFormatoControl(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('FORMATO DE CONTROL')
  ws.columns = [{ width: 3 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 24.3 }]
  ws.mergeCells('B1:I1')
  ws.getCell('B1').value = 'REGISTRO DE CONTROL DE PRODUCCIÓN'
  ws.getCell('B1').font = { name: 'Arial', size: 12, bold: true }
  ws.getCell('B1').alignment = { horizontal: 'center' }
  for (const [rango, t] of [['B2:B3', 'FECHA'], ['C2:C3', 'No. OP'], ['D2:D3', 'No. Pedido'], ['E2:F2', 'ENTREGAS'], ['G2:G3', 'Liberó'], ['H2:H3', 'ENTREGÓ'], ['I2:I3', 'RECIBIÓ']] as const) {
    ws.mergeCells(rango)
    ws.getCell(rango.split(':')[0]).value = t
  }
  ws.getCell('E3').value = 'TOTAL'
  ws.getCell('F3').value = 'PARCIAL'
  for (let f = 2; f <= 19; f++) for (let c = 2; c <= 9; c++) {
    const cell = ws.getCell(f, c)
    cell.border = BORDES
    if (f <= 3) { cell.font = { name: 'Arial', size: 9, bold: true }; cell.alignment = { horizontal: 'center', vertical: 'middle' } }
  }
  ws.mergeCells('B21:D21')
  ws.getCell('B21').value = 'OBSERVACIONES:'
  ws.getCell('B21').font = { name: 'Arial', size: 10, bold: true }
  // Firmas por área: línea arriba del nombre
  for (const [celda, t] of [['B26', 'Calidad'], ['E26', 'Corte y Doblez Lámina'], ['I26', 'Corte de Tubo'], ['B30', 'Soldadura y Armado'], ['E30', 'Pintura'], ['I30', 'Empaque']] as const) {
    const c = ws.getCell(celda)
    c.value = t
    c.font = { name: 'Arial', size: 9, bold: true }
    c.border = { top: { style: 'thin' } }
  }
}

/** Arma el .xlsx completo y devuelve sus bytes */
export async function crearExcelExplosion(d: DatosExcel): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SULA MOB'
  wb.created = new Date()
  hojaExplosion(wb, d)
  hojaReporte(wb, d)
  hojaRegistro(wb)
  hojaFormatoControl(wb)
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
