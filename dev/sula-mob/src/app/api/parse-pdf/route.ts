/**
 * /api/parse-pdf/route.ts
 * ───────────────────────
 * API Route que recibe un PDF de pedido SULA por FormData,
 * extrae su texto con pdf-parse v2 (Node.js), y devuelve
 * los datos estructurados como JSON.
 *
 * INSTALACIÓN REQUERIDA:
 *   npm install pdf-parse @napi-rs/canvas
 *
 * RUTA DEL ARCHIVO: src/app/api/parse-pdf/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'

/* ═══════════════════════════════════════
   CANVAS POLYFILLS — pdf-parse v2 usa pdfjs
   que requiere DOMMatrix/ImageData/Path2D.
   @napi-rs/canvas los provee de forma nativa,
   pero si falla, usamos stubs mínimos ya que
   solo extraemos texto, no renderizamos.
   ═══════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

try {
  // Intenta cargar el polyfill nativo
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@napi-rs/canvas')
} catch {
  // Si no se puede cargar, usamos stubs mínimos
}

// Asegurarnos de que existen (por si @napi-rs/canvas no los puso)
if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(init?: any) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init
      }
    }
    isIdentity = true
    translate() { return new g.DOMMatrix() }
    scale() { return new g.DOMMatrix() }
    inverse() { return new g.DOMMatrix() }
    multiply() { return new g.DOMMatrix() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformPoint(p: any) { return p }
  }
}
if (typeof g.ImageData === 'undefined') {
  g.ImageData = class ImageData {
    width: number; height: number; data: Uint8ClampedArray
    constructor(sw: number | Uint8ClampedArray, sh?: number) {
      if (typeof sw === 'number') {
        this.width = sw; this.height = sh || 0
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      } else {
        this.data = sw; this.width = sh || 0; this.height = 0
      }
    }
  }
}
if (typeof g.Path2D === 'undefined') {
  g.Path2D = class Path2D {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moveTo(..._a: any[]) {} lineTo(..._a: any[]) {} bezierCurveTo(..._a: any[]) {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quadraticCurveTo(..._a: any[]) {} arc(..._a: any[]) {} closePath() {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rect(..._a: any[]) {} ellipse(..._a: any[]) {} addPath(..._a: any[]) {}
  }
}

/* ═══════════════════════════════════════
   Cargar pdf-parse DESPUÉS de los polyfills
   ═══════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfParseModule = require('pdf-parse') as any
const PDFParse = pdfParseModule.PDFParse as new (opts: { data: Uint8Array }) => {
  load: () => Promise<void>
  getText: () => Promise<{ text: string }>
}

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
}

/* ═══════════════════════════════════════
   UTILIDADES DE PARSEO
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
  }

  // ── Número de pedido ──
  const pedidoMatch = raw.match(/^(\d{4,6})\s/m)
  if (pedidoMatch) result.numero_pedido = pedidoMatch[1]

  // ── Cliente ──
  const clienteMatch = raw.match(/^\d{4,6}\n(.+)/m)
  if (clienteMatch) result.cliente = clienteMatch[1].trim()

  // ── Fecha (YYYY-MM-DD) ──
  const fechaMatch = raw.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/)
  if (fechaMatch) result.fecha = fechaMatch[1]

  // ── Fecha de entrega ──
  const entregaMatch = raw.match(/Fecha\s+de\s+Entrega:\s*\n?\s*(\d{4}-\d{2}-\d{2})/i)
  if (entregaMatch) result.fecha_entrega = entregaMatch[1]

  // ── Referencia / Sucursal ──
  const refMatch = raw.match(/Fecha\s+de\s+Entrega:\s*\n([^\n]+)\nReferencia/i)
  if (refMatch) {
    result.referencia_sucursal = refMatch[1].trim()
  } else {
    const fbRef = raw.match(/\n([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)\nReferencia\s*\/?\s*Sucursal:/i)
    if (fbRef) result.referencia_sucursal = fbRef[1].trim()
  }

  // ── Elaborado por ──
  const elabMatch = raw.match(/Elaborado\s+por:\s*\n\s*\*?\s*\n\s*(?:GRUPO\s+AVANT\s+CIM\s*\n\s*)?([^\n]+)/i)
  if (elabMatch) result.elaborado_por = elabMatch[1].trim()

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

  const partidaRegex = /^(Pieza|Juego|Metro|Kg|Litro|Servicio)\t(\d+(?:\.\d+)?)\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\t([\d][\d-]+-[\d-]+)\s+(.+)/i

  for (const line of mergedLines) {
    const match = line.match(partidaRegex)
    if (match) {
      result.partidas.push({
        cantidad: Math.round(parseFloat(match[2])),
        clave: match[3],
        unidad: match[1],
        descripcion: match[4].replace(/\s+/g, ' ').trim(),
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

    const parser = new PDFParse({ data: pdfBytes })
    await parser.load()
    const pdfResult = await parser.getText()
    const text = pdfResult.text

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