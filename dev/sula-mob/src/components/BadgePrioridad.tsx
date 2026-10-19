/**
 * BadgePrioridad.tsx
 * ──────────────────
 * Etiqueta de prioridad de un proyecto con su color (urgente rojo, alta naranja,
 * media azul, baja gris). Se usa en el dashboard y en la lista de proyectos.
 *
 * RUTA: src/components/BadgePrioridad.tsx
 */

const COLORES: Record<string, string> = {
  urgente: 'bg-red-500/15 text-red-300 border-red-400/30',
  alta: 'bg-orange-500/15 text-orange-300 border-orange-400/30',
  media: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  baja: 'bg-white/10 text-white/50 border-white/15',
};

export function BadgePrioridad({ prioridad }: { prioridad?: string | null }) {
  const valor = (prioridad || 'media').toLowerCase();
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${COLORES[valor] || COLORES.media}`}>
      {valor}
    </span>
  );
}
