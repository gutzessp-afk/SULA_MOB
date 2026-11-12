'use client';

/**
 * EstadoBom.tsx
 * ─────────────
 * Estado de la explosión de material (BOM) de cada pedido para la lista de Proyectos:
 * badge (pendiente, bloqueado, en proceso, en pausa, completado) con lo que tardó o lleva,
 * y cuándo inició/terminó en el tooltip. Clic → /admin/bom?proyecto=ID.
 *
 * useResumenBom() trae el estado de todos los pedidos de una vez (GET /api/bom?resumen=1)
 * y se actualiza en tiempo real con cambios en bom_explosiones (también lo usa el Panel de Control).
 *
 * RUTA: src/components/admin/EstadoBom.tsx
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import { ESTATUS_BOM, duracionLegible, estatusBom, segundosTrabajados, type TiemposExplosion } from '@/lib/bom-tiempo';

export type ResumenBom = TiemposExplosion & { id: string; proyecto_id: string };

export function useResumenBom(): Record<string, ResumenBom> {
  const [resumen, setResumen] = useState<Record<string, ResumenBom>>({});
  const cargar = useCallback(
    () => fetch('/api/bom?resumen=1', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(d => { if (d?.resumen) setResumen(d.resumen); })
      .catch(() => {}),
    [],
  );
  const recargar = useRecargaAgrupada(cargar, 500);
  useEffect(() => {
    const ch = supabase
      // Nombre único por instancia: Proyectos y el Panel de Control lo usan por separado
      .channel(`bom-resumen-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_explosiones' }, recargar)
      .subscribe(status => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') recargar(); });
    // Primera carga de inmediato, sin esperar a que se conecte el tiempo real
    const primera = setTimeout(() => void cargar(), 0);
    return () => { clearTimeout(primera); void supabase.removeChannel(ch); };
  }, [cargar, recargar]);
  return resumen;
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function EstadoBom({ proyectoId, resumen }: { proyectoId: string; resumen?: ResumenBom }) {
  if (!resumen) return <span className="text-white/30 text-xs">—</span>;
  const est = estatusBom(resumen);
  const conf = ESTATUS_BOM[est];
  const seg = segundosTrabajados(resumen);
  const detalle = [
    resumen.fecha_inicio && `Inició: ${fechaHora(resumen.fecha_inicio)}`,
    est === 'completado' && resumen.fecha_termino && `Terminó: ${fechaHora(resumen.fecha_termino)}`,
    resumen.fecha_inicio && `${est === 'completado' ? 'Tardó' : 'Lleva'}: ${duracionLegible(seg)}`,
  ].filter(Boolean).join('\n');

  return (
    <Link
      href={`/admin/bom?proyecto=${proyectoId}`}
      title={detalle ? `Explosión de material\n${detalle}` : 'Explosión de material'}
      className="inline-flex flex-col items-start gap-0.5 hover:opacity-80 transition-opacity"
    >
      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border whitespace-nowrap ${conf.css}`}>{conf.txt}</span>
      {resumen.fecha_inicio && (
        <span className={`text-[10px] whitespace-nowrap ${est === 'completado' ? 'text-emerald-300/90' : 'text-white/45'}`}>
          {est === 'completado' ? duracionLegible(seg) : `lleva ${duracionLegible(seg)}`}
        </span>
      )}
    </Link>
  );
}
