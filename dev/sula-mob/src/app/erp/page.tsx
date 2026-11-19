'use client';

/**
 * Dashboard del panel ERP — /erp
 * ───────────────────────────────
 * KPIs según el perfil, con los pedidos activos de GET /api/bom (todos los materiales):
 *   · compras  → sin OC (falta pedir) · con OC · comprados (%) · pagado incompleto + pedidos con más materiales sin OC
 *   · finanzas → total en OC · pagado · por pagar                 + OC con saldo (pedido / proveedor)
 *   · almacen  → por llegar (comprados sin almacén) · en almacén · pagado incompleto + pedidos con más material por llegar
 *   "Pagado incompleto" = Finanzas PAGADO pero no ha llegado completo (GET /api/bom → pagado_incompleto).
 * Almacén no ve ningún importe (el servidor tampoco los manda).
 *
 * RUTA: src/app/erp/page.tsx
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, ArrowRight, FileCheck2, FileWarning, Loader2, PackageCheck, ShoppingCart, Truck, Wallet } from 'lucide-react';
import { avanceDe, dinero, pct, useExplosionesCompras, type ExplosionCompras } from '@/app/madera/compras';
import { PERFILES, TARJETA, usePerfilErp } from './perfil';
import { TarjetaErp } from './tarjeta';

/** Partidas PAGADAS que no han llegado completas (lo cuenta GET /api/bom) */
const pagadoIncompletoDe = (e: ExplosionCompras) => (avanceDe(e, false) as { pagado_incompleto?: number }).pagado_incompleto ?? 0

/** "Por llegar" de un pedido = comprados que todavía no están en almacén (comprados − en almacén) */
function porLlegarDe(e: ExplosionCompras) {
  const a = avanceDe(e, false);
  return Math.max(0, a.comprados - a.almacen);
}

interface OcSaldo { id: string; explosion_id: string; folio: string; proveedor: string | null; total: number | null; monto_pagado: number | null }

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

const TITULOS = {
  compras: { titulo: 'Compras', sub: 'Materiales por pedir y comprar en los pedidos activos.', lista: 'Pedidos con más materiales sin OC' },
  finanzas: { titulo: 'Pagos de órdenes de compra', sub: 'Lo comprometido en OC, lo pagado y lo que falta por pagar.', lista: 'Órdenes de compra con saldo' },
  almacen: { titulo: 'Almacén', sub: 'Material comprado que falta recibir.', lista: 'Pedidos con más material por llegar' },
} as const;

export default function ErpDashboard() {
  const { perfil } = usePerfilErp();
  const { explosiones, cargando, error } = useExplosionesCompras();
  const [ocs, setOcs] = useState<OcSaldo[]>([]);
  const [errorOcs, setErrorOcs] = useState('');

  // Finanzas: cada OC con su proveedor (para la lista de saldos)
  useEffect(() => {
    if (perfil !== 'finanzas') return;
    let vivo = true;
    void fetch('/api/bom/revisiones/compras?todas=1', { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudieron cargar las órdenes de compra.');
        return res.json();
      })
      .then(d => { if (vivo) { setOcs(d.ordenes ?? []); setErrorOcs(''); } })
      .catch((e: Error) => { if (vivo) setErrorOcs(e.message); });
    return () => { vivo = false; };
  }, [perfil, explosiones]);

  const conHoja = useMemo(() => explosiones.filter(e => e.revision), [explosiones]);
  const totales = useMemo(() => conHoja.reduce((t, e) => {
    const a = avanceDe(e, false);
    return { total: t.total + a.total, comprados: t.comprados + a.comprados, almacen: t.almacen + a.almacen, sin_oc: t.sin_oc + a.sin_oc };
  }, { total: 0, comprados: 0, almacen: 0, sin_oc: 0 }), [conHoja]);
  const porLlegar = conHoja.reduce((s, e) => s + porLlegarDe(e), 0);
  const incompletos = conHoja.reduce((s, e) => s + pagadoIncompletoDe(e), 0);
  const kpiIncompleto = (
    <Kpi titulo="Pagado incompleto" valor={incompletos} detalle="pagadas que no han llegado completas" icono={<AlertTriangle className="w-5 h-5 text-white" />} color={incompletos > 0 ? 'bg-red-600/80' : 'bg-emerald-600/80'} />
  );

  const dineroOc = useMemo(() => explosiones.reduce((t, e) => ({
    total: t.total + (e.ordenes?.total ?? 0), pagado: t.pagado + (e.ordenes?.pagado ?? 0), cantidad: t.cantidad + (e.ordenes?.cantidad ?? 0),
  }), { total: 0, pagado: 0, cantidad: 0 }), [explosiones]);
  const porPagar = Math.max(0, dineroOc.total - dineroOc.pagado);

  const codigoDe = useMemo(() => new Map(explosiones.map(e => [e.id, e.proyecto?.codigo ?? '—'])), [explosiones]);
  // OC de pedidos activos con saldo, la de mayor saldo primero
  const conSaldo = useMemo(() => ocs
    .filter(o => codigoDe.has(o.explosion_id))
    .map(o => ({ o, saldo: Math.max(0, (Number(o.total) || 0) - Math.min(Number(o.monto_pagado) || 0, Number(o.total) || 0)) }))
    .filter(x => x.saldo > 0.009)
    .sort((a, b) => b.saldo - a.saldo), [ocs, codigoDe]);

  const lista = useMemo(() => {
    if (perfil === 'compras') return conHoja.map(e => ({ e, n: avanceDe(e, false).sin_oc, txt: (n: number) => `${n} material(es) sin orden de compra` }));
    if (perfil === 'almacen') return conHoja.map(e => ({ e, n: porLlegarDe(e), txt: (n: number) => `${n} material(es) comprado(s) por llegar` }));
    return [];
  }, [perfil, conHoja]).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);

  if (cargando) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;

  const t = TITULOS[perfil];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: PERFILES[perfil].claro }}>{PERFILES[perfil].etiqueta}</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{t.titulo}</h1>
        <p className="text-sm text-white/50 mt-1">{t.sub}</p>
      </div>

      {(error || errorOcs) && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error || errorOcs}
        </div>
      )}

      {/* KPIs */}
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${perfil === 'compras' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {perfil === 'compras' && (<>
          <Kpi titulo="Sin OC (falta pedir)" valor={totales.sin_oc} detalle={`de ${totales.total} materiales`} icono={<FileWarning className="w-5 h-5 text-white" />} color="bg-orange-600/80" />
          <Kpi titulo="Con OC" valor={totales.total - totales.sin_oc} detalle={`${pct(totales.total - totales.sin_oc, totales.total)}% de los materiales`} icono={<FileCheck2 className="w-5 h-5 text-white" />} color="bg-blue-600/80" />
          <Kpi titulo="Comprados" valor={`${pct(totales.comprados, totales.total)}%`} detalle={`${totales.comprados} de ${totales.total} materiales`} icono={<ShoppingCart className="w-5 h-5 text-white" />} color="bg-emerald-600/80" />
          {kpiIncompleto}
        </>)}
        {perfil === 'finanzas' && (<>
          <Kpi titulo="Total en OC" valor={`$${dinero(dineroOc.total)}`} detalle={`${dineroOc.cantidad} orden(es) de compra`} icono={<FileCheck2 className="w-5 h-5 text-white" />} color="bg-blue-600/80" />
          <Kpi titulo="Pagado" valor={`$${dinero(dineroOc.pagado)}`} detalle={`${pct(dineroOc.pagado, dineroOc.total)}% del total`} icono={<Wallet className="w-5 h-5 text-white" />} color="bg-emerald-600/80" />
          <div className="col-span-2 lg:col-span-1"><Kpi titulo="Por pagar" valor={`$${dinero(porPagar)}`} detalle={`${conSaldo.length} OC con saldo`} icono={<Wallet className="w-5 h-5 text-white" />} color={porPagar > 0 ? 'bg-red-600/80' : 'bg-emerald-600/80'} /></div>
        </>)}
        {perfil === 'almacen' && (<>
          <Kpi titulo="Por llegar" valor={porLlegar} detalle="comprados sin almacén" icono={<Truck className="w-5 h-5 text-white" />} color="bg-amber-600/80" />
          <Kpi titulo="En almacén" valor={`${pct(totales.almacen, totales.total)}%`} detalle={`${totales.almacen} de ${totales.total} materiales`} icono={<PackageCheck className="w-5 h-5 text-white" />} color="bg-sky-600/80" />
          <div className="col-span-2 lg:col-span-1">{kpiIncompleto}</div>
        </>)}
      </div>

      {/* Lista */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white">{t.lista}</h2>
          <Link href="/erp/bom" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-blue-200">Ver todas las explosiones <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
        {perfil === 'finanzas' ? (
          conSaldo.length === 0 ? (
            <div className={`${TARJETA} px-5 py-10 text-center`}><Wallet className="w-8 h-8 text-emerald-400/70 mx-auto mb-2" /><p className="text-sm text-white/70">{dineroOc.cantidad ? 'Todas las órdenes de compra están pagadas.' : 'Todavía no hay órdenes de compra.'}</p></div>
          ) : (
            <div className={`${TARJETA} divide-y divide-white/10 overflow-hidden`}>
              {conSaldo.slice(0, 15).map(({ o, saldo }) => (
                <Link key={o.id} href={`/erp/bom/${o.explosion_id}`} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-white/[0.04] text-sm">
                  <span className="font-mono font-bold text-white shrink-0">OC {o.folio}</span>
                  <span className="min-w-0 flex-1 truncate text-white/60">{codigoDe.get(o.explosion_id)} · {o.proveedor || 'Sin proveedor'}</span>
                  <span className="shrink-0 tabular-nums font-bold text-red-300">${dinero(saldo)}</span>
                </Link>
              ))}
            </div>
          )
        ) : lista.length === 0 ? (
          <div className={`${TARJETA} px-5 py-10 text-center`}>
            <ShoppingCart className="w-8 h-8 text-emerald-400/70 mx-auto mb-2" />
            <p className="text-sm text-white/70">{!conHoja.length ? 'Todavía no hay explosiones capturadas.' : perfil === 'compras' ? 'Todos los materiales ya tienen orden de compra.' : 'No hay material comprado pendiente de llegar.'}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {lista.map(({ e, n, txt }) => <TarjetaErp key={e.id} e={e} detalle={txt(n)} />)}
          </div>
        )}
      </section>
    </div>
  );
}
