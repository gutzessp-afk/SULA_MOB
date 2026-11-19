'use client';

/**
 * Dashboard del ÁREA DE MADERA — /madera
 * ────────────────────────────────────────
 * Resumen de compras de los pedidos activos (los terminados al 100% no salen):
 *   · KPIs: pedidos con explosión, comprados, en almacén, sin OC y dinero de las OC (pagado / por pagar).
 *   · "Pendientes de comprar": los pedidos con más materiales por comprar.
 * Por defecto cuenta solo los materiales con Clasificación = Madera; se puede cambiar a todos.
 * Los números salen de GET /api/bom (última revisión de cada hoja de explosión).
 *
 * RUTA: src/app/madera/page.tsx
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, ClipboardList, FileWarning, Loader2, PackageCheck, ShoppingCart, Trees, Wallet } from 'lucide-react';
import { avanceDe, dinero, pct, SelectorAlcance, TARJETA, TarjetaPedido, useExplosionesCompras } from './compras';

function Kpi({ titulo, valor, detalle, icono, color }: { titulo: string; valor: string | number; detalle?: string; icono: React.ReactNode; color: string }) {
  return (
    <div className={`${TARJETA} px-4 py-4 sm:px-5 sm:py-5`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>{icono}</div>
      <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums leading-none">{valor}</p>
      <p className="text-[12px] font-semibold text-white/70 mt-1.5">{titulo}</p>
      {detalle && <p className="text-[11px] text-white/40 mt-0.5">{detalle}</p>}
    </div>
  );
}

export default function MaderaDashboard() {
  const { explosiones, cargando, error } = useExplosionesCompras();
  const [soloMadera, setSoloMadera] = useState(true);

  const conHoja = useMemo(() => explosiones.filter(e => e.revision), [explosiones]);
  const totales = useMemo(() => conHoja.reduce((t, e) => {
    const a = avanceDe(e, soloMadera);
    return { total: t.total + a.total, comprados: t.comprados + a.comprados, almacen: t.almacen + a.almacen, sin_oc: t.sin_oc + a.sin_oc };
  }, { total: 0, comprados: 0, almacen: 0, sin_oc: 0 }), [conHoja, soloMadera]);

  // Dinero de las órdenes de compra (PDF) de todos los pedidos activos
  const dineroOc = useMemo(() => explosiones.reduce((t, e) => ({
    total: t.total + (e.ordenes?.total ?? 0), pagado: t.pagado + (e.ordenes?.pagado ?? 0), cantidad: t.cantidad + (e.ordenes?.cantidad ?? 0),
  }), { total: 0, pagado: 0, cantidad: 0 }), [explosiones]);
  const porPagar = Math.max(0, dineroOc.total - dineroOc.pagado);

  // Los pedidos con más materiales por comprar primero (solo los que tienen algo pendiente)
  const pendientes = useMemo(() => conHoja
    .map(e => ({ e, falta: avanceDe(e, soloMadera).total - avanceDe(e, soloMadera).comprados }))
    .filter(x => x.falta > 0)
    .sort((a, b) => b.falta - a.falta)
    .slice(0, 6), [conHoja, soloMadera]);

  if (cargando) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-amber-300/90 uppercase"><Trees className="w-3.5 h-3.5" /> Área de madera</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">Compras y almacén</h1>
          <p className="text-sm text-white/50 mt-1">Pedidos activos con explosión de materiales.</p>
        </div>
        <SelectorAlcance soloMadera={soloMadera} onCambio={setSoloMadera} />
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Kpi titulo="Pedidos con explosión" valor={conHoja.length} detalle={`${explosiones.length - conHoja.length} todavía sin explosión`} icono={<ClipboardList className="w-5 h-5 text-white" />} color="bg-amber-600/80" />
        <Kpi titulo="Comprados" valor={`${pct(totales.comprados, totales.total)}%`} detalle={`${totales.comprados} de ${totales.total} materiales`} icono={<ShoppingCart className="w-5 h-5 text-white" />} color="bg-emerald-600/80" />
        <Kpi titulo="En almacén" valor={`${pct(totales.almacen, totales.total)}%`} detalle={`${totales.almacen} de ${totales.total} materiales`} icono={<PackageCheck className="w-5 h-5 text-white" />} color="bg-sky-600/80" />
        <Kpi titulo="Sin orden de compra" valor={totales.sin_oc} detalle="materiales sin folio de OC" icono={<FileWarning className="w-5 h-5 text-white" />} color="bg-orange-700/80" />
        <div className="col-span-2 lg:col-span-1">
          <Kpi titulo="Por pagar" valor={`$${dinero(porPagar)}`} detalle={`Pagado $${dinero(dineroOc.pagado)} de $${dinero(dineroOc.total)} · ${dineroOc.cantidad} OC`} icono={<Wallet className="w-5 h-5 text-white" />} color={porPagar > 0 ? 'bg-red-600/80' : 'bg-emerald-600/80'} />
        </div>
      </div>

      {/* Pendientes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white">Pendientes de comprar</h2>
          <Link href="/madera/bom" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200">Ver todas las explosiones <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
        {pendientes.length === 0 ? (
          <div className={`${TARJETA} px-5 py-10 text-center`}>
            <ShoppingCart className="w-8 h-8 text-emerald-400/70 mx-auto mb-2" />
            <p className="text-sm text-white/70">{conHoja.length ? 'Todo lo de las explosiones activas ya está comprado.' : 'Todavía no hay explosiones capturadas.'}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {pendientes.map(({ e }) => <TarjetaPedido key={e.id} e={e} soloMadera={soloMadera} />)}
          </div>
        )}
      </section>
    </div>
  );
}
