'use client';

/**
 * ExplosionCompleta — explosión de materiales COMPLETA de un pedido, solo lectura (/madera/subir)
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * Todo lo de cada revisión REV-00, REV-01… (también el borrador que el administrador está editando):
 * encabezado, qué cambió, todos los materiales (no solo Madera) con costo, OC, Compra y Almacén,
 * los colores de cambios de SULA y los materiales quitados. Filtro por clasificación y búsqueda.
 * Sale de GET /api/bom/revisiones?explosion_id=…&completa=1 y se actualiza en vivo: la hoja del
 * administrador guarda cada cambio en menos de un segundo y aquí llega por Supabase Realtime
 * (los borrados no se pueden filtrar por explosión, por eso se escuchan aparte) y, por si se
 * cae la conexión, se vuelve a pedir cada 10 s.
 *
 * RUTA: src/app/madera/subir/ExplosionCompleta.tsx
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileX2, Loader2, Radio, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import { LEYENDA, colorClasificacion, colorMarca, compararRevision, costoEstimado, estadoPedido, etiquetaRev, normalizar, resumenPedidos, type EstadoPedido, type Revision } from '@/lib/explosion-revisiones';

const cantidadTxt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-MX', { maximumFractionDigits: 3 }));

/** "YA PEDIDO": etapa más avanzada de cada material (mismos colores del panel de madera) */
const ESTILO_PEDIDO: Record<EstadoPedido, { txt: string; css: string }> = {
  falta: { txt: 'Falta pedir', css: 'bg-amber-500/15 text-amber-300 border-amber-400/30' },
  pedido: { txt: 'Pedido', css: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' },
  comprado: { txt: 'Comprado', css: 'bg-emerald-600/80 text-white border-emerald-500' },
  almacen: { txt: 'En almacén', css: 'bg-sky-600/80 text-white border-sky-500' },
  no_se_compra: { txt: 'No se compra', css: 'bg-white/[0.04] text-white/35 border-white/10' },
};

function PastillaPedido({ l }: { l: Revision['lineas'][number] }) {
  const e = estadoPedido(l);
  const folios = String(l.oc ?? '').split(/[,;/]+/).map(f => f.trim()).filter(Boolean);
  const conOc = folios.length > 0 && e !== 'falta' && e !== 'no_se_compra';
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded-md border text-[10.5px] font-bold whitespace-nowrap ${ESTILO_PEDIDO[e].css}`}>
      {ESTILO_PEDIDO[e].txt}{conOc ? ` · OC ${folios.join(', ')}` : ''}
    </span>
  );
}

const dinero = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fechaCorta(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

/** Revisión que se está viendo (para el encabezado y los botones Excel/PDF de la página) */
export interface VistaRev { id: string; numero: number; estado: 'borrador' | 'cerrada' }

export function ExplosionCompleta({ explosionId, onVista }: { explosionId: string; onVista?: (v: VistaRev | null) => void }) {
  const [revisiones, setRevisiones] = useState<Revision[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // null = la revisión más reciente (sigue a la nueva si el administrador sube otra)
  const [vistaId, setVistaId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [filtroPedido, setFiltroPedido] = useState<'todos' | 'falta' | 'pedidos'>('todos');
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/bom/revisiones?explosion_id=${encodeURIComponent(explosionId)}&completa=1`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setRevisiones(((await res.json()).revisiones as Revision[]) ?? []);
      setActualizado(new Date());
      setError('');
    } catch {
      setError('No se pudo cargar la explosión.');
    } finally {
      setCargando(false);
    }
  }, [explosionId]);

  const recargar = useRecargaAgrupada(cargar, 500);
  useEffect(() => {
    const ch = supabase
      .channel(`madera-completa-${explosionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_revisiones', filter: `explosion_id=eq.${explosionId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_revision_lineas', filter: `explosion_id=eq.${explosionId}` }, recargar)
      // Realtime no filtra los DELETE: se escuchan todos y se recarga (agrupado)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bom_revision_lineas' }, recargar)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bom_revisiones' }, recargar)
      .subscribe();
    const primera = setTimeout(() => void cargar(), 0);
    const respaldo = setInterval(() => { if (document.visibilityState === 'visible') recargar(); }, 10_000);
    return () => { clearTimeout(primera); clearInterval(respaldo); void supabase.removeChannel(ch); };
  }, [explosionId, cargar, recargar]);

  const vista = revisiones.find(r => r.id === vistaId) ?? revisiones[revisiones.length - 1] ?? null;
  const vId = vista?.id ?? null;
  const vNumero = vista?.numero ?? 0;
  const vEstado = vista?.estado ?? 'cerrada';
  useEffect(() => { onVista?.(vId ? { id: vId, numero: vNumero, estado: vEstado } : null); }, [vId, vNumero, vEstado, onVista]);
  // Todas las líneas, también las que se están capturando (todavía sin clave ni descripción)
  const lineas = useMemo(() => vista?.lineas ?? [], [vista]);
  const comparacion = useMemo(() => {
    const i = vista ? revisiones.findIndex(r => r.id === vista.id) : -1;
    return i >= 0 ? compararRevision(revisiones, i) : null;
  }, [revisiones, vista]);
  const costoTotal = useMemo(() => lineas.reduce((t, l) => t + costoEstimado(l), 0), [lineas]);
  const clasificaciones = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const l of lineas) { const c = l.clasificacion || 'Sin clasificación'; conteo.set(c, (conteo.get(c) ?? 0) + 1); }
    return [...conteo.entries()];
  }, [lineas]);
  // Si la clasificación elegida no está en esta revisión, se ven todas
  const filtroEfectivo = filtro === 'todas' || clasificaciones.some(([c]) => c === filtro) ? filtro : 'todas';
  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return lineas.filter(l => {
      const e = estadoPedido(l);
      return (filtroEfectivo === 'todas' || (l.clasificacion || 'Sin clasificación') === filtroEfectivo) &&
        (filtroPedido === 'todos' || (filtroPedido === 'falta' ? e === 'falta' : e !== 'falta' && e !== 'no_se_compra')) &&
        (!q || normalizar(`${l.clave} ${l.descripcion} ${l.oc}`).includes(q));
    });
  }, [lineas, filtroEfectivo, filtroPedido, busqueda]);
  const pedidos = useMemo(() => resumenPedidos(lineas), [lineas]);

  if (cargando) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>;
  if (error) return <p className="flex items-center gap-2 text-sm text-red-300"><AlertCircle className="w-4 h-4" /> {error}</p>;
  if (!vista) return (
    <p className="flex items-center gap-2 text-sm text-white/50 py-4 justify-center"><FileX2 className="w-4 h-4" /> Este pedido todavía no tiene explosión de materiales.</p>
  );

  return (
    <div className="space-y-3">
      {/* Revisiones */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Revisiones">
        {revisiones.map(r => {
          const activa = r.id === vista.id;
          return (
            <button key={r.id} type="button" role="tab" aria-selected={activa}
              onClick={() => setVistaId(r.id === revisiones[revisiones.length - 1].id ? null : r.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg font-mono text-[12px] font-bold border transition-colors ${activa ? 'bg-amber-600 border-amber-500 text-white' : 'bg-white/[0.04] border-white/10 text-white/60 hover:text-white'}`}>
              {etiquetaRev(r.numero)}{r.estado === 'borrador' ? ' · borrador' : ''}
            </button>
          );
        })}
        <span className="ml-auto shrink-0 text-[11px] text-white/40 pl-2">
          {vista.origen === 'importado' && vista.archivo_nombre ? vista.archivo_nombre : 'Capturada en el sistema'}
          {vista.creado_por ? ` · ${vista.creado_por}` : ''}
        </span>
      </div>
      {vista.motivo && <p className="text-[12px] text-white/55">Qué cambió: <span className="text-white/80">{vista.motivo}</span></p>}

      {/* Encabezado de la revisión */}
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[12px]">
        {([['Fecha', vista.encabezado?.fecha ? fechaCorta(vista.encabezado.fecha) : ''], ['Cliente', vista.encabezado?.cliente], ['Proyecto', vista.encabezado?.proyecto],
          ['Pedido', vista.encabezado?.pedido], ['Orden de producción', vista.encabezado?.orden_produccion], ['Elaboró', vista.encabezado?.usuario]] as [string, string | undefined][]).map(([k, v]) => (
          <div key={k} className="min-w-0"><dt className="text-white/40 text-[10px] uppercase tracking-wide">{k}</dt><dd className="text-white/85 truncate">{v || '—'}</dd></div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/50">
        <span className="inline-flex items-center gap-1.5 text-emerald-300/90"><Radio className="w-3.5 h-3.5 animate-pulse" /> En vivo{actualizado ? ` · ${actualizado.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
        {vista.estado === 'borrador' && <span className="text-amber-300">El administrador está editando esta revisión</span>}
        {comparacion && Object.keys(comparacion.marcas).length + comparacion.eliminadas.length > 0 && LEYENDA.map(l => (
          <span key={l.marca} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />{l.texto}</span>
        ))}
      </div>

      {/* Resumen de pedidos */}
      {pedidos.seCompran + pedidos.noSeCompran > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-[12px] text-white/70">
          <span><b className="text-emerald-300">Pedidos {pedidos.pedidos} de {pedidos.seCompran}</b> · Faltan <b className="text-amber-300">{pedidos.faltan}</b>{pedidos.noSeCompran > 0 && <> · No se compran <b className="text-white/45">{pedidos.noSeCompran}</b></>}</span>
          <span className="flex-1 min-w-[120px] max-w-xs h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Materiales pedidos" aria-valuemin={0} aria-valuemax={pedidos.seCompran} aria-valuenow={pedidos.pedidos}>
            <span className="block h-full bg-emerald-500 transition-all" style={{ width: `${pedidos.seCompran ? Math.round((pedidos.pedidos / pedidos.seCompran) * 100) : 0}%` }} />
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {[['todas', lineas.length] as [string, number], ...clasificaciones].map(([c, n]) => (
            <button key={c} type="button" onClick={() => setFiltro(c)} aria-pressed={filtroEfectivo === c}
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${filtroEfectivo === c ? 'border-amber-400/70 bg-amber-500/20 text-white' : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'}`}>
              {c !== 'todas' && <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorClasificacion(c) }} />}
              {c === 'todas' ? 'Todas' : c} <span className="text-white/40">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filtrar por estado de compra">
          {([['falta', 'Falta pedir', pedidos.faltan, 'border-amber-400/70 bg-amber-500/20 text-white'], ['pedidos', 'Pedidos', pedidos.pedidos, 'border-emerald-400/70 bg-emerald-500/20 text-white']] as const).map(([v, txt, n, activo]) => (
            <button key={v} type="button" onClick={() => setFiltroPedido(f => (f === v ? 'todos' : v))} aria-pressed={filtroPedido === v}
              className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${filtroPedido === v ? activo : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'}`}>
              {txt} <span className="text-white/40">{n}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar clave, material u OC…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-amber-400/60" />
        </label>
      </div>

      {/* Materiales */}
      {visibles.length === 0 ? (
        <p className="text-sm text-white/45 text-center py-6">{lineas.length ? 'Ningún material coincide con la búsqueda.' : 'Esta revisión no tiene materiales.'}</p>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-[12.5px]">
              <thead className="bg-white/[0.06] text-white/55 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Clave</th>
                  <th className="text-left px-3 py-2 font-semibold">Material</th>
                  <th className="text-right px-3 py-2 font-semibold">Cant.</th>
                  <th className="text-left px-3 py-2 font-semibold">Unidad</th>
                  <th className="text-left px-3 py-2 font-semibold">Clasif.</th>
                  <th className="text-right px-3 py-2 font-semibold">Costo</th>
                  <th className="text-left px-3 py-2 font-semibold">Estado</th>
                  <th className="text-center px-3 py-2 font-semibold">Se compra</th>
                  <th className="text-left px-3 py-2 font-semibold">OC</th>
                  <th className="text-center px-3 py-2 font-semibold">Compra</th>
                  <th className="text-center px-3 py-2 font-semibold">Almacén</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(l => (
                  <tr key={l.id} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 font-mono text-white/80 whitespace-nowrap">
                      {comparacion?.marcas[l.id] && <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: colorMarca(comparacion.marcas[l.id]) }} title={LEYENDA.find(x => x.marca === comparacion.marcas[l.id])?.texto} />}
                      {l.clave || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-white/90">{l.descripcion || <span className="text-white/30 italic">capturando…</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-white">{cantidadTxt(l.cantidad)}</td>
                    <td className="px-3 py-1.5 text-white/60">{l.unidad}</td>
                    <td className="px-3 py-1.5">
                      {l.clasificacion && <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-900 whitespace-nowrap" style={{ background: colorClasificacion(l.clasificacion) }}>{l.clasificacion}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-white/75 whitespace-nowrap" title={l.moneda}>{l.costo ? `$${dinero(Number(l.costo))}` : '—'}</td>
                    <td className="px-3 py-1.5"><PastillaPedido l={l} /></td>
                    <td className="px-3 py-1.5 text-center text-white/70">{l.se_compra === true ? 'SI' : l.se_compra === false ? 'NO' : '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-white/75">{l.oc || <span className="text-white/25">—</span>}</td>
                    <td className="px-3 py-1.5 text-center">{l.comprado ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" />{fechaCorta(l.fecha_compra)}</span> : <span className="text-white/25">—</span>}</td>
                    <td className="px-3 py-1.5 text-center">{l.almacen ? <span className="inline-flex items-center gap-1 text-sky-300"><CheckCircle2 className="w-3.5 h-3.5" />{fechaCorta(l.fecha_almacen)}</span> : <span className="text-white/25">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: tarjetas */}
          <ul className="md:hidden space-y-2">
            {visibles.map(l => (
              <li key={l.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] text-white/90 min-w-0">
                    {comparacion?.marcas[l.id] && <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: colorMarca(comparacion.marcas[l.id]) }} />}
                    {l.descripcion || <span className="text-white/30 italic">capturando…</span>}
                  </p>
                  <p className="text-[13px] font-bold text-white tabular-nums shrink-0">{cantidadTxt(l.cantidad)} <span className="font-normal text-white/50 text-[11px]">{l.unidad}</span></p>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <PastillaPedido l={l} />
                  {l.clave && <span className="font-mono text-white/55">{l.clave}</span>}
                  {l.clasificacion && <span className="px-1.5 py-0.5 rounded font-semibold text-slate-900" style={{ background: colorClasificacion(l.clasificacion) }}>{l.clasificacion}</span>}
                  {!!l.costo && <span className="text-white/60">${dinero(Number(l.costo))}</span>}
                  {l.oc && <span className="text-white/60">OC {l.oc}</span>}
                  {l.comprado && <span className="text-emerald-300">Comprado {fechaCorta(l.fecha_compra)}</span>}
                  {l.almacen && <span className="text-sky-300">Almacén {fechaCorta(l.fecha_almacen)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {comparacion && comparacion.eliminadas.length > 0 && (
        <div className="rounded-xl border border-red-400/25 bg-red-500/[0.07] px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-red-300 mb-1.5">Quitados en {etiquetaRev(vista.numero)} ({comparacion.eliminadas.length})</p>
          <ul className="space-y-0.5 text-[12px] text-red-200/90">
            {comparacion.eliminadas.map(l => (
              <li key={l.id} className="line-through decoration-red-400/60"><span className="font-mono">{l.clave}</span> {l.descripcion} · {cantidadTxt(l.cantidad)} {l.unidad}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-white/35">{visibles.length} de {lineas.length} materiales · costo estimado ${dinero(costoTotal)} · {etiquetaRev(vista.numero)} · solo lectura</p>
    </div>
  );
}
