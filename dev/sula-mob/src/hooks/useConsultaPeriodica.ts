'use client'

/**
 * useConsultaPeriodica.ts
 * ───────────────────────
 * Carga datos al montar y los mantiene al día sin gastar de más:
 *   - vuelve a cargar cada `cadaMs` SOLO con la pestaña a la vista (en segundo
 *     plano no consulta: ahorra batería y datos en el celular),
 *   - al regresar a la pestaña recarga una vez,
 *   - también recarga con los eventos de ventana indicados (ej. 'notificaciones-actualizadas')
 *     y cuando cambia `recargarCon`.
 * Con `cadaMs` en null solo carga al montar y con los eventos.
 *
 * La primera carga va en un setTimeout(0): así no se llama setState dentro del efecto
 * (React lo marca porque provoca renders en cascada).
 *
 * RUTA: src/hooks/useConsultaPeriodica.ts
 */

import { useEffect, useRef } from 'react'

export function useConsultaPeriodica(
  cargar: () => unknown,
  cadaMs: number | null,
  opciones?: { eventos?: string[]; recargarCon?: unknown },
) {
  // Siempre la versión más reciente de `cargar`, sin reiniciar los temporizadores
  const ref = useRef(cargar)
  useEffect(() => {
    ref.current = cargar
  })

  const claveEventos = (opciones?.eventos ?? []).join('|')
  const recargarCon = opciones?.recargarCon

  useEffect(() => {
    const correr = () => { void ref.current() }
    const siVisible = () => { if (document.visibilityState === 'visible') correr() }
    const eventos = claveEventos ? claveEventos.split('|') : []

    const primero = setTimeout(correr, 0)
    const intervalo = cadaMs ? setInterval(siVisible, cadaMs) : null
    if (cadaMs) document.addEventListener('visibilitychange', siVisible)
    eventos.forEach((e) => window.addEventListener(e, correr))

    return () => {
      clearTimeout(primero)
      if (intervalo) clearInterval(intervalo)
      document.removeEventListener('visibilitychange', siVisible)
      eventos.forEach((e) => window.removeEventListener(e, correr))
    }
  }, [cadaMs, claveEventos, recargarCon])
}
