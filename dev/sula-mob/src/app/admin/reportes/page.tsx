'use client';

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAvisos } from '@/components/dashboard/NotificationBellAdmin';
import { TarjetaRetraso, piezaDelReporte, sucursalDelProyecto, type Retraso } from '@/components/TarjetaRetraso';
import { useDebounce } from '@/hooks/useDebounce';
import { ZONA_HORARIA, diasEntre, fechaHoy } from '@/lib/entregas';
import { FileSpreadsheet, Download, AlertCircle, BarChart3, Loader2, Search, X } from 'lucide-react';

type TipoReporte = 'produccion' | 'incidencias';
type Periodo = 'todos' | 'hoy' | '7' | '30';

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'todos', texto: 'Todas las fechas' },
  { valor: 'hoy', texto: 'Hoy' },
  { valor: '7', texto: 'Últimos 7 días' },
  { valor: '30', texto: 'Últimos 30 días' },
];

const CAMPO_FILTRO = 'h-[44px] w-full rounded-xl border border-white/20 bg-[#121824] px-3 text-sm text-white outline-none focus:border-white/50 max-sm:text-base';

/** Fecha "AAAA-MM-DD" en la hora de México, la misma regla del resto del sistema */
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });

type Uno<T> = T | T[] | null;
const uno = <T,>(x: Uno<T>): T | null => (Array.isArray(x) ? x[0] : x) ?? null;

// useSearchParams necesita un Suspense alrededor para que la página pueda prerenderizarse
export default function ReportesPage() {
  return (
    <Suspense fallback={null}>
      <Reportes />
    </Suspense>
  );
}

function Reportes() {
  // ?retraso=… viene de la campanita o del aviso de atraso: ese reporte se resalta y se trae a la vista
  const resaltado = useSearchParams().get('retraso');
  const elegido = useRef<HTMLDivElement | null>(null);
  const [retrasos, setRetrasos] = useState<Retraso[]>([]);
  const [operadores, setOperadores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [descargando, setDescargando] = useState<TipoReporte | null>(null);
  const [errorDescarga, setErrorDescarga] = useState('');

  // Filtros de la lista de retrasos
  const [busqueda, setBusqueda] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroMotivo, setFiltroMotivo] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('todos');

  const cargar = useCallback(async () => {
    // Con los datos del proyecto para la tarjeta; si algo falla se vuelve a la consulta de siempre
    let res = await supabase
      .from('retrasos')
      .select('*, proyectos (codigo, nombre, referencia_sucursal, prioridad, progreso, fecha_maxima, descripcion), areas (nombre)')
      .order('created_at', { ascending: false });

    if (res.error) {
      console.warn('No se pudieron traer los datos completos del proyecto, se usa la consulta básica:', res.error);
      res = await supabase.from('retrasos').select('*, proyectos (nombre), areas (nombre)').order('created_at', { ascending: false });
    }
    const { data, error } = res;

    if (error) {
      console.error('Error al traer retrasos:', error);
      return;
    }

    // Cada relación puede llegar como objeto o como lista de uno
    const filas = ((data ?? []) as unknown as (Omit<Retraso, 'proyectos' | 'areas'> & { proyectos: Uno<Retraso['proyectos']>; areas: Uno<Retraso['areas']> })[])
      .map((f) => ({ ...f, proyectos: uno(f.proyectos), areas: uno(f.areas) })) as Retraso[];
    setRetrasos(filas);

    // Nombres de operadores en una consulta aparte (no depende de relaciones)
    const ids = Array.from(new Set(filas.map((r) => r.operador_id).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: us } = await supabase
        .from('usuarios')
        .select('id, nombre, apellidos')
        .in('id', ids);
      const mapa: Record<string, string> = {};
      (us ?? []).forEach((u: { id: string; nombre: string; apellidos: string | null }) => {
        mapa[u.id] = `${u.nombre} ${u.apellidos ?? ''}`.trim();
      });
      setOperadores(mapa);
    }
  }, []);

  useEffect(() => {
    let montado = true;
    async function load() {
      setLoading(true);
      await cargar();
      if (montado) setLoading(false);
    }
    void load();
    return () => { montado = false; };
  }, [cargar]);

  // Cuando llega un atraso nuevo (la campanita lo detecta), la lista se actualiza sola
  const ultimoAtraso = useAvisos()?.lista.find((a) => a.tipo === 'retraso')?.id;
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    void cargar();
  }, [cargar, ultimoAtraso]);

  // Lleva hasta el atraso que se tocó en la campanita
  useEffect(() => {
    if (!resaltado || loading) return;
    const t = setTimeout(() => elegido.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [resaltado, loading, retrasos]);

  const nombreOperador = useCallback(
    (r: Retraso) => (r.operador_id && operadores[r.operador_id]) || 'Operador',
    [operadores],
  );

  /* ── Filtros ── */
  const busquedaDebounced = useDebounce(busqueda, 300);
  const areasDisponibles = useMemo(() => [...new Set(retrasos.map((r) => r.areas?.nombre).filter(Boolean) as string[])].sort(), [retrasos]);
  const motivosDisponibles = useMemo(() => [...new Set(retrasos.map((r) => r.motivo).filter(Boolean) as string[])].sort(), [retrasos]);

  const visibles = useMemo(() => {
    const term = busquedaDebounced.trim().toLowerCase();
    const hoy = fechaHoy();
    return retrasos.filter((r) => {
      if (filtroArea && r.areas?.nombre !== filtroArea) return false;
      if (filtroMotivo && r.motivo !== filtroMotivo) return false;
      if (periodo !== 'todos') {
        const dias = diasEntre(diaDe(r.created_at), hoy);
        if (periodo === 'hoy' ? dias !== 0 : dias >= Number(periodo)) return false;
      }
      if (!term) return true;
      const p = r.proyectos;
      const pieza = piezaDelReporte(r.descripcion);
      return [p?.codigo, p?.nombre, p && sucursalDelProyecto(p), r.motivo, r.descripcion, r.comentario, pieza?.clave, pieza?.nombre, nombreOperador(r)]
        .some((campo) => campo?.toLowerCase().includes(term));
    });
  }, [retrasos, busquedaDebounced, filtroArea, filtroMotivo, periodo, nombreOperador]);

  const hayFiltros = !!(busqueda || filtroArea || filtroMotivo || periodo !== 'todos');
  const limpiarFiltros = () => { setBusqueda(''); setFiltroArea(''); setFiltroMotivo(''); setPeriodo('todos'); };

  // Los Excel se arman en el servidor (/api/reportes/...) con los datos actuales
  const descargarReporte = async (tipo: TipoReporte) => {
    setDescargando(tipo);
    setErrorDescarga('');
    try {
      const res = await fetch(`/api/reportes/${tipo}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Error ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `reporte-${tipo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorDescarga('No se pudo descargar el reporte: ' + (err instanceof Error ? err.message : 'error desconocido'));
    } finally {
      setDescargando(null);
    }
  };

  const botonExportar = (tipo: TipoReporte) => (
    <button
      onClick={() => descargarReporte(tipo)}
      disabled={descargando !== null}
      className="bg-white text-neutral-900 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-white/90 shadow-md disabled:opacity-40"
    >
      {descargando === tipo ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
      ) : (
        <><Download className="w-4 h-4" /> Exportar Excel</>
      )}
    </button>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      <div
        className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 sm:p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.95), rgba(18,24,36,0.8)), url('/images/nuevap.webp')` }}
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-red-500" />
            Reportes e Indicadores
          </h1>
          <p className="text-xs text-white/65 mt-1">
            Generación de métricas de desempeño, eficiencia por estación y descargas de datos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 space-y-6">
          <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/60 border-b border-white/10 pb-3">
              Descarga de Reportes
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/[0.07] border border-white/10 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-3 text-white font-bold text-sm">
                  <BarChart3 className="w-5 h-5 text-red-400" /> Reporte de Producción
                </div>
                <p className="text-xs text-white/60">Estado y avance de cada proyecto, y progreso por área de producción.</p>
                {botonExportar('produccion')}
              </div>

              <div className="bg-white/[0.07] border border-white/10 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-3 text-white font-bold text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-400" /> Historial de Incidencias
                </div>
                <p className="text-xs text-white/60">Consolidado de avisos y detenciones enviadas por operadores.</p>
                {botonExportar('incidencias')}
              </div>
            </div>

            {errorDescarga && (
              <p className="text-xs text-red-400 flex items-center gap-2" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" /> {errorDescarga}
              </p>
            )}
          </div>

          {/* INCIDENCIAS REPORTADAS POR OPERADORES */}
          <div id="incidencias" className="scroll-mt-4 relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/60 border-b border-white/10 pb-3 flex items-center justify-between">
              <span>Retrasos reportados por operadores</span>
              <span className="text-white/40">{hayFiltros ? `${visibles.length} de ${retrasos.length}` : retrasos.length}</span>
            </h2>

            {/* Filtros */}
            {retrasos.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/[0.07] px-3">
                  <Search className="h-4 w-4 flex-shrink-0 text-white/50" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por proyecto, código, sucursal, pieza u operador..."
                    className="h-[44px] w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40 max-sm:text-base"
                  />
                  {busqueda && (
                    <button type="button" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} aria-label="Filtrar por área" className={CAMPO_FILTRO}>
                    <option value="">Todas las áreas</option>
                    {areasDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select value={filtroMotivo} onChange={(e) => setFiltroMotivo(e.target.value)} aria-label="Filtrar por motivo" className={CAMPO_FILTRO}>
                    <option value="">Todos los motivos</option>
                    {motivosDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Filtrar por fecha" className={CAMPO_FILTRO}>
                    {PERIODOS.map((p) => <option key={p.valor} value={p.valor}>{p.texto}</option>)}
                  </select>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center items-center py-10 text-white/50 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                <span className="text-sm">Cargando incidencias...</span>
              </div>
            ) : retrasos.length === 0 ? (
              <p className="text-xs text-white/50 py-6 text-center">
                Todavía no hay retrasos reportados.
              </p>
            ) : visibles.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-white/50">Ningún reporte coincide con los filtros.</p>
                <button type="button" onClick={limpiarFiltros} className="min-h-[40px] rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">
                  Quitar filtros
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {visibles.map((r) => (
                  <div key={r.id} ref={r.id === resaltado ? elegido : undefined}>
                    <TarjetaRetraso retraso={r} operador={nombreOperador(r)} resaltado={r.id === resaltado} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-4 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] h-64 flex flex-col justify-end">
          <Image src="/images/instalaciones.webp" alt="Infraestructura" fill className="object-cover rounded-2xl opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-transparent to-transparent rounded-2xl" />
          <div className="relative z-10 p-2 space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-red-400 bg-black/60 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md inline-block">
              Trazabilidad Total
            </span>
            <p className="text-xs text-white/80">Informes optimizados para análisis técnico y auditorías.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
