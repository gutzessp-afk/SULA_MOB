'use client';

/**
 * SoltarPedido.tsx — arrastrar un PEDIDO PDF al panel admin y crearlo como ORDEN NUEVA
 * ─────────────────────────────────────────────────────────────────────────────────────
 * Va en el layout del admin (src/app/admin/layout.tsx) y solo se activa en las pantallas de
 * RUTAS_ACTIVAS: ahí, al arrastrar un PDF sobre la ventana aparece una capa "Suelta el pedido".
 * No se activa en Proyectos (ya tiene su propio "Cargar Pedido PDF" con formulario), ni en BOM
 * (ahí los PDF son órdenes de compra), ni en Despiece (ahí los PDF son planos).
 *
 *   1. Suelta el PDF → /api/parse-pdf lo lee (mismo lector de siempre: plantilla anterior y nueva).
 *   2. Ventana de revisión: código, cliente, sucursal, fechas, partidas, áreas y prioridad.
 *   3. "Crear orden" → /api/proyectos/desde-pedido crea el proyecto, sus partidas, áreas y su
 *      explosión de material, igual que el formulario de Proyectos.
 *   4. Listo: botones para abrir Proyectos o la explosión en BOM.
 *
 * RUTA: src/components/admin/SoltarPedido.tsx
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, CheckCircle2, FilePlus2, Loader2, MapPin, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/** Pantallas donde soltar un PDF crea un pedido */
const RUTAS_ACTIVAS = ['/admin', '/admin/dashboard', '/admin/terminados', '/admin/calendario', '/admin/reportes'];

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-[#0d111a]/95 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl';

interface PartidaLeida { cantidad: number; clave: string; unidad: string; descripcion: string; precio?: number }
interface PedidoLeido {
  numero_pedido: string; cliente: string; fecha: string; fecha_entrega: string;
  referencia_sucursal: string; elaborado_por: string; partidas: PartidaLeida[];
}
interface Area { id: string; nombre: string }

type Paso =
  | { tipo: 'leyendo'; archivo: string }
  | { tipo: 'revisar'; archivo: string; pedido: PedidoLeido }
  | { tipo: 'creando'; archivo: string; pedido: PedidoLeido }
  | { tipo: 'listo'; codigo: string; proyectoId: string; partidas: number; avisos: string[] }
  | { tipo: 'error'; mensaje: string; proyectoId?: string };

export function SoltarPedido() {
  const pathname = usePathname();
  const activo = RUTAS_ACTIVAS.includes(pathname);
  const [arrastrando, setArrastrando] = useState(false);
  const [paso, setPaso] = useState<Paso | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [prioridad, setPrioridad] = useState('media');
  const contador = useRef(0);

  /* ── Leer el PDF con el lector de pedidos de siempre ── */
  const leer = async (archivo: File) => {
    setPaso({ tipo: 'leyendo', archivo: archivo.name });
    try {
      const form = new FormData();
      form.append('pdf', archivo);
      const [res, { data: listaAreas }] = await Promise.all([
        fetch('/api/parse-pdf', { method: 'POST', body: form }),
        supabase.from('areas').select('id, nombre').eq('activo', true).order('orden', { ascending: true }),
      ]);
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) { setPaso({ tipo: 'error', mensaje: datos.error || 'No se pudo leer el PDF.' }); return; }
      const pedido = datos as PedidoLeido;
      if (!pedido.numero_pedido || !pedido.partidas?.length) {
        setPaso({ tipo: 'error', mensaje: `"${archivo.name}" no parece un pedido de Click Balance (sin número de pedido o sin partidas). Créalo a mano desde Proyectos.` });
        return;
      }
      const lista = (listaAreas ?? []) as Area[];
      setAreas(lista);
      setElegidas(new Set(lista.map(a => a.id)));
      setPrioridad('media');
      setPaso({ tipo: 'revisar', archivo: archivo.name, pedido });
    } catch {
      setPaso({ tipo: 'error', mensaje: 'No hay conexión con el servidor. Intenta de nuevo.' });
    }
  };

  /* ── Capa al arrastrar un archivo sobre la ventana ── */
  useEffect(() => {
    if (!activo) return;
    const conArchivos = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const entra = (e: DragEvent) => { if (!conArchivos(e)) return; e.preventDefault(); contador.current++; setArrastrando(true); };
    const sobre = (e: DragEvent) => { if (conArchivos(e)) e.preventDefault(); };
    const sale = () => { contador.current = Math.max(0, contador.current - 1); if (!contador.current) setArrastrando(false); };
    const suelta = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      contador.current = 0;
      setArrastrando(false);
      const pdf = Array.from(e.dataTransfer?.files ?? []).find(f => /\.pdf$/i.test(f.name));
      if (pdf) void leer(pdf);
      else setPaso({ tipo: 'error', mensaje: 'Suelta el PDF del pedido (de Click Balance).' });
    };
    window.addEventListener('dragenter', entra);
    window.addEventListener('dragover', sobre);
    window.addEventListener('dragleave', sale);
    window.addEventListener('drop', suelta);
    return () => {
      window.removeEventListener('dragenter', entra);
      window.removeEventListener('dragover', sobre);
      window.removeEventListener('dragleave', sale);
      window.removeEventListener('drop', suelta);
    };
  }, [activo]);

  /* ── Crear la orden ── */
  const crear = async () => {
    if (paso?.tipo !== 'revisar') return;
    const { pedido, archivo } = paso;
    setPaso({ tipo: 'creando', archivo, pedido });
    try {
      const todas = elegidas.size === areas.length;
      const res = await fetch('/api/proyectos/desde-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Todas las áreas = lista vacía (la base ya las crea pendientes, igual que en Proyectos)
        body: JSON.stringify({ pedido, areas: todas ? [] : [...elegidas], prioridad }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setPaso({ tipo: 'error', mensaje: d.error || 'No se pudo crear la orden.', proyectoId: d.proyecto_id }); return; }
      setPaso({ tipo: 'listo', codigo: d.proyecto.codigo, proyectoId: d.proyecto.id, partidas: d.partidas, avisos: d.avisos ?? [] });
    } catch {
      setPaso({ tipo: 'error', mensaje: 'No hay conexión con el servidor. Intenta de nuevo.' });
    }
  };

  const cerrar = () => setPaso(null);

  if (!activo && !paso) return null;

  return (
    <>
      {/* Capa al arrastrar */}
      {arrastrando && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-blue-950/70 backdrop-blur-sm pointer-events-none p-6">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-blue-400 px-10 py-12 text-center bg-black/30">
            <FilePlus2 className="w-14 h-14 text-blue-300" />
            <p className="text-xl font-bold text-white">Suelta el pedido para crear una orden nueva</p>
            <p className="text-sm text-blue-100/70">PDF del pedido de Click Balance</p>
          </div>
        </div>
      )}

      {/* Ventana */}
      {paso && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="soltar-pedido-titulo">
          <div className={`${TARJETA} w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-[26px] p-5 sm:p-7`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 id="soltar-pedido-titulo" className="text-lg font-bold text-white flex items-center gap-2"><FilePlus2 className="w-5 h-5 text-blue-400" /> Nueva orden desde PDF</h2>
              {paso.tipo !== 'creando' && paso.tipo !== 'leyendo' && (
                <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
              )}
            </div>

            {(paso.tipo === 'leyendo' || paso.tipo === 'creando') && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                <p className="text-sm text-white/70">{paso.tipo === 'leyendo' ? `Leyendo "${paso.archivo}"…` : 'Creando la orden, sus partidas y su explosión de material…'}</p>
              </div>
            )}

            {paso.tipo === 'revisar' && (() => {
              const p = paso.pedido;
              const piezas = p.partidas.reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
              return (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
                    <p><span className="text-white/45">Código: </span><b className="text-white">PED-{p.numero_pedido}</b></p>
                    <p><span className="text-white/45">Cliente: </span><span className="text-white/85">{p.cliente || '—'}</span></p>
                    <p className="sm:col-span-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-white/40" /><span className="text-white/45">Sucursal: </span><span className="text-white/85">{p.referencia_sucursal || '—'}</span></p>
                    <p><span className="text-white/45">Fecha: </span><span className="text-white/85">{p.fecha || '—'}</span></p>
                    <p><span className="text-white/45">Entrega: </span><span className="text-white/85">{p.fecha_entrega || '—'}</span></p>
                    <p className="sm:col-span-2"><span className="text-white/45">Elaboró: </span><span className="text-white/85">{p.elaborado_por || '—'}</span></p>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-2">{p.partidas.length} partida(s) · {piezas} pieza(s)</p>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/[0.06]">
                      {p.partidas.map((x, i) => (
                        <div key={i} className="flex items-start gap-3 px-3 py-2 text-[12.5px]">
                          <span className="shrink-0 w-10 text-right font-bold text-white tabular-nums">{x.cantidad}</span>
                          <span className="shrink-0 font-mono text-blue-300">{x.clave || '—'}</span>
                          <span className="text-white/75 leading-snug">{x.descripcion}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {areas.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-white/50">Áreas por las que pasa ({elegidas.size}/{areas.length})</p>
                        <button type="button" onClick={() => setElegidas(elegidas.size === areas.length ? new Set() : new Set(areas.map(a => a.id)))} className="text-xs text-blue-300 hover:text-blue-200">
                          {elegidas.size === areas.length ? 'Quitar todas' : 'Todas'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {areas.map(a => {
                          const on = elegidas.has(a.id);
                          return (
                            <button key={a.id} type="button" aria-pressed={on} onClick={() => setElegidas(prev => { const n = new Set(prev); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${on ? 'bg-blue-600/30 border-blue-400/50 text-white' : 'bg-white/[0.03] border-white/10 text-white/45'}`}>
                              {a.nombre}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-3 text-sm text-white/70">Prioridad
                    <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-white text-sm">
                      <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
                    </select>
                  </label>

                  <div className="flex gap-3 justify-end flex-wrap pt-1">
                    <button type="button" onClick={cerrar} className="px-4 py-2.5 rounded-xl text-white/60 hover:text-white text-sm">Cancelar</button>
                    <button type="button" onClick={() => void crear()} disabled={elegidas.size === 0} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40">
                      <Upload className="w-4 h-4" /> Crear orden PED-{p.numero_pedido}
                    </button>
                  </div>
                </div>
              );
            })()}

            {paso.tipo === 'listo' && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                <p className="text-lg font-bold text-white">Orden {paso.codigo} creada</p>
                <p className="text-sm text-white/60">{paso.partidas} partida(s). Ya aparece en Proyectos y en BOM como pendiente.</p>
                {paso.avisos.map(a => <p key={a} className="text-xs text-amber-300 flex gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{a}</p>)}
                <div className="flex gap-3 flex-wrap justify-center pt-2">
                  <Link href="/admin/proyectos" onClick={cerrar} className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-sm font-semibold border border-white/10">Ver en Proyectos</Link>
                  <Link href={`/admin/bom?proyecto=${paso.proyectoId}`} onClick={cerrar} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">Abrir su explosión (BOM)</Link>
                </div>
              </div>
            )}

            {paso.tipo === 'error' && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-400" />
                <p className="text-sm text-red-200 max-w-md">{paso.mensaje}</p>
                <div className="flex gap-3 pt-2">
                  {paso.proyectoId && <Link href="/admin/proyectos" onClick={cerrar} className="px-4 py-2.5 rounded-xl bg-white/[0.08] text-white text-sm font-semibold border border-white/10">Ir a Proyectos</Link>}
                  <button type="button" onClick={cerrar} className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-sm">Cerrar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
