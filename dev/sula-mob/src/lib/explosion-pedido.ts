/**
 * explosion-pedido.ts
 * ───────────────────
 * Subir el Excel o la OC SIN elegir pedido (panel de madera, /madera/subir): el pedido sale del
 * archivo (PEDIDO del encabezado del Excel o REFERENCIA de la OC) y funciona aunque el pedido
 * todavía no esté dado de alta en Proyectos.
 *
 *   · Explosión "sin alta": bom_explosiones con proyecto_id NULL y pedido_numero = '3531'. Se liga
 *     sola a su proyecto cuando lo den de alta (vincularPendientes). El BOM del admin no la ve
 *     mientras no tenga proyecto.
 *   · OC "en espera": bom_ordenes_compra con explosion_id NULL y pedido_numero. Se aplica sola
 *     cuando se sube el Excel de ese pedido (aplicarOcEnEspera).
 * Columnas de sql/madera_sin_pedido.sql (pedido_numero y los NULL permitidos).
 *
 * aplicarOrdenCompra es el mismo paso que hacía POST /api/bom/revisiones/compras (folio en la
 * columna OC y registro de la OC); la ruta y las OC en espera lo comparten.
 *
 * RUTA: src/lib/explosion-pedido.ts
 */

import { motivosSinResolver } from '@/lib/bom-motivos'
import { agregarFolio, soloNumero, type OrdenCompraLeida, type PartidaOC } from '@/lib/explosion-oc'
import { normalizar } from '@/lib/explosion-revisiones'
import { ultimaRevision, type Supabase } from '@/lib/explosion-servidor'
import { registrarActividad } from '@/lib/registrar-actividad'

export interface ExplosionPedido {
  id: string
  proyecto_id: string | null
  pedido_numero: string | null
  estado: string
  checklist: unknown
}

const CAMPOS = 'id, proyecto_id, pedido_numero, estado, checklist'

/** "PED-0002", "0002" o "2" → "2" (sin ceros a la izquierda); '' si no trae número */
export const numeroDePedido = (texto: unknown) => soloNumero(String(texto ?? ''))

/** Proyecto cuyo código es ese número de pedido (PED-3531, PED-0002…), o null */
export async function proyectoDePedido(supabase: Supabase, numero: string): Promise<{ id: string; codigo: string } | null> {
  if (!numero) return null
  const { data } = await supabase.from('proyectos').select('id, codigo').ilike('codigo', `%${numero}%`)
  return (data ?? []).find(p => numeroDePedido(p.codigo) === numero) ?? null
}

/** Explosión del pedido: la de su proyecto si ya está dado de alta; si no, la "sin alta" por número */
export async function explosionDePedido(
  supabase: Supabase,
  numero: string,
): Promise<{ explosion: ExplosionPedido | null; proyecto: { id: string; codigo: string } | null }> {
  const proyecto = await proyectoDePedido(supabase, numero)
  const consulta = supabase.from('bom_explosiones').select(CAMPOS)
  const { data } = proyecto
    ? await consulta.eq('proyecto_id', proyecto.id).maybeSingle()
    : await consulta.is('proyecto_id', null).eq('pedido_numero', numero).maybeSingle()
  return { explosion: (data as ExplosionPedido | null) ?? null, proyecto }
}

/**
 * Explosión lista para importar el Excel: la crea si no existe (en proceso, como al iniciar) y,
 * si estaba pendiente, la inicia con la misma regla de "Iniciar" (no con motivos sin resolver).
 */
export async function explosionParaExcel(
  supabase: Supabase,
  numero: string,
  usuario: { id: string; nombre: string },
): Promise<{ explosion: ExplosionPedido; sinAlta: boolean } | { error: string; status: number }> {
  const { explosion, proyecto } = await explosionDePedido(supabase, numero)
  const ahora = new Date().toISOString()

  if (!explosion) {
    const { data, error } = await supabase
      .from('bom_explosiones')
      .insert({
        proyecto_id: proyecto?.id ?? null,
        pedido_numero: proyecto ? null : numero,
        estado: 'en_proceso',
        fecha_inicio: ahora,
        tramo_inicio: ahora,
        usuario_id: usuario.id || null,
        usuario_nombre: usuario.nombre,
      })
      .select(CAMPOS)
      .single()
    if (error) {
      // Otra pestaña la creó al mismo tiempo: se usa esa
      if (error.code === '23505') {
        const otra = await explosionDePedido(supabase, numero)
        if (otra.explosion) return { explosion: otra.explosion, sinAlta: !otra.proyecto }
      }
      return { error: `No se pudo crear la explosión del pedido ${numero}: ${error.message}`, status: 500 }
    }
    return { explosion: data as ExplosionPedido, sinAlta: !proyecto }
  }

  if (explosion.estado === 'pendiente') {
    const bloqueos = motivosSinResolver(explosion.checklist)
    if (bloqueos.length > 0)
      return { error: `El pedido ${numero} tiene ${bloqueos.length} motivo(s) del estatus sin resolver: el administrador debe resolverlos antes de subir la explosión.`, status: 409 }
    const { error } = await supabase
      .from('bom_explosiones')
      .update({
        estado: 'en_proceso',
        fecha_inicio: ahora,
        tramo_inicio: ahora,
        acumulado_seg: 0,
        checklist: { ...((explosion.checklist as Record<string, unknown> | null) ?? {}), pausas: 0 },
        usuario_id: usuario.id || null,
        usuario_nombre: usuario.nombre,
      })
      .eq('id', explosion.id)
      .eq('estado', 'pendiente')
    if (error) return { error: `No se pudo iniciar la explosión del pedido ${numero}: ${error.message}`, status: 500 }
    await registrarActividad({
      tipo: 'bom_iniciado',
      usuarioId: usuario.id,
      usuarioNombre: usuario.nombre,
      ...(explosion.proyecto_id ? { referenciaId: explosion.proyecto_id, referenciaTipo: 'proyecto' as const } : {}),
      detalle: { explosion_id: explosion.id },
    })
    return { explosion: { ...explosion, estado: 'en_proceso' }, sinAlta: !explosion.proyecto_id }
  }

  return { explosion, sinAlta: !explosion.proyecto_id }
}

/* ═══ Aplicar una OC a la última revisión ═══ */

/**
 * Escribe el folio en la columna OC de cada material cuya Clave viene en la orden y registra la OC
 * (si el folio ya estaba en esa explosión, se reemplaza y lo pagado se conserva).
 */
export async function aplicarOrdenCompra(
  supabase: Supabase,
  explosionId: string,
  revisionId: string,
  orden: OrdenCompraLeida,
  archivoNombre: string,
  subidoPor: string,
): Promise<{ registro: Record<string, unknown>; actualizadas: number; no_encontradas: PartidaOC[] } | { error: string }> {
  const { data: lineas, error: errL } = await supabase.from('bom_revision_lineas').select('id, clave, oc').eq('revision_id', revisionId)
  if (errL) return { error: errL.message }
  const porClave = new Map<string, NonNullable<typeof lineas>>()
  for (const l of lineas ?? []) {
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
  if (fallo?.error) return { error: fallo.error.message }

  const { data: registro, error } = await supabase
    .from('bom_ordenes_compra')
    .upsert({
      explosion_id: explosionId,
      folio: orden.folio,
      referencia: orden.referencia,
      proveedor: orden.proveedor,
      fecha: orden.fecha,
      archivo_nombre: archivoNombre.slice(0, 200),
      partidas,
      // Importes leídos del PDF; el pago (monto_pagado, fecha_pago) se conserva si se vuelve a subir
      subtotal: orden.subtotal,
      iva: orden.iva,
      total: orden.total,
      subido_por: subidoPor,
      created_at: new Date().toISOString(),
    }, { onConflict: 'explosion_id,folio' })
    .select()
    .single()
  if (error) return { error: error.message }

  return { registro, actualizadas: cambios.size, no_encontradas: partidas.filter(p => !p.encontrada) }
}

/* ═══ OC en espera ═══ */

/** Guarda una OC cuyo pedido todavía no tiene explosión (se aplica sola al subir el Excel) */
export async function guardarOcEnEspera(
  supabase: Supabase,
  numero: string,
  orden: OrdenCompraLeida,
  archivoNombre: string,
  subidoPor: string,
): Promise<{ ok: true } | { yaEstaba: true } | { error: string }> {
  const { data: previa } = await supabase
    .from('bom_ordenes_compra').select('id').is('explosion_id', null).eq('pedido_numero', numero).eq('folio', orden.folio).maybeSingle()
  if (previa) return { yaEstaba: true }
  const { error } = await supabase.from('bom_ordenes_compra').insert({
    explosion_id: null,
    pedido_numero: numero,
    folio: orden.folio,
    referencia: orden.referencia,
    proveedor: orden.proveedor,
    fecha: orden.fecha,
    archivo_nombre: archivoNombre.slice(0, 200),
    partidas: orden.partidas,
    subtotal: orden.subtotal,
    iva: orden.iva,
    total: orden.total,
    subido_por: subidoPor,
  })
  if (error) return error.code === '23505' ? { yaEstaba: true } : { error: error.message }
  return { ok: true }
}

/**
 * Aplica a la explosión las OC que esperaban ese pedido. La aplicada se borra de "en espera"
 * (aplicarOrdenCompra ya creó la suya ligada a la explosión); la que falla se queda y se avisa.
 */
export async function aplicarOcEnEspera(
  supabase: Supabase,
  explosionId: string,
  numero: string,
  subidoPor: string,
): Promise<{ aplicadas: number; avisos: string[] }> {
  const avisos: string[] = []
  const { data: espera } = await supabase.from('bom_ordenes_compra').select('*').is('explosion_id', null).eq('pedido_numero', numero)
  if (!espera?.length) return { aplicadas: 0, avisos }
  const revision = await ultimaRevision(supabase, explosionId)
  if (!revision) return { aplicadas: 0, avisos }

  let aplicadas = 0
  for (const oc of espera) {
    const orden: OrdenCompraLeida = {
      folio: String(oc.folio ?? ''),
      referencia: String(oc.referencia ?? ''),
      proveedor: String(oc.proveedor ?? ''),
      fecha: String(oc.fecha ?? ''),
      partidas: ((oc.partidas as PartidaOC[] | null) ?? []).map(p => ({ clave: p.clave, descripcion: p.descripcion, cantidad: p.cantidad, unidad: p.unidad })),
      subtotal: oc.subtotal ?? null,
      iva: oc.iva ?? null,
      total: oc.total ?? null,
    }
    const r = await aplicarOrdenCompra(supabase, explosionId, revision.id, orden, String(oc.archivo_nombre ?? ''), subidoPor)
    if ('error' in r) { avisos.push(`OC ${orden.folio} sigue en espera: ${r.error}`); continue }
    const { error } = await supabase.from('bom_ordenes_compra').delete().eq('id', oc.id)
    if (error) avisos.push(`OC ${orden.folio} se aplicó pero no se pudo quitar de "en espera": ${error.message}`)
    aplicadas++
  }
  return { aplicadas, avisos }
}

/* ═══ Ligar lo "sin alta" cuando ya den de alta el pedido ═══ */

/** true si la explosión no tiene nada capturado (se puede reemplazar por la "sin alta" sin perder nada) */
async function explosionVacia(supabase: Supabase, e: { id: string; estado: string; checklist: unknown; notas?: string | null }) {
  if (e.estado !== 'pendiente' || String(e.notas ?? '').trim()) return false
  const checklist = (e.checklist as { motivos?: unknown[] } | null) ?? {}
  if (Array.isArray(checklist.motivos) && checklist.motivos.length > 0) return false
  const [{ count: revs }, { count: ocs }] = await Promise.all([
    supabase.from('bom_revisiones').select('id', { count: 'exact', head: true }).eq('explosion_id', e.id),
    supabase.from('bom_ordenes_compra').select('id', { count: 'exact', head: true }).eq('explosion_id', e.id),
  ])
  return !revs && !ocs
}

/**
 * Liga a su proyecto las explosiones "sin alta" cuyo pedido ya existe en Proyectos y aplica las OC
 * en espera de pedidos que ya tienen explosión con revisión.
 * Si el proyecto ya tiene explosión: si está vacía (pendiente, sin revisiones, OC, motivos ni notas,
 * como la que se crea al dar de alta el pedido) se quita y se liga la "sin alta"; si tiene algo,
 * no se mezclan y se avisa.
 */
export async function vincularPendientes(supabase: Supabase, subidoPor: string): Promise<string[]> {
  const avisos: string[] = []
  const { data: sinAlta } = await supabase.from('bom_explosiones').select('id, pedido_numero').is('proyecto_id', null).not('pedido_numero', 'is', null)

  for (const e of sinAlta ?? []) {
    const numero = String(e.pedido_numero)
    const proyecto = await proyectoDePedido(supabase, numero)
    if (!proyecto) continue
    const { data: existente } = await supabase.from('bom_explosiones').select('id, estado, checklist, notas').eq('proyecto_id', proyecto.id).maybeSingle()
    if (existente) {
      if (!(await explosionVacia(supabase, existente))) {
        avisos.push(`El pedido ${numero} tiene dos explosiones; revisa cuál se queda.`)
        continue
      }
      // .select: un borrado bloqueado por permisos no da error (0 renglones); sin borrar no se liga,
      // para no dejar dos explosiones en el mismo proyecto
      const { data: borradas, error } = await supabase.from('bom_explosiones').delete().eq('id', existente.id).select('id')
      if (error || !borradas?.length) {
        avisos.push(`El pedido ${numero} no se pudo ligar a Proyectos: ${error?.message ?? 'la base no dejó quitar su explosión vacía'}.`)
        continue
      }
    }
    const { error } = await supabase.from('bom_explosiones').update({ proyecto_id: proyecto.id, pedido_numero: null }).eq('id', e.id)
    if (error) avisos.push(`El pedido ${numero} no se pudo ligar a Proyectos: ${error.message}`)
  }

  // OC en espera de pedidos que ya tienen explosión con revisión
  const { data: espera } = await supabase.from('bom_ordenes_compra').select('pedido_numero').is('explosion_id', null).not('pedido_numero', 'is', null)
  for (const numero of new Set((espera ?? []).map(o => String(o.pedido_numero)))) {
    const { explosion } = await explosionDePedido(supabase, numero)
    if (!explosion) continue
    const r = await aplicarOcEnEspera(supabase, explosion.id, numero, subidoPor)
    avisos.push(...r.avisos)
  }
  return avisos
}
