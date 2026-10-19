import { useEffect, useState } from 'react'

/**
 * Devuelve el valor "con retraso": solo cambia cuando `value` lleva `delay` ms
 * sin modificarse. Sirve para no filtrar una lista en cada tecla de un buscador.
 *
 * RUTA: src/hooks/useDebounce.ts
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
