/**
 * matriz-corte-pdf.ts
 * ───────────────────
 * Escribe en PDF la Matriz de Corte de un plano (tamaño carta, horizontal):
 *   1. La matriz por subensamble, con columnas amarillas para producción.
 *   2. El resumen por área de producción, con casilla de hecho.
 *
 * Se genera en el navegador (jsPDF + autoTable); las librerías solo se
 * descargan cuando alguien pide el PDF. Los datos los arma
 * src/lib/matriz-corte.ts (el Excel usa los mismos).
 *
 * RUTA: src/lib/matriz-corte-pdf.ts
 */

import type { CellDef, RowInput } from 'jspdf-autotable'
import { colorArea, nombreArchivoMatriz, notasDe, type Matriz } from './matriz-corte'

type RGB = [number, number, number]
const rgb = (hex: string): RGB => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]

const AZUL_OSCURO = rgb('0F1729')
const AZUL = rgb('2563EB')
const GRIS_SECCION = rgb('334155')
const GRIS_TEXTO = rgb('64748B')
const AMARILLO = rgb('FEFCE8')
const LINEA = rgb('CBD5E1')
const BLANCO: RGB = [255, 255, 255]

const numero = (n: number | null) => (n === null ? '' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }))

export async function descargarMatrizPDF(m: Matriz) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const M = 10 // margen

  /** "ETIQUETA: valor" con la etiqueta en gris; devuelve dónde termina */
  const dato = (etiqueta: string, valor: string, x: number, y: number, maxAncho = 90) => {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS_TEXTO)
    doc.text(`${etiqueta}:`, x, y)
    const w = doc.getTextWidth(`${etiqueta}: `)
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(20, 20, 20)
    doc.text(doc.splitTextToSize(valor || '—', maxAncho - w)[0] as string, x + w, y)
  }

  /* ── Encabezado de la primera hoja ── */
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...AZUL)
  doc.text('S U L A', M, 15)
  doc.setFontSize(11).setTextColor(...GRIS_TEXTO)
  doc.text('M O B', M, 20.5)

  doc.setFontSize(17).setTextColor(15, 15, 15)
  doc.text('MATRIZ DE CORTE', 58, 15)
  doc.setFontSize(11).setTextColor(...AZUL)
  doc.text(doc.splitTextToSize(m.descripcion, 130)[0] as string, 58, 20.5)

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS_TEXTO)
  doc.text('MODELO:', ancho - M - 52, 14)
  doc.text('REVISIÓN:', ancho - M - 52, 19.5)
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(15, 15, 15)
  doc.text(m.modelo, ancho - M, 14, { align: 'right' })
  doc.setTextColor(220, 38, 38)
  doc.text(m.revision || '—', ancho - M, 19.5, { align: 'right' })

  doc.setDrawColor(...AZUL).setLineWidth(0.6).line(M, 24, ancho - M, 24)

  dato('CLIENTE', m.cliente, M, 29.5, 70)
  dato('ACABADO', m.acabado, 85, 29.5, 105)
  dato('FECHA', m.fecha, 195, 29.5, 40)
  dato('DIMENSIONES', m.dimensiones, M, 34.5, 70)
  dato('PEDIDO', m.proyecto, 85, 34.5, 50)
  dato('DIBUJO', m.dibujo, 140, 34.5, 50)

  // Total a producir, destacado
  doc.setFillColor(...AMARILLO).setDrawColor(...LINEA).setLineWidth(0.2)
  doc.roundedRect(ancho - M - 34, 26.5, 34, 9.5, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GRIS_TEXTO)
  doc.text('TOTAL A PRODUCIR', ancho - M - 32, 32.5)
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...AZUL)
  doc.text(String(m.total), ancho - M - 2.5, 33.6, { align: 'right' })

  /* ── Tabla principal ── */
  const cuerpo: RowInput[] = []
  for (const sec of m.secciones) {
    const estilo = { fillColor: GRIS_SECCION, textColor: BLANCO, fontStyle: 'bold' as const }
    cuerpo.push([
      { content: '', styles: estilo },
      { content: sec.nombre, styles: { ...estilo, fontSize: 8, halign: 'left' } },
      { content: sec.pagina !== null ? `Pág. ${sec.pagina}` : '', styles: { ...estilo, fontStyle: 'italic', textColor: LINEA, halign: 'left' } },
      { content: `×${sec.cantidad}`, styles: estilo },
      { content: '', colSpan: 8, styles: estilo },
    ])
    for (const f of sec.filas) {
      const color = colorArea(f.area)
      cuerpo.push([
        { content: String(f.n), styles: { textColor: GRIS_TEXTO, fontSize: 5.5 } },
        { content: f.descripcion, styles: { halign: 'left', textColor: [15, 15, 15] } },
        { content: f.material, styles: { halign: 'left', fontSize: 6, textColor: GRIS_SECCION } },
        String(f.cantidad),
        numero(f.largo),
        f.ancho,
        { content: notasDe(f), styles: { halign: 'left', fontSize: 6, textColor: GRIS_SECCION } },
        { content: f.pagina !== null ? String(f.pagina) : '', styles: { textColor: GRIS_TEXTO, fontSize: 6 } },
        { content: f.area, styles: { fillColor: rgb(color.claro), textColor: rgb(color.fuerte), fontStyle: 'bold', fontSize: 6 } },
        { content: String(f.total), styles: { textColor: AZUL, fontStyle: 'bold', fontSize: 8.5 } },
        { content: '', styles: { fillColor: AMARILLO } },
        { content: '', styles: { fillColor: AMARILLO } },
      ] as CellDef[])
    }
  }

  autoTable(doc, {
    startY: 39,
    margin: { left: M, right: M, top: 12, bottom: 12 },
    head: [['#', 'DESCRIPCIÓN', 'MATERIAL', 'CANT.', 'LARGO mm', 'ANCHO mm', 'NOTAS DE CORTE / BARRENOS', 'PÁG.', 'ÁREA', 'CANT.\nTOTAL', 'PZAS.\nPROCESADAS', 'FECHA']],
    body: cuerpo,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.1, halign: 'center', valign: 'middle', lineColor: LINEA, lineWidth: 0.15, textColor: [30, 30, 30], overflow: 'linebreak' },
    headStyles: { fillColor: AZUL_OSCURO, textColor: BLANCO, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 7 }, 1: { cellWidth: 40 }, 2: { cellWidth: 46 }, 3: { cellWidth: 11 }, 4: { cellWidth: 16 }, 5: { cellWidth: 16 },
      6: { cellWidth: 'auto' }, 7: { cellWidth: 9 }, 8: { cellWidth: 22 }, 9: { cellWidth: 14 }, 10: { cellWidth: 19 }, 11: { cellWidth: 16 },
    },
    rowPageBreak: 'avoid',
  })

  // Notas al pie de la matriz
  let y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 7
  if (y > alto - 28) { doc.addPage(); y = 18 }
  if (m.avisoPlano) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(185, 28, 28)
    doc.text(`! ${m.avisoPlano}`, M, y)
    y += 6
  }
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(15, 15, 15)
  doc.text('NOTAS:', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GRIS_SECCION)
  doc.text('• Las columnas PZAS. PROCESADAS y FECHA (amarillas) son para llenar en producción.', M, y + 4.5)
  doc.text('• CANT. TOTAL = cantidad por subensamble × subensambles por producto × total a producir.', M, y + 8.5)
  doc.setFont('helvetica', 'bold').setTextColor(...AZUL)
  doc.text(`• Total a producir: ${m.total} unidad(es) de ${m.descripcion} · ${m.resumen.componentes} componentes · ${m.resumen.piezas} piezas a fabricar.`, M, y + 12.5)

  /* ── Resumen por área ── */
  doc.addPage()
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...AZUL)
  doc.text('S U L A   M O B', M, 15)
  doc.setTextColor(15, 15, 15)
  doc.text('RESUMEN POR ÁREA DE PRODUCCIÓN', ancho - M, 15, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIS_SECCION)
  doc.text(`${m.modelo}  —  ${m.descripcion}  —  Total a producir: ${m.total}`, M, 20.5)

  // Tira de totales por área
  let x = M
  let yTira = 25
  for (const g of m.porArea) {
    const color = colorArea(g.area)
    const texto = `${g.area}: ${g.piezas} pzas.`
    doc.setFont('helvetica', 'bold').setFontSize(7)
    const w = doc.getTextWidth(texto) + 5
    if (x + w > ancho - M) { x = M; yTira += 7 }
    doc.setFillColor(...rgb(color.claro)).roundedRect(x, yTira, w, 5.5, 1.2, 1.2, 'F')
    doc.setTextColor(...rgb(color.fuerte)).text(texto, x + 2.5, yTira + 3.8)
    x += w + 2
  }

  let inicio = yTira + 10
  for (const g of m.porArea) {
    const color = colorArea(g.area)
    const fuerte = rgb(color.fuerte)
    const banda = { fillColor: fuerte, textColor: BLANCO, fontStyle: 'bold' as const }
    const sub = { fillColor: rgb(color.claro), textColor: fuerte, fontStyle: 'bold' as const, fontSize: 6.5 }
    autoTable(doc, {
      startY: inicio,
      margin: { left: M, right: M, top: 12, bottom: 12 },
      head: [
        [
          { content: g.area, colSpan: 6, styles: { ...banda, fontSize: 9.5, halign: 'left' } },
          { content: `${g.filas.length} componente(s)`, styles: { ...banda, fontSize: 7 } },
          { content: `${g.piezas} pzas.`, colSpan: 2, styles: { ...banda, fontSize: 9.5 } },
        ],
        ['DESCRIPCIÓN', 'MATERIAL', 'SUBENSAMBLE', 'CANT.', 'LARGO', 'ANCHO', 'NOTAS', 'TOTAL', 'HECHO'].map(t => ({ content: t, styles: sub })),
      ],
      body: g.filas.map(f => [
        { content: f.descripcion, styles: { halign: 'left', textColor: [15, 15, 15] } },
        { content: f.material, styles: { halign: 'left', fontSize: 6, textColor: GRIS_SECCION } },
        { content: f.subensamble, styles: { halign: 'left', fontSize: 6, textColor: GRIS_TEXTO } },
        String(f.cantidad),
        numero(f.largo),
        f.ancho,
        { content: notasDe(f), styles: { halign: 'left', fontSize: 6, textColor: GRIS_SECCION } },
        { content: String(f.total), styles: { textColor: AZUL, fontStyle: 'bold', fontSize: 8.5 } },
        { content: '', styles: { fillColor: AMARILLO } },
      ] as CellDef[]),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.1, halign: 'center', valign: 'middle', lineColor: LINEA, lineWidth: 0.15, textColor: [30, 30, 30], overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 44 }, 1: { cellWidth: 52 }, 2: { cellWidth: 40 }, 3: { cellWidth: 11 }, 4: { cellWidth: 16 }, 5: { cellWidth: 16 },
        6: { cellWidth: 'auto' }, 7: { cellWidth: 15 }, 8: { cellWidth: 14 },
      },
      rowPageBreak: 'avoid',
    })
    inicio = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6
    if (inicio > alto - 30) { doc.addPage(); inicio = 14 }
  }

  /* ── Pie de página en todas las hojas ── */
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GRIS_TEXTO)
    doc.text(`SULA MOB · Matriz de Corte · ${m.modelo} — ${m.descripcion}`, M, alto - 6)
    doc.text(`Página ${i} de ${paginas}`, ancho - M, alto - 6, { align: 'right' })
  }

  doc.save(`${nombreArchivoMatriz(m)}.pdf`)
}
