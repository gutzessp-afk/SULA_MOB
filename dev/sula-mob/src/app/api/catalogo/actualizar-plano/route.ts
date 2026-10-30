/**
 * /api/catalogo/actualizar-plano/route.ts
 * ───────────────────────────────────────
 * Reemplaza en Google Drive el PDF de un plano (arrastrar y soltar en el Catálogo).
 * Es el mismo archivo con contenido nuevo: conserva su nombre, su carpeta y su id,
 * y Drive guarda la versión anterior en su historial.
 *
 *   POST FormData { fileId, archivo (PDF) } → { ok }
 *
 * El despiece no se toca aquí: después la página manda el PDF nuevo a /api/analizar-plano
 * para sacar el BOM actualizado y su Matriz de Corte.
 * La cuenta de servicio tiene que ser Editor de la carpeta PLANOS. Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/catalogo/actualizar-plano/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin } from '@/lib/admin-api'
import { claveDeNombre, esPdf, planoDrive, reemplazarArchivo } from '@/lib/google-drive'
import { registrarActividad, obtenerUsuarioDeSesion } from '@/lib/registrar-actividad'

export const maxDuration = 60

/** Lo más que puede recibir una función de Vercel */
const MAX_BYTES = 4.4 * 1024 * 1024

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo los administradores pueden actualizar planos.' }, { status: 403 })

  const form = await request.formData().catch(() => null)
  const fileId = (form?.get('fileId') as string | null) ?? ''
  const archivo = form?.get('archivo')
  if (!/^[\w-]+$/.test(fileId) || !(archivo instanceof File)) return NextResponse.json({ error: 'Faltan el plano o el archivo.' }, { status: 400 })
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'El PDF pesa más de 4.4 MB; redúcelo antes de subirlo.' }, { status: 413 })

  const bytes = await archivo.arrayBuffer()
  if (!esPdf(bytes)) return NextResponse.json({ error: 'El archivo no es un PDF.' }, { status: 400 })

  try {
    const plano = await planoDrive(fileId)
    if (!plano) return NextResponse.json({ error: 'Ese plano ya no está en la carpeta PLANOS de Drive.' }, { status: 404 })
    await reemplazarArchivo(fileId, bytes)

    const usuario = await obtenerUsuarioDeSesion()
    const clave = claveDeNombre(plano.nombre)
    await registrarActividad({
      tipo: 'plano_actualizado',
      usuarioId: usuario.id,
      usuarioNombre: usuario.nombre,
      referenciaId: clave ?? undefined,
      referenciaTipo: 'plano',
      detalle: { clave, archivo: plano.nombre, archivo_subido: archivo.name, bytes: archivo.size },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[actualizar-plano]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo actualizar el plano.' }, { status: 500 })
  }
}
