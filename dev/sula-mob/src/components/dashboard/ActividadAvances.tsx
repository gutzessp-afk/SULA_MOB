'use client';

/**
 * ActividadAvances.tsx
 * ────────────────────
 * Avances registrados en los últimos 30 días, acumulados día por día (Recharts).
 * El tooltip dice cuántos avances y piezas hubo ese día. Recharts pesa bastante:
 * el dashboard lo carga con next/dynamic para no retrasar el resto de la página.
 *
 * RUTA: src/components/dashboard/ActividadAvances.tsx
 */

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface DiaActividad {
  /** YYYY-MM-DD en hora de México */
  dia: string;
  avances: number;
  piezas: number;
  /** Avances acumulados desde el inicio de la ventana */
  total: number;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// Se arma a mano: new Date('2026-10-01') es medianoche UTC y en México se vería como el 30 de septiembre
const fechaCorta = (dia: string) => `${dia.slice(8, 10)} ${MESES[Number(dia.slice(5, 7)) - 1] ?? ''}`;

interface PuntoTooltip { payload: DiaActividad }

function Globo({ active, payload }: { active?: boolean; payload?: PuntoTooltip[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-white">{fechaCorta(d.dia)}</p>
      <p className="text-white/70">{d.avances} avance{d.avances === 1 ? '' : 's'} · {d.piezas.toLocaleString('es-MX')} pzas</p>
      <p className="text-blue-300">{d.total} acumulados</p>
    </div>
  );
}

export default function ActividadAvances({ datos }: { datos: DiaActividad[] }) {
  return (
    // Llena el alto de su contenedor (mínimo 200 px) para emparejarse con el panel de notificaciones
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <AreaChart data={datos} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gradAvance" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="dia" tickFormatter={fechaCorta} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} tickLine={false} axisLine={false} width={35} />
        <Tooltip content={<Globo />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
        <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="url(#gradAvance)" strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
