/**
 * AreaBadge.tsx
 * ─────────────
 * Etiqueta de color para un área de producción. Los mismos colores se usan
 * en el visor 3D (COLOR_AREA) para que lista y modelo coincidan.
 *
 * RUTA: src/components/AreaBadge.tsx
 */

/** Color de cada área: clases del badge + color hexadecimal para el 3D */
export const ESTILO_AREA: Record<string, { badge: string; punto: string; hex: string }> = {
  'Corte de tubo': { badge: 'bg-blue-500/20 text-blue-400', punto: 'bg-blue-400', hex: '#3b82f6' },
  'Corte de Laser': { badge: 'bg-red-500/20 text-red-400', punto: 'bg-red-400', hex: '#ef4444' },
  'Corte de Lamina': { badge: 'bg-slate-500/20 text-slate-300', punto: 'bg-slate-400', hex: '#64748b' },
  'Doblez': { badge: 'bg-emerald-500/20 text-emerald-400', punto: 'bg-emerald-400', hex: '#10b981' },
  'Troquel': { badge: 'bg-purple-500/20 text-purple-400', punto: 'bg-purple-400', hex: '#a855f7' },
  'Punteado': { badge: 'bg-amber-500/20 text-amber-400', punto: 'bg-amber-400', hex: '#f59e0b' },
  'Soldadura Y Pulido': { badge: 'bg-orange-500/20 text-orange-400', punto: 'bg-orange-400', hex: '#f97316' },
  'Pintura': { badge: 'bg-pink-500/20 text-pink-400', punto: 'bg-pink-400', hex: '#ec4899' },
  'Empaque': { badge: 'bg-cyan-500/20 text-cyan-400', punto: 'bg-cyan-400', hex: '#06b6d4' },
}

const SIN_AREA = { badge: 'bg-white/10 text-white/50', punto: 'bg-white/40', hex: '#9ca3af' }

export const estiloArea = (area: string) => ESTILO_AREA[area] ?? SIN_AREA

export function AreaBadge({ area }: { area: string }) {
  const e = estiloArea(area)
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${e.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.punto}`} />
      {area || 'Sin área'}
    </span>
  )
}
