'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import {
  Activity,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Layers,
  BarChart2,
  Search,
  Download,
  Target,
  Filter,
  PieChart,
  Box
} from 'lucide-react';

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  progreso: number;
  cliente?: string;
  created_at?: string;
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
}

const defaultAreaImages: Record<string, string> = {
  'corte de tubo': '/images/corte_tubo.png',
  'doblez': '/images/dobles.png',
  'corte de lámina': '/images/corte_lamina.png',
  'soldadura': '/images/soldaduraa.png',
  'alambrón': '/images/alambron.png',
  'pintura': '/images/pintura.png',
  'empaque': '/images/empaque.png',
  'corte de madera': '/images/corte_madera.png',
};

export default function DashboardPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [avances, setAvances] = useState<AvanceEstacion[]>([]);
  const [stats, setStats] = useState({ total: 0, completados: 0, enProceso: 0, alertas: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'proceso' | 'completados'>('todos');

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    const [
      { data: pData },
      { data: aData },
      { count: nCount },
      { data: avData }
    ] = await Promise.all([
      supabase.from('proyectos').select('*').order('created_at', { ascending: false }),
      supabase.from('areas').select('*').order('created_at', { ascending: true }),
      supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leido', false),
      supabase.from('producto_area_avance').select('*')
    ]);

    if (pData) {
      setProyectos(pData as Proyecto[]);
      const completados = pData.filter(p => p.progreso === 100).length;
      setStats({
        total: pData.length,
        completados,
        enProceso: pData.length - completados,
        alertas: nCount || 0
      });
    }

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

  const handleManualRefresh = async () => {
    await fetchMetrics();
  };

  const getAreaImage = (nombreArea: string) => {
    const normalized = nombreArea.trim().toLowerCase();
    return defaultAreaImages[normalized] || '/images/nueva.png';
  };

  // 1. Carga Real por Estación de Trabajo calculada automáticamente por Unidades o Porcentaje
  const estacionesCarga = useMemo(() => {
    if (!areas.length || !avances.length) return [];
    
    return areas.map(area => {
      const avancesArea = avances.filter(a => a.area_id === area.id);
      if (!avancesArea.length) {
        return { ...area, carga: 0, totalTareas: 0, completadas: 0, totalPiezas: 0, piezasProcesadas: 0 };
      }

      const totalTareas = avancesArea.length;
      let sumaPorcentajes = 0;
      let totalPiezas = 0;
      let piezasProcesadas = 0;

      avancesArea.forEach(curr => {
        if (curr.piezas_totales && curr.piezas_totales > 0) {
          totalPiezas += curr.piezas_totales;
          const pc = curr.piezas_completadas || 0;
          piezasProcesadas += pc;
          sumaPorcentajes += Math.min(100, Math.round((pc / curr.piezas_totales) * 100));
        } else {
          sumaPorcentajes += curr.porcentaje || (curr.completado ? 100 : 0);
        }
      });

      const promedioPorcentaje = Math.round(sumaPorcentajes / totalTareas);
      const completadas = avancesArea.filter(a => 
        a.completado || 
        (a.piezas_totales && a.piezas_completadas ? a.piezas_completadas >= a.piezas_totales : a.porcentaje >= 100)
      ).length;

      return {
        ...area,
        carga: promedioPorcentaje,
        totalTareas,
        completadas,
        totalPiezas,
        piezasProcesadas
      };
    });
  }, [areas, avances]);

  // Top 5 Estaciones con mayor carga activa
  const topEstacionesCarga = useMemo(() => {
    return [...estacionesCarga].sort((a, b) => b.carga - a.carga).slice(0, 5);
  }, [estacionesCarga]);

  // 2. Proyectos Activos (En proceso) para la nueva gráfica visual
  const proyectosActivosGrafica = useMemo(() => {
    return proyectos
      .filter(p => p.progreso < 100)
      .slice(0, 6); // Muestra los 6 más recientes en proceso
  }, [proyectos]);

  // 3. Proyectos filtrados por búsqueda y por estado
  const proyectosFiltrados = useMemo(() => {
    return proyectos.filter(p => {
      const coincideBusqueda =
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.cliente && p.cliente.toLowerCase().includes(searchTerm.toLowerCase()));

      const coincideEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'completados' && p.progreso === 100) ||
        (filtroEstado === 'proceso' && p.progreso < 100);

      return coincideBusqueda && coincideEstado;
    });
  }, [proyectos, searchTerm, filtroEstado]);

  // 4. Promedio del Progreso Global
  const promedioProgresoGlobal = useMemo(() => {
    if (!proyectos.length) return 0;
    const suma = proyectos.reduce((acc, p) => acc + p.progreso, 0);
    return Math.round(suma / proyectos.length);
  }, [proyectos]);

  // 5. Exportar Reporte de Métricas a CSV
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
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      
      {/* HEADER PRINCIPAL */}
      <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-white/[0.05] p-5 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Panel General de Producción
          </h1>
          <p className="text-xs text-white/60 mt-0.5">
            Monitoreo en tiempo real de órdenes, carga por estación y avance de piezas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5" />
            <input
              type="text"
              placeholder="Buscar proyectos..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-white/[0.07] border border-white/15 rounded-xl text-xs text-white pl-9 pr-3 py-2 outline-none focus:border-white/40 w-44 sm:w-56 transition-all placeholder:text-white/30"
            />
          </div>

          <button
            onClick={() => void handleManualRefresh()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/15 backdrop-blur-md transition-all shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} /> Sincronizar
          </button>
        </div>
      </div>

      {/* BLOQUE SUPERIOR 1: KPIs, GRÁFICO DE PROYECTOS ACTIVOS Y OBJETIVO GLOBAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* TARJETAS RESUMEN DE ÓRDENES Y NUEVO GRÁFICO DE PROYECTOS ACTIVOS */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-5">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white">Resumen Diario de Órdenes</h2>
              <p className="text-[11px] text-white/50">Estado actual de la planta</p>
            </div>
            <button
              onClick={exportarReporte}
              className="flex items-center gap-1.5 text-[11px] text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl border border-white/15 transition-all shadow-sm"
            >
              <Download className="w-3 h-3 text-sky-400" /> Exportar CSV
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 space-y-2 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-2xl font-black text-white">{stats.total}</div>
                <div className="text-[10px] font-medium text-sky-200/70 mt-0.5">Órdenes Totales</div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 space-y-2 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-2xl font-black text-amber-300">{stats.enProceso}</div>
                <div className="text-[10px] font-medium text-amber-200/70 mt-0.5">En Proceso</div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 space-y-2 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-300">{stats.completados}</div>
                <div className="text-[10px] font-medium text-emerald-200/70 mt-0.5">Completadas</div>
              </div>
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 space-y-2 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-400/30 flex items-center justify-center text-red-300">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <div className="text-2xl font-black text-red-300">{stats.alertas}</div>
                <div className="text-[10px] font-medium text-red-200/70 mt-0.5">Incidencias</div>
              </div>
            </div>
          </div>

          {/* NUEVA GRÁFICA: PROYECTOS ACTIVOS Y PORCENTAJE DE AVANCE */}
          <div className="pt-2 border-t border-white/10 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-1.5 font-bold text-white">
                <Box className="w-4 h-4 text-sky-400" /> Proyectos Activos en Taller y Porcentaje de Avance
              </span>
              <span className="text-[10px] text-white/50">{proyectosActivosGrafica.length} en fabricación</span>
            </div>

            {proyectosActivosGrafica.length === 0 ? (
              <p className="text-xs text-white/40 text-center py-4">No hay proyectos activos actualmente.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {proyectosActivosGrafica.map((p) => (
                  <div key={p.id} className="bg-black/30 p-3 rounded-xl border border-white/10 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white truncate max-w-[140px]" title={p.nombre}>
                        <span className="text-sky-400 font-mono text-[10px] mr-1">{p.codigo}</span>
                        {p.nombre}
                      </span>
                      <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[11px]">
                        {p.progreso}%
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-700"
                        style={{ width: `${p.progreso}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CUMPLIMIENTO GLOBAL Y OBJETIVO */}
        <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-400" /> Objetivo vs Realidad
              </h2>
              <p className="text-[11px] text-white/50">Avance global ponderado</p>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold font-mono">
              {promedioProgresoGlobal}%
            </span>
          </div>

          <div className="space-y-4 my-auto">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70">Progreso Promedio Global</span>
              <span className="font-mono font-bold text-emerald-400">{promedioProgresoGlobal}%</span>
            </div>
            <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/10 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-sky-500 via-indigo-400 to-emerald-400 rounded-full transition-all duration-700 shadow-sm"
                style={{ width: `${promedioProgresoGlobal}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-2">
              <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/10">
                <span className="text-[10px] text-white/50 block">Meta Requerida</span>
                <span className="text-sm font-bold text-white font-mono">100%</span>
              </div>
              <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/10">
                <span className="text-[10px] text-white/50 block">Faltante Promedio</span>
                <span className="text-sm font-bold text-amber-300 font-mono">{100 - promedioProgresoGlobal}%</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px]">
            <span className="text-white/50 flex items-center gap-1">
              <PieChart className="w-3 h-3 text-sky-400" /> Estaciones Activas
            </span>
            <span className="font-mono text-emerald-400 font-bold">
              {areas.filter(a => a.activo).length} / {areas.length} Online
            </span>
          </div>
        </div>

      </div>

      {/* BLOQUE MEDIO 2: AVANCE DE PROYECTOS Y DISTRIBUCIÓN POR ESTACIONES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* AVANCE REAL Y COMPARATIVO POR PROYECTO */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-sky-400" /> Avance por Orden de Producción
              </h3>
              <p className="text-xs text-white/60">Calculado dinámicamente según piezas terminadas por estación.</p>
            </div>

            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 text-[10px]">
              <button
                onClick={() => setFiltroEstado('todos')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filtroEstado === 'todos' ? 'bg-sky-500 text-white font-bold' : 'text-white/60 hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltroEstado('proceso')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filtroEstado === 'proceso' ? 'bg-amber-500 text-white font-bold' : 'text-white/60 hover:text-white'
                }`}
              >
                En Proceso
              </button>
              <button
                onClick={() => setFiltroEstado('completados')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filtroEstado === 'completados' ? 'bg-emerald-500 text-white font-bold' : 'text-white/60 hover:text-white'
                }`}
              >
                Completados
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
            {proyectosFiltrados.length === 0 ? (
              <p className="text-xs text-white/50 text-center py-10">No hay proyectos que coincidan con el filtro.</p>
            ) : (
              proyectosFiltrados.map((p) => (
                <div key={p.id} className="space-y-1.5 bg-white/[0.02] p-3 rounded-2xl border border-white/5 hover:border-white/15 transition-all">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white flex items-center gap-2">
                      <span className="font-mono text-sky-400 text-[11px] font-bold">{p.codigo}</span> — {p.nombre}
                    </span>
                    <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                      {p.progreso}%
                    </span>
                  </div>
                  
                  <div className="w-full h-3.5 bg-black/50 rounded-full overflow-hidden border border-white/10 p-0.5">
                    <div 
                      className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-700 shadow-sm"
                      style={{ width: `${p.progreso}%` }}
                    />
                  </div>

                  {p.cliente && (
                    <div className="text-[10px] text-white/40 flex justify-between pt-0.5">
                      <span>Cliente: {p.cliente}</span>
                      <span>Estado: {p.progreso === 100 ? 'Finalizado' : 'En producción'}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* TOP ESTACIONES CON MAYOR CARGA */}
        <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4 flex flex-col justify-between">
          <div>
            <div className="border-b border-white/10 pb-3 flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-sky-400" /> Carga Crítica por Estación
                </h3>
                <p className="text-[11px] text-white/50">Áreas con mayor volumen activo</p>
              </div>
              <BarChart2 className="w-4 h-4 text-white/40" />
            </div>

            <div className="space-y-3">
              {topEstacionesCarga.length === 0 ? (
                <p className="text-xs text-white/50 text-center py-6">Sin datos de carga registrados.</p>
              ) : (
                topEstacionesCarga.map((e, idx) => (
                  <div key={e.id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white text-[11px] flex items-center gap-2">
                        <span className="font-mono text-sky-400 text-[10px]">0{idx + 1}</span> {e.nombre}
                      </span>
                      <span className="font-mono font-bold text-amber-300 text-[10px]">{e.carga}%</span>
                    </div>
                    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          e.carga >= 90 ? 'bg-red-400' : e.carga >= 50 ? 'bg-amber-400' : 'bg-sky-400'
                        }`}
                        style={{ width: `${e.carga}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex justify-between items-center text-[11px] text-white/50">
            <span>Órdenes cargadas</span>
            <span className="font-bold text-white font-mono">{proyectos.length} en total</span>
          </div>
        </div>

      </div>

      {/* BLOQUE INFERIOR 3: ESTADO REAL DE CADA ESTACIÓN Y CONTEO DE PIEZAS */}
      <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-5">
        <div className="border-b border-white/10 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" /> Carga y Avance Dinámico por Estación de Trabajo
            </h3>
            <p className="text-[11px] text-white/50">Monitoreo automático por número de piezas procesadas</p>
          </div>
          <span className="text-[10px] bg-white/10 text-white/80 border border-white/15 px-3 py-1 rounded-full font-mono">
            {areas.filter(a => a.activo).length} de {areas.length} Áreas Operativas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {estacionesCarga.map((a) => {
            const bgImg = getAreaImage(a.nombre);
            const estaSaturado = a.carga >= 90;

            return (
              <div 
                key={a.id}
                className="relative overflow-hidden rounded-2xl border border-white/15 p-4 flex flex-col justify-between space-y-3 bg-cover bg-center transition-all hover:border-white/40 shadow-lg"
                style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.92), rgba(18,24,36,0.85)), url('${bgImg}')` }}
              >
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900/80 border border-white/20 overflow-hidden relative shrink-0">
                      <Image src={bgImg} alt={a.nombre} fill className="object-cover" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{a.nombre}</h4>
                      <span className="text-[10px] text-white/50">Peso: {a.peso || 14.28}%</span>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-md ${
                    !a.activo
                      ? 'bg-red-950/80 text-red-300 border-red-500/40'
                      : estaSaturado
                      ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                  }`}>
                    {!a.activo ? 'Inactiva' : estaSaturado ? 'Alta Carga' : 'Operativa'}
                  </span>
                </div>

                <div className="relative z-10 space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-white/60">Avance del Área:</span>
                    <span className="font-mono font-bold text-sky-300">{a.carga}%</span>
                  </div>
                  <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        estaSaturado ? 'bg-amber-400' : 'bg-gradient-to-r from-sky-400 to-emerald-400'
                      }`}
                      style={{ width: `${a.carga}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-white/50 pt-1 border-t border-white/5">
                    {a.totalPiezas > 0 ? (
                      <span className="text-emerald-400 font-mono font-semibold">
                        Piezas: {a.piezasProcesadas} / {a.totalPiezas}
                      </span>
                    ) : (
                      <span>Tareas: {a.completadas} / {a.totalTareas}</span>
                    )}
                    <span>{a.totalTareas} asignaciones</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}