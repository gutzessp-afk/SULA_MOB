/**
 * rate-limit.ts
 * ─────────────
 * Límite de peticiones por usuario en una ventana de tiempo, guardado en memoria.
 * En Vercel cada instancia del servidor lleva su propia cuenta, así que es un freno
 * contra el abuso accidental (un cliente que se queda mandando peticiones), no una
 * garantía exacta. Solo se importa desde archivos route.ts.
 *
 * RUTA: src/lib/rate-limit.ts
 */

const registros = new Map<string, { cuenta: number; reinicia: number }>()
const MAX_REGISTROS = 1000

/** true si `clave` todavía puede hacer otra petición dentro de la ventana */
export function permitido(clave: string, maximo: number, ventanaMs: number): boolean {
  const ahora = Date.now()

  if (registros.size > MAX_REGISTROS) {
    for (const [k, r] of registros) if (r.reinicia < ahora) registros.delete(k)
  }

  const registro = registros.get(clave)
  if (!registro || registro.reinicia < ahora) {
    registros.set(clave, { cuenta: 1, reinicia: ahora + ventanaMs })
    return true
  }
  if (registro.cuenta >= maximo) return false
  registro.cuenta++
  return true
}
