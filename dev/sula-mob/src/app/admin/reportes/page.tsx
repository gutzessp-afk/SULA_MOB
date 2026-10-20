'use client';

import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAvisos } from '@/components/dashboard/NotificationBellAdmin';
import { FileSpreadsheet, Download, AlertCircle, BarChart3, Loader2, Camera, Clock, User } from 'lucide-react';

interface Retraso {
  id: string;
  motivo: string | null;
  descripcion: string | null;
  tiempo_estimado_retraso: number | null;
  comentario: string | null;
  evidencia_url: string | null;
  operador_id: string | null;
  created_at: string;
  proyectos: { nombre: string } | null;
  areas: { nombre: string } | null;
}

type TipoReporte = 'produccion' | 'incidencias';

/** Solo las fotos del almacenamiento de Supabase pasan por el optimizador de imágenes (next.config) */
const esFotoSupabase = (url: string) => url.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`);

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

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('retrasos')
      .select('*, proyectos (nombre), areas (nombre)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al traer retrasos:', error);
      return;
    }

    const filas = (data ?? []) as unknown as Retraso[];
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

  const nombreOperador = (r: Retraso) =>
    (r.operador_id && operadores[r.operador_id]) || 'Operador';

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
              <span className="text-white/40">{retrasos.length}</span>
            </h2>

            {loading ? (
              <div className="flex justify-center items-center py-10 text-white/50 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                <span className="text-sm">Cargando incidencias...</span>
              </div>
            ) : retrasos.length === 0 ? (
              <p className="text-xs text-white/50 py-6 text-center">
                Todavía no hay retrasos reportados.
              </p>
            ) : (
              <div className="space-y-4">
                {retrasos.map((r) => (
                  <div
                    key={r.id}
                    ref={r.id === resaltado ? elegido : undefined}
                    className={`bg-white/[0.07] border p-4 rounded-2xl space-y-2 transition-shadow ${
                      r.id === resaltado ? 'border-amber-400/70 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]' : 'border-red-500/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {r.id === resaltado && (
                        <span className="text-[10px] font-bold uppercase bg-amber-400/15 text-amber-300 px-2 py-0.5 rounded-full">Nuevo</span>
                      )}
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-white/50" />
                        {nombreOperador(r)}
                      </span>
                      {r.proyectos && (
                        <span className="text-[10px] bg-red-950/60 text-red-300 px-2.5 py-0.5 rounded-full font-semibold border border-red-500/30">
                          {r.proyectos.nombre}
                        </span>
                      )}
                      {r.areas && (
                        <span className="text-[10px] bg-white/10 text-white/80 px-2.5 py-0.5 rounded-full font-semibold border border-white/10">
                          Área: {r.areas.nombre}
                        </span>
                      )}
                      {Number(r.tiempo_estimado_retraso) > 0 && (
                        <span className="text-[10px] text-amber-300 font-semibold">
                          {r.tiempo_estimado_retraso} h de retraso
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-red-400">{r.motivo}</p>
                    {r.descripcion && <p className="text-sm text-white/80 leading-relaxed">{r.descripcion}</p>}
                    {r.comentario && <p className="text-xs text-white/50">{r.comentario}</p>}

                    {r.evidencia_url && (
                      <a href={r.evidencia_url} target="_blank" rel="noreferrer" className="block pt-1 w-fit">
                        {/* Miniatura optimizada y diferida (fotos de Supabase); el enlace abre la foto completa */}
                        {esFotoSupabase(r.evidencia_url) ? (
                          <Image
                            src={r.evidencia_url}
                            alt="Evidencia del retraso"
                            width={192}
                            height={144}
                            sizes="192px"
                            className="h-36 w-48 rounded-xl border border-white/15 object-cover"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.evidencia_url} alt="Evidencia del retraso" loading="lazy" decoding="async" className="h-36 w-48 rounded-xl border border-white/15 object-cover" />
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-blue-400 mt-1">
                          <Camera className="w-3 h-3" />
                          Ver evidencia completa
                        </span>
                      </a>
                    )}

                    <div className="flex items-center gap-1 text-[11px] text-white/50">
                      <Clock className="w-3 h-3" />
                      {new Date(r.created_at).toLocaleString('es-MX')}
                    </div>
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