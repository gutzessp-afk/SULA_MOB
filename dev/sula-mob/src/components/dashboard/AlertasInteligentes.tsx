'use client';

import Link from 'next/link';
import { AlertOctagon, CheckCircle2, Clock, ShieldCheck, TrendingUp, type LucideIcon } from 'lucide-react';
import { useAlertas } from '@/components/AlertasPanel';
import type { TipoAlerta } from '@/app/api/alertas/route';

const MAX = 5;
const ESTILO: Record<TipoAlerta, { barra: string; texto: string; icono: LucideIcon }> = {
  critica: { barra: 'bg-red-500', texto: 'text-red-400', icono: AlertOctagon },
  advertencia: { barra: 'bg-amber-500', texto: 'text-amber-400', icono: Clock },
  avance: { barra: 'bg-blue-500', texto: 'text-blue-400', icono: TrendingUp },
  info: { barra: 'bg-emerald-500', texto: 'text-emerald-400', icono: CheckCircle2 },
};

/** "PED-3478 está atrasado" → "Está atrasado": el código ya va en su etiqueta */
function sinCodigo(titulo: string, codigo: string) {
  if (!codigo || !titulo.startsWith(codigo)) return titulo;
  const resto = titulo.slice(codigo.length).trim();
  return resto.charAt(0).toUpperCase() + resto.slice(1);
}

/** Lo que necesita atención ahora: las 5 alertas más urgentes, con su gravedad a la izquierda */
export function AlertasInteligentes() {
  const { alertas, estado } = useAlertas();

  if (estado === 'cargando') {
    return <div className="space-y-2" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-11 rounded-lg bg-white/[0.05] animate-pulse" />)}</div>;
  }
  if (estado === 'error') return <p className="text-xs text-red-300">No se pudieron cargar las alertas.</p>;
  if (!alertas.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
        <ShieldCheck className="h-8 w-8 text-emerald-400" />
        <p className="text-sm font-semibold text-white">Producción estable</p>
        <p className="text-[11px] text-white/45">Nada atrasado, por vencer ni detenido.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {alertas.slice(0, MAX).map(a => {
          const { barra, texto, icono: Icono } = ESTILO[a.tipo];
          return (
            <li key={a.id}>
              <Link href={`/admin/proyectos/${a.proyecto_id}`} title={a.descripcion} className="flex items-stretch gap-2.5 overflow-hidden rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                <span className={`w-1 shrink-0 ${barra}`} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 items-start gap-2 py-2 pr-2">
                  <Icono className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${texto}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-white/90">{sinCodigo(a.titulo, a.codigo)}</span>
                    <span className="block truncate text-[10px] text-white/45">{a.descripcion.split(' · ')[0]}</span>
                  </span>
                  {a.codigo && <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white/70">{a.codigo}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {alertas.length > MAX && (
        <Link href="/admin/alertas" className="block text-center text-[11px] font-semibold text-blue-400 hover:text-blue-300">Ver las {alertas.length} alertas</Link>
      )}
    </div>
  );
}
