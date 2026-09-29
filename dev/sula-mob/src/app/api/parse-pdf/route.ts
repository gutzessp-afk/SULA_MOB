/**
 * /api/parse-pdf/route.ts
 * ───────────────────────
 * API Route que recibe un PDF de pedido SULA por FormData,
 * extrae su texto con pdf-parse v1 (compatible con Vercel serverless),
 * y devuelve los datos estructurados como JSON.
 *
 * RUTA DEL ARCHIVO: src/app/api/parse-pdf/route.ts
 *
 * ¿Por qué pdf-parse v1 y no pdfjs-dist directo?
 * pdfjs-dist v5 necesita un "worker" (.mjs separado) que
 * Vercel serverless no puede resolver. pdf-parse v1.1.1
 * trae su propio pdf.js integrado que funciona sin worker.
 * Es la librería más usada para extraer texto de PDFs en
 * Node.js — lleva años funcionando en serverless sin problemas.
 */

import { NextRequest, NextResponse } from 'next/server'

/* ═══════════════════════════════════════
   TIPOS (los mismos que en parse-pedido.ts)
   ═══════════════════════════════════════ */

interface Partida {
  cantidad: number
  clave: string
  unidad: string
  descripcion: string
}

interface PedidoData {
  numero_pedido: string
  cliente: string
  fecha: string
  fecha_entrega: string
  referencia_sucursal: string
  elaborado_por: string
  partidas: Partida[]
  _raw_text?: string
}

/* ═══════════════════════════════════════
   EXTRAER TEXTO DEL PDF con pdf-parse v1
   (sin worker — compatible con Vercel serverless)

   pdf-parse v1.1.1 trae su propio pdf.js integrado.
   No necesita workers, no necesita polyfills,
   no necesita configuración especial. Solo funciona.
   ═══════════════════════════════════════ */

async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<string> {
  // pdf-parse espera un Buffer, no un Uint8Array
  // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
  const data = await pdfParse(Buffer.from(pdfBytes))
  return data.text
}

/* ═══════════════════════════════════════
   UTILIDADES DE PARSEO
   (exactamente la misma lógica de siempre)
   ═══════════════════════════════════════ */

function parseText(raw: string): PedidoData {
  const result: PedidoData = {
    numero_pedido: '',
    cliente: '',
    fecha: '',
    fecha_entrega: '',
    referencia_sucursal: '',
    elaborado_por: '',
    partidas: [],
    _raw_text: raw,
  }

  // ── Número de pedido ──
  const pedidoMatch = raw.match(/^(\d{4,6})\s/m)
  if (pedidoMatch) result.numero_pedido = pedidoMatch[1]
  if (!result.numero_pedido) {
    const p2 = raw.match(/(?:No\.?\s*)?Pedido:?\s*(\d{4,6})/i)
    if (p2) result.numero_pedido = p2[1]
  }

  // ── Cliente ──
  const clienteMatch = raw.match(/^\d{4,6}\n(.+)/m)
  if (clienteMatch) result.cliente = clienteMatch[1].trim()
  if (!result.cliente) {
    const c2 = raw.match(/Cliente:?\s*\n?\s*([A-ZÁÉÍÓÚÑ][^\n]{2,})/i)
    if (c2) result.cliente = c2[1].trim()
  }

  // ── Fecha ──
  const fechaMatch = raw.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/)
  if (fechaMatch) result.fecha = fechaMatch[1]
  if (!result.fecha) {
    const f2 = raw.match(/(\d{4}-\d{2}-\d{2})/)
    if (f2) result.fecha = f2[1]
  }
  if (!result.fecha) {
    const f3 = raw.match(/Fecha:?\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (f3) result.fecha = f3[1]
  }

  // ── Fecha de entrega ──
  const entregaMatch = raw.match(/Fecha\s+de\s+Entrega:?\s*\n?\s*(\d{4}-\d{2}-\d{2})/i)
  if (entregaMatch) result.fecha_entrega = entregaMatch[1]
  if (!result.fecha_entrega) {
    const e2 = raw.match(/Fecha\s+de\s+Entrega:?\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (e2) result.fecha_entrega = e2[1]
  }
  if (!result.fecha_entrega) {
    const e3 = raw.match(/Entrega:?\s*\n?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i)
    if (e3) result.fecha_entrega = e3[1]
  }
  if (!result.fecha_entrega && result.fecha) {
    const allDates = raw.match(/\d{4}-\d{2}-\d{2}/g)
    if (allDates && allDates.length >= 2) {
      const secondDate = allDates.find(d => d !== result.fecha)
      if (secondDate) result.fecha_entrega = secondDate
    }
  }

  // ── Referencia / Sucursal ──
  const refMatch = raw.match(/Fecha\s+de\s+Entrega:?\s*\n([^\n]+)\nReferencia/i)
  if (refMatch) {
    result.referencia_sucursal = refMatch[1].trim()
  }
  if (!result.referencia_sucursal) {
    const fbRef = raw.match(/\n([A-ZÁÉÍÓÚÑ&][A-ZÁÉÍÓÚÑ&\s]*)\nReferencia\s*\/?\s*Sucursal:?/i)
    if (fbRef) result.referencia_sucursal = fbRef[1].trim()
  }
  if (!result.referencia_sucursal) {
    const r3 = raw.match(/Referencia\s*\/?\s*Sucursal:?\s*\n?\s*([^\n]+)/i)
    if (r3 && !/Fecha|Elaborado|Pedido|Subtotal/i.test(r3[1])) {
      result.referencia_sucursal = r3[1].trim()
    }
  }
  if (!result.referencia_sucursal) {
    const r4 = raw.match(/Referencia:?\s*\n?\s*([A-ZÁÉÍÓÚÑ&][^\n]{1,})/i)
    if (r4 && !/Fecha|Elaborado|Pedido|Subtotal/i.test(r4[1])) {
      result.referencia_sucursal = r4[1].trim()
    }
  }

  // ── Elaborado por ──
  const elabMatch = raw.match(/Elaborado\s+por:?\s*\n\s*\*?\s*\n\s*(?:GRUPO\s+AVANT\s+CIM\s*\n\s*)?([^\n]+)/i)
  if (elabMatch) result.elaborado_por = elabMatch[1].trim()
  if (!result.elaborado_por) {
    const el2 = raw.match(/Elaborado\s+por:?\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][^\n]{2,})/i)
    if (el2) result.elaborado_por = el2[1].trim()
  }
  if (!result.elaborado_por) {
    const el3 = raw.match(/Elaborado\s+por:?\s*\n(?:[^\n]*\n){0,4}?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4})/i)
    if (el3) result.elaborado_por = el3[1].trim()
  }

  // ── Partidas (tabla de items) ──
  const cleanedRaw = raw
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, '\n@@PAGE_BREAK@@\n')

  const lines = cleanedRaw.split('\n')
  const mergedLines: string[] = []
  let inPageHeader = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed === '@@PAGE_BREAK@@') {
      inPageHeader = true
      continue
    }

    if (/^(Pieza|Juego|Metro|Kg|Litro|Servicio)\t/i.test(trimmed)) {
      inPageHeader = false
      mergedLines.push(trimmed)
    } else if (/^[\d,]+\.\d{2}\s/.test(trimmed) && /\b(Pieza|Juego|Metro|Kg|Litro|Servicio)\b/i.test(trimmed) && /\d[\d-]+-[\d-]+/.test(trimmed)) {
      inPageHeader = false
      mergedLines.push(trimmed)
    } else if (inPageHeader) {
      continue
    } else if (
      mergedLines.length > 0 &&
      /^[A-ZÁÉÍÓÚÑ0-9]/.test(trimmed) &&
      !/^\d{4}$/.test(trimmed) &&
      !/^[\d,]+\.\d{2}\s/.test(trimmed) &&
      !/^(WATTS|Dolores|Ciudad|GRUPO|NOVENTA|Elaborado|Fecha|Referencia|Subtotal|IVA|Total|Descuento|Pedido|Moneda|Condici)/i.test(trimmed) &&
      !/^\d{4}-\d{2}-\d{2}/.test(trimmed) &&
      !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(trimmed) &&
      !/^VENTO$|^SUCURSAL$/i.test(trimmed) &&
      !/^\*$/.test(trimmed)
    ) {
      mergedLines[mergedLines.length - 1] += ' ' + trimmed
    }
  }

  const partidaRegex1 = /^(Pieza|Juego|Metro|Kg|Litro|Servicio)\t([\d,]+(?:\.\d+)?)\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\t([\d][\d-]+-[\d-]+)\s+(.+)/i
  const partidaRegex2 = /^([\d,]+(?:\.\d+)?)\s+([\d][\d-]+-[\d-]+)\s+(Pieza|Juego|Metro|Kg|Litro|Servicio)\s+(.+?)\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}$/i

  for (const line of mergedLines) {
    const m1 = line.match(partidaRegex1)
    if (m1) {
      result.partidas.push({
        cantidad: Math.round(parseFloat(m1[2].replace(/,/g, ''))),
        clave: m1[3],
        unidad: m1[1],
        descripcion: m1[4].replace(/\s+/g, ' ').trim(),
      })
      continue
    }
    const m2 = line.match(partidaRegex2)
    if (m2) {
      result.partidas.push({
        cantidad: Math.round(parseFloat(m2[1].replace(/,/g, ''))),
        clave: m2[2],
        unidad: m2[3],
        descripcion: m2[4].replace(/\s+/g, ' ').trim(),
      })
    }
  }

  return result
}

/* ═══════════════════════════════════════
   HANDLER POST
   ═══════════════════════════════════════ */

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('pdf')

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No se recibió un archivo PDF.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const pdfBytes = new Uint8Array(arrayBuffer)

    // Extraer texto usando pdfjs-dist directo (sin worker)
    const text = await extractTextFromPdf(pdfBytes)

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'No se pudo extraer texto del PDF. Verifica que no sea una imagen escaneada.' },
        { status: 422 }
      )
    }

    const pedido = parseText(text)

    if (!pedido.numero_pedido && !pedido.cliente) {
      return NextResponse.json(
        { error: 'No se reconoció el formato del pedido. Sube un PDF de pedido SULA válido.' },
        { status: 422 }
      )
    }

    return NextResponse.json(pedido)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Error parseando PDF:', msg, err)
    return NextResponse.json(
      { error: `Error al procesar el PDF: ${msg}` },
      { status: 500 }
    )
  }
}