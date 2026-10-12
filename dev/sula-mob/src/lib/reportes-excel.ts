/**
 * reportes-excel.ts
 * ─────────────────
 * Piezas comunes de los reportes en Excel del módulo de Reportes: encabezado
 * con el logo, cajas de indicadores, tablas con filas alternas y la respuesta
 * de descarga. Solo se importa desde archivos route.ts.
 *
 * RUTA: src/lib/reportes-excel.ts
 */

import ExcelJS from 'exceljs'
import { readFile } from 'fs/promises'
import path from 'path'

export const ZONA_HORARIA = 'America/Mexico_City'

export const COLOR = {
  encabezado: 'FF0B0E15',
  azul: 'FF3B82F6',
  azulOscuro: 'FF1E3A5F',
  verde: 'FF16A34A',
  amarillo: 'FFD97706',
  rojo: 'FFDC2626',
  gris: 'FF64748B',
  grisClaro: 'FFF8FAFC',
  linea: 'FFE2E8F0',
  blanco: 'FFFFFFFF',
}

// Tamaño carta (el tipo de exceljs no lo lista, pero Excel lo identifica con el 1)
const CARTA = 1 as unknown as ExcelJS.PaperSize

const relleno = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const lado: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COLOR.linea } }
const BORDE: Partial<ExcelJS.Borders> = { top: lado, left: lado, bottom: lado, right: lado }
export const fuente = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 10, ...extra })

/* ═══════════════════════════════════════
   FECHAS
   ═══════════════════════════════════════ */

/** Fecha de hoy en México como "2026-10-12" */
export function fechaHoy(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA })
}

/** "2026-10-12" → "12/10/2026" */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : ''
}

/** Fecha y hora de México a partir de un timestamp de la base */
export function fechaHora(timestamp: string): string {
  const fecha = new Date(timestamp)
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleString('es-MX', {
    timeZone: ZONA_HORARIA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Días completos entre dos fechas "AAAA-MM-DD" */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)
}

/* ═══════════════════════════════════════
   DATOS
   ═══════════════════════════════════════ */

/** Supabase devuelve una relación como objeto o como arreglo según cómo la detecte */
export function relacion<T>(valor: T | T[] | null | undefined): T | null {
  return Array.isArray(valor) ? valor[0] ?? null : valor ?? null
}

const TAMANO_PAGINA = 1000

/** Trae todas las filas de una consulta: Supabase entrega máximo 1000 por petición */
export async function todasLasFilas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await consulta(desde, desde + TAMANO_PAGINA - 1)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as T[]))
    if (!data || data.length < TAMANO_PAGINA) return filas
  }
}

/* ═══════════════════════════════════════
   ARMADO DE HOJAS
   ═══════════════════════════════════════ */

export interface Columna {
  titulo: string
  ancho: number
  alineacion?: 'left' | 'center' | 'right'
  /** Formato de número de Excel, p. ej. '0%' */
  formato?: string
}

export function crearLibro(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SULA MOB'
  wb.created = new Date()
  return wb
}

let logoCache: Promise<Buffer | null> | null = null

function leerLogo(): Promise<Buffer | null> {
  logoCache ??= readFile(path.join(process.cwd(), 'public', 'SULA_MOB_logo_transparente.png')).catch(() => null)
  return logoCache
}

// El logo se guarda una sola vez por libro aunque salga en varias hojas
const logoPorLibro = new WeakMap<ExcelJS.Workbook, number | null>()

async function idLogo(wb: ExcelJS.Workbook): Promise<number | null> {
  if (!logoPorLibro.has(wb)) {
    const logo = await leerLogo()
    // El tipo Buffer de exceljs es anterior al de Node actual
    logoPorLibro.set(wb, logo ? wb.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: 'png' }) : null)
  }
  return logoPorLibro.get(wb) ?? null
}

/**
 * Crea una hoja con la franja oscura del encabezado (logo, título y subtítulo).
 * Las tablas empiezan en la fila 4. La primera columna debe medir al menos 16 para que quepa el logo.
 */
export async function crearHoja(
  wb: ExcelJS.Workbook,
  nombre: string,
  titulo: string,
  subtitulo: string,
  columnas: Columna[]
): Promise<ExcelJS.Worksheet> {
  const ws = wb.addWorksheet(nombre, {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape', paperSize: CARTA, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 },
    },
    headerFooter: { oddFooter: `&L&8SULA MOB — Generado automáticamente · ${fechaCorta(fechaHoy())}&R&8Página &P de &N` },
  })
  ws.columns = columnas.map((c) => ({ width: c.ancho }))

  const ultima = columnas.length
  ws.mergeCells(1, 1, 2, 1)
  ws.mergeCells(1, 2, 1, ultima)
  ws.mergeCells(2, 2, 2, ultima)
  for (let col = 1; col <= ultima; col++) {
    ws.getCell(1, col).fill = relleno(COLOR.encabezado)
    ws.getCell(2, col).fill = relleno(COLOR.encabezado)
  }

  const celdaTitulo = ws.getCell(1, 2)
  celdaTitulo.value = titulo
  celdaTitulo.font = fuente({ size: 16, bold: true, color: { argb: COLOR.blanco } })
  celdaTitulo.alignment = { vertical: 'bottom', horizontal: 'left' }

  const celdaSub = ws.getCell(2, 2)
  celdaSub.value = subtitulo
  celdaSub.font = fuente({ size: 9, italic: true, color: { argb: 'FF94A3B8' } })
  celdaSub.alignment = { vertical: 'top', horizontal: 'left' }

  ws.getRow(1).height = 30
  ws.getRow(2).height = 22
  ws.getRow(3).height = 8

  const imagen = await idLogo(wb)
  if (imagen !== null) {
    ws.addImage(imagen, { tl: { col: 0.08, row: 0.1 }, ext: { width: 108, height: 58 } })
  } else {
    const celdaLogo = ws.getCell(1, 1)
    celdaLogo.value = 'SULA MOB'
    celdaLogo.font = fuente({ size: 12, bold: true, color: { argb: COLOR.blanco } })
    celdaLogo.alignment = { vertical: 'middle', horizontal: 'center' }
  }
  return ws
}

/** Título de una sección. Devuelve la fila siguiente */
export function seccion(ws: ExcelJS.Worksheet, fila: number, texto: string): number {
  const celda = ws.getCell(fila, 1)
  celda.value = texto
  celda.font = fuente({ size: 11, bold: true, color: { argb: COLOR.azulOscuro } })
  ws.getRow(fila).height = 20
  return fila + 1
}

export interface Caja {
  etiqueta: string
  valor: string | number
  color: string
  /** Columnas que ocupa la caja: [primera, última] */
  columnas: [number, number]
}

/** Fila de indicadores grandes con su etiqueta debajo. Devuelve la fila siguiente (deja una de espacio) */
export function cajas(ws: ExcelJS.Worksheet, fila: number, lista: Caja[]): number {
  for (const caja of lista) {
    const [desde, hasta] = caja.columnas
    if (hasta > desde) {
      ws.mergeCells(fila, desde, fila, hasta)
      ws.mergeCells(fila + 1, desde, fila + 1, hasta)
    }
    const valor = ws.getCell(fila, desde)
    valor.value = caja.valor
    valor.font = fuente({ size: 20, bold: true, color: { argb: COLOR.blanco } })
    valor.fill = relleno(caja.color)
    valor.alignment = { horizontal: 'center', vertical: 'middle' }

    const etiqueta = ws.getCell(fila + 1, desde)
    etiqueta.value = caja.etiqueta
    etiqueta.font = fuente({ size: 9, color: { argb: COLOR.gris } })
    etiqueta.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  ws.getRow(fila).height = 38
  ws.getRow(fila + 1).height = 16
  return fila + 3
}

/**
 * Tabla con cabecera azul, filas alternas y bordes. `estilo` permite retocar una celda
 * ya pintada (p. ej. poner en rojo una fecha vencida). Devuelve la fila siguiente (deja una de espacio).
 */
export function tabla(
  ws: ExcelJS.Worksheet,
  fila: number,
  columnas: Columna[],
  filas: ExcelJS.CellValue[][],
  opciones: { estilo?: (celda: ExcelJS.Cell, indiceFila: number, indiceColumna: number) => void; vacio?: string } = {}
): number {
  columnas.forEach((c, i) => {
    const celda = ws.getCell(fila, i + 1)
    celda.value = c.titulo
    celda.font = fuente({ bold: true, color: { argb: COLOR.blanco } })
    celda.fill = relleno(COLOR.azulOscuro)
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    celda.border = BORDE
  })
  ws.getRow(fila).height = 24

  if (!filas.length) {
    ws.mergeCells(fila + 1, 1, fila + 1, columnas.length)
    const celda = ws.getCell(fila + 1, 1)
    celda.value = opciones.vacio ?? 'Sin registros.'
    celda.font = fuente({ italic: true, color: { argb: COLOR.gris } })
    celda.alignment = { horizontal: 'center', vertical: 'middle' }
    return fila + 3
  }

  filas.forEach((valores, i) => {
    const numero = fila + 1 + i
    columnas.forEach((c, j) => {
      const celda = ws.getCell(numero, j + 1)
      celda.value = valores[j] ?? ''
      celda.font = fuente()
      celda.alignment = { horizontal: c.alineacion ?? 'left', vertical: 'middle', wrapText: true }
      celda.border = BORDE
      if (c.formato) celda.numFmt = c.formato
      if (i % 2 === 1) celda.fill = relleno(COLOR.grisClaro)
      opciones.estilo?.(celda, i, j)
    })
  })
  return fila + filas.length + 2
}

/** Verde de 80% para arriba, amarillo de 40% a 79% y rojo por debajo */
export function colorAvance(fraccion: number): string {
  return fraccion >= 0.8 ? COLOR.verde : fraccion >= 0.4 ? COLOR.amarillo : COLOR.rojo
}

/** Respuesta HTTP que descarga el libro como "NOMBRE_AAAAMMDD.xlsx" */
export async function descargaExcel(wb: ExcelJS.Workbook, nombre: string): Promise<Response> {
  const buffer = await wb.xlsx.writeBuffer()
  const archivo = `${nombre}_${fechaHoy().replace(/-/g, '')}.xlsx`
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${archivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
