import { useCallback, useEffect, useRef } from 'react'

/**
 * Devuelve una función que pide recargar datos agrupando las llamadas seguidas:
 * corre `cargar` una sola vez `ms` después de la última petición y nunca dos a la vez
 * (si llega otra mientras carga, se repite una vez al terminar).
 *
 * Sirve para los cambios en tiempo real de Supabase: escribir rápido o varios admins
 * trabajando generan muchos eventos seguidos y cada uno recargaba la página completa.
 *
 * RUTA: src/hooks/useRecargaAgrupada.ts
 */
export function useRecargaAgrupada(cargar: () => Promise<unknown> | void, ms = 300): () => void {
  const cargarRef = useRef(cargar)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cargando = useRef(false)
  const otraVez = useRef(false)

  useEffect(() => { cargarRef.current = cargar }, [cargar])
  useEffect(() => () => clearTimeout(timer.current), [])

  const correr = useCallback(async () => {
    if (cargando.current) { otraVez.current = true; return }
    cargando.current = true
    try {
      // Si llegaron más peticiones mientras cargaba, se repite una vez más
      do {
        otraVez.current = false
        await cargarRef.current()
      } while (otraVez.current)
    } finally {
      cargando.current = false
    }
  }, [])

  return useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void correr(), ms)
  }, [correr, ms])
}
