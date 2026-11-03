'use client'

/**
 * usePlanes.ts
 * ────────────
 * Planes de tiempos guardados (ver lib/plan-almacen.ts), al día con lo que se guarde
 * en esta pestaña (evento propio) o en otra (evento "storage").
 *
 * En el servidor y en la hidratación no hay planes, igual que en el primer render
 * del cliente; se leen ya montada la pantalla y así no hay errores de hidratación.
 *
 * RUTA: src/hooks/usePlanes.ts
 */

import { useSyncExternalStore } from 'react'
import { EVENTO_PLANES, interpretarPlanes, leerTextoPlanes, type Planes } from '@/lib/plan-almacen'

const SIN_PLANES: Planes = {}

// El mismo texto devuelve el mismo objeto: useSyncExternalStore lo exige para no repintar sin fin
let ultimoTexto = ''
let ultimosPlanes: Planes = SIN_PLANES

function leer(): Planes {
  const texto = leerTextoPlanes()
  if (texto !== ultimoTexto) {
    ultimoTexto = texto
    ultimosPlanes = texto ? interpretarPlanes(texto) : SIN_PLANES
  }
  return ultimosPlanes
}

function suscribir(avisar: () => void) {
  window.addEventListener(EVENTO_PLANES, avisar)
  window.addEventListener('storage', avisar)
  return () => {
    window.removeEventListener(EVENTO_PLANES, avisar)
    window.removeEventListener('storage', avisar)
  }
}

export function usePlanes(): Planes {
  return useSyncExternalStore(suscribir, leer, () => SIN_PLANES)
}
