/**
 * /api/bom/revisiones/route.ts
 * ────────────────────────────
 * Revisiones de la explosión de materiales (REV-00, REV-01…). Tablas bom_revisiones y
 * bom_revision_lineas (sql/bom_revisiones.sql).
 *
 *   GET   ?explosion_id=UUID                         → todas las revisiones con sus líneas (por número)
 *         (sesión de madera: solo materiales Madera; con &completa=1 todos, para verlos en Subir archivos)
 *   POST  { explosion_id }                           → empezar en blanco: crea REV-00 borrador
 *                                                      (o devuelve la revisión editable que ya hay)
 *   PATCH { explosion_id, accion: 'encabezado', encabezado: {...} }
 *                                                    → cambia el encabezado (si la última está cerrada,
 *                                                      se abre la siguiente revisión)
 *   PATCH { explosion_id, accion: 'motivo', motivo } → "qué cambió" del borrador actual
 *   PATCH { explosion_id, accion: 'cerrar' }         → congela el borrador actual
 *   PATCH { explosion_id, accion: 'descartar' }      → borra el borrador actual (vuelve a la anterior)
 *   PATCH { explosion_id, accion: 'eliminar_ultima' } → borra la última revisión aunque esté cerrada
 *                                                      (ej. se subió el Excel equivocado)
 *   PATCH { explosion_id, accion: 'vaciar' }         → borra TODAS las revisiones: la hoja queda vacía
 *                                                      para volver a subir el Excel
 *
 * GET también lo pueden usar el área de madera y los perfiles ERP (solo lectura; almacén sin costos). Escribir: solo administradores, y solo con la explosión 'en_proceso'. Eliminar/vaciar se permite también en
 * 'pendiente' (no arranca el cronómetro), pero nunca con la explosión terminada. Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/revisiones/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, esClasifMadera, esSesionMadera, puedeVerBom, supabaseServidor, verCostos } from '@/lib/admin-api'
import { obtenerUsuarioDeSesion } from '@/lib/registrar-actividad'
import { bloqueoEdicion, errorJson, leerExplosion, revisionEditable, ultimaRevision } from '@/lib/explosion-servidor'
import { lineaConContenido, type EncabezadoRev } from '@/lib/explosion-revisiones'

const SIN_CACHE = { headers: { 'Cache-Control': 'no-store' } }
const CAMPOS_ENCABEZADO: (keyof EncabezadoRev)[] = ['fecha', 'cliente', 'proyecto', 'pedido', 'orden_produccion', 'usuario']

export async function GET(request: NextRequest) {
  if (!(await puedeVerBom())) return errorJson('Sin permiso.', 403)
  const explosionId = request.nextUrl.searchParams.get('explosion_id')
  if (!explosionId) return errorJson('Falta explosion_id.', 400)

  const supabase = supabaseServidor()
  const [{ data: revs, error }, { data: lineas, error: errL }] = await Promise.all([
    supabase.from('bom_revisiones').select('*').eq('explosion_id', explosionId).order('numero', { ascending: true }),
    supabase.from('bom_revision_lineas').select('*').eq('explosion_id', explosionId).order('orden', { ascending: true }),
  ])
  if (error || errL) return errorJson((error ?? errL)!.message, 500)

  // El área de madera solo ve los materiales de madera, salvo ?completa=1 (explosión completa de
  // "Subir archivos", solo lectura)
  const soloMadera = request.nextUrl.searchParams.get('completa') !== '1' && (await esSesionMadera())
  const porRevision = new Map<string, typeof lineas>()
  for (const l of lineas ?? []) if (!soloMadera || esClasifMadera(l.clasificacion)) porRevision.set(l.revision_id, [...(porRevision.get(l.revision_id) ?? []), l])
  // Almacén no ve costos: la columna costo no sale del servidor
  const conCostos = await verCostos()
  const revisiones = (revs ?? []).map(r => ({
    ...r,
    lineas: (porRevision.get(r.id) ?? []).map(l => {
      const { costo, ...resto } = l
      return conCostos ? { ...resto, costo: Number(costo), cantidad: Number(l.cantidad) } : { ...resto, cantidad: Number(l.cantidad) }
    }),
  }))
  return NextResponse.json({ revisiones }, SIN_CACHE)
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const body = await request.json().catch(() => null)
  const explosionId = body?.explosion_id
  if (!explosionId || typeof explosionId !== 'string') return errorJson('Falta explosion_id.', 400)

  const supabase = supabaseServidor()
  const explosion = await leerExplosion(supabase, explosionId)
  const bloqueo = bloqueoEdicion(explosion)
  if (bloqueo) return bloqueo

  const usuario = await obtenerUsuarioDeSesion()
  const r = await revisionEditable(supabase, explosion!, usuario.nombre)
  if ('error' in r) return r.error
  return NextResponse.json({ revision: r.revision, creada: r.creada })
}

export async function PATCH(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const body = await request.json().catch(() => null)
  const explosionId = body?.explosion_id
  const accion = body?.accion as string
  if (!explosionId || typeof explosionId !== 'string') return errorJson('Falta explosion_id.', 400)

  const supabase = supabaseServidor()
  const explosion = await leerExplosion(supabase, explosionId)

  /* ── Quitar revisiones (Excel equivocado): no necesita que la explosión esté en proceso ── */
  if (accion === 'eliminar_ultima' || accion === 'vaciar') {
    if (!explosion) return errorJson('Explosión no encontrada.', 404)
    if (explosion.estado === 'completado')
      return errorJson('La explosión está terminada: da clic en "Editar" antes de quitar revisiones.', 409)
    if (accion === 'vaciar') {
      // Las líneas se borran solas (ON DELETE CASCADE)
      const { error } = await supabase.from('bom_revisiones').delete().eq('explosion_id', explosionId)
      if (error) return errorJson(error.message, 500)
      return NextResponse.json({ ok: true })
    }
    const ultima = await ultimaRevision(supabase, explosionId)
    if (!ultima) return errorJson('No hay revisiones que quitar.', 400)
    const { error } = await supabase.from('bom_revisiones').delete().eq('id', ultima.id)
    if (error) return errorJson(error.message, 500)
    return NextResponse.json({ ok: true, eliminada: ultima.numero })
  }

  const bloqueo = bloqueoEdicion(explosion)
  if (bloqueo) return bloqueo
  const usuario = await obtenerUsuarioDeSesion()

  switch (accion) {
    case 'encabezado': {
      const entrada = body?.encabezado
      if (!entrada || typeof entrada !== 'object') return errorJson('Encabezado no válido.', 400)
      const cambios: Partial<EncabezadoRev> = {}
      for (const campo of CAMPOS_ENCABEZADO) {
        if (typeof entrada[campo] === 'string') cambios[campo] = entrada[campo].slice(0, 300)
      }
      if (cambios.fecha !== undefined && cambios.fecha !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(cambios.fecha))
        return errorJson('Fecha no válida (AAAA-MM-DD).', 400)
      if (!Object.keys(cambios).length) return errorJson('No hay cambios.', 400)

      const r = await revisionEditable(supabase, explosion!, usuario.nombre)
      if ('error' in r) return r.error
      const { data, error } = await supabase
        .from('bom_revisiones')
        .update({ encabezado: { ...(r.revision.encabezado ?? {}), ...cambios } })
        .eq('id', r.revision.id)
        .select()
        .single()
      if (error) return errorJson(error.message, 500)
      return NextResponse.json({ revision: data, creada: r.creada })
    }

    case 'motivo':
    case 'cerrar':
    case 'descartar': {
      const ultima = await ultimaRevision(supabase, explosionId)
      if (!ultima || ultima.estado !== 'borrador') return errorJson('No hay una revisión en borrador.', 400)

      if (accion === 'motivo') {
        const motivo = typeof body?.motivo === 'string' ? body.motivo.slice(0, 1000) : null
        if (motivo === null) return errorJson('Motivo no válido.', 400)
        const { data, error } = await supabase.from('bom_revisiones').update({ motivo }).eq('id', ultima.id).select().single()
        if (error) return errorJson(error.message, 500)
        return NextResponse.json({ revision: data })
      }

      if (accion === 'cerrar') {
        const { data: lineas } = await supabase.from('bom_revision_lineas').select('clave, descripcion').eq('revision_id', ultima.id)
        if (!(lineas ?? []).some(lineaConContenido)) return errorJson('Agrega al menos un material antes de cerrar la revisión.', 400)
        // Las filas vacías no se guardan en una revisión cerrada
        await supabase.from('bom_revision_lineas').delete().eq('revision_id', ultima.id).eq('clave', '').eq('descripcion', '')
        const { data, error } = await supabase
          .from('bom_revisiones')
          .update({ estado: 'cerrada', cerrada_en: new Date().toISOString(), cerrada_por: usuario.nombre })
          .eq('id', ultima.id)
          .select()
          .single()
        if (error) return errorJson(error.message, 500)
        return NextResponse.json({ revision: data })
      }

      // descartar: las líneas se borran solas (ON DELETE CASCADE)
      const { error } = await supabase.from('bom_revisiones').delete().eq('id', ultima.id)
      if (error) return errorJson(error.message, 500)
      return NextResponse.json({ ok: true })
    }

    default:
      return errorJson(`Acción no válida: ${accion}`, 400)
  }
}
