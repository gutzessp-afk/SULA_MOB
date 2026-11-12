'use client';

/**
 * BOM — Lista de Explosiones — /admin/bom
 * ────────────────────────────────────────
 * Explosiones de material de los pedidos activos (los terminados al 100% no aparecen).
 * Al hacer clic en una se abre su espacio de trabajo, /admin/bom/[id].
 *
 * Con ?proyecto=UUID (el ⚡ de Proyectos) abre directo la explosión de ese proyecto,
 * creándola si todavía no existe.
 *
 * RUTA: src/app/admin/bom/page.tsx
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, Search, Loader2, AlertCircle, ChevronRight, Clock, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BadgePrioridad } from '@/components/BadgePrioridad';
import { useDebounce } from '@/hooks/useDebounce';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import { motivosSinResolver } from '@/lib/bom-motivos';
import { ESTATUS_BOM, duracionLegible, estatusBom, segundosTrabajados } from '@/lib/bom-tiempo';

/* ── Tipos ── */

interface Proyecto { codigo: string; nombre: string; sucursal: string | null; prioridad: string }

interface Explosion {
  id: string;
  proyecto_id: string;
  estado: 'pendiente' | 'en_proceso' | 'completado';
  fecha_inicio: string | null;
  fecha_termino: string | null;
  duracion_seg: number;
  acumulado_seg: number | null;
  tramo_inicio: string | null;
  usuario_nombre: string | null;
  created_at: string;
  checklist: unknown;
  proyecto: Proyecto | null;
  total_partidas: number;
  detalles_count: { total: number; checked: number };
}

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

/* ── Helpers ── */

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return `${fechaCorta(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const estatusDe = (e: Explosion) => estatusBom(e);

function BadgeEstado({ estado }: { estado: keyof typeof ESTATUS_BOM }) {
  const c = ESTATUS_BOM[estado];
  return <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${c.css}`}>{c.txt}</span>;
}

const Cargando = () => (
  <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
);

/* useSearchParams necesita un límite de Suspense */
export default function BomListaPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <BomLista />
    </Suspense>
  );
}

function BomLista() {
  const router = useRouter();
  const proyectoParam = useSearchParams().get('proyecto');
  const [explosiones, setExplosiones] = useState<Explosion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const buscDebounced = useDebounce(busqueda, 300);

  /* ── ?proyecto=UUID → abrir (o crear) la explosión de ese proyecto ── */
  useEffect(() => {
    if (!proyectoParam) return;
    let vigente = true;
    fetch('/api/bom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoParam }),
    })
      .then(res => res.json())
      .then(d => {
        if (!vigente) return;
        if (d.explosion?.id) router.replace(`/admin/bom/${d.explosion.id}`);
        else router.replace('/admin/bom');
      })
      .catch(() => { if (vigente) router.replace('/admin/bom'); });
    return () => { vigente = false; };
  }, [proyectoParam, router]);

  /* ── Cargar ── */
  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/bom', { cache: 'no-store' });
      if (!res.ok) throw new Error('Error al cargar BOM');
      const d = await res.json();
      setExplosiones(d.explosiones || []);
      setError('');
    } catch {
      setError('No se pudieron cargar las explosiones de material.');
    } finally {
      setCargando(false);
    }
  }, []);

  /* ── Supabase real-time ──
     Carga al abrir y recarga (agrupando eventos seguidos) con cada cambio y al reconectarse. */
  const recargar = useRecargaAgrupada(cargar, 500);
  useEffect(() => {
    const ch = supabase
      .channel('bom-lista-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_explosiones' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_detalles' }, recargar)
      .subscribe(status => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') recargar(); });
    // Primera carga de inmediato, sin esperar a que se conecte el tiempo real
    const primera = setTimeout(() => void cargar(), 0);
    return () => { clearTimeout(primera); void supabase.removeChannel(ch); };
  }, [cargar, recargar]);

  /* ── Filtrar ── */
  const filtradas = useMemo(() => {
    let lista = explosiones;
    if (filtro !== 'todos') lista = lista.filter(e => estatusDe(e) === filtro);
    const t = buscDebounced.trim().toLowerCase();
    if (t) {
      lista = lista.filter(e =>
        e.proyecto?.codigo?.toLowerCase().includes(t) ||
        e.proyecto?.nombre?.toLowerCase().includes(t) ||
        e.proyecto?.sucursal?.toLowerCase().includes(t)
      );
    }
    return lista;
  }, [explosiones, filtro, buscDebounced]);

  const conteo = useMemo(() => {
    const c = { bloqueado: 0, pendiente: 0, en_proceso: 0, pausado: 0, completado: 0 };
    for (const e of explosiones) c[estatusDe(e)]++;
    return c;
  }, [explosiones]);

  if (proyectoParam) return <Cargando />;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto px-2 sm:px-0 pb-8">

      {/* ═══ HEADER ═══ */}
      <div className={`${TARJETA} relative overflow-hidden px-5 py-6 sm:p-8 flex items-center gap-5 lg:pl-16`}>
        <div className="w-14 h-14 rounded-2xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
          <Zap className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-wide leading-tight">BOM — Explosión de Material</h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1.5 leading-relaxed">Selecciona un pedido para iniciar o continuar su explosión de material.</p>
        </div>
      </div>

      {/* ═══ FILTROS ═══ */}
      <div className="flex flex-wrap items-center gap-3">
        {[
          { key: 'todos', label: 'Todos', n: explosiones.length },
          { key: 'bloqueado', label: 'Bloqueados', n: conteo.bloqueado },
          { key: 'pendiente', label: 'Pendientes', n: conteo.pendiente },
          { key: 'en_proceso', label: 'En Proceso', n: conteo.en_proceso },
          { key: 'pausado', label: 'En Pausa', n: conteo.pausado },
          { key: 'completado', label: 'Completados', n: conteo.completado },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFiltro(t.key)}
            aria-pressed={filtro === t.key}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${filtro === t.key ? 'bg-blue-600/30 text-white border-blue-400/40' : 'bg-white/[0.05] text-white/60 border-white/10 hover:bg-white/[0.1]'}`}
          >
            {t.label} ({t.n})
          </button>
        ))}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Buscar por código, nombre o sucursal..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* ═══ LISTA ═══ */}
      {cargando ? (
        <Cargando />
      ) : error ? (
        <div className={`${TARJETA} p-6 flex items-center gap-3 text-red-400`}><AlertCircle className="w-5 h-5" /><span className="text-sm">{error}</span></div>
      ) : filtradas.length === 0 ? (
        <div className={`${TARJETA} p-8 text-center text-white/40`}>
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{explosiones.length === 0 ? 'No hay pedidos activos para explosión de material. Crea un pedido en "Nueva Orden" para comenzar.' : 'No se encontraron resultados con ese filtro.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(exp => (
            <button
              key={exp.id}
              type="button"
              onClick={() => router.push(`/admin/bom/${exp.id}`)}
              className={`${TARJETA} w-full text-left px-5 py-4 sm:px-6 sm:py-5 hover:ring-blue-400/30 hover:border-blue-400/20 transition-all group`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-base font-bold text-white">{exp.proyecto?.codigo || '—'}</h3>
                    <span className="text-sm text-white/50">·</span>
                    <span className="text-sm text-white/70 truncate">{exp.proyecto?.nombre || 'Sin nombre'}</span>
                    <BadgeEstado estado={estatusDe(exp)} />
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-white/45 flex-wrap">
                    {exp.proyecto?.sucursal && <span>Sucursal: <span className="text-white/70">{exp.proyecto.sucursal}</span></span>}
                    {exp.proyecto?.prioridad && <BadgePrioridad prioridad={exp.proyecto.prioridad} />}
                    <span>Partidas: <span className="text-white/70">{exp.total_partidas}</span></span>
                    {exp.detalles_count.total > 0 && (
                      <span>Materiales: <span className="text-emerald-400">{exp.detalles_count.checked}/{exp.detalles_count.total}</span></span>
                    )}
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fechaCorta(exp.created_at)}</span>
                  </div>
                  {exp.fecha_inicio && (
                    <div className="flex items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-white/45 flex-wrap">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Inició: <span className="text-white/70">{fechaHora(exp.fecha_inicio)}</span></span>
                      {exp.estado === 'completado' && exp.fecha_termino && (
                        <span>Terminó: <span className="text-white/70">{fechaHora(exp.fecha_termino)}</span></span>
                      )}
                      <span>
                        {exp.estado === 'completado' ? 'Tardó' : 'Lleva'}:{' '}
                        <span className={exp.estado === 'completado' ? 'text-emerald-400 font-semibold' : 'text-white/70'}>{duracionLegible(segundosTrabajados(exp))}</span>
                      </span>
                    </div>
                  )}
                  {estatusDe(exp) === 'bloqueado' && (
                    <p className="mt-2 text-xs text-red-300/90 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>{motivosSinResolver(exp.checklist).map(m => m.texto).join(' · ')}</span>
                    </p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
