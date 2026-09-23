/**
 * parse-pedido.ts
 * ───────────────
 * Cliente que envía el PDF al API Route /api/parse-pdf
 * y recibe los datos estructurados del pedido.
 *
 * RUTA: src/lib/parse-pedido.ts
 */

/* ── Tipos ── */

/** Una línea/partida del pedido */
export interface Partida {
  cantidad: number
  clave: string
  unidad: string
  descripcion: string
}

/** Todos los datos extraídos del PDF */
export interface PedidoData {
  numero_pedido: string
  cliente: string
  fecha: string
  fecha_entrega: string
  referencia_sucursal: string
  elaborado_por: string
  partidas: Partida[]
}

/**
 * Envía el PDF al servidor para extraer los datos del pedido.
 *
 * ¿Qué hace?
 * 1. Empaqueta el archivo en un FormData
 * 2. Lo manda por POST a /api/parse-pdf
 * 3. El servidor usa pdf-parse para leer el texto del PDF
 * 4. Regresa un JSON con los datos estructurados (PedidoData)
 *
 * @param file — El archivo PDF que el usuario seleccionó
 * @returns Los datos del pedido ya parseados
 */
export async function parsePedidoPdf(file: File): Promise<PedidoData> {
  const formData = new FormData()
  formData.append('pdf', file)

  const res = await fetch('/api/parse-pdf', {
    method: 'POST',
    body: formData,
  })

  const json = await res.json()

  if (!res.ok) {
    throw new Error(json.error || 'Error al procesar el PDF en el servidor.')
  }

  return json as PedidoData
}