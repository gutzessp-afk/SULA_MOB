/**
 * explosion-pdf.ts
 * ────────────────
 * PDF de una revisión de la explosión de materiales, con el mismo contenido que el Excel
 * (src/lib/explosion-excel.ts): encabezado del formato SULA, materiales por unidad con colores de
 * clasificación y de revisión, totales, OC / Compra / Almacén con fechas, leyenda y, si hay, el
 * resumen de órdenes de compra (pagado / por pagar).
 *
 * Se genera en el servidor (jsPDF + jspdf-autotable, ya instaladas) en tamaño carta horizontal.
 * La fuente Helvetica no tiene "✓": las casillas salen como "Sí".
 *
 * RUTA: src/lib/explosion-pdf.ts
 */

import { jsPDF } from 'jspdf'
import autoTable, { type CellDef, type RowInput } from 'jspdf-autotable'
import type { DatosExcel } from './explosion-excel'
import {
  agruparPorUnidad, COLOR_ESTADO, colorClasificacion, colorMarca, costoEstimado, estadoAlmacenDe, estadoPagoDe, etiquetaRev, faltanDe, LEYENDA, lineaConContenido,
  type EstadoAlmacen, type EstadoPago, type LineaRev, type Marca,
} from './explosion-revisiones'

/** Estado abreviado para la columna del PDF (la tabla es angosta) */
const CORTO_PDF: Record<EstadoPago | EstadoAlmacen, string> = {
  'PENDIENTE DE PAGO': 'Pend.', 'PARCIALMENTE PAGADO': 'Parcial', PAGADO: 'Pagado',
  'PENDIENTE DE RECIBIR': 'Por recibir', 'PARCIALMENTE RECIBIDO': 'Parcial', RECIBIDO: 'Recibido',
}

type RGB = [number, number, number]
const rgb = (hex: string): RGB => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const NEGRO: RGB = [17, 24, 39]
const GRIS: RGB = [100, 116, 139]
const LINEA: RGB = [203, 213, 225]
const BLANCO: RGB = [255, 255, 255]
const SECCION: RGB = [226, 232, 240]

const dinero = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cantidad = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 })
/** "2026-11-13" → "13/11/2026" */
const fechaCorta = (ymd: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

export interface DatosPdf extends DatosExcel {
  /** Órdenes de compra con importes (para el resumen de pagos) */
  ordenesPago?: { folio: string; proveedor: string; total: number | null; monto_pagado: number | null; fecha_pago: string | null }[]
}

export function crearPdfExplosion(d: DatosPdf): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.getWidth()
  const M = 10
  const enc = d.revision.encabezado
  const rev = etiquetaRev(d.revision.numero)

  /* ── Encabezado del formato ── */
  doc.setDrawColor(...NEGRO).setLineWidth(0.6).roundedRect(M, M, 34, 16, 2, 2)
  doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...GRIS).text('REVISIÓN', M + 17, M + 4.5, { align: 'center' })
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...NEGRO).text(rev, M + 17, M + 12.5, { align: 'center' })

  doc.setFont('helvetica', 'bold').setFontSize(14).text('GRUPO AVANT CIM, S.A. DE C.V.', ancho / 2, M + 6, { align: 'center' })
  doc.setFontSize(10).setTextColor(...GRIS).text('REPORTE DE EXPLOSIÓN DE MATERIALES', ancho / 2, M + 12, { align: 'center' })
  if (d.revision.estado === 'borrador') {
    doc.setFontSize(7.5).setTextColor(2, 132, 199).text(`${rev} EN BORRADOR`, ancho / 2, M + 16.5, { align: 'center' })
  }

  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...NEGRO).text('FECHA:', ancho - M - 34, M + 5)
  doc.setFont('helvetica', 'normal').text(fechaCorta(enc.fecha) || '—', ancho - M, M + 5, { align: 'right' })

  const dato = (etq: string, valor: string, x: number, y: number, grande = false) => {
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...GRIS).text(etq, x, y)
    doc.setFont('helvetica', 'bold').setFontSize(grande ? 11 : 8.5).setTextColor(...NEGRO).text(valor || '—', x + doc.getTextWidth(etq) + 2.5, y)
  }
  const yDatos = M + 24
  dato('CLIENTE:', enc.cliente, M, yDatos, true)
  dato('PROYECTO:', enc.proyecto, M, yDatos + 6)
  dato('PEDIDO:', enc.pedido, ancho - M - 62, yDatos, true)
  dato('ORDEN PRODUCCIÓN:', enc.orden_produccion, ancho - M - 62, yDatos + 6)
  doc.setDrawColor(...NEGRO).setLineWidth(0.5).line(M, yDatos + 9, ancho - M, yDatos + 9)

  /* ── Tabla de materiales ── */
  const lineas = d.revision.lineas.filter(lineaConContenido)
  const eliminadasPorUnidad = new Map<string, LineaRev[]>()
  for (const l of d.eliminadas) {
    const u = l.unidad.trim() || 'Pieza'
    eliminadasPorUnidad.set(u, [...(eliminadasPorUnidad.get(u) ?? []), l])
  }
  const grupos = agruparPorUnidad(lineas)
  for (const u of eliminadasPorUnidad.keys()) if (!grupos.some(g => g.unidad === u)) grupos.push({ unidad: u, lineas: [], totalCantidad: 0, totalCosto: 0 })

  // Almacén (sinCostos): sin las columnas Costo y Costo est.
  const sinCostos = !!d.sinCostos
  const COLS = sinCostos ? 15 : 17
  const sinColsCosto = <T,>(fila: T[]): T[] => (sinCostos ? fila.filter((_, i) => i !== 5 && i !== 7) : fila)
  const estadoCelda = (e: EstadoPago | EstadoAlmacen): CellDef => ({
    content: CORTO_PDF[e], styles: { fillColor: rgb(COLOR_ESTADO[e].fondo), textColor: rgb(COLOR_ESTADO[e].texto), fontStyle: 'bold', halign: 'center' },
  })
  const cuerpo: RowInput[] = []
  for (const g of grupos) {
    cuerpo.push([{ content: g.unidad, colSpan: COLS, styles: { fillColor: SECCION, fontStyle: 'bold', textColor: NEGRO } }])
    const filas: { l: LineaRev; marca: Marca | null; quitada: boolean }[] = [
      ...g.lineas.map(l => ({ l, marca: d.marcas[l.id] ?? null, quitada: false })),
      ...(eliminadasPorUnidad.get(g.unidad) ?? []).map(l => ({ l, marca: 'disminucion' as Marca, quitada: true })),
    ]
    for (const { l, marca, quitada } of filas) {
      const fondo = marca ? rgb(colorMarca(marca)) : undefined
      const texto: RGB = marca === 'disminucion' ? BLANCO : NEGRO
      const celda = (content: string, extra: Partial<CellDef['styles']> = {}): CellDef => ({
        content, styles: { ...(fondo ? { fillColor: fondo } : {}), textColor: texto, ...(quitada ? { fontStyle: 'italic' } : {}), ...extra },
      })
      cuerpo.push(sinColsCosto([
        celda(l.clave, { fontStyle: 'bold' }),
        celda(quitada ? `${l.descripcion} (QUITADO)` : l.descripcion),
        celda(l.unidad),
        { content: l.clasificacion, styles: { fillColor: rgb(colorClasificacion(l.clasificacion)), textColor: NEGRO, fontStyle: 'bold' } },
        celda(l.moneda),
        celda(dinero(Number(l.costo) || 0), { halign: 'right' }),
        celda(quitada ? '0' : cantidad(Number(l.cantidad) || 0), { halign: 'right', fontStyle: 'bold' }),
        celda(quitada ? '0.00' : dinero(costoEstimado(l)), { halign: 'right' }),
        // COMPRAS: orden de compra · fecha · check
        celda(quitada ? '' : l.oc || '', { halign: 'center' }),
        celda(quitada ? '' : fechaCorta(l.fecha_compra), { halign: 'center' }),
        celda(!quitada && l.comprado ? 'Sí' : '', { halign: 'center' }),
        // FINANZAS: estado (con su color) · fecha
        quitada ? celda('') : estadoCelda(estadoPagoDe(l)),
        celda(quitada ? '' : fechaCorta(l.fecha_estado_pago), { halign: 'center' }),
        // ALMACÉN: estado · recibido · faltan · fecha
        quitada ? celda('') : estadoCelda(estadoAlmacenDe(l)),
        celda(!quitada && l.cantidad_recibida != null ? cantidad(Number(l.cantidad_recibida)) : '', { halign: 'right' }),
        celda(quitada ? '' : cantidad(faltanDe(l)), { halign: 'right', ...(faltanDe(l) > 0 && !quitada ? { fontStyle: 'bold' } : {}) }),
        celda(quitada ? '' : fechaCorta(l.fecha_almacen), { halign: 'center' }),
      ]))
    }
    cuerpo.push(sinCostos ? [
      { content: `Totales ${g.unidad}:`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: cantidad(g.totalCantidad), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: '', colSpan: 9 },
    ] : [
      { content: `Totales ${g.unidad}:`, colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: cantidad(g.totalCantidad), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: dinero(g.totalCosto), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: '', colSpan: 9 },
    ])
  }

  autoTable(doc, {
    startY: yDatos + 12,
    margin: { left: M, right: M, bottom: 14 },
    head: [sinColsCosto(['Clave', 'Descripción', 'Unidad', 'Clasificación', 'Moneda', 'Costo', 'Cant. nec.', 'Costo est.', 'OC', 'F. compra', 'Check', 'Finanzas', 'F. pago', 'Almacén', 'Recibido', 'Faltan', 'F. almacén'])],
    body: cuerpo.length ? cuerpo : [[{ content: 'La hoja está vacía.', colSpan: COLS, styles: { halign: 'center', textColor: GRIS } }]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.3, cellPadding: 1.2, lineColor: LINEA, lineWidth: 0.15, textColor: NEGRO, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: NEGRO, textColor: BLANCO, fontStyle: 'bold', halign: 'center', fontSize: 6.3 },
    columnStyles: Object.fromEntries(sinColsCosto([16, 'auto', 10, 15, 14, 13, 13, 15, 12, 13, 8, 12, 13, 14, 12, 11, 13] as (number | 'auto')[]).map((w, i) => [i, { cellWidth: w }])),
    // Encabezado de la tabla repetido en cada página
    showHead: 'everyPage',
  })

  /* ── Pie: usuario, leyenda, cambios y pagos ── */
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  const alto = doc.internal.pageSize.getHeight()
  const asegurar = (necesario: number) => { if (y + necesario > alto - 14) { doc.addPage(); y = M + 6 } }

  asegurar(22)
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...NEGRO).text(`Usuario: ${enc.usuario || '—'}`, M, y)
  let x = M + 70
  for (const l of LEYENDA) {
    doc.setFillColor(...rgb(l.color)).setDrawColor(...LINEA).rect(x, y - 3, 5, 3.5, 'FD')
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRIS).text(l.texto, x + 6.5, y)
    x += doc.getTextWidth(l.texto) + 14
  }
  y += 6
  if (d.revision.motivo.trim()) {
    const lineasMotivo = doc.splitTextToSize(`Cambios en ${rev}: ${d.revision.motivo.trim()}`, ancho - 2 * M)
    asegurar(lineasMotivo.length * 4)
    doc.setFont('helvetica', 'italic').setFontSize(7.5).setTextColor(...NEGRO).text(lineasMotivo, M, y)
    y += lineasMotivo.length * 4 + 2
  }

  const ordenes = d.ordenesPago ?? []
  if (ordenes.length) {
    const total = ordenes.reduce((s, o) => s + (Number(o.total) || 0), 0)
    const pagado = ordenes.reduce((s, o) => s + Math.min(Number(o.monto_pagado) || 0, Number(o.total) || Infinity), 0)
    asegurar(20)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 14 },
      head: [['Orden de compra', 'Proveedor', 'Total', 'Pagado', 'Por pagar', 'Fecha de pago']],
      body: [
        ...ordenes.map(o => {
          const t = Number(o.total) || 0
          const p = Number(o.monto_pagado) || 0
          return [`OC ${o.folio}`, o.proveedor || '—', t ? dinero(t) : '—', dinero(p), t ? dinero(Math.max(0, t - p)) : '—', fechaCorta(o.fecha_pago) || '—']
        }),
        [
          { content: 'TOTAL', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: dinero(total), styles: { fontStyle: 'bold' } },
          { content: dinero(pagado), styles: { fontStyle: 'bold', textColor: [4, 120, 87] } },
          { content: dinero(Math.max(0, total - pagado)), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
          '',
        ],
      ],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.3, lineColor: LINEA, lineWidth: 0.15 },
      headStyles: { fillColor: [4, 120, 87], textColor: BLANCO, fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' } },
      tableWidth: 190,
    })
  }

  /* ── Número de página en todas ── */
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRIS)
    doc.text(`${d.referencia} · ${rev}`, M, alto - 6)
    doc.text(`Página ${i} de ${paginas}`, ancho - M, alto - 6, { align: 'right' })
  }

  return doc.output('arraybuffer')
}
