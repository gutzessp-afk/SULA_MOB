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
 *     no trae clave) para pintar qué cambió, y conserva su OC, Compra, Almacén y sus fechas.
 *
 * La explosión debe estar 'en_proceso' (la página la inicia antes de subir). Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/revisiones/importar/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { obtenerUsuarioDeSesion } from '@/lib/registrar-actividad'
import { leerExcelExplosion } from '@/lib/explosion-excel'
import { bloqueoEdicion, encabezadoInicial, errorJson, leerExplosion, ultimaRevision } from '@/lib/explosion-servidor'
import { etiquetaRev, normalizar } from '@/lib/explosion-revisiones'

const MAX_BYTES = 5 * 1024 * 1024

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)

  const form = await request.formData().catch(() => null)
  const explosionId = form?.get('explosion_id')
  const archivo = form?.get('archivo')
  const reemplazar = form?.get('modo') === 'reemplazar'
  if (typeof explosionId !== 'string' || !explosionId) return errorJson('Falta explosion_id.', 400)
  if (!(archivo instanceof File)) return errorJson('Falta el archivo.', 400)
  if (!/\.xlsx$/i.test(archivo.name)) return errorJson('El archivo debe ser .xlsx (Excel).', 400)
  if (archivo.size > MAX_BYTES) return errorJson('El archivo pesa más de 5 MB.', 400)

  const supabase = supabaseServidor()
  const explosion = await leerExplosion(supabase, explosionId)
  const bloqueo = bloqueoEdicion(explosion)
  if (bloqueo) return bloqueo

  /* ── 1. Leer el Excel ── */
  let importada
  try {
    importada = await leerExcelExplosion(await archivo.arrayBuffer())
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : 'No se pudo leer el Excel.', 400)
  }
  const avisos = [...importada.avisos]
  const usuario = await obtenerUsuarioDeSesion()

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
  const base = await encabezadoInicial(supabase, explosion!.proyecto_id, usuario.nombre)
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
  // OC y Compra ya capturados pasan a la revisión nueva (son de compras, no del Excel)
  const compras = new Map<string, { oc: string; comprado: boolean; fecha_compra: string | null; almacen: boolean; fecha_almacen: string | null }>()
  if (anteriorId) {
    const { data: previas } = await supabase.from('bom_revision_lineas').select('id, clave, descripcion, oc, comprado, fecha_compra, almacen, fecha_almacen').eq('revision_id', anteriorId).order('orden')
    for (const l of previas ?? []) {
      compras.set(l.id, { oc: l.oc ?? '', comprado: !!l.comprado, fecha_compra: l.fecha_compra ?? null, almacen: !!l.almacen, fecha_almacen: l.fecha_almacen ?? null })
      const llave = normalizar(l.clave) || `d:${normalizar(l.descripcion)}`
      disponibles.set(llave, [...(disponibles.get(llave) ?? []), l.id])
    }
  }

  const filas = importada.lineas.map((l, i) => {
    const llave = normalizar(l.clave) || `d:${normalizar(l.descripcion)}`
    const origen = disponibles.get(llave)?.shift() ?? null
    return { ...l, ...(origen ? compras.get(origen) : undefined), revision_id: revision.id, explosion_id: explosionId, origen_id: origen, orden: i }
  })

  // En bloques para no mandar una petición gigante
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from('bom_revision_lineas').insert(filas.slice(i, i + 500))
    if (error) {
      await supabase.from('bom_revisiones').delete().eq('id', revision.id)
      return errorJson(`No se pudieron guardar los materiales: ${error.message}`, 500)
    }
  }

  return NextResponse.json({ revision, lineas: filas.length, avisos })
}
