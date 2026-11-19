/**
 * /api/bom/revisiones/importar/route.ts
 * ─────────────────────────────────────
 * Importa el Excel "EXPLOSION DE MATERIALES … REV-xx.xlsx" de SULA como una revisión.
 *
 *   POST multipart/form-data { explosion_id, archivo }                   → { revision, avisos }
 *   POST multipart/form-data { explosion_id, archivo, modo: 'reemplazar' } → el archivo sustituye a la
 *        ÚLTIMA revisión (aunque esté cerrada) y conserva su número. Para cuando se subió el Excel
 *        equivocado: REV-00 equivocado → se sube el bueno y sigue siendo REV-00.
 *
 * Reglas:
 *   · Si es la primera revisión, se respeta el número del archivo (A1 = "REV-01" → REV-01;
 *     sin número → REV-00).
 *   · Si ya hay revisiones, el archivo entra como la siguiente (REV-n+1). Si había un borrador,
 *     el archivo lo reemplaza (la página pide confirmación antes).
 *   · La revisión importada queda CERRADA: es el archivo original. Al editarla, el sistema abre
 *     la siguiente revisión automáticamente.
 *   · Cada material se liga con el de la revisión anterior por su Clave (o por la descripción si
 *     no trae clave) para pintar qué cambió, y conserva su OC, Compra, estados de FINANZAS y ALMACÉN,
 *     cantidad recibida y sus fechas.
 *   · Materiales nuevos: PENDIENTE DE PAGO / PENDIENTE DE RECIBIR (DEFAULT de la BD,
 *     sql/explosion_estados.sql). Si el Excel ya trae OC, estados, fechas o cantidad (plantilla de SULA
 *     o un Excel descargado del sistema) se respetan; lo ya capturado en el sistema gana sobre el archivo.
 *
 *   POST multipart/form-data { archivo, pedido_elegido? }  (sin explosion_id: panel de madera)
 *        → el pedido sale del PEDIDO del encabezado (o de pedido_elegido). Si el pedido no está dado de
 *          alta, se usa/crea su explosión "sin alta" (src/lib/explosion-pedido.ts); si estaba pendiente
 *          se inicia. Después se aplican las OC en espera de ese pedido.
 *          → { revision, avisos, explosion_id, sin_alta, pedido, oc_aplicadas }
 *
 * La explosión debe estar 'en_proceso' (la página la inicia antes de subir). Administradores, área
 * de madera (que sube el Excel desde /madera) y perfil compras: puede('excel').
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/revisiones/importar/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { puede, supabaseServidor } from '@/lib/admin-api'
import { obtenerUsuarioDeSesion } from '@/lib/registrar-actividad'
import { leerExcelExplosion } from '@/lib/explosion-excel'
import { bloqueoEdicion, encabezadoInicial, errorJson, leerExplosion, ultimaRevision } from '@/lib/explosion-servidor'
import { etiquetaRev, hoyMexico, normalizar } from '@/lib/explosion-revisiones'
import { aplicarOcEnEspera, explosionParaExcel, numeroDePedido, vincularPendientes } from '@/lib/explosion-pedido'

const MAX_BYTES = 5 * 1024 * 1024

/** Solo los campos con valor (sin null, undefined ni texto vacío) */
function conValor(campos: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}

export async function POST(request: NextRequest) {
  if (!(await puede('excel'))) return errorJson('Tu perfil no puede subir el Excel de explosión.', 403)

  const form = await request.formData().catch(() => null)
  const explosionDada = form?.get('explosion_id')
  const archivo = form?.get('archivo')
  const reemplazar = form?.get('modo') === 'reemplazar'
  // Sin explosion_id (panel de madera): el pedido sale del encabezado del Excel
  const detectar = typeof explosionDada !== 'string' || !explosionDada
  if (!(archivo instanceof File)) return errorJson('Falta el archivo.', 400)
  if (!/\.xlsx$/i.test(archivo.name)) return errorJson('El archivo debe ser .xlsx (Excel).', 400)
  if (archivo.size > MAX_BYTES) return errorJson('El archivo pesa más de 5 MB.', 400)

  const supabase = supabaseServidor()
  const usuario = await obtenerUsuarioDeSesion()
  let explosionId = detectar ? '' : (explosionDada as string)
  let importada: Awaited<ReturnType<typeof leerExcelExplosion>> | null = null
  let detectado: { sinAlta: boolean; numero: string } | null = null
  const avisosPedido: string[] = []

  if (detectar) {
    try {
      importada = await leerExcelExplosion(await archivo.arrayBuffer())
    } catch (e) {
      return errorJson(e instanceof Error ? e.message : 'No se pudo leer el Excel.', 400)
    }
    avisosPedido.push(...(await vincularPendientes(supabase, usuario.nombre)))
    const numero = numeroDePedido(importada.encabezado.pedido) || numeroDePedido(form?.get('pedido_elegido'))
    if (!numero) return errorJson('El Excel no trae el número de PEDIDO; elige el pedido en la lista y vuelve a subirlo.', 400)
    const r = await explosionParaExcel(supabase, numero, usuario)
    if ('error' in r) return errorJson(r.error, r.status)
    explosionId = r.explosion.id
    detectado = { sinAlta: r.sinAlta, numero }
  }

  const explosion = await leerExplosion(supabase, explosionId)
  const bloqueo = bloqueoEdicion(explosion)
  if (bloqueo) return bloqueo

  /* ── 1. Leer el Excel ── */
  if (!importada) {
    try {
      importada = await leerExcelExplosion(await archivo.arrayBuffer())
    } catch (e) {
      return errorJson(e instanceof Error ? e.message : 'No se pudo leer el Excel.', 400)
    }
  }
  const avisos = [...importada.avisos]

  /* ── 2. Número de revisión y revisión anterior (para ligar los cambios) ── */
  const ultima = await ultimaRevision(supabase, explosionId)
  let numero: number
  let anteriorId: string | null = null

  if (!ultima) {
    numero = importada.numero ?? 0
  } else if (ultima.estado === 'borrador' || reemplazar) {
    numero = ultima.numero
    const { data: previa } = await supabase
      .from('bom_revisiones').select('id').eq('explosion_id', explosionId).eq('numero', ultima.numero - 1).maybeSingle()
    anteriorId = previa?.id ?? null
    // Si se reemplaza la primera revisión, manda el número que traiga el archivo
    if (!previa && reemplazar && importada.numero !== null) numero = importada.numero
    // El archivo reemplaza el borrador (o la última revisión, si se pidió reemplazar)
    const { error } = await supabase.from('bom_revisiones').delete().eq('id', ultima.id)
    if (error) return errorJson(error.message, 500)
  } else {
    numero = ultima.numero + 1
    anteriorId = ultima.id
  }
  if (importada.numero !== null && importada.numero !== numero)
    avisos.push(`El archivo decía ${etiquetaRev(importada.numero)}; en el sistema queda como ${etiquetaRev(numero)}.`)

  /* ── 3. Encabezado: lo del proyecto + lo que traiga el archivo ── */
  // Sin alta no hay proyecto: el encabezado queda con lo que traiga el archivo
  const base = explosion!.proyecto_id
    ? await encabezadoInicial(supabase, explosion!.proyecto_id, usuario.nombre)
    : { fecha: hoyMexico(), cliente: '', proyecto: '', pedido: detectado?.numero ?? '', orden_produccion: '', usuario: usuario.nombre }
  const delArchivo = Object.fromEntries(Object.entries(importada.encabezado).filter(([, v]) => typeof v === 'string' && v.trim()))
  const encabezado = { ...base, ...delArchivo }

  const ahora = new Date().toISOString()
  const { data: revision, error: errRev } = await supabase
    .from('bom_revisiones')
    .insert({
      explosion_id: explosionId,
      numero,
      estado: 'cerrada',
      encabezado,
      motivo: '',
      origen: 'importado',
      archivo_nombre: archivo.name.slice(0, 200),
      creado_por: usuario.nombre,
      cerrada_en: ahora,
      cerrada_por: usuario.nombre,
    })
    .select()
    .single()
  if (errRev) {
    if (errRev.code === '23505') return errorJson('Otro usuario acaba de crear una revisión. Recarga e intenta de nuevo.', 409)
    return errorJson(errRev.message, 500)
  }

  /* ── 4. Ligar cada material con la revisión anterior (clave; si no hay, descripción) ── */
  const disponibles = new Map<string, string[]>()
  // Compras, finanzas y almacén ya capturados pasan a la revisión nueva (no son de la explosión).
  // Solo lo que tiene algo: así lo que traiga el Excel llena lo que el sistema todavía no tenía.
  const compras = new Map<string, Record<string, unknown>>()
  if (anteriorId) {
    const { data: previas } = await supabase
      .from('bom_revision_lineas')
      .select('id, clave, descripcion, oc, comprado, fecha_compra, almacen, fecha_almacen, estado_pago, fecha_estado_pago, estado_almacen, cantidad_recibida')
      .eq('revision_id', anteriorId)
      .order('orden')
    for (const l of previas ?? []) {
      compras.set(l.id, conValor({
        oc: l.oc, comprado: l.comprado || undefined, fecha_compra: l.fecha_compra, fecha_almacen: l.fecha_almacen,
        estado_pago: l.estado_pago === 'PENDIENTE DE PAGO' ? undefined : l.estado_pago, fecha_estado_pago: l.fecha_estado_pago,
        estado_almacen: l.estado_almacen === 'PENDIENTE DE RECIBIR' ? undefined : l.estado_almacen, cantidad_recibida: l.cantidad_recibida,
      }))
      const llave = normalizar(l.clave) || `d:${normalizar(l.descripcion)}`
      disponibles.set(llave, [...(disponibles.get(llave) ?? []), l.id])
    }
  }

  const filas = importada.lineas.map((l, i) => {
    const llave = normalizar(l.clave) || `d:${normalizar(l.descripcion)}`
    const origen = disponibles.get(llave)?.shift() ?? null
    const fila: Record<string, unknown> = { ...l, ...(origen ? compras.get(origen) : undefined), revision_id: revision.id, explosion_id: explosionId, origen_id: origen, orden: i }
    // Compatibilidad: la casilla almacen es true solo con RECIBIDO (dashboard de madera, KPIs, filtros)
    fila.almacen = fila.estado_almacen === 'RECIBIDO'
    return fila
  })

  // En bloques para no mandar una petición gigante
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from('bom_revision_lineas').insert(filas.slice(i, i + 500))
    if (error) {
      await supabase.from('bom_revisiones').delete().eq('id', revision.id)
      return errorJson(`No se pudieron guardar los materiales: ${error.message}`, 500)
    }
  }

  // Panel de madera: las OC que esperaban este pedido se aplican ya
  if (detectado) {
    const oc = await aplicarOcEnEspera(supabase, explosionId, detectado.numero, usuario.nombre)
    return NextResponse.json({
      revision, lineas: filas.length, avisos: [...avisosPedido, ...avisos, ...oc.avisos],
      explosion_id: explosionId, sin_alta: detectado.sinAlta, pedido: detectado.numero, oc_aplicadas: oc.aplicadas,
    })
  }

  return NextResponse.json({ revision, lineas: filas.length, avisos })
}
