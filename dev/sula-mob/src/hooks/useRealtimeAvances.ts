'use client'

/**
 * useRealtimeAvances.ts
 * ─────────────────────
 * Escucha en tiempo real (Supabase Realtime) los cambios que deja un avance de
 * operador y ejecuta `onCambio` (normalmente volver a cargar los datos).
 *
 * Un solo registrarAvance() toca 4 tablas en ~200 ms (avances, producto_area_avance,
 * proyecto_productos y proyectos): los eventos se juntan 500 ms y se recarga una vez.
 *
 * Con `proyectoId` solo escucha los cambios de ese proyecto (las tablas que tienen
 * proyecto_id se filtran en el servidor; producto_area_avance no lo tiene y no se
 * escucha, pero cada avance también cambia `avances` y `proyectos`, que sí se filtran).
 *
 * Devuelve el estado de la conexión para mostrar "En vivo" solo cuando de verdad lo está.
 * Supabase reconecta solo si se cae la red; al reconectar se recarga una vez por si
 * hubo cambios mientras tanto.
 *
 * RUTA: src/hooks/useRealtimeAvances.ts
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type EstadoRealtime = 'conectando' | 'en_vivo' | 'desconectado'

const ESPERA_MS = 500
// Cada uso del hook abre su propio canal: dos con el mismo nombre chocarían
let siguienteCanal = 0

export function useRealtimeAvances(
  onCambio: () => void,
  opciones?: { proyectoId?: string; habilitado?: boolean },
): EstadoRealtime {
  const { proyectoId, habilitado = true } = opciones ?? {}
  const [estado, setEstado] = useState<EstadoRealtime>('conectando')

  // Siempre la versión más reciente del callback, sin volver a suscribirse
  const callbackRef = useRef(onCambio)
  useEffect(() => {
    callbackRef.current = onCambio
  })

  useEffect(() => {
    if (!habilitado) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let yaConectado = false
    const avisar = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => callbackRef.current(), ESPERA_MS)
    }

    const filtro = proyectoId ? `proyecto_id=eq.${proyectoId}` : undefined
    let canal = supabase
      .channel(`avances-${proyectoId ?? 'global'}-${++siguienteCanal}`)
      // Registro del operador (alta y borrado)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avances', filter: filtro }, avisar)
      // Progreso recalculado del producto y del proyecto
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proyecto_productos', filter: filtro }, avisar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proyectos', filter: proyectoId ? `id=eq.${proyectoId}` : undefined }, avisar)
    // Piezas por área: sin proyecto_id, solo en las vistas globales
    if (!proyectoId) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'producto_area_avance' }, avisar)

    canal.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setEstado('en_vivo')
        // Al reconectar después de un corte: recargar por lo que haya pasado mientras tanto
        if (yaConectado) avisar()
        yaConectado = true
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setEstado('desconectado')
      }
    })

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(canal)
    }
  }, [proyectoId, habilitado])

  return habilitado ? estado : 'desconectado'
}
