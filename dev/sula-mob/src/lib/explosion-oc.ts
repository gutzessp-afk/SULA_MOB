/**
 * explosion-oc.ts
 * ───────────────
 * Lee el PDF de ORDEN DE COMPRA de SULA (el que genera su sistema de compras) y ayuda a escribir
 * el folio en la columna OC de la hoja de explosión. Solo servidor (usa pdf-parse).
 *
 * Lo que se saca del PDF:
 *   NÚMERO 5621            → folio de la OC (lo que va en la columna OC)
 *   REFERENCIA: 3531       → número de pedido (se valida contra el pedido de la explosión)
 *   Proveedor / Fecha      → informativos
 *   Detalle de la Compra   → partidas: Cantidad · Unidad · Clave · Descripción
 *
 * pdf-parse pega las columnas sin espacios, y el orden depende de cómo se generó el PDF:
 *   · OC real de SULA:  "Litro483.79361.00003,023.71001-03-0243" = unidad + IVA + cantidad + precio
 *                       + CLAVE, luego el importe y la descripción en los renglones siguientes;
 *                       "3531REFERENCIA:" (el número va antes de la etiqueta).
 *   · Otro formato:     "1.0000Litro1-03-0243SELLADOR…" = cantidad + unidad + CLAVE + descripción.
 * Se prueba primero el de la OC real y si no hay partidas, el otro. La Clave (d-dd-dddd) es la misma
 * que usa la explosión, por eso el cruce es exacto (no hay que adivinar por descripción).
 *
 * RUTA: src/lib/explosion-oc.ts
 */

import { normalizar } from './explosion-revisiones'

export interface PartidaOC {
  clave: string
  descripcion: string
  cantidad: number
  unidad: string
  /** true si la clave está en la hoja de explosión */
  encontrada?: boolean
}

export interface OrdenCompraLeida {
  folio: string
  referencia: string
  proveedor: string
  fecha: string
  partidas: PartidaOC[]
}

/* Polyfills que pdf.js pide al cargarse en Node (igual que /api/parse-pdf) */
function prepararNode() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any
  if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = class DOMMatrix {}
  if (typeof g.Path2D === 'undefined') g.Path2D = class Path2D {}
  if (typeof g.ImageData === 'undefined') g.ImageData = class ImageData {}
}

/** Texto del PDF con pdf-parse (v1 o v2, la que esté instalada) */
export async function textoDePdf(bytes: Uint8Array): Promise<string> {
  prepararNode()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  if (typeof pdfParse !== 'function' && typeof pdfParse.PDFParse === 'function') {
    const parser = new pdfParse.PDFParse({ data: bytes })
    try {
      return (await parser.getText()).text as string
    } finally {
      await parser.destroy()
    }
  }
  const data = await pdfParse(Buffer.from(bytes))
  return data.text as string
}

/** Número de 4 decimales como los de la OC ("3,023.7100") */
const NUM4 = /\d{1,3}(?:,\d{3})*\.\d{4}/

/** Descripción entre el final de una partida y el inicio de la siguiente, sin importes */
function descripcionEntre(detalle: string, desde: number, hasta: number): string {
  return detalle.slice(desde, hasta)
    .replace(/\d{1,3}(?:,\d{3})*\.\d{4}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

/** OC real de SULA: unidad + IVA + cantidad + precio + CLAVE, y la descripción después */
function partidasOcReal(detalle: string): PartidaOC[] {
  const n = '(\\d{1,3}(?:,\\d{3})*\\.\\d{4})'
  const patron = new RegExp(`([A-Za-zÁÉÍÓÚáéíóúÑñ.]{1,15})\\s*${n}\\s*${n}\\s*${n}\\s*(\\d-\\d{2}-\\d{4})(?!\\d)`, 'g')
  const encontrados = [...detalle.matchAll(patron)]
  return encontrados.map((m, i) => ({
    clave: m[5],
    descripcion: descripcionEntre(detalle, (m.index ?? 0) + m[0].length, encontrados[i + 1]?.index ?? detalle.length),
    cantidad: Number(m[3].replace(/,/g, '')) || 0,
    unidad: m[1],
  }))
}

/** Otro formato: cantidad + unidad + CLAVE + descripción (luego precio e importes) */
function partidasCantidadPrimero(detalle: string): PartidaOC[] {
  const patron = /(\d{1,3}(?:,\d{3})*\.\d{1,4})\s*([A-Za-zÁÉÍÓÚáéíóúÑñ.]{1,15})\s*(\d-\d{2}-\d{4})(?!\d)/g
  const encontrados = [...detalle.matchAll(patron)]
  return encontrados.map((m, i) => {
    const inicioDesc = (m.index ?? 0) + m[0].length
    const finDesc = encontrados[i + 1]?.index ?? detalle.length
    let descripcion = detalle.slice(inicioDesc, finDesc)
    const precio = NUM4.exec(descripcion)
    if (precio) descripcion = descripcion.slice(0, precio.index)
    return {
      clave: m[3],
      descripcion: descripcion.replace(/\s+/g, ' ').trim().slice(0, 300),
      cantidad: Number(m[1].replace(/,/g, '')) || 0,
      unidad: m[2],
    }
  })
}

/** Saca folio, referencia, proveedor, fecha y partidas del texto. Lanza Error si no parece una OC. */
export function leerOrdenCompra(texto: string, nombreArchivo = ''): OrdenCompraLeida {
  const limpio = texto.replace(/\r/g, '')
  if (limpio.replace(/\s/g, '').length < 40)
    throw new Error('El PDF casi no tiene texto (¿es un escaneo?). Sube el PDF original de la orden de compra.')
  if (!/ORDEN\s*DE\s*COMPRA/i.test(limpio) && !/Detalle\s*de\s*la\s*Compra/i.test(limpio))
    throw new Error('Este PDF no parece una orden de compra (no dice "ORDEN DE COMPRA").')

  // Folio: el número debajo de "NÚMERO"
  const folio =
    /N[ÚU]MERO\s*[:#]?\s*(\d{2,10})/i.exec(limpio)?.[1] ??
    /ORDEN\s*DE\s*COMPRA\s*[:#N°o.\s-]*(\d{2,10})/i.exec(limpio)?.[1] ??
    /(\d{3,10})/.exec(nombreArchivo)?.[1] ??
    ''
  if (!folio) throw new Error('No encontré el folio (NÚMERO) de la orden de compra.')

  // "REFERENCIA: 3531" (mismo renglón, que no sea un importe como 0.0000) o "3531REFERENCIA:"
  const referencia =
    /REFERENCIA[ \t]*:?[ \t]*([A-Z0-9-]{2,20})(?![.,]\d)/i.exec(limpio)?.[1] ??
    /([A-Z0-9-]{2,20})[ \t]*REFERENCIA\s*:/i.exec(limpio)?.[1] ??
    ''
  const fecha =
    /Fecha\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(limpio)?.[1] ??
    /(\d{4}-\d{2}-\d{2})/.exec(limpio)?.[1] ??
    ''

  // Proveedor: el renglón de abajo del encabezado "Proveedor"; se le quita el nombre de la empresa
  // que pdf-parse pega de la columna "Facturar a"
  const lineas = limpio.split('\n').map(l => l.trim())
  const empresa = lineas.find(l => l.length > 3) ?? ''
  const iProv = lineas.findIndex(l => /proveedor/i.test(l))
  // (se saltan las etiquetas de la otra columna, como "Facturar a")
  let proveedor = iProv >= 0 ? lineas.slice(iProv + 1).find(l => l.length > 2 && !/^facturar\s*a:?$/i.test(l)) ?? '' : ''
  if (empresa && proveedor.toLowerCase().endsWith(empresa.toLowerCase())) proveedor = proveedor.slice(0, -empresa.length)
  proveedor = proveedor.trim().slice(0, 120)

  // Partidas: desde "Detalle de la Compra" hasta "TOTAL" / "Subtotal"
  const ini = limpio.search(/Detalle\s*de\s*la\s*Compra/i)
  const cuerpo = ini >= 0 ? limpio.slice(ini) : limpio
  const fin = cuerpo.search(/TOTAL\s*CON\s*LETRA|Subtotal/i)
  const detalle = (fin > 0 ? cuerpo.slice(0, fin) : cuerpo).replace(/\n/g, ' ')

  const partidas = partidasOcReal(detalle)
  if (!partidas.length) partidas.push(...partidasCantidadPrimero(detalle))
  if (!partidas.length)
    throw new Error(`Leí la OC ${folio} pero no encontré partidas con clave (ej. 1-03-0243).`)

  return { folio, referencia, proveedor, fecha, partidas }
}

/** Solo los dígitos, sin ceros a la izquierda: "PED-0002" → "2", "3531" → "3531" */
export const soloNumero = (t: string) => String(t ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')

/* ── Columna OC: lista de folios separados por coma ── */

export const foliosDe = (oc: string) => String(oc ?? '').split(/[,;/]+/).map(f => f.trim()).filter(Boolean)

/** Agrega un folio a la columna OC sin repetirlo */
export function agregarFolio(oc: string, folio: string): string {
  const lista = foliosDe(oc)
  if (!lista.some(f => normalizar(f) === normalizar(folio))) lista.push(folio)
  return lista.join(', ')
}

/** Quita un folio de la columna OC */
export function quitarFolio(oc: string, folio: string): string {
  return foliosDe(oc).filter(f => normalizar(f) !== normalizar(folio)).join(', ')
}
