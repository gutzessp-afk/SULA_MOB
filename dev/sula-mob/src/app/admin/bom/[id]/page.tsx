'use client';

/**
 * BOM — Espacio de Trabajo — /admin/bom/[id]
 * ────────────────────────────────────────────
 * 1. Encabezado del pedido con el cronómetro y sus controles (Iniciar, Pausar/Reanudar, Editar tiempo,
 *    Reset, Deshacer inicio, Terminar, Editar).
 * 2. Estatus del pedido (EstatusPedido.tsx): por qué no se puede explosionar todavía. Mientras haya
 *    motivos sin resolver no se puede iniciar ni capturar.
 * 3. Indicador grande: BLOQUEADO / LISTO PARA EXPLOSIONAR / EN PROCESO / EN PAUSA / COMPLETADO.
 * 4. Hoja de explosión (HojaExplosion.tsx): el formato Excel de SULA con revisiones REV-00, REV-01…
 *    Se arrastra el Excel, se edita aquí y el sistema abre la siguiente revisión solo.
 *
 * El cronómetro arranca al importar o capturar el primer cambio (o con "Iniciar Explosión").
 * "Terminar Explosión" cierra la revisión actual y guarda tiempos, días y pausas.
 *
 * Supabase Realtime sincroniza entre admins.
 *
 * RUTA: src/app/admin/bom/[id]/page.tsx
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Zap, Play, Square, Pencil, Clock, Calendar, Loader2, AlertCircle, CheckCircle2, ArrowLeft, Download, X,
  MapPin, Pause, RotateCcw, Timer, ShieldAlert, ShieldCheck, Undo2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import { motivosDe, motivosSinResolver } from '@/lib/bom-motivos';
import { ESTATUS_BOM, duracionLegible, estatusBom, formatTiempo, pausasDe, textoDias } from '@/lib/bom-tiempo';
import { etiquetaRev } from '@/lib/explosion-revisiones';
import { EstatusPedido } from './EstatusPedido';
import { HojaExplosion, type ResumenHoja } from './HojaExplosion';

/* ═══ Tipos ═══ */

interface Proyecto {
  id: string; codigo: string; nombre: string; cliente: string | null;
  referencia_sucursal: string | null; prioridad: string;
}

interface Partida {
  id: string; clave: string; descripcion: string;
  cantidad: number; orden: number;
}

interface Explosion {
  id: string; proyecto_id: string;
  estado: 'pendiente' | 'en_proceso' | 'completado';
  fecha_inicio: string | null; fecha_termino: string | null;
  duracion_seg: number;
  /** Segundos trabajados antes del tramo actual; tramo_inicio null = en pausa */
  acumulado_seg: number | null; tramo_inicio: string | null;
  usuario_id: string | null; usuario_nombre: string | null;
  /** { motivos, pausas } del estatus del pedido (src/lib/bom-motivos.ts) */
  checklist: unknown;
  notas: string | null;
  proyecto: Proyecto | null;
  partidas: Partida[];
}

type AccionExplosion = 'iniciar' | 'pausar' | 'reanudar' | 'reiniciar' | 'finalizar' | 'reabrir' | 'cancelar';

/* ═══ Constantes y helpers ═══ */

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

/** Segundos → { h, m, s } para el editor de tiempo */
const partesDe = (seg: number) => ({ h: Math.floor(seg / 3600), m: Math.floor((seg % 3600) / 60), s: seg % 60 });

function fechaLegible(iso: string): string {
  const d = new Date(iso);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function diaSemana(iso: string): string {
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(iso).getDay()];
}

function nombreMes(iso: string): string {
  return ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][new Date(iso).getMonth()];
}

/* ═══ Cronómetro: acumulado + tramo actual; en pausa se queda quieto ═══ */
function Cronometro({ acumulado, tramoInicio }: { acumulado: number; tramoInicio: string | null }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!tramoInicio) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tramoInicio]);
  const seg = acumulado + (tramoInicio ? Math.max(0, Math.floor((ahora - new Date(tramoInicio).getTime()) / 1000)) : 0);
  const color = tramoInicio ? 'text-blue-400' : 'text-amber-300';
  return (
    <div className="flex items-center gap-3">
      {tramoInicio ? <Clock className="w-5 h-5 text-blue-400 animate-pulse" /> : <Pause className="w-5 h-5 text-amber-300" />}
      <div className="text-right">
        <span className={`font-mono text-3xl sm:text-4xl font-bold tabular-nums ${color}`}>{formatTiempo(seg)}</span>
        {!tramoInicio && <p className="text-[11px] font-bold text-amber-300 tracking-wide">EN PAUSA</p>}
      </div>
    </div>
  );
}

/* ═══ Página ═══ */

export default function BomTrabajoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const explosionId = params.id;

  const [data, setData] = useState<Explosion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [accionando, setAccionando] = useState(false);
  const [editandoTiempo, setEditandoTiempo] = useState<{ h: string; m: string; s: string } | null>(null);
  const [showCompletado, setShowCompletado] = useState(false);
  const [hoja, setHoja] = useState<ResumenHoja | null>(null);

  const estadoRef = useRef<Explosion['estado'] | null>(null);
  const iniciando = useRef<Promise<boolean> | null>(null);
  // La hoja registra aquí su "guardar todo" para llamarlo antes de terminar
  const guardarHoja = useRef<(() => Promise<void>) | null>(null);

  /* ── Cargar datos ── */
  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/bom?id=${encodeURIComponent(explosionId)}`, { cache: 'no-store' });
      if (res.status === 404) { setData(null); setError('Explosión no encontrada.'); return; }
      if (!res.ok) throw new Error('Error al cargar');
      const d = await res.json();
      const exp = d.explosion as Explosion;
      estadoRef.current = exp.estado;
      setData(exp);
      setError('');
    } catch {
      setError('No se pudo cargar la explosión.');
    } finally {
      setCargando(false);
    }
  }, [explosionId]);

  /* ── Real-time: carga al abrir y recarga con cada cambio de la explosión ── */
  const recargar = useRecargaAgrupada(cargar, 300);
  useEffect(() => {
    const ch = supabase
      .channel(`bom-trabajo-${explosionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_explosiones', filter: `id=eq.${explosionId}` }, recargar)
      .subscribe(status => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') recargar(); });
    const primera = setTimeout(() => void cargar(), 0);
    return () => { clearTimeout(primera); void supabase.removeChannel(ch); };
  }, [explosionId, cargar, recargar]);

  /* ── PATCH de estado (iniciar, pausar, reanudar, reiniciar, finalizar, reabrir, cancelar, editar_tiempo) ── */
  const patchExplosion = useCallback(async (accion: AccionExplosion | 'editar_tiempo', extra?: Record<string, unknown>): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch('/api/bom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: explosionId, accion, ...extra }),
      });
    } catch {
      setAviso('No hay conexión con el servidor. Intenta de nuevo en unos segundos.');
      return false;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAviso(d.error || 'No se pudo completar la acción.');
      return false;
    }
    const d = await res.json().catch(() => ({}));
    if (d.explosion?.estado) estadoRef.current = d.explosion.estado;
    return true;
  }, [explosionId]);

  /* ── Si está pendiente, arrancar la explosión (una sola vez aunque se llame varias) ── */
  const asegurarIniciada = useCallback(async (): Promise<boolean> => {
    if (estadoRef.current === 'en_proceso') return true;
    if (estadoRef.current !== 'pendiente') return false;
    iniciando.current ??= patchExplosion('iniciar').then(async ok => { await cargar(); return ok; }).finally(() => { iniciando.current = null; });
    return iniciando.current;
  }, [patchExplosion, cargar]);

  /* ── Botones de estado ── */
  const accionExplosion = async (tipo: AccionExplosion) => {
    if (tipo === 'cancelar' && !confirm('¿Deshacer el inicio? La explosión regresa a PENDIENTE como si nunca se hubiera iniciado: se borran la fecha de inicio, el término, el tiempo y las pausas. La hoja de explosión y el estatus del pedido se quedan.')) return;
    if (tipo === 'reiniciar' && !confirm('¿Reset del cronómetro? Queda en 00:00:00 detenido, como si no hubiera empezado (da "Reanudar" para que corra). La fecha de inicio y la hoja se quedan.')) return;
    if (tipo === 'finalizar' && hoja && !confirm(`¿Terminar la explosión? ${hoja.estado === 'borrador' ? `Se cierra ${etiquetaRev(hoja.numero)} y queda` : `Queda ${etiquetaRev(hoja.numero)}`} como la explosión final, con ${hoja.materiales} materiales.`)) return;
    setAccionando(true);
    try {
      // Antes de terminar, guardar lo que se esté escribiendo en la hoja
      if (tipo === 'finalizar') await guardarHoja.current?.();
      const ok = tipo === 'iniciar' ? await asegurarIniciada() : await patchExplosion(tipo);
      if (ok && tipo === 'finalizar') setShowCompletado(true);
      if (ok && tipo === 'cancelar') setEditandoTiempo(null);
      await cargar();
    } finally {
      setAccionando(false);
    }
  };

  /* ── Editar el tiempo a mano ── */
  const guardarTiempo = async () => {
    if (!editandoTiempo) return;
    const segundos = (Number(editandoTiempo.h) || 0) * 3600 + (Number(editandoTiempo.m) || 0) * 60 + (Number(editandoTiempo.s) || 0);
    setAccionando(true);
    try {
      if (await patchExplosion('editar_tiempo', { segundos })) setEditandoTiempo(null);
      await cargar();
    } finally {
      setAccionando(false);
    }
  };

  /* ── Guardar el estatus del pedido (motivos por los que no se puede explosionar) ── */
  const guardarEstatus = useCallback(async (motivos: unknown[], notas: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/bom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: explosionId, accion: 'guardar_estatus', motivos, notas }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAviso(d.error || 'No se pudo guardar el estatus.');
      }
      await cargar();
      return res.ok;
    } catch {
      setAviso('No se pudo guardar el estatus: no hay conexión con el servidor. Vuelve a intentarlo en unos segundos.');
      return false;
    }
  }, [explosionId, cargar]);

  const urlExcel = `/api/bom/revisiones/excel?explosion_id=${encodeURIComponent(explosionId)}`;

  /* ═══ RENDER ═══ */

  if (cargando) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;

  if (!data) return (
    <div className="space-y-4 max-w-6xl mx-auto px-2 sm:px-0">
      <button type="button" onClick={() => router.push('/admin/bom')} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Volver a BOM
      </button>
      <div className={`${TARJETA} p-6 flex items-center gap-3 text-red-400`}>
        <AlertCircle className="w-5 h-5" /><span className="text-sm">{error || 'Explosión no encontrada.'}</span>
      </div>
    </div>
  );

  const pendientesEstatus = motivosSinResolver(data.checklist).length;
  const bloqueado = data.estado === 'pendiente' && pendientesEstatus > 0;
  const motivosGuardados = motivosDe(data.checklist);
  const puedeTerminar = !!hoja && hoja.materiales > 0;

  return (
    <div className="space-y-5 max-w-6xl mx-auto px-2 sm:px-0 pb-8">

      {/* ═══ Modal "¡Explosión Terminada!" ═══ */}
      {showCompletado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" role="dialog" aria-modal="true" aria-labelledby="bom-terminada">
          <div className={`${TARJETA} p-8 sm:p-10 text-center max-w-md w-full`}>
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h2 id="bom-terminada" className="text-2xl font-bold text-white mb-2">¡Explosión Terminada!</h2>
            <p className="text-sm text-white/60 mb-1">{data.proyecto?.codigo} — {data.proyecto?.referencia_sucursal || data.proyecto?.nombre}</p>
            <dl className="text-left text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 my-5 px-1">
              <dt className="text-white/45">Revisión</dt>
              <dd className="text-white/85 font-mono font-bold">{hoja ? `${etiquetaRev(hoja.numero)} · ${hoja.materiales} materiales` : '—'}</dd>
              <dt className="text-white/45">Inicio</dt>
              <dd className="text-white/85">{data.fecha_inicio ? fechaLegible(data.fecha_inicio) : '—'}</dd>
              <dt className="text-white/45">Término</dt>
              <dd className="text-white/85">{data.fecha_termino ? fechaLegible(data.fecha_termino) : '—'}</dd>
              <dt className="text-white/45">Tiempo trabajado</dt>
              <dd><span className="text-emerald-400 font-mono font-bold">{formatTiempo(data.duracion_seg)}</span> <span className="text-white/45">({duracionLegible(data.duracion_seg)})</span></dd>
              <dt className="text-white/45">Días</dt>
              <dd className="text-white/85">{textoDias(data.fecha_inicio, data.fecha_termino)}</dd>
              <dt className="text-white/45">Pausas</dt>
              <dd className="text-white/85">{pausasDe(data.checklist)}</dd>
            </dl>
            <div className="flex gap-3 justify-center flex-wrap">
              <a href={urlExcel} onClick={() => setShowCompletado(false)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
                <Download className="w-4 h-4" /> Descargar Excel
              </a>
              <button type="button" onClick={() => setShowCompletado(false)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.1] hover:bg-white/[0.15] text-white/80 text-sm border border-white/10">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Volver ═══ */}
      <button type="button" onClick={() => router.push('/admin/bom')} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Volver a BOM
      </button>

      {/* ═══ Aviso de error ═══ */}
      {aviso && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso('')} aria-label="Cerrar aviso" className="text-red-300/60 hover:text-red-200"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══ Header del pedido ═══ */}
      <div className={`${TARJETA} px-5 py-5 sm:px-8 sm:py-6`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Zap className="w-5 h-5 text-amber-400" />
              <h1 className="text-lg sm:text-xl font-bold text-white">{data.proyecto?.codigo || '—'}</h1>
              <span className="text-white/40">·</span>
              <span className="text-sm text-white/70">{data.proyecto?.nombre || 'Sin nombre'}</span>
              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${ESTATUS_BOM[estatusBom(data)].css}`}>{ESTATUS_BOM[estatusBom(data)].txt}</span>
              {hoja && (
                <span className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold border ${hoja.estado === 'borrador' ? 'bg-sky-500/15 text-sky-300 border-sky-400/30' : 'bg-white/[0.06] text-white/75 border-white/15'}`}>
                  {etiquetaRev(hoja.numero)}{hoja.estado === 'borrador' ? ' · borrador' : ''}
                </span>
              )}
            </div>
            {data.proyecto?.referencia_sucursal && (
              <p className="text-xs text-white/45 mt-1.5 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Sucursal: <span className="text-white/70">{data.proyecto.referencia_sucursal}</span>
              </p>
            )}
          </div>

          {data.estado === 'en_proceso' && <Cronometro acumulado={data.acumulado_seg || 0} tramoInicio={data.tramo_inicio} />}
          {data.estado === 'completado' && (
            <div className="text-right space-y-1">
              <span className="text-emerald-400 font-mono text-2xl font-bold">{formatTiempo(data.duracion_seg)}</span>
              <p className="text-[11px] text-white/45">Tiempo trabajado</p>
              {data.fecha_inicio && <p className="text-[11px] text-white/45">{diaSemana(data.fecha_inicio)} · {nombreMes(data.fecha_inicio)}</p>}
            </div>
          )}
        </div>

        {(data.fecha_inicio || data.fecha_termino) && (
          <div className="flex items-center gap-x-6 gap-y-1 mt-3 text-xs text-white/45 flex-wrap">
            {data.fecha_inicio && <span><Calendar className="w-3 h-3 inline mr-1" />Inicio: <span className="text-white/70">{fechaLegible(data.fecha_inicio)}</span></span>}
            {data.fecha_termino && <span><Calendar className="w-3 h-3 inline mr-1" />Término: <span className="text-white/70">{fechaLegible(data.fecha_termino)}</span></span>}
            {data.fecha_inicio && <span>Día: <span className="text-white/70">{diaSemana(data.fecha_inicio)}</span></span>}
            {data.fecha_inicio && <span>Mes: <span className="text-white/70">{nombreMes(data.fecha_inicio)}</span></span>}
            {data.estado === 'completado' && data.fecha_inicio && data.fecha_termino && (() => {
              const total = Math.max(0, Math.round((new Date(data.fecha_termino).getTime() - new Date(data.fecha_inicio).getTime()) / 1000));
              return (
                <>
                  <span>Tiempo total: <span className="text-white/70 font-mono">{formatTiempo(total)}</span></span>
                  <span>En pausa: <span className="text-white/70 font-mono">{formatTiempo(Math.max(0, total - data.duracion_seg))}</span></span>
                  <span>{textoDias(data.fecha_inicio, data.fecha_termino)}</span>
                  <span>Pausas: <span className="text-white/70">{pausasDe(data.checklist)}</span></span>
                </>
              );
            })()}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {data.estado === 'pendiente' && (
            <>
              <button type="button" onClick={() => accionExplosion('iniciar')} disabled={accionando || bloqueado} className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold ${bloqueado ? 'bg-white/[0.05] text-white/35 border border-white/10 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'}`}>
                {accionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {bloqueado ? `Resuelve ${pendientesEstatus} motivo(s) para iniciar` : 'Iniciar Explosión'}
              </button>
              {!bloqueado && <span className="text-xs text-white/40">o arrastra el Excel a la hoja y el cronómetro arranca solo.</span>}
            </>
          )}
          {data.estado === 'en_proceso' && (
            <>
              {data.tramo_inicio ? (
                <button type="button" onClick={() => accionExplosion('pausar')} disabled={accionando} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-sm font-semibold border border-amber-400/30 disabled:opacity-50">
                  <Pause className="w-4 h-4" /> Pausar
                </button>
              ) : (
                <button type="button" onClick={() => accionExplosion('reanudar')} disabled={accionando} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">
                  <Play className="w-4 h-4" /> Reanudar
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const p = partesDe(Math.round((data.acumulado_seg || 0) + (data.tramo_inicio ? (Date.now() - new Date(data.tramo_inicio).getTime()) / 1000 : 0)));
                  setEditandoTiempo({ h: String(p.h), m: String(p.m), s: String(p.s) });
                }}
                disabled={accionando}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 text-sm font-semibold border border-white/10 disabled:opacity-50"
              >
                <Timer className="w-4 h-4" /> Editar tiempo
              </button>
              <button type="button" onClick={() => accionExplosion('reiniciar')} disabled={accionando} title="Pone el cronómetro en 00:00:00 detenido" className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 text-sm font-semibold border border-white/10 disabled:opacity-50">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
              <button type="button" onClick={() => accionExplosion('cancelar')} disabled={accionando} title="Regresa a pendiente, como si nunca se hubiera iniciado" className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-red-300/80 hover:text-red-200 hover:bg-red-500/10 text-sm font-semibold border border-red-400/20 disabled:opacity-50">
                <Undo2 className="w-4 h-4" /> Deshacer inicio
              </button>
              <button
                type="button"
                onClick={() => accionExplosion('finalizar')}
                disabled={accionando || !puedeTerminar}
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold ${puedeTerminar ? 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50' : 'bg-white/[0.05] text-white/30 border border-white/10 cursor-not-allowed'}`}
              >
                {accionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                {puedeTerminar ? `Terminar Explosión${hoja?.estado === 'borrador' ? ` (cierra ${etiquetaRev(hoja.numero)})` : ''}` : 'Importa o captura materiales para terminar'}
              </button>
            </>
          )}
          {data.estado === 'completado' && (
            <>
              <button type="button" onClick={() => accionExplosion('reabrir')} disabled={accionando} title="Vuelve a abrir la explosión: el siguiente cambio en la hoja crea una revisión nueva" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600/30 hover:bg-amber-500/40 text-amber-300 text-xs font-semibold border border-amber-400/30 disabled:opacity-50">
                <Pencil className="w-3.5 h-3.5" /> Editar (nueva revisión)
              </button>
              <button type="button" onClick={() => accionExplosion('cancelar')} disabled={accionando} title="Regresa a pendiente, como si nunca se hubiera iniciado" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-300/80 hover:text-red-200 hover:bg-red-500/10 text-xs font-semibold border border-red-400/20 disabled:opacity-50">
                <Undo2 className="w-3.5 h-3.5" /> Deshacer inicio
              </button>
            </>
          )}
        </div>

        {editandoTiempo && data.estado === 'en_proceso' && (
          <form
            onSubmit={e => { e.preventDefault(); void guardarTiempo(); }}
            className="mt-4 flex items-end gap-2 flex-wrap p-3 rounded-xl border border-white/10 bg-white/[0.03]"
          >
            {(['h', 'm', 's'] as const).map(campo => (
              <label key={campo} className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-white/40">
                {campo === 'h' ? 'Horas' : campo === 'm' ? 'Minutos' : 'Segundos'}
                <input
                  type="number"
                  min={0}
                  max={campo === 'h' ? 999 : 59}
                  value={editandoTiempo[campo]}
                  onChange={e => setEditandoTiempo(prev => prev && { ...prev, [campo]: e.target.value })}
                  className="w-20 px-2 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-white font-mono text-base text-center focus:outline-none focus:border-blue-500/50"
                />
              </label>
            ))}
            <button type="submit" disabled={accionando} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">Guardar tiempo</button>
            <button type="button" onClick={() => setEditandoTiempo(null)} className="px-3 py-2.5 rounded-xl text-white/55 hover:text-white text-sm">Cancelar</button>
          </form>
        )}
      </div>

      {/* ═══ ESTATUS DEL PEDIDO ═══ */}
      <EstatusPedido
        key={data.id}
        motivos={motivosGuardados}
        notas={data.notas ?? ''}
        editable={data.estado === 'pendiente'}
        explosionId={data.id}
        onGuardar={guardarEstatus}
      />

      {/* ═══ INDICADOR DE ESTADO ═══ */}
      {(() => {
        const est = estatusBom(data);
        const listo = est === 'pendiente';
        const titulo = est === 'bloqueado' ? 'BLOQUEADO' : listo ? 'LISTO PARA EXPLOSIONAR' : ESTATUS_BOM[est].txt;
        const sub = est === 'bloqueado'
          ? `Faltan ${pendientesEstatus} motivo(s) del estatus por resolver.`
          : listo ? 'Todos los motivos del estatus están resueltos. Ya puedes iniciar la explosión.'
            : est === 'completado' ? `Terminada · ${duracionLegible(data.duracion_seg)} trabajados · ${textoDias(data.fecha_inicio, data.fecha_termino)}${hoja ? ` · ${etiquetaRev(hoja.numero)}` : ''}`
              : est === 'pausado' ? 'El cronómetro está detenido. Da "Reanudar" para continuar.'
                : 'Explosión en curso.';
        const css = est === 'bloqueado' ? 'border-red-400/40 bg-red-500/10 text-red-200'
          : listo || est === 'completado' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
            : est === 'pausado' ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
              : 'border-blue-400/40 bg-blue-500/10 text-blue-200';
        return (
          <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl border-2 ${css}`} role="status">
            {est === 'bloqueado' ? <ShieldAlert className="w-8 h-8 shrink-0" /> : <ShieldCheck className="w-8 h-8 shrink-0" />}
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-extrabold tracking-wide">{titulo}</p>
              <p className="text-xs sm:text-sm opacity-80">{sub}</p>
            </div>
          </div>
        );
      })()}

      {/* ═══ HOJA DE EXPLOSIÓN (formato SULA con revisiones) ═══ */}
      <HojaExplosion
        explosionId={data.id}
        estado={data.estado}
        bloqueado={bloqueado}
        partidas={data.partidas}
        asegurarIniciada={asegurarIniciada}
        onAviso={setAviso}
        onResumen={setHoja}
        guardarRef={guardarHoja}
      />
    </div>
  );
}
