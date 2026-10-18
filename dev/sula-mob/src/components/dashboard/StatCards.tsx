'use client';

/**
 * StatCards.tsx
 * ─────────────
 * Indicadores del dashboard: ícono de color, número que cuenta hasta su valor y título.
 *   Celular: 2 columnas y la 5ª a todo lo ancho · Tablet y laptop: 3 + 2 · xl: 5 en fila.
 *
 * RUTA: src/components/dashboard/StatCards.tsx
 */

import type { ComponentType } from 'react';
import { useCountUp } from '@/hooks/useCountUp';

export interface StatCard {
  icono: ComponentType<{ className?: string }>;
  titulo: string;
  valor: number;
  sufijo?: string;
  /** Fondo del cuadro del ícono, p. ej. 'bg-sky-500/80' */
  color: string;
  /** Texto al pasar el mouse */
  detalle?: string;
}

function Numero({ valor, sufijo = '', activo }: { valor: number; sufijo?: string; activo: boolean }) {
  const { valor: mostrado } = useCountUp(valor, 900, activo);
  return <>{mostrado}{sufijo}</>;
}

// Tablet (sm): 6 columnas → las 3 primeras ocupan 2 y las 2 últimas 3, para que ambas filas llenen
const SPAN = ['sm:col-span-2', 'sm:col-span-2', 'sm:col-span-2', 'sm:col-span-3', 'col-span-2 sm:col-span-3'];

export function StatCards({ cards, cargando }: { cards: StatCard[]; cargando: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:gap-3 xl:grid-cols-5">
      {cards.map(({ icono: Icono, titulo, valor, sufijo, color, detalle }, i) => (
        <div
          key={titulo}
          title={detalle}
          className={`${SPAN[i] ?? ''} xl:col-span-1 flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 backdrop-blur-xl sm:gap-4 sm:p-4`}
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${color}`}>
            <Icono className="h-4 w-4 text-white sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-2xl font-bold leading-tight text-white tabular-nums">
              {cargando ? <span className="inline-block h-7 w-10 animate-pulse rounded-md bg-white/[0.08] align-middle" /> : <Numero valor={valor} sufijo={sufijo} activo />}
            </p>
            <p className="truncate text-[10px] uppercase tracking-wide text-white/50 sm:text-[11px] sm:tracking-wider" title={titulo}>{titulo}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
