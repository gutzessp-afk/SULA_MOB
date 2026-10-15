import type { ReactNode } from 'react';

export interface StatCard {
  icono: ReactNode;
  etiqueta: string;
  valor: string | number;
  detalle?: string;
  /** 0 a 100 para la barrita de 10 segmentos */
  progreso?: number;
  /** Qué tan bueno es el valor: define el color de la barrita */
  color: 'blue' | 'emerald' | 'amber' | 'red';
}

const COLOR: Record<StatCard['color'], { texto: string; segmento: string; caja: string }> = {
  blue: { texto: 'text-blue-400', segmento: 'bg-blue-400', caja: 'bg-blue-500/15' },
  emerald: { texto: 'text-emerald-400', segmento: 'bg-emerald-400', caja: 'bg-emerald-500/15' },
  amber: { texto: 'text-amber-400', segmento: 'bg-amber-400', caja: 'bg-amber-500/15' },
  red: { texto: 'text-red-400', segmento: 'bg-red-400', caja: 'bg-red-500/15' },
};

/** Fila de indicadores clave: 2 × 2 en celular, 4 en una fila en computadora */
export function StatCards({ cards, glass, cargando }: { cards: StatCard[]; glass: string; cargando: boolean }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(c => {
        const color = COLOR[c.color];
        const llenos = Math.round(Math.min(100, Math.max(0, c.progreso ?? 0)) / 10);
        return (
          <div key={c.etiqueta} className={`${glass} p-4 space-y-2 min-w-0 transition-transform duration-200 hover:-translate-y-0.5`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 truncate">{c.etiqueta}</p>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color.caja} ${color.texto}`}>{c.icono}</span>
            </div>
            <p className={`font-mono text-2xl font-black leading-none ${color.texto}`}>
              {cargando ? <span className="inline-block h-6 w-12 rounded bg-white/[0.07] animate-pulse align-middle" /> : c.valor}
            </p>
            {c.detalle && <p className="text-[10px] text-white/45 truncate" title={c.detalle}>{c.detalle}</p>}
            {c.progreso !== undefined && (
              <div className="flex gap-0.5" role="img" aria-label={`${Math.round(c.progreso)}%`}>
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-sm ${i < llenos ? color.segmento : 'bg-white/[0.08]'}`} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
