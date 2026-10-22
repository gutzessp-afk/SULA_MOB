/**
 * versiones-plano.ts
 * ──────────────────
 * Historial de versiones del BOM de una clave (tabla plano_versiones,
 * sql/plano_versiones.sql). Cada análisis de un PDF nuevo o cada corrección
 * guardada a mano agrega una versión con lo que cambió contra la anterior.
 *
 * Si la tabla todavía no existe, no se registra nada y quien llama sigue
 * funcionando (devuelve null). Solo en el servidor.
 *
 * RUTA: src/lib/versiones-plano.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { compararBOMs } from './comparar-bom'
import type { BomSource, Diferencia, PlantillaBOM } from './types'

/** La tabla o la columna aún no existe: falta correr sql/plano_versiones.sql */
export const faltaEsquema = (error: { code?: string; message?: string } | null) =>
  !!error && (['42P01', 'PGRST205', 'PGRST204', '42703'].includes(error.code ?? '') || /plano_versiones|archivo_hash|version_actual|editado_manualmente/.test(error.message ?? ''))

interface NuevaVersion {
  clave: string
  bom: PlantillaBOM
  archivo_nombre: string | null
  archivo_hash: string | null
  analizado_por: BomSource
  /**
   * El BOM que había antes, si la clave ya tenía plantilla pero aún no tiene
   * historial (se analizó antes de que existieran las versiones): se guarda
   * como versión 1 para poder compararlo y regresar a él.
   */
  previoSinHistorial?: { bom: PlantillaBOM; archivo_nombre: string | null; analizado_por: BomSource } | null
}

/** Agrega la versión y devuelve su número y sus cambios; null si no hay tabla de versiones */
export async function registrarVersion(supabase: SupabaseClient, nueva: NuevaVersion): Promise<{ version: number; cambios: Diferencia[] | null } | null> {
  for (let intento = 0; intento < 2; intento++) {
    const { data: ultima, error } = await supabase
      .from('plano_versiones')
      .select('version, bom_snapshot')
      .eq('clave', nueva.clave)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (faltaEsquema(error)) return null
    if (error) throw new Error('No se pudo leer el historial del plano: ' + error.message)

    let anterior = ultima as { version: number; bom_snapshot: PlantillaBOM } | null
    if (!anterior && nueva.previoSinHistorial) {
      const p = nueva.previoSinHistorial
      const { error: e1 } = await supabase.from('plano_versiones').insert({
        clave: nueva.clave, version: 1, bom_snapshot: p.bom, archivo_nombre: p.archivo_nombre, archivo_hash: null, cambios: null, analizado_por: p.analizado_por,
      })
      if (e1 && e1.code !== '23505') throw new Error('No se pudo guardar el historial del plano: ' + e1.message)
      if (e1) continue
      anterior = { version: 1, bom_snapshot: p.bom }
    }

    const version = (anterior?.version ?? 0) + 1
    const cambios = anterior ? compararBOMs(anterior.bom_snapshot, nueva.bom) : null
    const { error: e2 } = await supabase.from('plano_versiones').insert({
      clave: nueva.clave, version, bom_snapshot: nueva.bom, archivo_nombre: nueva.archivo_nombre, archivo_hash: nueva.archivo_hash, cambios, analizado_por: nueva.analizado_por,
    })
    // 23505: otra persona guardó una versión al mismo tiempo; se recalcula con la suya
    if (e2?.code === '23505') continue
    if (e2) throw new Error('No se pudo guardar el historial del plano: ' + e2.message)
    return { version, cambios }
  }
  throw new Error('Otra persona está guardando este plano al mismo tiempo. Intenta de nuevo.')
}
