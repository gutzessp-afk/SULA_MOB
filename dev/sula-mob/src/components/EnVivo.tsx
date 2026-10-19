/**
 * EnVivo.tsx
 * ──────────
 * Punto verde pulsante "En vivo" cuando la página recibe cambios en tiempo real;
 * gris "Sin conexión en vivo" si se cayó (los datos se siguen actualizando al recargar).
 *
 * RUTA: src/components/EnVivo.tsx
 */

import type { EstadoRealtime } from '@/hooks/useRealtimeAvances'

export function EnVivo({ estado, className = '' }: { estado: EstadoRealtime; className?: string }) {
  if (estado === 'conectando') return null
  const vivo = estado === 'en_vivo'
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider ${vivo ? 'text-emerald-400/80' : 'text-white/35'} ${className}`}
      title={vivo ? 'Los avances de los operadores aparecen solos, sin recargar' : 'Se perdió la conexión en vivo; se reintenta sola'}
      role="status"
    >
      <span className="relative flex h-2 w-2">
        {vivo && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${vivo ? 'bg-emerald-500' : 'bg-white/30'}`} />
      </span>
      {vivo ? 'En vivo' : 'Sin conexión en vivo'}
    </span>
  )
}
