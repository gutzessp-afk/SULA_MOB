'use client'

/**
 * useAvanceReal.ts
 * ────────────────
 * Avance real por área (0 a 1) de los proyectos que tienen plan de tiempos, para
 * compararlo con el plan. Solo lee: producto_area_avance unido a proyecto_productos,
 * todos los proyectos en la misma consulta (.in), por páginas de 1000 filas.
 *
 * La regla es la misma que usan el dashboard (matriz proyecto × área) y el seguimiento
 * del proyecto: cada producto vale por sus piezas hechas/totales (o su porcentaje si no
 * tiene piezas) y el área del proyecto es el promedio de sus productos.
 *
 * Sin proyectos con plan no consulta nada ni abre el canal en vivo.
 *
 * RUTA: src/hooks/useAvanceReal.ts
 */

import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useDatos } from '@/lib/cache-datos'
import { useRealtimeAvances } from '@/hooks/useRealtimeAvances'

interface FilaAvance {
  area_id: string
  porcentaje: number | null
  completado: boolean | null
  piezas_completadas: number | null
  piezas_totales: number | null
  proyecto_productos: { proyecto_id: string } | { proyecto_id: string }[] | null
}

/** proyectoId → areaId → avance de 0 a 1 */
export type AvanceReal = Record<string, Record<string, number>>

const POR_PAGINA = 1000
const SIN_AVANCE: AvanceReal = {}

/** Porcentaje (0 a 100) de un producto en un área: por piezas si las tiene, si no el guardado */
function porcentajeDe(f: FilaAvance): number {
  if (f.piezas_totales && f.piezas_totales > 0) {
    return Math.min(100, Math.round(((f.piezas_completadas || 0) / f.piezas_totales) * 100))
  }
  return f.porcentaje || (f.completado ? 100 : 0)
}

async function cargarAvanceReal(ids: string[]): Promise<AvanceReal> {
  if (ids.length === 0) return {}
  const filas: FilaAvance[] = []
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await supabase
      .from('producto_area_avance')
      .select('area_id, porcentaje, completado, piezas_completadas, piezas_totales, proyecto_productos!inner ( proyecto_id )')
      .in('proyecto_productos.proyecto_id', ids)
      .order('id')
      .range(desde, desde + POR_PAGINA - 1)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as unknown as FilaAvance[]))
    if (!data || data.length < POR_PAGINA) break
  }

  const suma = new Map<string, { total: number; n: number }>()
  for (const f of filas) {
    const relacion = Array.isArray(f.proyecto_productos) ? f.proyecto_productos[0] : f.proyecto_productos
    if (!relacion) continue
    const clave = `${relacion.proyecto_id}|${f.area_id}`
    const g = suma.get(clave) ?? { total: 0, n: 0 }
    g.total += porcentajeDe(f); g.n++
    suma.set(clave, g)
  }

  const avance: AvanceReal = {}
  for (const [clave, g] of suma) {
    const [proyecto, area] = clave.split('|')
    ;(avance[proyecto] ??= {})[area] = Math.round(g.total / g.n) / 100
  }
  return avance
}

export function useAvanceReal(proyectoIds: string[]) {
  const ids = useMemo(() => [...new Set(proyectoIds)].sort(), [proyectoIds])
  const clave = `avance-plan:${ids.join(',')}`
  const { datos, cargando, recargar } = useDatos(clave, () => cargarAvanceReal(ids))
  useRealtimeAvances(() => void recargar(), { habilitado: ids.length > 0 })
  return { avance: datos ?? SIN_AVANCE, cargando: ids.length > 0 && cargando }
}

/** Áreas activas en el orden del flujo (misma consulta y clave que la lista de Proyectos) */
export function useAreasActivas() {
  const { datos, cargando } = useDatos('areas-activas', async () => {
    const { data, error } = await supabase.from('areas').select('id, nombre, peso').eq('activo', true).order('orden', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []) as { id: string; nombre: string; peso: number }[]
  })
  return { areas: datos ?? [], cargando }
}
