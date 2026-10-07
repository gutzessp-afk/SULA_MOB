/**
 * /api/generar-matriz-corte/route.ts
 * ──────────────────────────────────
 * Genera la Matriz de Corte en Excel de un pedido, con el formato que usa
 * el área de corte: un bloque por modelo con sus subensambles y piezas,
 * la cantidad a producir de cada pieza y columnas para registrar el avance.
 *
 * Entrada (JSON): { cliente, nombre_proyecto, fecha_entrega, partidas: [{ clave, descripcion, cantidad }] }
 * Salida: archivo .xlsx para descargar
 *
 * Los BOM salen de la tabla plantilla_despiece (los crea /api/analizar-plano).
 *
 *   CANTIDAD A PRODUCIR = piezas por subensamble × subensambles por unidad × unidades del pedido
 *
 * Se escribe como fórmula de Excel: si alguien corrige una cantidad en la hoja, se recalcula.
 *
 * RUTA DEL ARCHIVO: src/app/api/generar-matriz-corte/route.ts
 */

import ExcelJS from 'exceljs'
import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import type { MatrizCorteRequest, PartidaPedido, PlantillaBOM } from '@/lib/types'

/* ═══════════════════════════════════════
   ESTILOS (mismos colores en todo el archivo)
   ═══════════════════════════════════════ */

const AZUL_OSCURO = 'FF2F5496'
const AZUL_CLARO = 'FFD6E4F0'
const VERDE = 'FFE2EFDA'
const GRIS = 'FF595959'
const ROJO = 'FFC00000'

const relleno = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const BORDE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
}

const COLUMNAS = [
  { titulo: 'DESCRIPCIÓN', ancho: 35 },
  { titulo: 'MATERIAL', ancho: 38 },
  { titulo: 'CANT. PLANO', ancho: 14 },
  { titulo: 'LARGO mm', ancho: 12 },
  { titulo: 'ANCHO mm', ancho: 12 },
  { titulo: 'NOTAS', ancho: 40 },
  { titulo: 'PÁG', ancho: 8 },
  { titulo: 'CANT. A PRODUCIR', ancho: 16 },
  { titulo: 'PIEZAS PROCESADAS', ancho: 18 },
  { titulo: 'FECHA', ancho: 14 },
]

/** Aplica el mismo estilo a las 10 columnas de una fila */
function estiloFila(row: ExcelJS.Row, opciones: { fill?: string; bold?: boolean; color?: string; italic?: boolean; borde?: boolean }) {
  for (let col = 1; col <= COLUMNAS.length; col++) {
    const cell = row.getCell(col)
    if (opciones.fill) cell.fill = relleno(opciones.fill)
    cell.font = { name: 'Arial', size: 10, bold: opciones.bold, italic: opciones.italic, color: opciones.color ? { argb: opciones.color } : undefined }
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: col === 1 || col === 2 || col === 6 ? 'left' : 'center' }
    if (opciones.borde !== false) cell.border = BORDE
  }
}

/** "531.5" → 531.5 (número), "1 1/4\"" → texto tal cual */
const numeroSiSePuede = (v: string) => (/^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v)

/* ═══════════════════════════════════════
   ARMADO DEL EXCEL
   ═══════════════════════════════════════ */

async function construirExcel(req: MatrizCorteRequest, plantillas: Map<string, PlantillaBOM>) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SULA MOB'
  wb.created = new Date()

  const ws = wb.addWorksheet('MATRIZ DE CORTE', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = COLUMNAS.map(c => ({ width: c.ancho }))

  // ── Título ──
  ws.mergeCells('A1:J1')
  const titulo = ws.getCell('A1')
  titulo.value = `MATRIZ DE CORTE ${req.nombre_proyecto}`.trim().toUpperCase()
  titulo.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  titulo.fill = relleno(AZUL_OSCURO)
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 30

  // ── Datos generales ──
  const info = ws.getRow(3)
  info.values = ['CLIENTE:', req.cliente || '—', 'ÁREA:', 'PRODUCCIÓN', '', 'FECHA DE ENTREGA:', req.fecha_entrega || '—', '', 'GENERADA:', new Date().toISOString().slice(0, 10)]
  for (const col of [1, 3, 6, 9]) info.getCell(col).font = { name: 'Arial', size: 10, bold: true, color: { argb: AZUL_OSCURO } }
  for (const col of [2, 4, 7, 10]) info.getCell(col).font = { name: 'Arial', size: 10, bold: true }

  let r = 5
  const herrajes: { modelo: string; descripcion: string; sku: string; cantidad: number; unidades: number; filaModelo: number }[] = []

  for (const partida of req.partidas) {
    const bom = plantillas.get(partida.clave)

    // ── Fila del modelo ──
    const filaModelo = r
    const modelo = ws.getRow(r)
    modelo.values = ['MODELO:', partida.clave, 'DESCRIPCIÓN:', partida.descripcion || bom?.descripcion || '', '', '', '', '', 'TOTAL A PRODUCIR:', partida.cantidad]
    ws.mergeCells(r, 4, r, 8)
    estiloFila(modelo, { fill: AZUL_CLARO, bold: true })
    modelo.getCell(4).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
    r++

    if (!bom) {
      ws.mergeCells(r, 1, r, 10)
      const aviso = ws.getCell(r, 1)
      aviso.value = 'SIN PLANTILLA: falta analizar el plano de esta clave.'
      aviso.font = { name: 'Arial', size: 10, bold: true, color: { argb: ROJO } }
      r += 2
      continue
    }

    // ── Materiales del plano ──
    if (bom.materiales?.length) {
      ws.mergeCells(r, 1, r, 10)
      const mat = ws.getCell(r, 1)
      mat.value = 'Materiales: ' + bom.materiales.map(m => `${m.codigo} ${m.descripcion}`.trim()).join(' · ')
      mat.font = { name: 'Arial', size: 9, italic: true, color: { argb: GRIS } }
      mat.alignment = { wrapText: true, vertical: 'middle' }
      r++
    }

    // ── Encabezado de la tabla ──
    const encabezado = ws.getRow(r)
    encabezado.values = COLUMNAS.map(c => c.titulo)
    estiloFila(encabezado, { fill: AZUL_OSCURO, bold: true, color: 'FFFFFFFF' })
    r++

    // Para el resumen por área: celdas H de las piezas de cada área
    const celdasPorArea = new Map<string, { celdas: string[]; total: number }>()

    for (const sub of bom.subensambles ?? []) {
      // Un subensamble sin piezas propias solo agrupa a otros (un MODULO con su JAULA): no se corta
      if (!sub.componentes?.length) continue
      // ── Fila del subensamble: C = cuántos lleva una unidad ──
      const filaSub = r
      const subRow = ws.getRow(r)
      subRow.values = [sub.nombre, '', sub.cantidad || 1, '', '', '', sub.pagina ?? '']
      ws.mergeCells(r, 1, r, 2)
      estiloFila(subRow, { fill: VERDE, bold: true })
      r++

      // ── Piezas ──
      for (const comp of sub.componentes ?? []) {
        const total = (comp.cantidad || 0) * (sub.cantidad || 1) * partida.cantidad
        const fila = ws.getRow(r)
        fila.values = [
          comp.descripcion,
          comp.material,
          comp.cantidad || 0,
          comp.largo_mm ?? '',
          numeroSiSePuede(comp.ancho || ''),
          comp.notas || '',
          comp.pagina ?? '',
          { formula: `$C$${filaSub}*C${r}*$J$${filaModelo}`, result: total },
          '',
          '',
        ]
        estiloFila(fila, {})
        fila.getCell(8).font = { name: 'Arial', size: 10, bold: true }

        const area = comp.area || 'Sin área'
        const acumulado = celdasPorArea.get(area) ?? { celdas: [], total: 0 }
        acumulado.celdas.push(`H${r}`)
        acumulado.total += total
        celdasPorArea.set(area, acumulado)
        r++
      }
    }

    // ── Resumen por área del bloque ──
    if (celdasPorArea.size > 0) {
      const tituloResumen = ws.getRow(r)
      tituloResumen.values = ['RESUMEN POR ÁREA', '', '', '', '', '', '', 'PIEZAS']
      ws.mergeCells(r, 1, r, 7)
      estiloFila(tituloResumen, { bold: true, color: AZUL_OSCURO })
      r++
      for (const [area, { celdas, total }] of celdasPorArea) {
        const fila = ws.getRow(r)
        // SUM admite hasta 255 argumentos; si hay más piezas se escribe el valor calculado
        const valor = celdas.length <= 250 ? { formula: `SUM(${celdas.join(',')})`, result: total } : total
        fila.values = [area, '', '', '', '', '', '', valor]
        ws.mergeCells(r, 1, r, 7)
        estiloFila(fila, {})
        r++
      }
    }

    for (const h of bom.herrajes ?? []) {
      herrajes.push({ modelo: partida.clave, descripcion: h.descripcion, sku: h.sku, cantidad: h.cantidad || 0, unidades: partida.cantidad, filaModelo })
    }
    r++ // fila en blanco entre bloques
  }

  // ── Herraje de armado (al final) ──
  if (herrajes.length > 0) {
    ws.mergeCells(r, 1, r, 10)
    const t = ws.getCell(r, 1)
    t.value = 'HERRAJE DE ARMADO'
    t.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
    t.fill = relleno(AZUL_OSCURO)
    t.alignment = { horizontal: 'center', vertical: 'middle' }
    r++

    const encabezado = ws.getRow(r)
    encabezado.values = ['MODELO', 'DESCRIPCIÓN', 'CANT. X UNIDAD', '', '', 'SKU', '', 'CANT. TOTAL', 'SURTIDO', 'FECHA']
    estiloFila(encabezado, { fill: AZUL_CLARO, bold: true })
    r++

    for (const h of herrajes) {
      const fila = ws.getRow(r)
      fila.values = [h.modelo, h.descripcion, h.cantidad, '', '', h.sku || '', '', { formula: `C${r}*$J$${h.filaModelo}`, result: h.cantidad * h.unidades }, '', '']
      estiloFila(fila, {})
      fila.getCell(8).font = { name: 'Arial', size: 10, bold: true }
      r++
    }
  }

  return wb.xlsx.writeBuffer()
}

/* ═══════════════════════════════════════
   HANDLER POST
   ═══════════════════════════════════════ */

function leerRequest(body: unknown): MatrizCorteRequest | null {
  const b = (body ?? {}) as Record<string, unknown>
  if (!Array.isArray(b.partidas) || b.partidas.length === 0) return null
  const partidas: PartidaPedido[] = []
  for (const p of b.partidas) {
    const { clave, descripcion, cantidad } = (p ?? {}) as Record<string, unknown>
    if (typeof clave !== 'string' || !clave.trim()) return null
    partidas.push({
      clave: clave.trim(),
      descripcion: typeof descripcion === 'string' ? descripcion : '',
      cantidad: Math.max(1, Math.round(Number(cantidad) || 1)),
    })
  }
  return {
    cliente: typeof b.cliente === 'string' ? b.cliente : '',
    nombre_proyecto: typeof b.nombre_proyecto === 'string' ? b.nombre_proyecto : '',
    fecha_entrega: typeof b.fecha_entrega === 'string' ? b.fecha_entrega : '',
    partidas,
  }
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Solo los administradores pueden generar la matriz de corte.' }, { status: 403 })
  }

  const req = leerRequest(await request.json().catch(() => null))
  if (!req) return NextResponse.json({ error: 'Faltan las partidas del pedido.' }, { status: 400 })

  // Plantillas de todas las claves del pedido en una sola consulta
  const claves = [...new Set(req.partidas.map(p => p.clave))]
  const { data, error } = await supabaseServidor().from('plantilla_despiece').select('clave, bom').in('clave', claves)
  if (error) return NextResponse.json({ error: 'No se pudieron leer las plantillas: ' + error.message }, { status: 500 })

  const plantillas = new Map((data ?? []).map(p => [p.clave as string, p.bom as PlantillaBOM]))
  const faltantes = claves.filter(c => !plantillas.has(c))
  if (faltantes.length === claves.length) {
    return NextResponse.json({ error: 'Ninguna clave del pedido tiene plantilla. Analiza los planos primero.' }, { status: 400 })
  }

  try {
    const buffer = await construirExcel(req, plantillas)
    const nombre = `MATRIZ_DE_CORTE_${(req.nombre_proyecto || 'PEDIDO').replace(/[^\p{L}\p{N}]+/gu, '_')}.xlsx`
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombre.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'Cache-Control': 'no-store',
        // Para avisar en la interfaz si algunas claves salieron sin plantilla
        'X-Claves-Sin-Plantilla': encodeURIComponent(faltantes.join(',')),
      },
    })
  } catch (err) {
    console.error('[generar-matriz-corte] Error:', err)
    return NextResponse.json({ error: 'No se pudo generar el Excel.' }, { status: 500 })
  }
}
