/**
 * ProgresoAreas.tsx
 * ─────────────────
 * Avance de cada área de un proyecto en una cuadrícula compacta
 * (2 columnas en celular y tablet, 3 en computadora): un cuadro con el %
 * (o ✓ si terminó), el nombre, una barra delgada y las piezas hechas.
 *
 * RUTA: src/components/ProgresoAreas.tsx
 */

export interface AreaProgreso {
  nombre: string;
  hechas: number;
  totales: number;
  /** 0 a 100 */
  pct: number;
}

/** Verde terminada, ámbar en proceso, gris sin iniciar */
function tono(pct: number) {
  if (pct >= 100) return { cuadro: 'bg-emerald-500/15 text-emerald-400 border-emerald-400/30', barra: 'bg-emerald-400' };
  if (pct > 0) return { cuadro: 'bg-amber-500/15 text-amber-400 border-amber-400/30', barra: 'bg-amber-400' };
  return { cuadro: 'bg-white/[0.06] text-white/30 border-white/10', barra: 'bg-white/10' };
}

export default function ProgresoAreas({ areas }: { areas: AreaProgreso[] }) {
  return (
    <ul className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-3">
      {areas.map((area) => {
        const t = tono(area.pct);
        const estado = area.pct >= 100 ? 'Completada' : area.pct > 0 ? 'En proceso' : 'Sin iniciar';
        return (
          <li
            key={area.nombre}
            title={`${area.nombre}: ${estado}`}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2 transition-colors hover:bg-white/[0.06] sm:gap-3 sm:p-2.5"
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px] font-bold sm:h-9 sm:w-9 sm:text-[11px] ${t.cuadro}`}>
              {area.pct >= 100 ? '✓' : `${area.pct}%`}
            </span>
            <span className="min-w-0 flex-1">
              {/* El nombre puede ocupar dos líneas en celular en vez de cortarse */}
              <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-white sm:truncate sm:text-xs">{area.nombre}</span>
              <span className="mt-1.5 flex items-center gap-2">
                <span className="block h-1 flex-1 overflow-hidden rounded-full bg-black/40">
                  <span className={`block h-full rounded-full transition-all duration-500 ${t.barra}`} style={{ width: `${area.pct}%` }} />
                </span>
                {area.totales > 0 && (
                  <span className="shrink-0 font-mono text-[10px] text-white/40">{area.hechas}/{area.totales}</span>
                )}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
