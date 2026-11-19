'use client';

/**
 * compras.tsx — piezas compartidas del panel de madera (Dashboard y Explosiones)
 * ──────────────────────────────────────────────────────────────────────────────
 *   useExplosionesCompras()  carga GET /api/bom (pedidos activos con el avance de compras de su
 *                            última revisión) y recarga con Supabase Realtime.
 *   avanceDe(exp, soloMadera) números de compra/almacén: todos los materiales o solo "Madera".
 *   <TarjetaPedido/>          tarjeta de un pedido con barras de Compra y Almacén.
 *   <SelectorAlcance/>        "Solo madera / Todos los materiales".
 *   Cada pedido trae también `ordenes` (cuántas OC, total y pagado) para "pagado / por pagar".
 *
 * RUTA: src/app/madera/compras.tsx
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, MapPin, PackageCheck, ShoppingCart, FileX2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import { ESTATUS_BOM, estatusBom } from '@/lib/bom-tiempo';

/* ═══ Tipos (lo que devuelve GET /api/bom) ═══ */

export interface Compras { total: number; comprados: number; almacen: number; sin_oc: number }

export interface ExplosionCompras {
  id: string;
  proyecto_id: string;
  estado: 'pendiente' | 'en_proceso' | 'completado';
  fecha_inicio: string | null;
  fecha_termino: string | null;
  duracion_seg: number;
  acumulado_seg: number | null;
  tramo_inicio: string | null;
  checklist: unknown;
  created_at: string;
  proyecto: { codigo: string; nombre: string; sucursal: string | null; prioridad: string; progreso: number } | null;
  /** Última revisión de la hoja; null = todavía no hay explosión capturada */
  revision: { numero: number; estado: 'borrador' | 'cerrada'; lineas: number; compras?: Compras; madera?: Compras } | null;
  /** Órdenes de compra subidas: cuántas, total (de los PDF) y pagado */
  ordenes?: { cantidad: number; total: number; pagado: number };
}

export const dinero = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

const VACIO: Compras = { total: 0, comprados: 0, almacen: 0, sin_oc: 0 };

/** Números de compras de un pedido: todos los materiales o solo los de clasificación Madera */
export function avanceDe(e: ExplosionCompras, soloMadera: boolean): Compras {
  if (!e.revision) return VACIO;
  return (soloMadera ? e.revision.madera : e.revision.compras) ?? VACIO;
}

export const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/* ═══ Datos ═══ */

export function useExplosionesCompras() {
  const [explosiones, setExplosiones] = useState<ExplosionCompras[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/bom', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setExplosiones(d.explosiones ?? []);
      setError('');
    } catch {
      setError('No se pudieron cargar los pedidos.');
    } finally {
      setCargando(false);
    }
  }, []);

  // Cada OC, casilla o fecha que capture alguien genera un cambio: se agrupan en una sola recarga
  const recargar = useRecargaAgrupada(cargar, 600);
  useEffect(() => {
    const ch = supabase
      .channel('madera-compras')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_explosiones' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_revisiones' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_revision_lineas' }, recargar)
      .subscribe(status => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') recargar(); });
    const primera = setTimeout(() => void cargar(), 0);
    return () => { clearTimeout(primera); void supabase.removeChannel(ch); };
  }, [cargar, recargar]);

  return { explosiones, cargando, error };
}

/* ═══ Componentes ═══ */

export function SelectorAlcance({ soloMadera, onCambio }: { soloMadera: boolean; onCambio: (v: boolean) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5 text-[12px] font-semibold" role="group" aria-label="Qué materiales contar">
      {[true, false].map(v => (
        <button key={String(v)} type="button" onClick={() => onCambio(v)} aria-pressed={soloMadera === v}
          className={`px-3 py-1.5 rounded-lg transition-all ${soloMadera === v ? 'bg-amber-600 text-white' : 'text-white/55 hover:text-white'}`}>
          {v ? 'Solo madera' : 'Todos los materiales'}
        </button>
      ))}
    </div>
  );
}

function Barra({ etiqueta, valor, total, color, icono }: { etiqueta: string; valor: number; total: number; color: string; icono: React.ReactNode }) {
  const p = pct(valor, total);
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-[11px] text-white/55 mb-1">
        <span className="inline-flex items-center gap-1">{icono}{etiqueta}</span>
        <span className="tabular-nums"><b className="text-white/85">{valor}</b>/{total} · {p}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function TarjetaPedido({ e, soloMadera }: { e: ExplosionCompras; soloMadera: boolean }) {
  const a = avanceDe(e, soloMadera);
  const est = ESTATUS_BOM[estatusBom(e)];
  const sinExplosion = !e.revision;
  return (
    <Link href={`/madera/bom/${e.id}`} className={`${TARJETA} block px-4 py-4 sm:px-5 hover:ring-amber-400/30 hover:border-amber-400/20 transition-all group`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-bold text-white">{e.proyecto?.codigo || '—'}</h3>
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${est.css}`}>{est.txt}</span>
            {e.revision && (
              <span className="px-1.5 py-0.5 rounded-md font-mono font-bold text-[10px] border bg-white/[0.06] text-white/75 border-white/15">
                REV-{String(e.revision.numero).padStart(2, '0')}
              </span>
            )}
          </div>
          {(e.proyecto?.sucursal || e.proyecto?.nombre) && (
            <p className="text-xs text-white/50 mt-1 flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{e.proyecto?.sucursal || e.proyecto?.nombre}</p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-amber-300 shrink-0 mt-0.5" />
      </div>

      {sinExplosion ? (
        <p className="mt-3 text-xs text-white/40 flex items-center gap-1.5"><FileX2 className="w-3.5 h-3.5" /> Todavía sin explosión de materiales</p>
      ) : a.total === 0 ? (
        <p className="mt-3 text-xs text-white/40">{soloMadera ? 'Esta explosión no tiene materiales de madera.' : 'La explosión no tiene materiales.'}</p>
      ) : (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Barra etiqueta="Comprado" valor={a.comprados} total={a.total} color="bg-emerald-500" icono={<ShoppingCart className="w-3 h-3" />} />
          <Barra etiqueta="En almacén" valor={a.almacen} total={a.total} color="bg-sky-500" icono={<PackageCheck className="w-3 h-3" />} />
        </div>
      )}
      {!sinExplosion && a.sin_oc > 0 && (
        <p className="mt-2 text-[11px] text-amber-300/90">{a.sin_oc} material(es) sin orden de compra</p>
      )}
      {(e.ordenes?.cantidad ?? 0) > 0 && (
        <p className="mt-1.5 text-[11px] text-white/55 tabular-nums">
          {e.ordenes!.cantidad} OC · pagado <b className="text-emerald-300">${dinero(e.ordenes!.pagado)}</b>
          {e.ordenes!.total - e.ordenes!.pagado > 0.009
            ? <> · por pagar <b className="text-red-300">${dinero(e.ordenes!.total - e.ordenes!.pagado)}</b></>
            : <> · <b className="text-emerald-300">todo pagado</b></>}
        </p>
      )}
    </Link>
  );
}
