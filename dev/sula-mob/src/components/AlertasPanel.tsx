'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertOctagon, CheckCircle2, Clock, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Alerta, TipoAlerta } from '@/app/api/alertas/route';

interface Resumen {
  criticas: number;
  advertencias: number;
  avances: number;
  info: number;
  total: number;
}

const ESTILO: Record<TipoAlerta, { caja: string; texto: string; icono: LucideIcon }> = {
  critica: { caja: 'border-red-500/30 bg-red-500/10', texto: 'text-red-400', icono: AlertOctagon },
  advertencia: { caja: 'border-amber-500/30 bg-amber-500/10', texto: 'text-amber-400', icono: Clock },
  avance: { caja: 'border-blue-500/30 bg-blue-500/10', texto: 'text-blue-400', icono: TrendingUp },
  info: { caja: 'border-emerald-500/30 bg-emerald-500/10', texto: 'text-emerald-400', icono: CheckCircle2 },
};

const MAX_COMPACTO = 5;
const REFRESCO_MS = 5 * 60 * 1000;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Alertas de producción (/api/alertas): atrasos, entregas próximas, proyectos casi listos
 * y áreas que terminaron hoy. `compact` es el widget del dashboard, con las 5 más urgentes.
 */
/** Alertas de /api/alertas, refrescadas cada 5 minutos (las comparte el panel y el tile del dashboard) */
export function useAlertas() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');

  useEffect(() => {
    let vigente = true;
    const cargar = async () => {
      try {
        const res = await fetch('/api/alertas');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error);
        if (!vigente) return;
        setAlertas(data.alertas ?? []);
        setResumen(data.resumen ?? null);
        setEstado('listo');
      } catch {
        if (vigente) setEstado((previo) => (previo === 'listo' ? previo : 'error'));
      }
    };
    void cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    return () => {
      vigente = false;
      clearInterval(intervalo);
    };
  }, []);

  return { alertas, resumen, estado };
}

export default function AlertasPanel({ compact = false }: { compact?: boolean }) {
  const { alertas, resumen, estado } = useAlertas();

  if (estado === 'cargando') {
    return (
      <div className="space-y-2" aria-busy="true">
        {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}
      </div>
    );
  }
  if (estado === 'error') {
    return <p className="text-xs text-red-300">No se pudieron cargar las alertas.</p>;
  }

  const visibles = compact ? alertas.slice(0, MAX_COMPACTO) : alertas;

  return (
    <div>
      {!compact && resumen && resumen.total > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs font-medium">
          {resumen.criticas > 0 && <span className={`rounded-full border px-3 py-1 ${ESTILO.critica.caja} ${ESTILO.critica.texto}`}>{plural(resumen.criticas, 'crítica', 'críticas')}</span>}
          {resumen.advertencias > 0 && <span className={`rounded-full border px-3 py-1 ${ESTILO.advertencia.caja} ${ESTILO.advertencia.texto}`}>{plural(resumen.advertencias, 'por vencer', 'por vencer')}</span>}
          {resumen.avances > 0 && <span className={`rounded-full border px-3 py-1 ${ESTILO.avance.caja} ${ESTILO.avance.texto}`}>{plural(resumen.avances, 'casi listo', 'casi listos')}</span>}
          {resumen.info > 0 && <span className={`rounded-full border px-3 py-1 ${ESTILO.info.caja} ${ESTILO.info.texto}`}>{plural(resumen.info, 'área terminada hoy', 'áreas terminadas hoy')}</span>}
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 text-center text-sm text-white/45">
          Sin alertas: no hay proyectos atrasados ni por vencer.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((alerta) => {
            const { caja, texto, icono: Icono } = ESTILO[alerta.tipo];
            return (
              <li key={alerta.id}>
                <Link
                  href={`/admin/proyectos/${alerta.proyecto_id}`}
                  className={`flex items-start gap-3 rounded-xl border p-3 transition-all hover:brightness-125 ${caja}`}
                >
                  <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${texto}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white/90">{alerta.titulo}</span>
                    <span className="mt-0.5 block text-xs text-white/55">{alerta.descripcion}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {compact && alertas.length > MAX_COMPACTO && (
        <Link href="/admin/alertas" className="mt-3 block py-2 text-center text-xs font-semibold text-blue-400 hover:text-blue-300">
          Ver las {alertas.length} alertas
        </Link>
      )}
    </div>
  );
}
