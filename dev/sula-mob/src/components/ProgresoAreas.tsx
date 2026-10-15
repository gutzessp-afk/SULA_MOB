import { CheckCircle2 } from 'lucide-react';

export interface AreaProgreso {
  nombre: string;
  hechas: number;
  totales: number;
  /** 0 a 100 */
  pct: number;
}

interface Props {
  areas: AreaProgreso[];
  /** Avance total del proyecto (0 a 100); si no se pasa, no se muestra la barra de total */
  total?: number;
  /** Versión chica para tarjetas */
  compact?: boolean;
}

/** Rojo hasta 30%, amarillo hasta 60%, azul hasta 89% y verde de 90% para arriba */
function colorBarra(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 61) return 'bg-blue-500';
  if (pct >= 31) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Barras de avance de cada área de un proyecto */
export default function ProgresoAreas({ areas, total, compact = false }: Props) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      {areas.map((area) => (
        <div key={area.nombre}>
          <div className={`mb-1 flex items-center justify-between gap-3 ${compact ? 'text-xs' : 'text-sm'}`}>
            <span className="min-w-0 truncate text-white/70">{area.nombre}</span>
            <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-white/40">
              {!compact && area.totales > 0 && <span>{area.hechas}/{area.totales} pzas</span>}
              <span className="font-semibold text-white/70">{area.pct}%</span>
              {area.pct >= 100 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-label="Terminada" />}
            </span>
          </div>
          <div className={`overflow-hidden rounded-full bg-white/[0.06] ${compact ? 'h-1.5' : 'h-2.5'}`}>
            <div className={`h-full rounded-full transition-all duration-500 ${colorBarra(area.pct)}`} style={{ width: `${area.pct}%` }} />
          </div>
        </div>
      ))}

      {total !== undefined && (
        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold text-white">Progreso total</span>
            <span className="text-lg font-bold tabular-nums text-blue-400">{total}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
            <div className={`h-full rounded-full transition-all duration-700 ${colorBarra(total)}`} style={{ width: `${total}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
