'use client';

/**
 * BOM — Explosión de Material — /admin/bom
 * ─────────────────────────────────────────
 * Muestra los pedidos que necesitan explosión de material (se crean al dar de alta
 * un pedido en Proyectos → Nueva Orden). El admin puede:
 *   1. Iniciar la explosión (cronómetro empieza)
 *   2. Finalizar la explosión (cronómetro se detiene)
 *   3. Editar/reabrir si hubo un error
 *   4. Ver las partidas de cada pedido en una lista desplegable
 *   5. Marcar cada partida como verificada (checklist)
 *   6. Pasar el pedido cuando todas las partidas estén verificadas
 *
 * Iniciar y finalizar se registran en el Historial desde /api/bom.
 * Se suscribe a Supabase Realtime para ver los cambios de otros admins sin recargar.
 *
 * RUTA: src/app/admin/bom/page.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Zap, Play, Square, Pencil, Check, ChevronDown, ChevronRight,
  Clock, Calendar, Loader2, Search, AlertCircle, CheckCircle2, FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BadgePrioridad } from '@/components/BadgePrioridad';
import { useDebounce } from '@/hooks/useDebounce';

/* ── Tipos ── */

interface Proyecto {
  codigo: string;
  nombre: string;
  cliente: string | null;
  prioridad: string;
}

interface Explosion {
  id: string;
  proyecto_id: string;
  estado: 'pendiente' | 'en_proceso' | 'completado' | 'verificado';
  fecha_inicio: string | null;
  fecha_termino: string | null;
  duracion_seg: number;
  usuario_id: string | null;
  usuario_nombre: string | null;
  notas: string | null;
  checklist: Record<string, { checked: boolean; checked_at: string; checked_by: string }> | null;
  created_at: string;
  updated_at: string;
  // Datos anexos del GET
  proyecto: Proyecto | null;
  total_partidas: number;
}

interface Partida {
  id: string;
  proyecto_id: string;
  clave: string;
  descripcion: string;
  cantidad: number;
  orden: number;
}

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

/* ── Helpers de formato ── */

/** Formatea segundos como HH:MM:SS */
function formatTiempo(seg: number): string {
  const total = Math.max(0, seg || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Fecha legible: "11 Nov 2026 14:32" */
function fechaLegible(iso: string): string {
  const d = new Date(iso);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function diaSemana(iso: string): string {
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return dias[new Date(iso).getDay()];
}

function nombreMes(iso: string): string {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return meses[new Date(iso).getMonth()];
}

/* ── Badge de estado con color ── */
function BadgeEstado({ estado }: { estado: Explosion['estado'] }) {
  const colores = {
    pendiente: 'bg-yellow-500/15 text-yellow-300 border-yellow-400/30',
    en_proceso: 'bg-blue-500/15 text-blue-300 border-blue-400/30',
    completado: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    verificado: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
  };
  const etiquetas = {
    pendiente: 'PENDIENTE',
    en_proceso: 'EN PROCESO',
    completado: 'COMPLETADO',
    verificado: 'VERIFICADO',
  };
  return (
    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${colores[estado]}`}>
      {etiquetas[estado]}
    </span>
  );
}

/* ── Cronómetro en vivo ── */
function Cronometro({ fechaInicio }: { fechaInicio: string }) {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const inicio = new Date(fechaInicio).getTime();
    const tick = () => setSeg(Math.floor((Date.now() - inicio) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [fechaInicio]);

  return (
    <span className="font-mono text-2xl font-bold text-blue-400 tabular-nums animate-pulse">
      {formatTiempo(seg)}
    </span>
  );
}

/* ══════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════ */

export default function BomPage() {
  const [explosiones, setExplosiones] = useState<Explosion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const busquedaDebounced = useDebounce(busqueda, 300);
  const [expandido, setExpandido] = useState<string | null>(null);  // id de explosión expandida
  const [partidas, setPartidas] = useState<Record<string, Partida[]>>({});
  const [cargandoPartidas, setCargandoPartidas] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);  // id mientras se ejecuta acción

  /* ── Cargar explosiones ── */
  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/bom', { cache: 'no-store' });
      if (!res.ok) throw new Error('Error al cargar BOM');
      const data = await res.json();
      setExplosiones(data.explosiones || []);
      setError('');
    } catch {
      setError('No se pudieron cargar las explosiones de material.');
    } finally {
      setCargando(false);
    }
  }, []);

  /* ── Supabase real-time ──
     La primera carga sale del callback de subscribe (también recarga si el canal se reconecta
     o falla, para que la lista no dependa de que Realtime funcione). */
  useEffect(() => {
    const channel = supabase
      .channel('bom-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bom_explosiones' },
        () => { void cargar(); }
      )
      .subscribe(status => { if (status !== 'CLOSED') void cargar(); });

    return () => { void supabase.removeChannel(channel); };
  }, [cargar]);

  /* ── Filtrar y buscar ── */
  const filtradas = useMemo(() => {
    let lista = explosiones;
    if (filtroEstado !== 'todos') {
      lista = lista.filter(e => e.estado === filtroEstado);
    }
    const term = busquedaDebounced.trim().toLowerCase();
    if (term) {
      lista = lista.filter(e =>
        e.proyecto?.codigo?.toLowerCase().includes(term) ||
        e.proyecto?.nombre?.toLowerCase().includes(term) ||
        e.proyecto?.cliente?.toLowerCase().includes(term)
      );
    }
    return lista;
  }, [explosiones, filtroEstado, busquedaDebounced]);

  /* ── Acciones sobre una explosión ── */
  const ejecutarAccion = useCallback(async (id: string, accion: string, extra?: Record<string, unknown>) => {
    setAccionando(id);
    try {
      const res = await fetch('/api/bom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, accion, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Error al ejecutar la acción.');
        return;
      }
      await cargar();
    } finally {
      setAccionando(null);
    }
  }, [cargar]);

  /* ── Cargar partidas de un proyecto ── */
  const cargarPartidas = async (proyectoId: string) => {
    if (partidas[proyectoId]) return; // Ya cargadas
    setCargandoPartidas(proyectoId);
    try {
      const { data, error: err } = await supabase
        .from('partidas')
        .select('id, proyecto_id, clave, descripcion, cantidad, orden')
        .eq('proyecto_id', proyectoId)
        .order('orden', { ascending: true });

      if (!err && data) {
        setPartidas(prev => ({ ...prev, [proyectoId]: data as Partida[] }));
      }
    } finally {
      setCargandoPartidas(null);
    }
  };

  /* ── Toggle expandir/colapsar pedido ── */
  const toggleExpandir = (explosion: Explosion) => {
    if (expandido === explosion.id) {
      setExpandido(null);
    } else {
      setExpandido(explosion.id);
      void cargarPartidas(explosion.proyecto_id);
    }
  };

  /* ── Toggle checklist de una partida ── */
  const toggleCheck = async (explosion: Explosion, partidaId: string) => {
    const checklistActual = { ...(explosion.checklist ?? {}) };
    const yaChecked = checklistActual[partidaId]?.checked ?? false;

    checklistActual[partidaId] = {
      checked: !yaChecked,
      checked_at: new Date().toISOString(),
      checked_by: 'Admin',
    };

    await ejecutarAccion(explosion.id, 'actualizar_checklist', { checklist: checklistActual });
  };

  const verificarPedido = async (explosion: Explosion) => {
    await ejecutarAccion(explosion.id, 'verificar');
  };

  const guardarNotas = useCallback(async (explosion: Explosion, notas: string) => {
    await ejecutarAccion(explosion.id, 'actualizar_notas', { notas });
  }, [ejecutarAccion]);

  /* ── Contadores por estado ── */
  const conteo = useMemo(() => {
    const c = { pendiente: 0, en_proceso: 0, completado: 0, verificado: 0 };
    for (const e of explosiones) c[e.estado]++;
    return c;
  }, [explosiones]);

  /* ══════════════════════════════════════
     RENDER
     ══════════════════════════════════════ */

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto px-2 sm:px-0 pb-8">

      {/* ═══ HEADER ═══ */}
      <div className={`${TARJETA} relative overflow-hidden px-5 py-6 sm:p-8 flex items-center gap-5 lg:pl-16`}>
        <div className="w-14 h-14 rounded-2xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
          <Zap className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-wide leading-tight">
            BOM — Explosión de Material
          </h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1.5 leading-relaxed">
            Inicia y controla la explosión de material de cada pedido. Verifica las partidas antes de continuar.
          </p>
        </div>
      </div>

      {/* ═══ FILTROS ═══ */}
      <div className="flex flex-wrap items-center gap-3">
        {[
          { key: 'todos', label: 'Todos', count: explosiones.length },
          { key: 'pendiente', label: 'Pendientes', count: conteo.pendiente },
          { key: 'en_proceso', label: 'En Proceso', count: conteo.en_proceso },
          { key: 'completado', label: 'Completados', count: conteo.completado },
          { key: 'verificado', label: 'Verificados', count: conteo.verificado },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFiltroEstado(tab.key)}
            aria-pressed={filtroEstado === tab.key}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
              filtroEstado === tab.key
                ? 'bg-blue-600/30 text-white border-blue-400/40'
                : 'bg-white/[0.05] text-white/60 border-white/10 hover:bg-white/[0.1]'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Buscar por código, nombre o cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* ═══ LISTA DE EXPLOSIONES ═══ */}
      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : error ? (
        <div className={`${TARJETA} p-6 flex items-center gap-3 text-red-400`}>
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      ) : filtradas.length === 0 ? (
        <div className={`${TARJETA} p-8 text-center text-white/40`}>
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {explosiones.length === 0
              ? 'No hay explosiones de material. Crea un pedido en "Nueva Orden" para comenzar.'
              : 'No se encontraron resultados con ese filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtradas.map(explosion => {
            const isExpandido = expandido === explosion.id;
            const checklist = explosion.checklist ?? {};
            const pts = partidas[explosion.proyecto_id] || [];
            const totalChecked = pts.filter(p => checklist[p.id]?.checked).length;
            const todasVerificadas = pts.length > 0 && totalChecked === pts.length;
            const ocupado = accionando === explosion.id;

            return (
              <div key={explosion.id} className={`${TARJETA} overflow-hidden transition-all`}>
                {/* Cabecera de la tarjeta */}
                <div className="px-5 py-4 sm:px-6 sm:py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-base font-bold text-white">
                          {explosion.proyecto?.codigo || '—'}
                        </h3>
                        <span className="text-sm text-white/50">·</span>
                        <span className="text-sm text-white/70 truncate">
                          {explosion.proyecto?.nombre || 'Sin nombre'}
                        </span>
                        <BadgeEstado estado={explosion.estado} />
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs text-white/45 flex-wrap">
                        {explosion.proyecto?.cliente && (
                          <span>Cliente: <span className="text-white/70">{explosion.proyecto.cliente}</span></span>
                        )}
                        {explosion.proyecto?.prioridad && (
                          <BadgePrioridad prioridad={explosion.proyecto.prioridad} />
                        )}
                        <span>Partidas: <span className="text-white/70">{explosion.total_partidas}</span></span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {fechaLegible(explosion.created_at)}
                        </span>
                      </div>

                      {/* ── PENDIENTE → Iniciar ── */}
                      {explosion.estado === 'pendiente' && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => ejecutarAccion(explosion.id, 'iniciar')}
                            disabled={ocupado}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
                          >
                            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Iniciar Explosión
                          </button>
                        </div>
                      )}

                      {/* ── EN_PROCESO → cronómetro + Finalizar ── */}
                      {explosion.estado === 'en_proceso' && explosion.fecha_inicio && (
                        <div className="mt-4 space-y-3">
                          <span className="text-xs text-white/45 block">
                            <Clock className="w-3 h-3 inline mr-1" />
                            Inicio: {fechaLegible(explosion.fecha_inicio)}
                          </span>
                          <div className="flex items-center gap-4 flex-wrap">
                            <Cronometro fechaInicio={explosion.fecha_inicio} />
                            <button
                              type="button"
                              onClick={() => ejecutarAccion(explosion.id, 'finalizar')}
                              disabled={ocupado}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
                            >
                              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                              Finalizar Explosión
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── COMPLETADO → tiempos + Editar ── */}
                      {explosion.estado === 'completado' && (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center gap-6 flex-wrap text-xs">
                            {explosion.fecha_inicio && (
                              <span className="text-white/50">
                                <Clock className="w-3 h-3 inline mr-1 text-emerald-400" />
                                Inicio: <span className="text-white/80">{fechaLegible(explosion.fecha_inicio)}</span>
                              </span>
                            )}
                            {explosion.fecha_termino && (
                              <span className="text-white/50">
                                <Clock className="w-3 h-3 inline mr-1 text-emerald-400" />
                                Término: <span className="text-white/80">{fechaLegible(explosion.fecha_termino)}</span>
                              </span>
                            )}
                            <span className="text-white/50">
                              Duración: <span className="text-emerald-400 font-mono font-bold">{formatTiempo(explosion.duracion_seg)}</span>
                            </span>
                          </div>
                          {explosion.fecha_inicio && (
                            <div className="flex items-center gap-6 text-xs text-white/50">
                              <span>Día: <span className="text-white/80">{diaSemana(explosion.fecha_inicio)}</span></span>
                              <span>Mes: <span className="text-white/80">{nombreMes(explosion.fecha_inicio)}</span></span>
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <button
                              type="button"
                              onClick={() => ejecutarAccion(explosion.id, 'reabrir')}
                              disabled={ocupado}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600/30 hover:bg-amber-500/40 text-amber-300 text-xs font-semibold transition-all border border-amber-400/30 disabled:opacity-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── VERIFICADO ── */}
                      {explosion.estado === 'verificado' && (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center gap-2 text-sm text-violet-300 font-semibold">
                            <CheckCircle2 className="w-5 h-5" />
                            Pedido verificado y pasado
                          </div>
                          {explosion.fecha_inicio && (
                            <div className="flex items-center gap-6 text-xs text-white/50 flex-wrap">
                              <span>Inicio: <span className="text-white/70">{fechaLegible(explosion.fecha_inicio)}</span></span>
                              {explosion.fecha_termino && (
                                <span>Término: <span className="text-white/70">{fechaLegible(explosion.fecha_termino)}</span></span>
                              )}
                              <span>Duración: <span className="font-mono text-violet-300">{formatTiempo(explosion.duracion_seg)}</span></span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Botón expandir: las partidas se pueden ver en cualquier estado */}
                    <button
                      type="button"
                      onClick={() => toggleExpandir(explosion)}
                      aria-expanded={isExpandido}
                      aria-label={isExpandido ? 'Ocultar partidas' : 'Ver partidas y checklist'}
                      className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all"
                    >
                      {isExpandido ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* ═══ PANEL EXPANDIBLE: partidas + checklist ═══ */}
                {isExpandido && (
                  <div className="border-t border-white/10 px-5 py-4 sm:px-6 sm:py-5 space-y-4">
                    <h4 className="text-sm font-bold text-white/80 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Partidas del Pedido
                    </h4>

                    {cargandoPartidas === explosion.proyecto_id ? (
                      <div className="flex items-center gap-2 py-4 text-white/40 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cargando partidas...
                      </div>
                    ) : pts.length === 0 ? (
                      <p className="text-sm text-white/40 py-4">
                        Este pedido no tiene partidas registradas.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {pts.map(partida => {
                            const isChecked = checklist[partida.id]?.checked ?? false;
                            return (
                              <div
                                key={partida.id}
                                className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                                  isChecked
                                    ? 'bg-emerald-500/[0.05] border-emerald-400/20'
                                    : 'bg-white/[0.02] border-white/10'
                                }`}
                              >
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={isChecked}
                                  aria-label={`Verificar ${partida.clave}`}
                                  onClick={() => toggleCheck(explosion, partida.id)}
                                  disabled={explosion.estado === 'verificado' || ocupado}
                                  className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all mt-0.5 ${
                                    isChecked
                                      ? 'bg-emerald-500 border-emerald-400 text-white'
                                      : 'border-white/20 hover:border-white/40 text-transparent'
                                  } disabled:opacity-50`}
                                >
                                  <Check className="w-4 h-4" />
                                </button>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-white/60">{partida.clave}</span>
                                    <span className="text-sm text-white/80">{partida.descripcion}</span>
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-white/40">
                                    <span>Cantidad: <span className="text-white/70">{partida.cantidad}</span></span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                          <span className="text-xs text-white/50">
                            Verificadas: <span className="text-white/80 font-bold">{totalChecked} de {pts.length}</span>
                          </span>

                          {explosion.estado === 'completado' && (
                            <button
                              type="button"
                              onClick={() => verificarPedido(explosion)}
                              disabled={!todasVerificadas || ocupado}
                              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                todasVerificadas
                                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                                  : 'bg-white/[0.05] text-white/30 cursor-not-allowed border border-white/10'
                              }`}
                            >
                              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              {todasVerificadas ? 'Verificar y Pasar Pedido' : `Faltan ${pts.length - totalChecked} partidas`}
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    <div className="pt-2 border-t border-white/10">
                      <label className="text-xs text-white/50 font-semibold mb-1 block">
                        Observaciones generales:
                      </label>
                      <NotasExplosion explosion={explosion} onGuardar={guardarNotas} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Notas con auto-guardado (1.5 s después de dejar de escribir) ── */
function NotasExplosion({ explosion, onGuardar }: { explosion: Explosion; onGuardar: (e: Explosion, n: string) => Promise<void> }) {
  const [texto, setTexto] = useState(explosion.notas || '');
  const [guardando, setGuardando] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);


  const handleChange = (valor: string) => {
    setTexto(valor);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setGuardando(true);
      try {
        await onGuardar(explosion, valor);
      } finally {
        setGuardando(false);
      }
    }, 1500);
  };

  return (
    <div className="relative">
      <textarea
        value={texto}
        onChange={e => handleChange(e.target.value)}
        placeholder="Escribe observaciones sobre esta explosión..."
        rows={3}
        disabled={explosion.estado === 'verificado'}
        className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 resize-none disabled:opacity-50"
      />
      {guardando && (
        <span className="absolute bottom-2 right-2 text-[10px] text-blue-400 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Guardando...
        </span>
      )}
    </div>
  );
}
