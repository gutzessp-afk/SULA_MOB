'use client';

/**
 * tarjeta.tsx — tarjeta de un pedido en el panel ERP (Dashboard y BOM)
 * ─────────────────────────────────────────────────────────────────────
 * Avance de Compra y Almacén de la última revisión (todos los materiales) y, salvo almacén,
 * lo pagado / por pagar de sus OC. Abre /erp/bom/[id].
 * Los datos salen de useExplosionesCompras (src/app/madera/compras.tsx, GET /api/bom).
 *
 * RUTA: src/app/erp/tarjeta.tsx
 */

import Link from 'next/link';
import { ChevronRight, FileX2, MapPin, PackageCheck, ShoppingCart } from 'lucide-react';
import { ESTATUS_BOM, estatusBom } from '@/lib/bom-tiempo';
import { avanceDe, dinero, pct, type ExplosionCompras } from '@/app/madera/compras';
import { TARJETA, usePerfilErp } from './perfil';

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

/** detalle = texto destacado debajo (ej. "12 sin OC") */
export function TarjetaErp({ e, detalle }: { e: ExplosionCompras; detalle?: React.ReactNode }) {
  const { perfil } = usePerfilErp();
  const a = avanceDe(e, false);
  const est = ESTATUS_BOM[estatusBom(e)];
  const deMadera = (e.revision?.madera?.total ?? 0) > 0;
  const ordenes = e.ordenes;
  return (
    <Link href={`/erp/bom/${e.id}`} className={`${TARJETA} block px-4 py-4 sm:px-5 hover:ring-blue-400/30 hover:border-blue-400/20 transition-all group`}>
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
            {deMadera && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold border bg-amber-500/10 text-amber-300 border-amber-400/30">Madera</span>}
          </div>
          {(e.proyecto?.sucursal || e.proyecto?.nombre) && (
            <p className="text-xs text-white/50 mt-1 flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{e.proyecto?.sucursal || e.proyecto?.nombre}</p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-blue-300 shrink-0 mt-0.5" />
      </div>

      {!e.revision ? (
        <p className="mt-3 text-xs text-white/40 flex items-center gap-1.5"><FileX2 className="w-3.5 h-3.5" /> Todavía sin explosión de materiales</p>
      ) : a.total === 0 ? (
        <p className="mt-3 text-xs text-white/40">La explosión no tiene materiales.</p>
      ) : (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Barra etiqueta="Comprado" valor={a.comprados} total={a.total} color="bg-emerald-500" icono={<ShoppingCart className="w-3 h-3" />} />
          <Barra etiqueta="En almacén" valor={a.almacen} total={a.total} color="bg-sky-500" icono={<PackageCheck className="w-3 h-3" />} />
        </div>
      )}
      {detalle && <p className="mt-2 text-[11px] text-amber-300/90">{detalle}</p>}
      {perfil !== 'almacen' && (ordenes?.cantidad ?? 0) > 0 && (
        <p className="mt-1.5 text-[11px] text-white/55 tabular-nums">
          {ordenes!.cantidad} OC · pagado <b className="text-emerald-300">${dinero(ordenes!.pagado)}</b>
          {ordenes!.total - ordenes!.pagado > 0.009
            ? <> · por pagar <b className="text-red-300">${dinero(ordenes!.total - ordenes!.pagado)}</b></>
            : <> · <b className="text-emerald-300">todo pagado</b></>}
        </p>
      )}
    </Link>
  );
}
