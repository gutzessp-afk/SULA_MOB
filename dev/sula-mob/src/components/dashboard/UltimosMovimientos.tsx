export interface Movimiento {
  id: string;
  operador: string;
  area: string;
  piezas: number;
  operacion: string;
  created_at: string;
}

/** "hace 5 min", "hace 2 h", "hace 3 días" */
function hace(fecha: string, ahora: number) {
  const s = Math.max(0, (ahora - Date.parse(fecha)) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`;
  const dias = Math.round(s / 86_400);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

/** Quién registró qué y cuándo: los últimos avances de los operadores, en línea de tiempo */
export function UltimosMovimientos({ movimientos, cargando, ahora }: { movimientos: Movimiento[]; cargando: boolean; ahora: number }) {
  if (cargando) {
    return <div className="space-y-3" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="h-8 rounded-lg bg-white/[0.05] animate-pulse" />)}</div>;
  }
  if (!movimientos.length) return <p className="py-6 text-center text-xs text-white/40">Sin actividad registrada.</p>;

  return (
    <ol className="relative ml-1 max-h-[300px] space-y-3 overflow-y-auto border-l border-white/[0.1] pl-4 pr-1">
      {movimientos.map(m => (
        <li key={m.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-blue-400 ring-2 ring-[#0b0f17]" aria-hidden="true" />
          <p className="text-xs leading-snug text-white/85">
            <span className="font-semibold text-white">{m.operador}</span> → {m.area}
            <span className="text-white/50"> · {m.piezas} pza{m.piezas === 1 ? '' : 's'}</span>
          </p>
          <p className="text-[10px] text-white/40">{[m.operacion, ahora ? hace(m.created_at, ahora) : ''].filter(Boolean).join(' · ')}</p>
        </li>
      ))}
    </ol>
  );
}
