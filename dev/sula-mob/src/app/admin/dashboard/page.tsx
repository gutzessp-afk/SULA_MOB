'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Clock,
  RefreshCw,
  Search,
  Download,
  ShieldAlert,
  Layers,
  BarChart3,
  TrendingUp,
  Cpu
} from 'lucide-react';

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  progreso: number;
  cliente?: string;
  prioridad?: string;
  created_at?: string;
  descripcion?: string;
}

interface Area {
  id: string;
  nombre: string;
  activo: boolean;
  peso?: number;
}

interface AvanceEstacion {
  id?: string;
  producto_id?: string;
  proyecto_id?: string;
  area_id: string;
  porcentaje: number;
  completado: boolean;
  piezas_totales?: number;
  piezas_completadas?: number;
  updated_at?: string;
}

export default function DashboardPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [avances, setAvances] = useState<AvanceEstacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    const [
      { data: pData },
      { data: aData },
      { data: avData }
    ] = await Promise.all([
      supabase.from('proyectos').select('*').order('created_at', { ascending: false }),
      supabase.from('areas').select('*').order('created_at', { ascending: true }),
      supabase.from('producto_area_avance').select('*')
    ]);

    if (pData) setProyectos(pData as Proyecto[]);
    if (aData) setAreas(aData as Area[]);
    if (avData) setAvances(avData as AvanceEstacion[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      await fetchMetrics();
      if (!isMounted) return;
    }
    void init();
    return () => { isMounted = false; };
  }, [fetchMetrics]);

  // Proyectos Filtrados
  const proyectosFiltrados = useMemo(() => {
    return proyectos.filter(p =>
      p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.cliente && p.cliente.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [proyectos, searchTerm]);

  // Cálculo de Rendimiento Comparativo por Área
  const rendimientoAreas = useMemo(() => {
    if (!areas.length || !avances.length) return [];

    return areas.map(area => {
      const avancesArea = avances.filter(a => a.area_id === area.id);
      if (!avancesArea.length) return { ...area, rendimiento: 0, piezasCompletadas: 0, piezasTotales: 0 };

      let totalPiezas = 0;
      let piezasHechas = 0;
      let sumaPcts = 0;

      avancesArea.forEach(item => {
        if (item.piezas_totales && item.piezas_totales > 0) {
          totalPiezas += item.piezas_totales;
          piezasHechas += item.piezas_completadas || 0;
          sumaPcts += Math.min(100, Math.round(((item.piezas_completadas || 0) / item.piezas_totales) * 100));
        } else {
          sumaPcts += item.porcentaje || (item.completado ? 100 : 0);
        }
      });

      const promedio = Math.round(sumaPcts / avancesArea.length);

      return {
        ...area,
        rendimiento: promedio,
        piezasCompletadas: piezasHechas,
        piezasTotales: totalPiezas
      };
    });
  }, [areas, avances]);

  // Detección de Atrasos
  const metricasAtrasos = useMemo(() => {
    let proyectosAtrasados = 0;
    let proyectosRiesgo = 0;
    let dentroDeTiempo = 0;

    proyectos.forEach(p => {
      if (p.progreso === 100) {
        dentroDeTiempo++;
        return;
      }

      let fechaEntrega: Date | null = null;
      if (p.descripcion && p.descripcion.includes('Entrega:')) {
        const match = p.descripcion.match(/Entrega:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
        if (match && match[1]) {
          fechaEntrega = new Date(match[1]);
        }
      }

      const hoy = new Date();
      if (fechaEntrega && fechaEntrega < hoy && p.progreso < 100) {
        proyectosAtrasados++;
      } else if (p.progreso < 30 && p.prioridad === 'urgente') {
        proyectosRiesgo++;
      } else {
        dentroDeTiempo++;
      }
    });

    const total = proyectos.length || 1;
    return {
      atrasados: proyectosAtrasados,
      riesgo: proyectosRiesgo,
      aTiempo: dentroDeTiempo,
      pctAtraso: Math.round((proyectosAtrasados / total) * 100)
    };
  }, [proyectos]);

  // Cronología por Fechas
  const avancesPorFechas = useMemo(() => {
    const ordenados = [...proyectos].sort((a, b) => {
      const fechaA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const fechaB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return fechaB - fechaA;
    });

    return ordenados.slice(0, 6).map(p => {
      let fechaTexto = 'Sin fecha';
      if (p.descripcion && p.descripcion.includes('Entrega:')) {
        const match = p.descripcion.match(/Entrega:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
        if (match && match[1]) fechaTexto = match[1];
      } else if (p.created_at) {
        fechaTexto = new Date(p.created_at).toISOString().split('T')[0];
      }

      return { ...p, fechaTarget: fechaTexto };
    });
  }, [proyectos]);

  const exportarReporte = () => {
    const headers = ['Codigo', 'Proyecto', 'Cliente', 'Progreso %'];
    const rows = proyectos.map(p => [p.codigo, `"${p.nombre}"`, `"${p.cliente || 'General'}"`, `${p.progreso}%`]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Reporte_Produccion_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 px-2 sm:px-4 text-white">
      
      {/* HEADER PRINCIPAL */}
      <div className="relative overflow-hidden rounded-[30px] border border-white/20 bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-indigo-950/90 p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] backdrop-blur-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">
            <Cpu className="w-3.5 h-3.5 animate-pulse" /> Telemetría de Planta
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-sky-400 bg-clip-text text-transparent">
            Control de Producción
          </h1>
          <p className="text-xs text-white/60">Monitoreo general de proyectos en planta y rendimiento por área.</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="relative flex items-center flex-1 md:flex-initial">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5" />
            <input
              type="text"
              placeholder="Buscar proyecto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-black/40 border border-white/15 rounded-2xl text-xs text-white pl-9 pr-3 py-2.5 outline-none focus:border-sky-400 w-full sm:w-52 transition-all placeholder:text-white/30"
            />
          </div>

          <button
            onClick={() => void fetchMetrics()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold text-xs border border-sky-400/30 backdrop-blur-md transition-all shrink-0 active:scale-95 shadow-lg shadow-sky-950/50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Sincronizar
          </button>
        </div>
      </div>

      {/* 1. GRÁFICA PRINCIPAL: BARRAS DE PROYECTOS ACTIVOS (ALTURA = AVANCE TOTAL) */}
      <div className="relative overflow-hidden rounded-[30px] border border-white/15 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-2xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-400" /> Avance Total por Proyecto (Gráfica Principal de Barras)
            </h2>
            <p className="text-xs text-white/50">Cada barra representa un proyecto y su altura indica su porcentaje de avance global</p>
          </div>
          <button onClick={exportarReporte} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl self-start sm:self-auto">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>

        {/* CONTENEDOR DE BARRAS VERTICALES PONDERADAS */}
        {proyectosFiltrados.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-12">No hay proyectos registrados o que coincidan con la búsqueda.</p>
        ) : (
          <div className="pt-8 pb-4">
            <div className="h-64 sm:h-72 w-full flex items-end justify-between gap-2 sm:gap-4 overflow-x-auto pb-6 px-2 border-b border-white/10 relative">
              <div className="absolute inset-x-0 top-0 border-b border-dashed border-white/10 text-[9px] font-mono text-white/30 pl-1">100%</div>
              <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-white/10 text-[9px] font-mono text-white/30 pl-1">50%</div>

              {proyectosFiltrados.map((p) => {
                const alturaPorcentaje = Math.max(5, p.progreso);
                const esCompletado = p.progreso === 100;

                return (
                  <div key={p.id} className="flex-1 min-w-[55px] max-w-[90px] h-full flex flex-col justify-end items-center group relative">
                    
                    <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 border border-white/20 text-[10px] p-2 rounded-xl text-center shadow-xl z-20 pointer-events-none whitespace-nowrap">
                      <p className="font-bold text-white">{p.nombre}</p>
                      <p className="text-emerald-400 font-mono">{p.progreso}% completado</p>
                    </div>

                    <span className="text-[10px] font-mono font-bold text-emerald-400 mb-1.5 opacity-90 group-hover:scale-110 transition-transform">
                      {p.progreso}%
                    </span>

                    <div className="w-full bg-slate-950/80 rounded-t-xl p-0.5 border-t border-x border-white/10 shadow-[inner_0_2px_4px_rgba(0,0,0,0.8)] h-full flex items-end">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-1000 relative shadow-[0_0_15px_rgba(56,189,248,0.3)] ${
                          esCompletado
                            ? 'bg-gradient-to-t from-emerald-600 via-emerald-500 to-teal-300'
                            : 'bg-gradient-to-t from-sky-600 via-indigo-500 to-emerald-400'
                        }`}
                        style={{ height: `${alturaPorcentaje}%` }}
                      >
                        <div className="absolute top-0 inset-x-0 h-[2px] bg-white/60" />
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-sky-300 font-bold mt-2 truncate w-full text-center" title={p.nombre}>
                      {p.codigo}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. GRÁFICA COMPARATIVA DE LÍNEAS DE DESEMPEÑO POR ÁREA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-2 relative overflow-hidden rounded-[30px] border border-white/15 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-2xl space-y-4">
          <div className="border-b border-white/10 pb-3 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Desempeño Comparativo por Área (Gráfica de Líneas)
              </h3>
              <p className="text-[11px] text-white/50">Porcentaje promedio de trabajo terminado en cada taller</p>
            </div>
            <span className="text-[10px] font-mono text-sky-300 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20">
              Análisis Comparativo
            </span>
          </div>

          <div className="relative h-56 w-full pt-4">
            {rendimientoAreas.length === 0 ? (
              <p className="text-xs text-white/40 text-center py-16">Sin datos para la comparativa de áreas.</p>
            ) : (
              <div className="h-full w-full relative flex flex-col justify-between">
                <svg className="w-full h-40 overflow-visible" viewBox={`0 0 ${Math.max(100, (rendimientoAreas.length - 1) * 100)} 100`} preserveAspectRatio="none">
                  <line x1="0" y1="0" x2="1000" y2="0" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <line x1="0" y1="50" x2="1000" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <line x1="0" y1="100" x2="1000" y2="100" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={rendimientoAreas.map((a, i) => `${i * 100},${100 - a.rendimiento}`).join(' ')}
                    className="drop-shadow-[0_4px_10px_rgba(16,185,129,0.5)] transition-all duration-1000"
                  />

                  {rendimientoAreas.map((a, i) => (
                    <g key={a.id}>
                      <circle
                        cx={i * 100}
                        cy={100 - a.rendimiento}
                        r="5"
                        fill="#0284c7"
                        stroke="#ffffff"
                        strokeWidth="2"
                        className="transition-all hover:scale-150 cursor-pointer"
                      />
                    </g>
                  ))}
                </svg>

                <div className="flex justify-between items-center text-[10px] text-white/60 font-semibold pt-2 border-t border-white/10">
                  {rendimientoAreas.map(a => (
                    <div key={a.id} className="text-center truncate px-1" style={{ width: `${100 / rendimientoAreas.length}%` }}>
                      <span className="block truncate font-bold text-white">{a.nombre}</span>
                      <span className="text-emerald-400 font-mono">{a.rendimiento}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DETECTOR DE ATRASOS Y ESTADO DE ENTREGAS */}
        <div className="relative overflow-hidden rounded-[30px] border border-white/15 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-2xl flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" /> Indicador de Atrasos
              </h3>
              <p className="text-[11px] text-white/50">Cumplimiento de fechas programadas</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-red-500/20 text-red-300 border border-red-500/30">
              {metricasAtrasos.pctAtraso}% Crítico
            </span>
          </div>

          <div className="space-y-3 my-auto">
            <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20 flex justify-between items-center">
              <span className="text-xs text-emerald-300 font-bold">A Tiempo / En Regla</span>
              <span className="text-lg font-black text-emerald-400 font-mono">{metricasAtrasos.aTiempo}</span>
            </div>

            <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20 flex justify-between items-center">
              <span className="text-xs text-amber-300 font-bold">En Riesgo</span>
              <span className="text-lg font-black text-amber-400 font-mono">{metricasAtrasos.riesgo}</span>
            </div>

            <div className="bg-red-500/10 p-3 rounded-2xl border border-red-500/20 flex justify-between items-center">
              <span className="text-xs text-red-300 font-bold">Órdenes Atrasadas</span>
              <span className="text-lg font-black text-red-400 font-mono">{metricasAtrasos.atrasados}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 text-[10px] text-white/50 text-center">
            Total de pedidos en análisis: <strong className="text-white">{proyectos.length}</strong>
          </div>
        </div>

      </div>

      {/* 3. VISTA TEMPORAL DE AVANCES CON FECHA DE ENTREGA */}
      <div className="relative overflow-hidden rounded-[30px] border border-white/15 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-2xl space-y-6">
        <div className="border-b border-white/10 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" /> Avances por Fechas y Programación
            </h3>
            <p className="text-[11px] text-white/50">Progreso registrado según fecha compromiso de entrega</p>
          </div>
          <span className="text-[10px] font-mono text-white/60 bg-white/10 px-3 py-1 rounded-full border border-white/10">
            Línea del Tiempo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {avancesPorFechas.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all flex items-center justify-between gap-3 shadow-md"
            >
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] text-sky-400 font-mono font-bold block">{item.codigo}</span>
                <h4 className="text-xs font-bold text-white truncate" title={item.nombre}>{item.nombre}</h4>
                <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Entrega: {item.fechaTarget}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-base font-black text-emerald-400 font-mono">{item.progreso}%</div>
                <div className="w-12 h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10 mt-1">
                  <div className="h-full bg-emerald-400" style={{ width: `${item.progreso}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}