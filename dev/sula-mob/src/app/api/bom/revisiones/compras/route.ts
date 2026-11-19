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
 *   POST   multipart { archivo (PDF), pedido_elegido? }  (sin explosion_id: panel de madera)
 *          → el pedido sale de la REFERENCIA (o de pedido_elegido). Si ese pedido todavía no tiene
 *            explosión con revisión, la OC queda EN ESPERA (explosion_id NULL + pedido_numero) y se
 *            aplica sola al subir su Excel: { tipo: 'oc_espera', folio, pedido, total }.
 *   GET    ?en_espera=1                                    → { ordenes } OC en espera de su Excel
 *   GET    ?todas=1                                        → { ordenes } todas las OC ya aplicadas a una explosión
 *          (dashboard de finanzas: saldo por pedido y proveedor)
 *   PATCH  { explosion_id, linea_id, oc?, comprado?, fecha_compra?, almacen?, fecha_almacen? }
 *          → edición a mano de OC, Compra, Almacén y sus fechas (fecha: 'AAAA-MM-DD' o '' para borrarla)
 *   PATCH  { explosion_id, linea_id, estado_pago?, fecha_estado_pago? }            (FINANZAS, por partida)
 *   PATCH  { explosion_id, linea_id, estado_almacen?, cantidad_recibida?, fecha_almacen? } (ALMACÉN)
 *          → la fecha se pone sola (hoy) al cambiar el estado y se borra al regresar a PENDIENTE;
 *            RECIBIDO ⇔ almacen = true; PARCIALMENTE RECIBIDO exige 0 < cantidad < necesaria.
 *            cantidad_recibida sola → el estado se ajusta (estadoAlmacenPorCantidad).
 *   PATCH  { explosion_id, linea_id, sumar_llegada: 1 }  → otra entrega: se suma al total recibido
 *            (PAGADO + llegó incompleto → aviso "PAGADO completo pero llegaron 4 de 5…")
 *            Avisos (src/lib/notificar-erp.ts): pago parcial/pagado → almacén; recibido/parcial →
 *            compras y finanzas. Historial: bom_estado_pago / bom_estado_almacen.
 *   PATCH  { explosion_id, oc: '5621', estado_pago }    → masivo: todas las partidas con esa OC
 *          (un solo aviso a almacén)
 *   PATCH  { explosion_id, folio, monto_pagado?, pagada?, fecha_pago? }
 *          → pago de una OC: monto pagado a mano, o pagada = true (paga el total) / false (regresa a 0)
 *   DELETE ?explosion_id=UUID&folio=5621                    → quita esa OC: borra su registro y su folio
 *
 * OC y Compra NO abren revisión nueva (son de compras, no de la explosión) y se pueden editar aunque
 * la explosión ya esté terminada. Siempre se escriben en la ÚLTIMA revisión; al abrir una revisión
 * nueva se copian solos.
 * Ver (GET): todos los perfiles del BOM; almacén sin importes ni pagos. Escribir, por acción
 * (src/lib/admin-api.ts → puede): OC/PDF/Compra = admin, madera, compras · pagos = admin, madera,
 * finanzas · Almacén = admin, madera, almacen. Sin permiso → 403 con el motivo.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/revisiones/compras/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { puede, puedeVerBom, supabaseServidor, verCostos } from '@/lib/admin-api'
import { obtenerUsuarioDeSesion, registrarActividad } from '@/lib/registrar-actividad'
import { avisarRol } from '@/lib/notificar-erp'
import {
  esEstadoAlmacen, esEstadoPago, estadoAlmacenDe, estadoAlmacenPorCantidad, estadoPagoDe, hoyMexico, normalizarEstado, tieneFolio,
  type EstadoAlmacen, type EstadoPago,
} from '@/lib/explosion-revisiones'
import { errorJson, leerExplosion, lineaEnRevision, ultimaRevision, type Supabase } from '@/lib/explosion-servidor'
import { leerOrdenCompra, quitarFolio, soloNumero, textoDePdf } from '@/lib/explosion-oc'
import { aplicarOrdenCompra, explosionDePedido, guardarOcEnEspera, numeroDePedido, vincularPendientes } from '@/lib/explosion-pedido'

const MAX_BYTES = 10 * 1024 * 1024

const CAMPOS_DINERO = ['subtotal', 'iva', 'total', 'monto_pagado', 'fecha_pago'] as const

/** Almacén no ve importes: se quitan del registro de la OC (las partidas no traen precios) */
function sinImportes(oc: Record<string, unknown>) {
  const copia = { ...oc }
  for (const k of CAMPOS_DINERO) delete copia[k]
  return copia
}

/** Código del pedido para los avisos: PED-#### del proyecto o, si es "sin alta", del número de pedido */
async function pedidoDe(supabase: Supabase, explosionId: string): Promise<{ codigo: string; proyectoId: string | null }> {
  const { data: e } = await supabase.from('bom_explosiones').select('proyecto_id, pedido_numero').eq('id', explosionId).maybeSingle()
  const proyectoId = (e?.proyecto_id as string | null) ?? null
  const { data: p } = proyectoId ? await supabase.from('proyectos').select('codigo').eq('id', proyectoId).maybeSingle() : { data: null }
  return { codigo: p?.codigo || (e?.pedido_numero ? `PED-${e.pedido_numero}` : 'Pedido'), proyectoId }
}

/** Respuesta con las OC, sin importes si el perfil no ve costos */
async function respuestaOrdenes(ordenes: Record<string, unknown>[]) {
  const lista = (await verCostos()) ? ordenes : ordenes.map(sinImportes)
  return NextResponse.json({ ordenes: lista }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Líneas de la última revisión (id, clave, oc) */
async function lineasActuales(supabase: Supabase, revisionId: string) {
  const { data, error } = await supabase.from('bom_revision_lineas').select('id, clave, oc').eq('revision_id', revisionId)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function GET(request: NextRequest) {
  if (!(await puedeVerBom())) return errorJson('Sin permiso.', 403)
  // OC en espera del Excel de su pedido (panel de madera)
  if (request.nextUrl.searchParams.get('en_espera') === '1') {
    const { data, error } = await supabaseServidor()
      .from('bom_ordenes_compra')
      // select('*'): funciona aunque todavía no existan las columnas de pago (sql/bom_pagos_oc.sql)
      .select('*')
      .is('explosion_id', null)
      .order('created_at', { ascending: true })
    if (error) return errorJson(error.message, 500)
    return respuestaOrdenes(data ?? [])
  }
  if (request.nextUrl.searchParams.get('todas') === '1') {
    const { data, error } = await supabaseServidor()
      .from('bom_ordenes_compra')
      .select('*')
      .not('explosion_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) return errorJson(error.message, 500)
    return respuestaOrdenes(data ?? [])
  }
  const explosionId = request.nextUrl.searchParams.get('explosion_id')
  if (!explosionId) return errorJson('Falta explosion_id.', 400)
  const { data, error } = await supabaseServidor()
    .from('bom_ordenes_compra')
    .select('*')
    .eq('explosion_id', explosionId)
    .order('created_at', { ascending: true })
  if (error) return errorJson(error.message, 500)
  return respuestaOrdenes(data ?? [])
}

export async function POST(request: NextRequest) {
  if (!(await puede('oc'))) return errorJson('Tu perfil no puede subir órdenes de compra.', 403)
  const form = await request.formData().catch(() => null)
  const explosionDada = form?.get('explosion_id')
  const archivo = form?.get('archivo')
  const forzar = form?.get('forzar') === '1'
  if (!(archivo instanceof File)) return errorJson('Falta el archivo.', 400)
  if (!/\.pdf$/i.test(archivo.name)) return errorJson('La orden de compra debe ser PDF.', 400)
  if (archivo.size > MAX_BYTES) return errorJson('El PDF pesa más de 10 MB.', 400)
  // Sin explosion_id (panel de madera): el pedido sale de la REFERENCIA de la OC
  const detectar = typeof explosionDada !== 'string' || !explosionDada

  const supabase = supabaseServidor()
  const usuario = await obtenerUsuarioDeSesion()

  /* ── 1. Leer el PDF ── */
  let orden
  try {
    orden = leerOrdenCompra(await textoDePdf(new Uint8Array(await archivo.arrayBuffer())), archivo.name)
  } catch (e) {
    return errorJson(`${archivo.name}: ${e instanceof Error ? e.message : 'no se pudo leer el PDF.'}`, 400)
  }

  let explosionId = detectar ? '' : (explosionDada as string)
  const avisos: string[] = []
  if (detectar) {
    avisos.push(...(await vincularPendientes(supabase, usuario.nombre)))
    const numero = numeroDePedido(orden.referencia) || numeroDePedido(form?.get('pedido_elegido'))
    if (!numero) return errorJson(`${archivo.name}: la OC ${orden.folio} no trae REFERENCIA (pedido); elige el pedido en la lista y vuelve a subirla.`, 400)
    const { explosion } = await explosionDePedido(supabase, numero)
    const conHoja = explosion ? await ultimaRevision(supabase, explosion.id) : null
    // Sin explosión (o vacía) no es error: la OC espera al Excel de su pedido
    if (!explosion || !conHoja) {
      const r = await guardarOcEnEspera(supabase, numero, orden, archivo.name, usuario.nombre)
      if ('error' in r) return errorJson(`No se pudo guardar la OC ${orden.folio} en espera: ${r.error}`, 500)
      return NextResponse.json({ tipo: 'oc_espera', folio: orden.folio, pedido: numero, total: orden.total, ya_estaba: 'yaEstaba' in r, avisos })
    }
    explosionId = explosion.id
  }

  const explosion = await leerExplosion(supabase, explosionId)
  if (!explosion) return errorJson('Explosión no encontrada.', 404)
  const revision = await ultimaRevision(supabase, explosionId)
  if (!revision) return errorJson('Primero sube la explosión (Excel) y después las órdenes de compra.', 400)

  /* ── 2. ¿La OC es de este pedido? (REFERENCIA vs pedido de la explosión) ── */
  const { data: proyecto } = await supabase.from('proyectos').select('codigo').eq('id', explosion.proyecto_id).maybeSingle()
  const pedidos = [soloNumero(proyecto?.codigo ?? ''), soloNumero((revision.encabezado as { pedido?: string })?.pedido ?? '')].filter(Boolean)
  const ref = soloNumero(orden.referencia)
  if (!detectar && !forzar && ref && pedidos.length && !pedidos.includes(ref)) {
    return NextResponse.json({
      error: `La OC ${orden.folio} dice REFERENCIA ${orden.referencia}, pero este es el pedido ${pedidos[0]}.`,
      confirmar: true, folio: orden.folio, referencia: orden.referencia,
    }, { status: 409 })
  }

  /* ── 3 y 4. Folio en la columna OC y registro de la OC ── */
  const r = await aplicarOrdenCompra(supabase, explosionId, revision.id, orden, archivo.name, usuario.nombre)
  if ('error' in r) return errorJson(r.error, 500)

  return NextResponse.json({
    orden: r.registro,
    actualizadas: r.actualizadas,
    no_encontradas: r.no_encontradas,
    ...(detectar ? { explosion_id: explosionId, avisos } : {}),
  })
}

export async function PATCH(request: NextRequest) {
  if (!(await puedeVerBom())) return errorJson('Sin permiso.', 403)
  const body = await request.json().catch(() => null)
  const explosionId = body?.explosion_id
  const lineaId = body?.linea_id

  /* ── Pago de una OC (por folio) ── */
  if (typeof explosionId === 'string' && typeof body?.folio === 'string') {
    if (!(await puede('pagos'))) return errorJson('Tu perfil no puede editar pagos.', 403)
    const supabase = supabaseServidor()
    const { data: oc } = await supabase.from('bom_ordenes_compra').select('total, monto_pagado').eq('explosion_id', explosionId).eq('folio', body.folio).maybeSingle()
    if (!oc) return errorJson('Esa orden de compra ya no está. Recarga la página.', 404)
    const pago: { monto_pagado?: number; fecha_pago?: string | null } = {}
    if (typeof body.pagada === 'boolean') pago.monto_pagado = body.pagada ? Number(oc.total) || 0 : 0
    if (typeof body.monto_pagado === 'number') {
      if (!Number.isFinite(body.monto_pagado) || body.monto_pagado < 0 || body.monto_pagado > 1e10) return errorJson('Monto no válido.', 400)
      pago.monto_pagado = Math.round(body.monto_pagado * 100) / 100
    }
    if (body.fecha_pago === null || body.fecha_pago === '') pago.fecha_pago = null
    else if (typeof body.fecha_pago === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha_pago) || Number.isNaN(Date.parse(body.fecha_pago))) return errorJson('Fecha no válida (AAAA-MM-DD).', 400)
      pago.fecha_pago = body.fecha_pago
    }
    if (!Object.keys(pago).length) return errorJson('No hay cambios.', 400)
    const { data, error } = await supabase.from('bom_ordenes_compra').update(pago).eq('explosion_id', explosionId).eq('folio', body.folio).select()
    if (error) return errorJson(error.message, 500)
    // 0 renglones sin error = la base de datos no dejó guardar (RLS): no se reporta éxito
    if (!data?.length) return errorJson('No se guardó el pago (la base de datos no lo permitió).', 500)
    return NextResponse.json({ orden: data[0] })
  }

  /* ── Masivo: todas las partidas de una OC → estado de pago ── */
  if (typeof explosionId === 'string' && typeof lineaId !== 'string' && typeof body?.oc === 'string' && body?.estado_pago !== undefined) {
    if (!(await puede('pagos'))) return errorJson('Tu perfil no puede editar pagos.', 403)
    const estado = normalizarEstado(body.estado_pago)
    if (!esEstadoPago(estado)) return errorJson('Estado de pago no válido.', 400)
    const folio = body.oc.trim()
    const supabase = supabaseServidor()
    const revision = await ultimaRevision(supabase, explosionId)
    if (!revision) return errorJson('La explosión no tiene revisiones.', 404)
    const { data: lineas, error: errL } = await supabase.from('bom_revision_lineas').select('id, oc, estado_pago').eq('revision_id', revision.id)
    if (errL) return errorJson(errL.message, 500)
    const deLaOc = (lineas ?? []).filter(l => tieneFolio(l.oc, folio))
    if (!deLaOc.length) return errorJson(`Ninguna partida tiene la OC ${folio}.`, 404)
    // Solo cambian (y toman la fecha de hoy) las que tenían otro estado
    const cambian = deLaOc.filter(l => l.estado_pago !== estado).map(l => l.id)
    if (!cambian.length) return NextResponse.json({ cambiadas: 0, total: deLaOc.length })
    const { data: hechas, error } = await supabase
      .from('bom_revision_lineas')
      .update({ estado_pago: estado, fecha_estado_pago: estado === 'PENDIENTE DE PAGO' ? null : hoyMexico() })
      .in('id', cambian)
      .select('id')
    if (error) return errorJson(error.message, 500)
    if ((hechas?.length ?? 0) !== cambian.length)
      return errorJson(`Solo se guardaron ${hechas?.length ?? 0} de ${cambian.length} partidas (la base de datos no permitió el resto). Recarga la página.`, 500)

    const usuario = await obtenerUsuarioDeSesion()
    const pedido = await pedidoDe(supabase, explosionId)
    registrarActividad({
      tipo: 'bom_estado_pago', usuarioId: usuario.id || undefined, usuarioNombre: usuario.nombre,
      referenciaId: pedido.proyectoId ?? undefined, referenciaTipo: pedido.proyectoId ? 'proyecto' : undefined,
      detalle: { pedido: pedido.codigo, oc: folio, partidas: cambian.length, estado_nuevo: estado },
    })
    let aviso: string | undefined
    if (estado !== 'PENDIENTE DE PAGO') {
      const r = await avisarRol(supabase, 'almacen', {
        tipo: 'bom_pago', proyectoId: pedido.proyectoId, remitenteId: usuario.id || null, url: `/erp/bom/${explosionId}`,
        mensaje: `${pedido.codigo} · OC ${folio} — ${estado}: ${cambian.length} partida${cambian.length === 1 ? '' : 's'}, ${estado === 'PAGADO' ? 'debe llegarte el material.' : 'llegará solo una parte del material.'}`,
      })
      if (r.error) aviso = `El pago quedó guardado, pero no se pudo avisar a almacén: ${r.error}`
    }
    return NextResponse.json({ cambiadas: cambian.length, total: deLaOc.length, aviso })
  }

  if (typeof explosionId !== 'string' || typeof lineaId !== 'string') return errorJson('Faltan explosion_id o linea_id.', 400)

  type Campos = {
    oc?: string; comprado?: boolean; almacen?: boolean; fecha_compra?: string | null; fecha_almacen?: string | null
    estado_pago?: EstadoPago; fecha_estado_pago?: string | null; estado_almacen?: EstadoAlmacen; cantidad_recibida?: number | null
  }
  const campos: Campos = {}
  if (typeof body.oc === 'string') campos.oc = body.oc.slice(0, 200)
  if (typeof body.comprado === 'boolean') campos.comprado = body.comprado
  for (const k of ['fecha_compra', 'fecha_almacen', 'fecha_estado_pago'] as const) {
    const v = body[k]
    if (v === null || v === '') campos[k] = null
    else if (typeof v === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return errorJson('Fecha no válida (AAAA-MM-DD).', 400)
      campos[k] = v
    }
  }
  if (body.estado_pago !== undefined) {
    const e = normalizarEstado(body.estado_pago)
    if (!esEstadoPago(e)) return errorJson('Estado de pago no válido.', 400)
    campos.estado_pago = e
  }
  if (body.estado_almacen !== undefined) {
    const e = normalizarEstado(body.estado_almacen)
    if (!esEstadoAlmacen(e)) return errorJson('Estado de almacén no válido.', 400)
    campos.estado_almacen = e
  }
  // La casilla vieja "Almacén" (true/false) equivale a RECIBIDO / PENDIENTE DE RECIBIR
  if (typeof body.almacen === 'boolean' && !campos.estado_almacen) campos.estado_almacen = body.almacen ? 'RECIBIDO' : 'PENDIENTE DE RECIBIR'
  /** Número ≥ 0 con hasta 3 decimales (kilos, metros); null si no es válido */
  const cantidadValida = (v: unknown): number | null => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 1e9 || Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) return null
    return Math.round(n * 1000) / 1000
  }
  if (body.cantidad_recibida === null || body.cantidad_recibida === '') campos.cantidad_recibida = null
  else if (body.cantidad_recibida !== undefined) {
    const n = cantidadValida(body.cantidad_recibida)
    if (n === null) return errorJson('Cantidad recibida no válida (número de 0 en adelante, máximo 3 decimales).', 400)
    campos.cantidad_recibida = n
  }
  // Otra entrega del mismo material: se suma al total recibido
  let llegada: number | null = null
  if (body.sumar_llegada !== undefined) {
    llegada = cantidadValida(body.sumar_llegada)
    if (llegada === null || llegada <= 0) return errorJson('Escribe cuánto llegó en esta entrega (más de 0, máximo 3 decimales).', 400)
    if ('cantidad_recibida' in campos) return errorJson('Manda la cantidad total o la llegada, no las dos.', 400)
  }
  if (!Object.keys(campos).length && llegada === null) return errorJson('No hay cambios.', 400)
  // Cada campo es de un perfil: OC/Compra (compras) · pagos (finanzas) · almacén (almacén)
  if (['oc', 'comprado', 'fecha_compra'].some(k => k in campos) && !(await puede('oc')))
    return errorJson('Tu perfil no puede editar la OC ni la compra.', 403)
  if (['estado_pago', 'fecha_estado_pago'].some(k => k in campos) && !(await puede('pagos')))
    return errorJson('Tu perfil no puede editar pagos.', 403)
  if ((llegada !== null || ['estado_almacen', 'cantidad_recibida', 'fecha_almacen'].some(k => k in campos)) && !(await puede('almacen')))
    return errorJson('Tu perfil no puede editar el almacén.', 403)

  const supabase = supabaseServidor()
  const revision = await ultimaRevision(supabase, explosionId)
  if (!revision) return errorJson('La explosión no tiene revisiones.', 404)
  // Si la pantalla traía el id de la revisión anterior, se busca su copia en la última
  const linea = await lineaEnRevision(supabase, revision.id, lineaId)
  if (!linea) return errorJson('Ese material ya no está en la revisión actual. Recarga la página.', 409)

  /* ── Finanzas: la fecha se pone sola al cambiar el estado (se borra al regresar a pendiente) ── */
  const pagoAntes = estadoPagoDe(linea)
  const cambiaPago = !!campos.estado_pago && campos.estado_pago !== pagoAntes
  if (cambiaPago && !('fecha_estado_pago' in campos)) campos.fecha_estado_pago = campos.estado_pago === 'PENDIENTE DE PAGO' ? null : hoyMexico()

  /* ── Almacén: siempre a mano (nunca por un pago); estado y cantidad siempre coherentes ── */
  const almacenAntes = estadoAlmacenDe(linea)
  const recibidaAntes = linea.cantidad_recibida != null ? Number(linea.cantidad_recibida) : null
  const necesaria = Number(linea.cantidad) || 0
  if (llegada !== null) campos.cantidad_recibida = Math.round(((recibidaAntes ?? 0) + llegada) * 1000) / 1000
  let almacenNuevo = almacenAntes
  if (campos.estado_almacen || 'cantidad_recibida' in campos) {
    if (campos.estado_almacen) {
      // Eligió el estado
      almacenNuevo = campos.estado_almacen
      const dada = 'cantidad_recibida' in campos ? campos.cantidad_recibida ?? null : null
      if (almacenNuevo === 'PENDIENTE DE RECIBIR') campos.cantidad_recibida = null
      else if (almacenNuevo === 'PARCIALMENTE RECIBIDO') {
        const r = dada ?? recibidaAntes
        if (!r || r <= 0 || (necesaria > 0 && r >= necesaria))
          return errorJson(`Escribe cuánto llegó (más de 0 y menos de lo necesario${necesaria ? `: ${necesaria}` : ''}).`, 400)
        campos.cantidad_recibida = r
      } else {
        if (dada !== null && dada < necesaria) return errorJson(`Llegaron ${dada} de ${necesaria}: elige PARCIALMENTE RECIBIDO.`, 400)
        // RECIBIDO = la cantidad necesaria (o lo que ya había llegado, si fue de más)
        campos.cantidad_recibida = dada ?? (recibidaAntes !== null && recibidaAntes >= necesaria ? recibidaAntes : necesaria || null)
      }
    } else {
      // Escribió (o sumó) una cantidad: el estado se ajusta solo
      almacenNuevo = estadoAlmacenPorCantidad(campos.cantidad_recibida, necesaria)
      if (almacenNuevo === 'PENDIENTE DE RECIBIR') campos.cantidad_recibida = null
      campos.estado_almacen = almacenNuevo
    }
    campos.almacen = almacenNuevo === 'RECIBIDO'
    if (almacenNuevo !== almacenAntes && !('fecha_almacen' in campos)) campos.fecha_almacen = almacenNuevo === 'PENDIENTE DE RECIBIR' ? null : hoyMexico()
  }
  const cambiaAlmacen = almacenNuevo !== almacenAntes
  const recibidaNueva = 'cantidad_recibida' in campos ? campos.cantidad_recibida ?? null : recibidaAntes
  const cambiaRecibido = recibidaNueva !== recibidaAntes

  const { data, error } = await supabase.from('bom_revision_lineas').update(campos).eq('id', linea.id).select()
  if (error) return errorJson(error.message, 500)
  if (!data?.length) return errorJson('No se guardó el cambio (la base de datos no lo permitió).', 500)

  /* ── Historial y avisos (el cambio ya quedó guardado; si el aviso falla se dice) ── */
  const avisos: string[] = []
  if (cambiaPago || cambiaAlmacen || cambiaRecibido) {
    const usuario = await obtenerUsuarioDeSesion()
    const pedido = await pedidoDe(supabase, explosionId)
    const material = `${linea.clave}${linea.descripcion ? ` ${linea.descripcion}` : ''}`.trim()
    const base = { usuarioId: usuario.id || undefined, usuarioNombre: usuario.nombre, referenciaId: pedido.proyectoId ?? undefined, referenciaTipo: pedido.proyectoId ? 'proyecto' as const : undefined }
    const url = `/erp/bom/${explosionId}`
    if (cambiaPago) {
      registrarActividad({ ...base, tipo: 'bom_estado_pago', detalle: { pedido: pedido.codigo, clave: linea.clave, estado_anterior: pagoAntes, estado_nuevo: campos.estado_pago } })
      if (campos.estado_pago !== 'PENDIENTE DE PAGO') {
        const r = await avisarRol(supabase, 'almacen', {
          tipo: 'bom_pago', proyectoId: pedido.proyectoId, remitenteId: usuario.id || null, url,
          mensaje: `${pedido.codigo} · ${material} — ${campos.estado_pago === 'PAGADO' ? 'PAGADO: ya se pagó, debe llegarte el material completo.' : 'PARCIALMENTE PAGADO: llegará solo una parte del material.'}`,
        })
        if (r.error) avisos.push(`El pago quedó guardado, pero no se pudo avisar a almacén: ${r.error}`)
      }
    }
    if (cambiaAlmacen || cambiaRecibido) {
      registrarActividad({ ...base, tipo: 'bom_estado_almacen', detalle: { pedido: pedido.codigo, clave: linea.clave, estado_anterior: almacenAntes, estado_nuevo: almacenNuevo, recibido_anterior: recibidaAntes, recibido_nuevo: recibidaNueva, ...(llegada !== null ? { llegada } : {}) } })
      // Aviso a compras y finanzas: al recibir completo, o en cada parcial (cuánto llegó y cuánto falta)
      if (almacenNuevo === 'PARCIALMENTE RECIBIDO' || (almacenNuevo === 'RECIBIDO' && cambiaAlmacen)) {
        const unidad = linea.unidad ? ` ${linea.unidad}` : ''
        const faltan = Math.round(Math.max(0, necesaria - (recibidaNueva ?? 0)) * 1000) / 1000
        const pagado = estadoPagoDe({ estado_pago: campos.estado_pago ?? linea.estado_pago }) === 'PAGADO'
        const mensaje = almacenNuevo === 'RECIBIDO'
          ? `${pedido.codigo} · ${linea.clave} — RECIBIDO${recibidaNueva && recibidaNueva > necesaria ? ` (llegaron ${recibidaNueva} de ${necesaria}${unidad})` : ''}.`
          : pagado
            ? `${pedido.codigo} · ${material.slice(0, 70)} — PAGADO completo pero llegaron ${recibidaNueva} de ${necesaria}${unidad}: faltan ${faltan}. Revisar con el proveedor.`
            : `${pedido.codigo} · ${linea.clave} — PARCIALMENTE RECIBIDO: llegaron ${recibidaNueva} de ${necesaria}${unidad}.`
        const r = await avisarRol(supabase, ['compras', 'finanzas'], { tipo: 'bom_almacen', proyectoId: pedido.proyectoId, remitenteId: usuario.id || null, url, mensaje })
        if (r.error) avisos.push(`Almacén quedó guardado, pero no se pudo avisar a compras y finanzas: ${r.error}`)
      }
    }
  }
  return NextResponse.json({ linea: data[0], ...(avisos.length ? { aviso: avisos.join(' ') } : {}) })
}

export async function DELETE(request: NextRequest) {
  if (!(await puede('oc'))) return errorJson('Tu perfil no puede quitar órdenes de compra.', 403)
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
  const { data: borradas, error } = await supabase.from('bom_ordenes_compra').delete().eq('explosion_id', explosionId).eq('folio', folio).select('id')
  if (error) return errorJson(error.message, 500)
  // 0 renglones = ya no estaba o la base de datos no dejó borrarla: no se reporta éxito
  if (!borradas?.length) return errorJson(`No se quitó la OC ${folio}: ya no está o la base de datos no permitió borrarla. Recarga la página.`, 404)
  return NextResponse.json({ ok: true })
}
