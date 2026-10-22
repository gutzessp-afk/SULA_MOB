/**
 * hash-archivo.ts
 * Huella SHA-256 de un archivo: dos PDF con la misma huella son el mismo archivo,
 * así un plano que ya se analizó no se vuelve a mandar a la IA. Solo en el servidor.
 *
 * RUTA: src/lib/hash-archivo.ts
 */

import { createHash } from 'node:crypto'

export function hashArchivo(contenido: Buffer | Uint8Array): string {
  return createHash('sha256').update(contenido).digest('hex')
}
