/**
 * eliminar-proyecto.ts
 * ────────────────────
 * Borra un proyecto con todo lo que depende de él, de las hojas hacia la raíz,
 * para que ninguna llave foránea lo impida:
 *   avance_componente → componentes → subensambles → partidas
 *   producto_area_avance → avances, retrasos, notificaciones → proyecto_productos → proyectos
 *
 * Al final comprueba que el proyecto de verdad desapareció: si la base no deja
 * borrar (permisos RLS), Supabase no marca error pero tampoco borra nada.
 *
 * Si se aplica sql/borrado_en_cascada.sql en Supabase, la base hace esto sola.
 *
 * RUTA: src/lib/eliminar-proyecto.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js'

type Resultado = { ok: true } | { ok: false; error: string }

// Columna o tabla que no existe en esta base: ese paso no aplica
const NO_APLICA = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

export async function eliminarProyecto(supabase: SupabaseClient, proyectoId: string): Promise<Resultado> {
  const ids = async (tabla: string, columna: string, valores: string[]) => {
    if (!valores.length) return []
    const { data, error } = await supabase.from(tabla).select('id').in(columna, valores)
    if (error) {
      if (NO_APLICA.has(error.code)) return []
      throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
    }
    return (data ?? []).map((f) => f.id as string)
  }
  const borrar = async (tabla: string, columna: string, valores: string[]) => {
    if (!valores.length) return
    const { error } = await supabase.from(tabla).delete().in(columna, valores)
    if (error && !NO_APLICA.has(error.code)) throw new Error(`No se pudo borrar ${tabla}: ${error.message}`)
  }

  try {
    const partidas = await ids('partidas', 'proyecto_id', [proyectoId])
    const subensambles = await ids('subensambles', 'partida_id', partidas)
    const componentes = await ids('componentes', 'subensamble_id', subensambles)
    const productos = await ids('proyecto_productos', 'proyecto_id', [proyectoId])

    await borrar('avance_componente', 'componente_id', componentes)
    await borrar('componentes', 'id', componentes)
    await borrar('subensambles', 'id', subensambles)
    await borrar('partidas', 'id', partidas)
    await borrar('producto_area_avance', 'producto_id', productos)
    await borrar('avances', 'proyecto_id', [proyectoId])
    await borrar('retrasos', 'proyecto_id', [proyectoId])
    await borrar('notificaciones', 'proyecto_id', [proyectoId])
    await borrar('proyecto_productos', 'id', productos)

    const { data, error } = await supabase.from('proyectos').delete().eq('id', proyectoId).select('id')
    if (error) return { ok: false, error: error.message }
    if (!data?.length) {
      return { ok: false, error: 'La base de datos no permitió borrar el proyecto (permisos de Supabase). Aplica sql/borrado_en_cascada.sql o revisa las políticas RLS de la tabla proyectos.' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
