/**
 * explosion-servidor.ts
 * ─────────────────────
 * Lógica de servidor de las revisiones de la explosión (tablas bom_revisiones y
 * bom_revision_lineas). Solo la importan las rutas de /api/bom/revisiones.
 *
 * La regla central vive aquí, en revisionEditable():
 *   · Si la última revisión es BORRADOR → se edita esa.
 *   · Si la última está CERRADA → se crea la siguiente (REV-01, REV-02…) copiando sus líneas,
 *     cada copia con origen_id = línea original. Así "editar" = "nueva revisión" automáticamente.
 *   · Si no hay ninguna → se crea REV-00 en blanco.
 * Solo se puede escribir mientras la explosión está 'en_proceso' (igual que la lista anterior).
 *
 * RUTA: src/lib/explosion-servidor.ts
 */

import { NextResponse } from 'next/server'
import { supabaseServidor } from './admin-api'
import { hoyMexico, type EncabezadoRev, type LineaRev, type Revision } from './explosion-revisiones'

export type Supabase = ReturnType<typeof supabaseServidor>

/** Campos de una revisión sin las líneas (lo que se lee de bom_revisiones) */
export type RevisionFila = Omit<Revision, 'lineas'>

export interface ExplosionBasica {
  id: string
  proyecto_id: string
  estado: string
}

/** Respuesta de error lista para devolver desde una ruta */
export const errorJson = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status })

export async function leerExplosion(supabase: Supabase, explosionId: string): Promise<ExplosionBasica | null> {
  const { data } = await supabase.from('bom_explosiones').select('id, proyecto_id, estado').eq('id', explosionId).maybeSingle()
  return data
}

/** null si se puede editar; si no, la respuesta de error */
export function bloqueoEdicion(explosion: ExplosionBasica | null): NextResponse | null {
  if (!explosion) return errorJson('Explosión no encontrada.', 404)
  if (explosion.estado === 'completado')
    return errorJson('La explosión está terminada: da clic en "Editar" para abrir una nueva revisión.', 409)
  if (explosion.estado !== 'en_proceso')
    return errorJson('La explosión no está en proceso: iníciala primero.', 409)
  return null
}

export async function ultimaRevision(supabase: Supabase, explosionId: string): Promise<RevisionFila | null> {
  const { data } = await supabase
    .from('bom_revisiones')
    .select('*')
    .eq('explosion_id', explosionId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

/** Encabezado inicial tomado del proyecto: cliente, sucursal/referencia y número de pedido */
export async function encabezadoInicial(supabase: Supabase, proyectoId: string, usuario: string): Promise<EncabezadoRev> {
  const { data: p } = await supabase
    .from('proyectos')
    .select('codigo, nombre, cliente, referencia_sucursal')
    .eq('id', proyectoId)
    .maybeSingle()
  // "PED-3518" → "3518"
  const pedido = String(p?.codigo ?? '').replace(/^\D+/, '') || String(p?.codigo ?? '')
  return {
    fecha: hoyMexico(),
    cliente: String(p?.cliente ?? '').trim(),
    proyecto: String(p?.referencia_sucursal || p?.nombre || '').trim(),
    pedido,
    orden_produccion: '',
    usuario,
  }
}

const COLUMNAS_COPIA = 'id, orden, clave, descripcion, unidad, clasificacion, moneda, costo, cantidad, oc, comprado'

/**
 * Revisión donde se escriben los cambios (ver la regla arriba).
 * Devuelve { revision, creada } o { error } listo para responder.
 */
export async function revisionEditable(
  supabase: Supabase,
  explosion: ExplosionBasica,
  usuario: string,
): Promise<{ revision: RevisionFila; creada: boolean } | { error: NextResponse }> {
  for (let intento = 0; intento < 3; intento++) {
    const ultima = await ultimaRevision(supabase, explosion.id)
    if (ultima?.estado === 'borrador') return { revision: ultima, creada: false }

    const encabezado: EncabezadoRev = ultima
      ? { ...(ultima.encabezado as EncabezadoRev), fecha: hoyMexico(), usuario }
      : await encabezadoInicial(supabase, explosion.proyecto_id, usuario)

    const { data: nueva, error } = await supabase
      .from('bom_revisiones')
      .insert({
        explosion_id: explosion.id,
        numero: ultima ? ultima.numero + 1 : 0,
        estado: 'borrador',
        encabezado,
        origen: 'manual',
        creado_por: usuario,
      })
      .select()
      .single()

    // 23505 = otro admin (u otra pestaña) creó la misma revisión al mismo tiempo: se vuelve a leer
    if (error?.code === '23505') continue
    if (error || !nueva) return { error: errorJson(error?.message || 'No se pudo crear la revisión.', 500) }

    if (ultima) {
      const { data: lineas, error: errL } = await supabase.from('bom_revision_lineas').select(COLUMNAS_COPIA).eq('revision_id', ultima.id)
      if (errL) return { error: errorJson(errL.message, 500) }
      if (lineas?.length) {
        const copias = lineas.map(({ id, ...resto }) => ({ ...resto, origen_id: id, revision_id: nueva.id, explosion_id: explosion.id }))
        const { error: errC } = await supabase.from('bom_revision_lineas').insert(copias)
        if (errC) {
          await supabase.from('bom_revisiones').delete().eq('id', nueva.id)
          return { error: errorJson(errC.message, 500) }
        }
      }
    }
    return { revision: nueva, creada: true }
  }
  return { error: errorJson('Otro usuario está creando la revisión, intenta de nuevo.', 409) }
}

/**
 * La línea del borrador que corresponde a `lineaId`.
 * Si `lineaId` es de la revisión cerrada anterior (la pantalla todavía no se recargaba), se busca
 * su copia por origen_id.
 */
export async function lineaEnRevision(supabase: Supabase, revisionId: string, lineaId: string): Promise<LineaRev | null> {
  const { data: directa } = await supabase.from('bom_revision_lineas').select('*').eq('id', lineaId).eq('revision_id', revisionId).maybeSingle()
  if (directa) return directa
  const { data: copia } = await supabase.from('bom_revision_lineas').select('*').eq('origen_id', lineaId).eq('revision_id', revisionId).maybeSingle()
  return copia
}
