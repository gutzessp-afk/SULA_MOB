/**
 * /api/ver-plano/route.ts
 * ───────────────────────
 * El PDF de un plano, bajado de Google Drive al momento (no se guarda en ningún lado).
 *
 *   GET ?fileId=<id>             → el PDF para verlo en el navegador (visor del Catálogo)
 *   GET ?fileId=<id>&download=1  → el mismo PDF como descarga
 *
 * Solo sirve PDFs que están dentro de la carpeta PLANOS (src/lib/google-drive.ts):
 * no es una puerta a cualquier archivo del Drive. Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/ver-plano/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin } from '@/lib/admin-api'
import { descargarPDF, planoDrive } from '@/lib/google-drive'

export const maxDuration = 60

const MAX_BYTES = 4.5 * 1024 * 1024 // lo más que puede responder una función de Vercel

const escapar = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** El error como una página corta y legible: se ve dentro del visor (iframe) */
const error = (mensaje: string, status: number) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#171717;color:#e5e5e5;font:15px system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box"><p style="max-width:28rem">${escapar(mensaje)}</p></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )

export async function GET(request: NextRequest) {
  if (!(await esAdmin())) return error('Solo los administradores pueden ver los planos.', 403)

  const fileId = request.nextUrl.searchParams.get('fileId') ?? ''
  const descargar = request.nextUrl.searchParams.get('download') === '1'
  if (!/^[\w-]+$/.test(fileId)) return error('Falta el plano.', 400)

  try {
    const plano = await planoDrive(fileId)
    if (!plano) return error('Ese archivo no está en la carpeta PLANOS de Drive: puede que lo hayan movido o borrado.', 404)

    const bytes = await descargarPDF(fileId)
    if (bytes.byteLength > MAX_BYTES) return error('El PDF es demasiado pesado para mostrarlo aquí; ábrelo desde Drive.', 413)
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(plano.nombre)}`,
        // Corto: si alguien reemplaza el PDF, el visor muestra el nuevo pronto
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (err) {
    console.error('[ver-plano]', err)
    const mensaje = err instanceof Error ? err.message : ''
    if (/\(404\)/.test(mensaje)) return error('El PDF ya no está en Drive: puede que lo hayan movido o borrado.', 404)
    return error(mensaje || 'No se pudo bajar el plano de Drive.', 500)
  }
}
