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
 *   Subtotal / IVA / Total → importes de la OC (para "pagado / por pagar")
 *
 * pdf-parse pega las columnas sin espacios ("1.0000Litro1-03-0243SELLADOR…"), así que cada partida
 * se reconoce por el patrón cantidad + unidad + CLAVE (d-dd-dddd). La Clave es la misma que usa la
 * explosión, por eso el cruce es exacto (no hay que adivinar por descripción).
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
  subtotal: number | null
  iva: number | null
  /** Total a pagar de la OC (si no viene, subtotal + IVA − retenciones) */
  total: number | null
}

/** Primer importe después de una etiqueta: "Subtotal6,368.7100" → 6368.71 */
function importeDe(texto: string, etiqueta: RegExp): number | null {
  const m = new RegExp(etiqueta.source + String.raw`\s*:?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?)`, 'i').exec(texto)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
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

  // Referencia (= número de pedido). Normal: "REFERENCIA: 3531". En el PDF original de Click Balance
  // pdf-parse la pega al revés: "3531REFERENCIA:" seguido de "0.0000" (que NO es la referencia)
  const referencia =
    /REFERENCIA\s*:?\s*([A-Z0-9-]{1,20})(?![.,\d])/i.exec(limpio)?.[1] ??
    /(\d{2,10})\s*REFERENCIA\s*:/i.exec(limpio)?.[1] ??
    ''
  // Fecha: junto a "Fecha" o, si las etiquetas vienen apiladas, la primera fecha AAAA-MM-DD del documento
  const fecha =
    /Fecha\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(limpio)?.[1] ??
    /\b(\d{4}-\d{2}-\d{2})\b/.exec(limpio)?.[1] ??
    ''

  // Proveedor: el renglón de abajo del encabezado "Proveedor"; se le quita el nombre de la empresa
  // que pdf-parse pega de la columna "Facturar a"
  const lineas = limpio.split('\n').map(l => l.trim())
  const empresa = lineas.find(l => l.length > 3) ?? ''
  const iProv = lineas.findIndex(l => /proveedor/i.test(l))
  // (se brincan los encabezados que pdf-parse a veces pone en medio, como "Facturar a")
  let proveedor = iProv >= 0 ? lineas.slice(iProv + 1).find(l => l.length > 2 && !/^facturar\s*a\b|^para\b/i.test(l)) ?? '' : ''
  if (empresa && proveedor.toLowerCase().endsWith(empresa.toLowerCase())) proveedor = proveedor.slice(0, -empresa.length)
  proveedor = proveedor.trim().slice(0, 120)

  // Partidas: desde "Detalle de la Compra" hasta "TOTAL" / "Subtotal"
  const ini = limpio.search(/Detalle\s*de\s*la\s*Compra/i)
  const cuerpo = ini >= 0 ? limpio.slice(ini) : limpio
  const fin = cuerpo.search(/TOTAL\s*CON\s*LETRA|Subtotal/i)
  const detalle = (fin > 0 ? cuerpo.slice(0, fin) : cuerpo).replace(/\n/g, ' ')

  // Dos acomodos de columnas, según cómo pdf-parse lea el PDF:
  //  A) "1.0000 Litro 1-03-0243 SELLADOR…"            (cantidad, unidad, clave)
  //  B) "Litro483.79361.00003,023.71001-03-0243"       (unidad, IVA, cantidad, precio, clave, todo pegado)
  //     Así sale el PDF original de Click Balance (OC 5621). Los números traen siempre 4 decimales,
  //     por eso se pueden separar aunque vengan pegados.
  const N = String.raw`\d{1,3}(?:,\d{3})*\.\d{4}`
  const patronA = /(\d{1,3}(?:,\d{3})*\.\d{1,4})\s*([A-Za-zÁÉÍÓÚáéíóúÑñ.]{1,15})\s*(\d-\d{2}-\d{4})(?!\d)/g
  const patronB = new RegExp(String.raw`([A-Za-zÁÉÍÓÚáéíóúÑñ.]{1,15})\s*(${N})\s*(${N})\s*(${N})\s*(\d-\d{2}-\d{4})(?!\d)`, 'g')

  const enB = [...detalle.matchAll(patronB)]
  const enA = enB.length ? [] : [...detalle.matchAll(patronA)]
  const encontrados = enB.length
    ? enB.map(m => ({ index: m.index ?? 0, largo: m[0].length, cantidad: m[3], unidad: m[1], clave: m[5], iva: m[2], precio: m[4] }))
    : enA.map(m => ({ index: m.index ?? 0, largo: m[0].length, cantidad: m[1], unidad: m[2], clave: m[3], iva: '', precio: '' }))

  const num = (t: string) => Number(t.replace(/,/g, '')) || 0
  let sumaSubtotal = 0
  let sumaIva = 0
  const partidas: PartidaOC[] = encontrados.map((m, i) => {
    const inicioDesc = m.index + m.largo
    const finDesc = encontrados[i + 1]?.index ?? detalle.length
    let descripcion = detalle.slice(inicioDesc, finDesc)
    if (enB.length) {
      // B: después de la clave viene el importe y luego la descripción
      descripcion = descripcion.replace(new RegExp(String.raw`^\s*${N}`), '')
      sumaSubtotal += num(m.precio) * num(m.cantidad)
      sumaIva += num(m.iva)
    } else {
      const precio = NUM4.exec(descripcion)
      if (precio) descripcion = descripcion.slice(0, precio.index)
    }
    return {
      clave: m.clave,
      descripcion: descripcion.replace(/\s+/g, ' ').trim().slice(0, 300),
      cantidad: Number(m.cantidad.replace(/,/g, '')) || 0,
      unidad: m.unidad,
    }
  })
  if (!partidas.length)
    throw new Error(`Leí la OC ${folio} pero no encontré partidas con clave (ej. 1-03-0243).`)

  // Importes: "Subtotal", "IVA", "Retención ISR/IVA" y "Total" (que no sea "TOTAL CON LETRA" ni "Subtotal")
  const subtotal = importeDe(limpio, /Subtotal/)
  const iva = importeDe(limpio, /(?<![A-Za-z])I\.?V\.?A\.?(?!\s*Ret)/)
  const retenciones = [importeDe(limpio, /Retenci[oó]n\s*ISR/), importeDe(limpio, /Retenci[oó]n\s*IVA/)].reduce<number>((s, n) => s + (n ?? 0), 0)
  let total = importeDe(limpio, /(?<![A-Za-z])Total(?!\s*CON)(?:\s*a\s*pagar)?/)
  if (total === null && subtotal !== null) total = Math.round((subtotal + (iva ?? 0) - retenciones) * 100) / 100

  // Acomodo B: las etiquetas de importes vienen apiladas y no se puede saber qué número es de cuál.
  // Se calculan de las partidas (precio × cantidad e IVA de cada renglón), que sí vienen completos.
  if (enB.length) {
    const r2 = (n: number) => Math.round(n * 100) / 100
    return { folio, referencia, proveedor, fecha, partidas, subtotal: r2(sumaSubtotal), iva: r2(sumaIva), total: r2(sumaSubtotal + sumaIva - retenciones) }
  }

  return { folio, referencia, proveedor, fecha, partidas, subtotal, iva, total }
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
