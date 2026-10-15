'use client';

/**
 * BurndownChart.tsx
 * ─────────────────
 * Plan contra real de cada proyecto activo, uno a la vez con flechas (o deslizando
 * en el celular). El plan es lineal: 0% el día que se dio de alta y 100% el día de
 * entrega. La línea real sale de los avances registrados día por día, escalada
 * para terminar en el avance actual del proyecto. El indicador "pp" es la
 * diferencia en puntos porcentuales entre lo real y lo planeado para hoy.
 *
 * RUTA: src/components/dashboard/BurndownChart.tsx
 */

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';

export interface BurndownProyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente: string;
  progreso: number;
  /** Fechas "AAAA-MM-DD" */
  inicio: string;
  entrega: string;
  hoy: string;
  planeadoHoy: number;
  desviacion: number;
  /** Avance real acumulado por día (día = AAAA-MM-DD) */
  puntosReales: { dia: string; progreso: number }[];
}

const ANCHO = 300, ALTO = 180;
const X0 = 34, X1 = 286, Y0 = 18, Y1 = 146;
const ms = (f: string) => Date.parse(`${f}T12:00:00`);
const corta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

function Grafica({ p }: { p: BurndownProyecto }) {
  // El eje X abarca el alta, la entrega y hoy (un pedido puede darse de alta ya vencido)
  const desde = Math.min(ms(p.inicio), ms(p.entrega));
  const hasta = Math.max(ms(p.entrega), ms(p.hoy), desde + 86_400_000);
  const x = (f: string) => X0 + ((ms(f) - desde) / (hasta - desde)) * (X1 - X0);
  const y = (v: number) => Y1 - (Math.min(100, Math.max(0, v)) / 100) * (Y1 - Y0);

  const xEntrega = x(p.entrega);
  const xHoy = x(p.hoy);
  // El plan sube de 0% (alta) a 100% (entrega); si la entrega es antes del alta, ya debía estar al 100%
  const xInicio = x(p.inicio);
  const plan = ms(p.entrega) > ms(p.inicio) ? `M${xInicio},${y(0)} L${xEntrega},${y(100)} L${X1},${y(100)}` : `M${xInicio},${y(100)} L${X1},${y(100)}`;
  const reales = [{ dia: p.inicio, progreso: 0 }, ...p.puntosReales.filter(r => r.dia > p.inicio && r.dia < p.hoy), { dia: p.hoy, progreso: p.progreso }];
  const real = reales.map((r, i) => `${i ? 'L' : 'M'}${x(r.dia).toFixed(1)},${y(r.progreso).toFixed(1)}`).join(' ');
  const colorReal = p.desviacion >= 0 ? '#10b981' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full" role="img" aria-label={`${p.codigo}: planeado ${p.planeadoHoy}%, real ${p.progreso}%`}>
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
          <text x={X0 - 6} y={y(v)} textAnchor="end" dominantBaseline="central" className="fill-white/35 font-mono" style={{ fontSize: 7 }}>{v}%</text>
        </g>
      ))}
      {/* Hoy */}
      <line x1={xHoy} x2={xHoy} y1={Y0} y2={Y1} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 3" />
      <text x={xHoy} y={Y0 - 6} textAnchor="middle" className="fill-white/45" style={{ fontSize: 7 }}>hoy</text>
      {/* Plan y real */}
      <path d={plan} fill="none" stroke="rgba(148,163,184,0.45)" strokeWidth={1.5} strokeDasharray="4 4" />
      <path d={real} fill="none" stroke={colorReal} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${colorReal}66)` }} />
      {/* Dónde debería ir hoy (círculo) y dónde va (diamante) */}
      <circle cx={xHoy} cy={y(p.planeadoHoy)} r={3.5} fill="none" stroke="rgba(148,163,184,0.8)" strokeWidth={1.2} />
      <rect x={xHoy - 4} y={y(p.progreso) - 4} width={8} height={8} transform={`rotate(45 ${xHoy} ${y(p.progreso)})`} fill="#f59e0b" style={{ filter: 'drop-shadow(0 0 4px #f59e0b)' }} />
      {/* Entrega */}
      <path d={`M${xEntrega - 4},${Y1 + 9} L${xEntrega + 4},${Y1 + 9} L${xEntrega},${Y1 + 2} Z`} fill="#ef4444" />
      {Math.abs(x(p.inicio) - xEntrega) > 40 && (
        <text x={x(p.inicio)} y={Y1 + 22} textAnchor={x(p.inicio) > X1 - 30 ? 'end' : 'start'} className="fill-white/40" style={{ fontSize: 7 }}>alta {corta(p.inicio)}</text>
      )}
      <text x={xEntrega} y={Y1 + 22} textAnchor={xEntrega > X1 - 30 ? 'end' : xEntrega < X0 + 30 ? 'start' : 'middle'} className="fill-red-300/80" style={{ fontSize: 7 }}>entrega {corta(p.entrega)}</text>
    </svg>
  );
}

export function BurndownChart({ proyectos, cargando }: { proyectos: BurndownProyecto[]; cargando: boolean }) {
  const [indice, setIndice] = useState(0);
  const toque = useRef<number | null>(null);

  if (cargando) return <div className="h-[230px] rounded-xl bg-white/[0.04] animate-pulse" aria-busy="true" />;
  if (!proyectos.length) {
    return <p className="py-10 text-center text-xs text-white/40">No hay proyectos activos con fecha de entrega para graficar.</p>;
  }

  const i = Math.min(indice, proyectos.length - 1);
  const p = proyectos[i];
  const mover = (d: number) => setIndice((i + d + proyectos.length) % proyectos.length);
  const adelantado = p.desviacion >= 0;
  const boton = 'flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white/70 hover:bg-white/[0.1] hover:text-white disabled:opacity-30';

  return (
    <div
      className="space-y-2"
      // En el celular se cambia de proyecto deslizando el dedo
      onTouchStart={e => { toque.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (toque.current === null) return;
        const dx = e.changedTouches[0].clientX - toque.current;
        if (Math.abs(dx) > 40) mover(dx < 0 ? 1 : -1);
        toque.current = null;
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/admin/proyectos/${p.id}`} className="block truncate text-sm font-bold text-white hover:underline">
            <span className="font-mono text-blue-300">{p.codigo}</span>{p.cliente ? ` · ${p.cliente}` : ''}
          </Link>
          <p className="text-[11px] text-white/50">Planeado {p.planeadoHoy}% · real {p.progreso}% · entrega {corta(p.entrega)}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${adelantado ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {adelantado ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {adelantado ? '+' : ''}{p.desviacion} pp
        </span>
      </div>

      <Grafica p={p} />

      <div className="flex items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/50">
          <li className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-slate-400" />plan</li>
          <li className="inline-flex items-center gap-1.5"><span className={`w-4 border-t-2 ${adelantado ? 'border-emerald-500' : 'border-red-500'}`} />real</li>
          <li className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-amber-500" />hoy</li>
          <li className="inline-flex items-center gap-1.5"><span className="h-0 w-0 border-x-4 border-b-[6px] border-x-transparent border-b-red-500" />entrega</li>
        </ul>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => mover(-1)} className={boton} disabled={proyectos.length < 2} aria-label="Proyecto anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[36px] text-center font-mono text-[11px] text-white/60" aria-live="polite">{i + 1}/{proyectos.length}</span>
          <button type="button" onClick={() => mover(1)} className={boton} disabled={proyectos.length < 2} aria-label="Proyecto siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
