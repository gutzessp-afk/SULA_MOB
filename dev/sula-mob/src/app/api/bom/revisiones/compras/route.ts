/**
 * /api/bom/revisiones/compras/route.ts
 * ────────────────────────────────────
 * Compras de la hoja de explosión: columnas OC y Compra, y los PDF de órdenes de compra.
 *
 *   GET    ?explosion_id=UUID                              → { ordenes } OC subidas (tabla bom_ordenes_compra)
 *   POST   multipart { explosion_id, archivo (PDF), forzar? }
 *          → lee la OC (folio, REFERENCIA = pedido, partidas) y escribe el folio en la columna OC
 *            de cada material cuya Clave aparece en la orden. Si la REFERENCIA no coincide con el
 *            pedido, responde 409 { confirmar: true } y la página pregunta; con forzar=1 se aplica.
 *   PATCH  { explosion_id, linea_id, oc?, comprado?, fecha_compra?, almacen?, fecha_almacen? }
 *          → edición a mano de OC, Compra, Almacén y sus fechas (fecha: 'AAAA-MM-DD' o '' para borrarla)
 *   DELETE ?explosion_id=UUID&folio=5621                    → quita esa OC: borra su registro y su folio
 *
 * OC y Compra NO abren revisión nueva (son de compras, no de la explosión) y se pueden editar aunque
 * la explosión ya esté terminada. Siempre se escriben en la ÚLTIMA revisión; al abrir una revisión
 * nueva se copian solos.
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/revisiones/compras/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { obtenerUsuarioDeSesion } from '@/lib/registrar-actividad'
import { errorJson, leerExplosion, lineaEnRevision, ultimaRevision, type Supabase } from '@/lib/explosion-servidor'
import { agregarFolio, leerOrdenCompra, quitarFolio, soloNumero, textoDePdf } from '@/lib/explosion-oc'
import { normalizar } from '@/lib/explosion-revisiones'

const MAX_BYTES = 10 * 1024 * 1024

/** Líneas de la última revisión (id, clave, oc) */
async function lineasActuales(supabase: Supabase, revisionId: string) {
  const { data, error } = await supabase.from('bom_revision_lineas').select('id, clave, oc').eq('revision_id', revisionId)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function GET(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const explosionId = request.nextUrl.searchParams.get('explosion_id')
  if (!explosionId) return errorJson('Falta explosion_id.', 400)
  const { data, error } = await supabaseServidor()
    .from('bom_ordenes_compra')
    .select('*')
    .eq('explosion_id', explosionId)
    .order('created_at', { ascending: true })
  if (error) return errorJson(error.message, 500)
  return NextResponse.json({ ordenes: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const form = await request.formData().catch(() => null)
  const explosionId = form?.get('explosion_id')
  const archivo = form?.get('archivo')
  const forzar = form?.get('forzar') === '1'
  if (typeof explosionId !== 'string' || !explosionId) return errorJson('Falta explosion_id.', 400)
  if (!(archivo instanceof File)) return errorJson('Falta el archivo.', 400)
  if (!/\.pdf$/i.test(archivo.name)) return errorJson('La orden de compra debe ser PDF.', 400)
  if (archivo.size > MAX_BYTES) return errorJson('El PDF pesa más de 10 MB.', 400)

  const supabase = supabaseServidor()
  const explosion = await leerExplosion(supabase, explosionId)
  if (!explosion) return errorJson('Explosión no encontrada.', 404)
  const revision = await ultimaRevision(supabase, explosionId)
  if (!revision) return errorJson('Primero sube la explosión (Excel) y después las órdenes de compra.', 400)

  /* ── 1. Leer el PDF ── */
  let orden
  try {
    orden = leerOrdenCompra(await textoDePdf(new Uint8Array(await archivo.arrayBuffer())), archivo.name)
  } catch (e) {
    return errorJson(`${archivo.name}: ${e instanceof Error ? e.message : 'no se pudo leer el PDF.'}`, 400)
  }

  /* ── 2. ¿La OC es de este pedido? (REFERENCIA vs pedido de la explosión) ── */
  const { data: proyecto } = await supabase.from('proyectos').select('codigo').eq('id', explosion.proyecto_id).maybeSingle()
  const pedidos = [soloNumero(proyecto?.codigo ?? ''), soloNumero((revision.encabezado as { pedido?: string })?.pedido ?? '')].filter(Boolean)
  const ref = soloNumero(orden.referencia)
  if (!forzar && ref && pedidos.length && !pedidos.includes(ref)) {
    return NextResponse.json({
      error: `La OC ${orden.folio} dice REFERENCIA ${orden.referencia}, pero este es el pedido ${pedidos[0]}.`,
      confirmar: true, folio: orden.folio, referencia: orden.referencia,
    }, { status: 409 })
  }

  /* ── 3. Escribir el folio en la columna OC de las claves que vienen en la orden ── */
  let lineas
  try {
    lineas = await lineasActuales(supabase, revision.id)
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : 'No se pudieron leer los materiales.', 500)
  }
  const porClave = new Map<string, typeof lineas>()
  for (const l of lineas) {
    const k = normalizar(l.clave)
    if (k) porClave.set(k, [...(porClave.get(k) ?? []), l])
  }

  const cambios = new Map<string, string>()
  const partidas = orden.partidas.map(p => {
    const destino = porClave.get(normalizar(p.clave)) ?? []
    for (const l of destino) {
      const nuevo = agregarFolio(cambios.get(l.id) ?? l.oc, orden.folio)
      if (nuevo !== l.oc) cambios.set(l.id, nuevo)
    }
    return { ...p, encontrada: destino.length > 0 }
  })

  const resultados = await Promise.all(
    [...cambios].map(([id, oc]) => supabase.from('bom_revision_lineas').update({ oc }).eq('id', id)),
  )
  const fallo = resultados.find(r => r.error)
  if (fallo?.error) return errorJson(fallo.error.message, 500)

  /* ── 4. Registrar la OC (si el folio ya estaba, se reemplaza) ── */
  const usuario = await obtenerUsuarioDeSesion()
  const { data: registro, error } = await supabase
    .from('bom_ordenes_compra')
    .upsert({
      explosion_id: explosionId,
      folio: orden.folio,
      referencia: orden.referencia,
      proveedor: orden.proveedor,
      fecha: orden.fecha,
      archivo_nombre: archivo.name.slice(0, 200),
      partidas,
      subido_por: usuario.nombre,
      created_at: new Date().toISOString(),
    }, { onConflict: 'explosion_id,folio' })
    .select()
    .single()
  if (error) return errorJson(error.message, 500)

  return NextResponse.json({
    orden: registro,
    actualizadas: cambios.size,
    no_encontradas: partidas.filter(p => !p.encontrada),
  })
}

export async function PATCH(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const body = await request.json().catch(() => null)
  const explosionId = body?.explosion_id
  const lineaId = body?.linea_id
  if (typeof explosionId !== 'string' || typeof lineaId !== 'string') return errorJson('Faltan explosion_id o linea_id.', 400)

  const campos: { oc?: string; comprado?: boolean; almacen?: boolean; fecha_compra?: string | null; fecha_almacen?: string | null } = {}
  if (typeof body.oc === 'string') campos.oc = body.oc.slice(0, 200)
  if (typeof body.comprado === 'boolean') campos.comprado = body.comprado
  if (typeof body.almacen === 'boolean') campos.almacen = body.almacen
  for (const k of ['fecha_compra', 'fecha_almacen'] as const) {
    const v = body[k]
    if (v === null || v === '') campos[k] = null
    else if (typeof v === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return errorJson('Fecha no válida (AAAA-MM-DD).', 400)
      campos[k] = v
    }
  }
  if (!Object.keys(campos).length) return errorJson('No hay cambios.', 400)

  const supabase = supabaseServidor()
  const revision = await ultimaRevision(supabase, explosionId)
  if (!revision) return errorJson('La explosión no tiene revisiones.', 404)
  // Si la pantalla traía el id de la revisión anterior, se busca su copia en la última
  const linea = await lineaEnRevision(supabase, revision.id, lineaId)
  if (!linea) return errorJson('Ese material ya no está en la revisión actual. Recarga la página.', 409)

  const { data, error } = await supabase.from('bom_revision_lineas').update(campos).eq('id', linea.id).select().single()
  if (error) return errorJson(error.message, 500)
  return NextResponse.json({ linea: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const params = request.nextUrl.searchParams
  const explosionId = params.get('explosion_id')
  const folio = params.get('folio')
  if (!explosionId || !folio) return errorJson('Faltan explosion_id o folio.', 400)

  const supabase = supabaseServidor()
  const revision = await ultimaRevision(supabase, explosionId)
  if (revision) {
    try {
      const lineas = await lineasActuales(supabase, revision.id)
      const cambios = lineas.filter(l => quitarFolio(l.oc, folio) !== l.oc)
      const res = await Promise.all(cambios.map(l => supabase.from('bom_revision_lineas').update({ oc: quitarFolio(l.oc, folio) }).eq('id', l.id)))
      const fallo = res.find(r => r.error)
      if (fallo?.error) return errorJson(fallo.error.message, 500)
    } catch (e) {
      return errorJson(e instanceof Error ? e.message : 'No se pudo quitar el folio.', 500)
    }
  }
  const { error } = await supabase.from('bom_ordenes_compra').delete().eq('explosion_id', explosionId).eq('folio', folio)
  if (error) return errorJson(error.message, 500)
  return NextResponse.json({ ok: true })
}
