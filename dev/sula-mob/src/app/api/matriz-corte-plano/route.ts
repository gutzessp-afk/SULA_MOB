/**
 * /api/matriz-corte-plano/route.ts
 * ────────────────────────────────
 * Genera en Excel la Matriz de Corte de UN plano (un producto del pedido).
 *
 * Entrada (JSON): { bom, clave, descripcion, cantidad, cliente, proyecto, fecha }
 * Salida: archivo .xlsx con dos hojas:
 *   1. MATRIZ DE CORTE — piezas por subensamble, con columnas amarillas para
 *      que producción anote piezas procesadas y fecha.
 *   2. POR ÁREA — las mismas piezas agrupadas por área, con casilla de hecho.
 *
 * No usa IA: solo da formato al BOM que ya está guardado. Los datos los arma
 * src/lib/matriz-corte.ts (el PDF usa los mismos).
 *
 * La CANT. TOTAL va como fórmula: si en la hoja se corrige una cantidad o el
 * total a producir, se recalcula sola.
 *
 * RUTA DEL ARCHIVO: src/app/api/matriz-corte-plano/route.ts
 */

import ExcelJS from 'exceljs'
import { NextRequest, NextResponse } from 'next/server'
import { esAdmin } from '@/lib/admin-api'
import { colorArea, construirMatriz, nombreArchivoMatriz, notasDe, type Matriz } from '@/lib/matriz-corte'
import type { PlantillaBOM } from '@/lib/types'

/* ═══════════════════════════════════════
   ESTILOS
   ═══════════════════════════════════════ */

const AZUL_OSCURO = 'FF0F1729'
const AZUL = 'FF2563EB'
const GRIS_SECCION = 'FF334155'
const GRIS_TEXTO = 'FF64748B'
const AMARILLO = 'FFFEFCE8'
const LINEA = 'FFCBD5E1'

// Tamaño carta (el tipo de exceljs no lo lista, pero Excel lo identifica con el 1)
const CARTA = 1 as unknown as ExcelJS.PaperSize

const argb = (hex: string) => 'FF' + hex
const relleno = (color: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } })
const lado: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: LINEA } }
const BORDE: Partial<ExcelJS.Borders> = { top: lado, left: lado, bottom: lado, right: lado }
const fuente = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 9, ...extra })

/** "531.5" → 531.5 (para que Excel lo trate como número); '1"x1"' se queda como texto */
const numeroSiSePuede = (t: string): string | number => (/^\s*\d+(\.\d+)?\s*$/.test(t) ? Number(t) : t)

/** Escribe "ETIQUETA: valor" en un rango combinado, con la etiqueta en gris y el valor en negritas */
function dato(ws: ExcelJS.Worksheet, rango: string, etiqueta: string, valor: string) {
  ws.mergeCells(rango)
  const celda = ws.getCell(rango.split(':')[0])
  celda.value = {
    richText: [
      { text: `${etiqueta}: `, font: fuente({ color: { argb: GRIS_TEXTO } }) },
      { text: valor || '—', font: fuente({ bold: true, size: 10 }) },
    ],
  }
  celda.alignment = { vertical: 'middle', wrapText: true }
}

/* ═══════════════════════════════════════
   HOJA 1: MATRIZ DE CORTE
   ═══════════════════════════════════════ */

const COLUMNAS = [
  { titulo: '#', ancho: 5 },
  { titulo: 'DESCRIPCIÓN', ancho: 30 },
  { titulo: 'MATERIAL', ancho: 36 },
  { titulo: 'CANT.', ancho: 8 },
  { titulo: 'LARGO mm', ancho: 11 },
  { titulo: 'ANCHO mm', ancho: 11 },
  { titulo: 'NOTAS DE CORTE / BARRENOS', ancho: 40 },
  { titulo: 'PÁG.', ancho: 6 },
  { titulo: 'ÁREA', ancho: 17 },
  { titulo: 'CANT. TOTAL', ancho: 11 },
  { titulo: 'PZAS. PROCESADAS', ancho: 14 },
  { titulo: 'FECHA', ancho: 12 },
]
const FILA_ENCABEZADO = 7
const CELDA_TOTAL = '$L$4'

function hojaMatriz(wb: ExcelJS.Workbook, m: Matriz) {
  const ws = wb.addWorksheet('MATRIZ DE CORTE', {
    views: [{ state: 'frozen', ySplit: FILA_ENCABEZADO, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape', paperSize: CARTA, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 },
      printTitlesRow: `${FILA_ENCABEZADO}:${FILA_ENCABEZADO}`,
    },
    headerFooter: { oddFooter: `&L&8SULA MOB · Matriz de Corte · ${m.modelo} — ${m.descripcion}&R&8Página &P de &N` },
  })
  ws.columns = COLUMNAS.map(c => ({ width: c.ancho }))

  // ── Encabezado ──
  ws.mergeCells('A1:B1'); ws.mergeCells('C1:G1'); ws.mergeCells('H1:L1')
  ws.mergeCells('A2:B2'); ws.mergeCells('C2:G2'); ws.mergeCells('H2:L2')
  ws.getCell('A1').value = 'S U L A'
  ws.getCell('A1').font = fuente({ size: 18, bold: true, color: { argb: AZUL } })
  ws.getCell('A2').value = 'M O B'
  ws.getCell('A2').font = fuente({ size: 11, bold: true, color: { argb: GRIS_TEXTO } })
  ws.getCell('C1').value = 'MATRIZ DE CORTE'
  ws.getCell('C1').font = fuente({ size: 16, bold: true })
  ws.getCell('C2').value = m.descripcion
  ws.getCell('C2').font = fuente({ size: 12, bold: true, color: { argb: AZUL } })
  ws.getCell('H1').value = { richText: [{ text: 'MODELO: ', font: fuente({ color: { argb: GRIS_TEXTO } }) }, { text: m.modelo, font: fuente({ bold: true, size: 11 }) }] }
  ws.getCell('H2').value = { richText: [{ text: 'REVISIÓN: ', font: fuente({ color: { argb: GRIS_TEXTO } }) }, { text: m.revision || '—', font: fuente({ bold: true, size: 11, color: { argb: 'FFDC2626' } }) }] }
  for (const c of ['H1', 'H2']) ws.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getRow(1).height = 26
  ws.getRow(2).height = 18
  ws.getRow(3).height = 6

  dato(ws, 'A4:C4', 'CLIENTE', m.cliente)
  dato(ws, 'D4:G4', 'ACABADO', m.acabado)
  dato(ws, 'H4:I4', 'FECHA', m.fecha)
  ws.mergeCells('J4:K4')
  ws.getCell('J4').value = 'TOTAL A PRODUCIR:'
  ws.getCell('J4').font = fuente({ color: { argb: GRIS_TEXTO } })
  ws.getCell('J4').alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getCell('L4').value = m.total
  ws.getCell('L4').font = fuente({ size: 14, bold: true, color: { argb: AZUL } })
  ws.getCell('L4').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('L4').fill = relleno(AMARILLO)
  ws.getCell('L4').border = BORDE
  dato(ws, 'A5:C5', 'DIMENSIONES', m.dimensiones)
  dato(ws, 'D5:G5', 'PEDIDO', m.proyecto)
  dato(ws, 'H5:L5', 'DIBUJO', m.dibujo)
  ws.getRow(4).height = 22
  ws.getRow(5).height = 18
  ws.getRow(6).height = 6

  const titulos = ws.getRow(FILA_ENCABEZADO)
  titulos.values = COLUMNAS.map(c => c.titulo)
  titulos.height = 26
  titulos.eachCell(c => {
    c.fill = relleno(AZUL_OSCURO)
    c.font = fuente({ bold: true, size: 8, color: { argb: 'FFFFFFFF' } })
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = BORDE
  })

  // ── Secciones ──
  let r = FILA_ENCABEZADO + 1
  for (const sec of m.secciones) {
    const filaSeccion = r
    const fs = ws.getRow(r++)
    fs.values = ['', sec.nombre, sec.pagina !== null ? `Pág. ${sec.pagina}` : '', sec.cantidad]
    fs.height = 20
    for (let c = 1; c <= COLUMNAS.length; c++) {
      const celda = fs.getCell(c)
      celda.fill = relleno(GRIS_SECCION)
      celda.font = fuente({ bold: c !== 3, italic: c === 3, size: c === 2 ? 10 : 9, color: { argb: c === 3 ? 'FFCBD5E1' : 'FFFFFFFF' } })
      celda.alignment = { vertical: 'middle', horizontal: c === 4 ? 'center' : 'left' }
    }
    fs.getCell(4).numFmt = '"×"0'

    for (const f of sec.filas) {
      const fila = ws.getRow(r)
      fila.values = [
        f.n, f.descripcion, f.material, f.cantidad, f.largo ?? '', numeroSiSePuede(f.ancho), notasDe(f), f.pagina ?? '', f.area,
        { formula: `D${r}*$D$${filaSeccion}*${CELDA_TOTAL}`, result: f.total }, '', '',
      ]
      const color = colorArea(f.area)
      for (let c = 1; c <= COLUMNAS.length; c++) {
        const celda = fila.getCell(c)
        celda.border = BORDE
        celda.font = fuente()
        celda.alignment = { vertical: 'middle', wrapText: true, horizontal: c === 2 || c === 3 || c === 7 ? 'left' : 'center' }
      }
      fila.getCell(1).font = fuente({ size: 7, color: { argb: GRIS_TEXTO } })
      fila.getCell(3).font = fuente({ size: 8, color: { argb: 'FF334155' } })
      fila.getCell(5).numFmt = '#,##0.##'
      fila.getCell(6).numFmt = '#,##0.##'
      fila.getCell(7).font = fuente({ size: 8, color: { argb: 'FF334155' } })
      fila.getCell(8).font = fuente({ size: 8, color: { argb: GRIS_TEXTO } })
      fila.getCell(9).fill = relleno(argb(color.claro))
      fila.getCell(9).font = fuente({ size: 8, bold: true, color: { argb: argb(color.fuerte) } })
      fila.getCell(10).font = fuente({ size: 11, bold: true, color: { argb: AZUL } })
      fila.getCell(11).fill = relleno(AMARILLO)
      fila.getCell(12).fill = relleno(AMARILLO)
      r++
    }
    ws.getRow(r++).height = 6
  }

  // ── Notas ──
  r++
  ws.getCell(`B${r}`).value = 'NOTAS:'
  ws.getCell(`B${r}`).font = fuente({ bold: true })
  const notas = [
    ...(m.avisoPlano ? [m.avisoPlano] : []),
    'Las columnas PZAS. PROCESADAS y FECHA (amarillas) son para llenar en producción.',
    'CANT. TOTAL = cantidad por subensamble × subensambles por producto × total a producir.',
    `Total a producir: ${m.total} unidad(es) de ${m.descripcion} · ${m.resumen.componentes} componentes · ${m.resumen.piezas} piezas a fabricar.`,
  ]
  notas.forEach((texto, i) => {
    ws.mergeCells(`B${r + 1 + i}:L${r + 1 + i}`)
    ws.getCell(`B${r + 1 + i}`).value = `• ${texto}`
    ws.getCell(`B${r + 1 + i}`).font = fuente({ size: texto === m.avisoPlano ? 9 : 8, color: { argb: texto === m.avisoPlano ? 'FFB91C1C' : i === notas.length - 1 ? AZUL : 'FF334155' }, bold: texto === m.avisoPlano || i === notas.length - 1 })
  })
}

/* ═══════════════════════════════════════
   HOJA 2: POR ÁREA DE PRODUCCIÓN
   ═══════════════════════════════════════ */

const COLUMNAS_AREA = [
  { titulo: 'DESCRIPCIÓN', ancho: 30 },
  { titulo: 'MATERIAL', ancho: 36 },
  { titulo: 'SUBENSAMBLE', ancho: 28 },
  { titulo: 'CANT.', ancho: 8 },
  { titulo: 'LARGO', ancho: 11 },
  { titulo: 'ANCHO', ancho: 11 },
  { titulo: 'NOTAS', ancho: 40 },
  { titulo: 'TOTAL', ancho: 11 },
  { titulo: 'HECHO', ancho: 9 },
]

function hojaAreas(wb: ExcelJS.Workbook, m: Matriz) {
  const ws = wb.addWorksheet('POR ÁREA', {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape', paperSize: CARTA, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 },
    },
    headerFooter: { oddFooter: `&L&8SULA MOB · Por área · ${m.modelo} — ${m.descripcion}&R&8Página &P de &N` },
  })
  ws.columns = COLUMNAS_AREA.map(c => ({ width: c.ancho }))
  const ultima = String.fromCharCode(64 + COLUMNAS_AREA.length)

  ws.mergeCells(`A1:C1`); ws.mergeCells(`D1:${ultima}1`); ws.mergeCells(`A2:${ultima}2`)
  ws.getCell('A1').value = 'S U L A   M O B'
  ws.getCell('A1').font = fuente({ size: 16, bold: true, color: { argb: AZUL } })
  ws.getCell('D1').value = 'RESUMEN POR ÁREA DE PRODUCCIÓN'
  ws.getCell('D1').font = fuente({ size: 14, bold: true })
  ws.getCell('D1').alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getCell('A2').value = `${m.modelo}  —  ${m.descripcion}  —  Total a producir: ${m.total}`
  ws.getCell('A2').font = fuente({ size: 10, color: { argb: 'FF334155' } })
  ws.getRow(1).height = 26

  let r = 4
  for (const grupo of m.porArea) {
    const color = colorArea(grupo.area)
    const banda = ws.getRow(r++)
    banda.height = 22
    banda.values = [grupo.area, '', '', '', '', '', `${grupo.filas.length} componente(s)`, `${grupo.piezas} pzas.`]
    for (let c = 1; c <= COLUMNAS_AREA.length; c++) {
      const celda = banda.getCell(c)
      celda.fill = relleno(argb(color.fuerte))
      celda.font = fuente({ bold: true, size: c === 1 || c === 8 ? 11 : 9, color: { argb: 'FFFFFFFF' } })
      celda.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' }
    }

    const titulos = ws.getRow(r++)
    titulos.values = COLUMNAS_AREA.map(c => c.titulo)
    titulos.eachCell(c => {
      c.fill = relleno(argb(color.claro))
      c.font = fuente({ bold: true, size: 8, color: { argb: argb(color.fuerte) } })
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.border = BORDE
    })

    for (const f of grupo.filas) {
      const fila = ws.getRow(r++)
      fila.values = [f.descripcion, f.material, f.subensamble, f.cantidad, f.largo ?? '', numeroSiSePuede(f.ancho), notasDe(f), f.total, '']
      for (let c = 1; c <= COLUMNAS_AREA.length; c++) {
        const celda = fila.getCell(c)
        celda.border = BORDE
        celda.font = fuente()
        celda.alignment = { vertical: 'middle', wrapText: true, horizontal: c <= 3 || c === 7 ? 'left' : 'center' }
      }
      fila.getCell(2).font = fuente({ size: 8, color: { argb: 'FF334155' } })
      fila.getCell(3).font = fuente({ size: 8, color: { argb: GRIS_TEXTO } })
      fila.getCell(5).numFmt = '#,##0.##'
      fila.getCell(6).numFmt = '#,##0.##'
      fila.getCell(7).font = fuente({ size: 8, color: { argb: 'FF334155' } })
      fila.getCell(8).font = fuente({ size: 11, bold: true, color: { argb: AZUL } })
      fila.getCell(9).fill = relleno(AMARILLO)
    }
    r++
  }
}

/* ═══════════════════════════════════════
   HANDLER POST
   ═══════════════════════════════════════ */

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Solo los administradores pueden generar la matriz.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as {
    bom?: PlantillaBOM; clave?: string; descripcion?: string; cantidad?: number; cliente?: string; proyecto?: string; fecha?: string
  } | null
  if (!body?.bom || !Array.isArray(body.bom.subensambles)) {
    return NextResponse.json({ error: 'Falta el despiece del plano.' }, { status: 400 })
  }

  try {
    const matriz = construirMatriz(body.bom, {
      clave: String(body.clave ?? ''),
      descripcion: String(body.descripcion ?? ''),
      cantidad: Number(body.cantidad) || 1,
      cliente: String(body.cliente ?? ''),
      proyecto: String(body.proyecto ?? ''),
      fecha: String(body.fecha ?? ''),
    })

    const wb = new ExcelJS.Workbook()
    wb.creator = 'SULA MOB'
    hojaMatriz(wb, matriz)
    hojaAreas(wb, matriz)
    const buffer = await wb.xlsx.writeBuffer()

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombreArchivoMatriz(matriz)}.xlsx"`,
      },
    })
  } catch (err) {
    console.error('[matriz-corte-plano] Error:', err)
    return NextResponse.json({ error: 'No se pudo generar la Matriz de Corte.' }, { status: 500 })
  }
}
