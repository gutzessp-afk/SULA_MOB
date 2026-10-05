'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
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

export default function ReportesPage() {
  const [retrasos, setRetrasos] = useState<Retraso[]>([]);
  const [operadores, setOperadores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

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

  const nombreOperador = (r: Retraso) =>
    (r.operador_id && operadores[r.operador_id]) || 'Operador';

  const exportarCSV = () => {
    const celda = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const encabezado = ['Fecha', 'Operador', 'Proyecto', 'Área', 'Motivo', 'Descripción', 'Horas de retraso', 'Comentario', 'Evidencia'];
    const filas = retrasos.map((r) => [
      new Date(r.created_at).toLocaleString('es-MX'),
      nombreOperador(r),
      r.proyectos?.nombre ?? '',
      r.areas?.nombre ?? '',
      r.motivo,
      r.descripcion,
      r.tiempo_estimado_retraso,
      r.comentario,
      r.evidencia_url,
    ]);
    const csv = [encabezado, ...filas].map((f) => f.map(celda).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incidencias-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      <div
        className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 sm:p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.95), rgba(18,24,36,0.8)), url('/images/nuevap.png')` }}
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
                <p className="text-xs text-white/60">Exporta el acumulado de proyectos finalizados por estación.</p>
                <button className="bg-white text-neutral-900 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-white/90 shadow-md">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              </div>

              <div className="bg-white/[0.07] border border-white/10 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-3 text-white font-bold text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-400" /> Historial de Incidencias
                </div>
                <p className="text-xs text-white/60">Consolidado de avisos y detenciones enviadas por operadores.</p>
                <button
                  onClick={exportarCSV}
                  disabled={retrasos.length === 0}
                  className="bg-white text-neutral-900 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-white/90 shadow-md disabled:opacity-40"
                >
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              </div>
            </div>
          </div>

          {/* INCIDENCIAS REPORTADAS POR OPERADORES */}
          <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4">
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
                  <div key={r.id} className="bg-white/[0.07] border border-red-500/30 p-4 rounded-2xl space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
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
                      {r.tiempo_estimado_retraso !== null && (
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.evidencia_url}
                          alt="Evidencia del retraso"
                          className="w-48 rounded-xl border border-white/15 object-cover"
                        />
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
          <Image src="/images/instalaciones.png" alt="Infraestructura" fill className="object-cover rounded-2xl opacity-75" />
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