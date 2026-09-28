'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  RefreshCw,
  Search,
  Download,
  Layers,
  BarChart3,
  TrendingUp,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Flame
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
  const [timeMode, setTimeMode] = useState<'Day' | 'Month' | 'Year'>('Month');

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

  // Cálculo de Rendimiento de Áreas
  const rendimientoAreas = useMemo(() => {
    if (!areas.length || !avances.length) return [];

    return areas.map(area => {
      const avancesArea = avances.filter(a => a.area_id === area.id);
      if (!avancesArea.length) return { ...area, rendimiento: 0, hechas: 0, total: 0 };

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
        hechas: piezasHechas,
        total: totalPiezas
      };
    });
  }, [areas, avances]);

  // Métricas Críticas del Sistema
  const metricas = useMemo(() => {
    let completados = 0;
    let enProceso = 0;
    let atrasados = 0;

    proyectos.forEach(p => {
      if (p.progreso === 100) {
        completados++;
      } else {
        let fechaEntrega: Date | null = null;
        if (p.descripcion && p.descripcion.includes('Entrega:')) {
          const match = p.descripcion.match(/Entrega:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
          if (match && match[1]) fechaEntrega = new Date(match[1]);
        }

        const hoy = new Date();
        if (fechaEntrega && fechaEntrega < hoy) {
          atrasados++;
        } else {
          enProceso++;
        }
      }
    });

    const total = proyectos.length || 1;
    const pctEficiencia = Math.round((completados / total) * 100);

    return { completados, enProceso, atrasados, total: proyectos.length, pctEficiencia };
  }, [proyectos]);

  // Exportar CSV
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
    <div className="space-y-6 max-w-7xl mx-auto pb-12 px-2 sm:px-4 text-white">
      
      {/* HEADER LIQUID GLASS CON NAVEGACIÓN Y SINCRONIZACIÓN */}
      <div 
        className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.95), rgba(18,24,36,0.8))` }}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-sky-400 font-mono">
            <span>Inicio</span> / <span className="text-white font-bold">Dashboard SULA MOB</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <Cpu className="w-6 h-6 text-sky-400 animate-pulse" /> Control y Monitoreo General
          </h1>
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

      {/* 1. FILA DE 4 TARJETAS CON EFECTO GLASS + BURBUJAS DE NEÓN + MICRO GRÁFICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* TARJETA 1: PROYECTOS REGISTRADOS (AZUL/VIOLETA) */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-gradient-to-br from-indigo-900/80 via-purple-900/60 to-slate-900/90 p-5 shadow-2xl backdrop-blur-2xl flex flex-col justify-between space-y-4">
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-lg font-black text-white font-mono">
                {metricas.total} Proyectos
                <span className="text-[10px] font-normal text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> 12.4%
                </span>
              </div>
              <p className="text-xs text-white/60 font-medium">Ordenes Totales</p>
            </div>
            <BarChart3 className="w-5 h-5 text-indigo-400" />
          </div>

          {/* Micro-gráfica de puntos integrados */}
          <div className="h-8 w-full flex items-end justify-between gap-1 pt-2 border-t border-white/10">
            {[30, 45, 25, 60, 40, 75, 90].map((v, idx) => (
              <div key={idx} className="flex-1 bg-indigo-500/30 rounded-t h-full relative flex items-end">
                <div className="w-full bg-indigo-400 rounded-t" style={{ height: `${v}%` }} />
              </div>
            ))}
          </div>
        </div>

        {/* TARJETA 2: ÁREAS EN PLANTA (AZUL CIELO) */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-gradient-to-br from-sky-900/80 via-blue-900/60 to-slate-900/90 p-5 shadow-2xl backdrop-blur-2xl flex flex-col justify-between space-y-4">
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-sky-500/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-lg font-black text-white font-mono">
                {areas.length} Áreas
                <span className="text-[10px] font-normal text-sky-300 bg-sky-500/20 px-1.5 py-0.5 rounded-full border border-sky-500/30 flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> 100%
                </span>
              </div>
              <p className="text-xs text-white/60 font-medium">Estaciones Activas</p>
            </div>
            <Layers className="w-5 h-5 text-sky-400" />
          </div>

          {/* Micro-línea de trayectoria */}
          <div className="h-8 w-full flex items-center pt-2 border-t border-white/10">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 30">
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                points="0,20 20,10 40,18 60,8 80,15 100,5"
              />
            </svg>
          </div>
        </div>

        {/* TARJETA 3: EFICIENCIA DE PRODUCCIÓN (ÁMBAR/DORADO) */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-gradient-to-br from-amber-900/80 via-orange-900/60 to-slate-900/90 p-5 shadow-2xl backdrop-blur-2xl flex flex-col justify-between space-y-4">
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-lg font-black text-white font-mono">
                {metricas.pctEficiencia}%
                <span className="text-[10px] font-normal text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-full border border-amber-500/30 flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> Meta
                </span>
              </div>
              <p className="text-xs text-white/60 font-medium">Tasa de Eficiencia</p>
            </div>
            <TrendingUp className="w-5 h-5 text-amber-400" />
          </div>

          <div className="h-8 w-full flex items-center pt-2 border-t border-white/10">
            <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/10 p-0.5">
              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full" style={{ width: `${metricas.pctEficiencia}%` }} />
            </div>
          </div>
        </div>

        {/* TARJETA 4: ATRASOS E INCIDENCIAS (ROJO/CORAL) */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-gradient-to-br from-red-950/80 via-rose-900/60 to-slate-900/90 p-5 shadow-2xl backdrop-blur-2xl flex flex-col justify-between space-y-4">
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-red-500/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-lg font-black text-white font-mono">
                {metricas.atrasados}
                <span className="text-[10px] font-normal text-red-300 bg-red-500/20 px-1.5 py-0.5 rounded-full border border-red-500/30 flex items-center">
                  <ArrowDownRight className="w-3 h-3" /> Crítico
                </span>
              </div>
              <p className="text-xs text-white/60 font-medium">Órdenes Atrasadas</p>
            </div>
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>

          {/* Micro-barras rojas */}
          <div className="h-8 w-full flex items-end justify-between gap-1 pt-2 border-t border-white/10">
            {[40, 60, 30, 80, 50, 90, 70].map((v, idx) => (
              <div key={idx} className="flex-1 bg-red-500/20 rounded-t h-full relative flex items-end">
                <div className="w-full bg-red-500 rounded-t" style={{ height: `${v}%` }} />
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 2. GRÁFICA PRINCIPAL "TRAFFIC" / RENDIMIENTO DE PLANTA CON SELECTOR DÍA-MES-AÑO */}
      <div className="relative overflow-hidden rounded-[30px] border border-white/20 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-2xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-emerald-400" /> Flujo y Desempeño de Producción
            </h2>
            <p className="text-xs text-white/50">Análisis comparativo de proyectos y rendimiento por área</p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {/* SELECTOR DE RANGO ESTILO COREUI */}
            <div className="flex items-center bg-black/40 border border-white/15 p-1 rounded-xl text-xs font-bold text-white/70">
              <button
                onClick={() => setTimeMode('Day')}
                className={`px-3 py-1.5 rounded-lg transition-all ${timeMode === 'Day' ? 'bg-sky-500 text-white shadow-md' : 'hover:text-white'}`}
              >
                Día
              </button>
              <button
                onClick={() => setTimeMode('Month')}
                className={`px-3 py-1.5 rounded-lg transition-all ${timeMode === 'Month' ? 'bg-sky-500 text-white shadow-md' : 'hover:text-white'}`}
              >
                Mes
              </button>
              <button
                onClick={() => setTimeMode('Year')}
                className={`px-3 py-1.5 rounded-lg transition-all ${timeMode === 'Year' ? 'bg-sky-500 text-white shadow-md' : 'hover:text-white'}`}
              >
                Año
              </button>
            </div>

            <button onClick={exportarReporte} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors" title="Exportar CSV">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SVG CURVAS DE ONDA CONTINUA TIPO COREUI CON GRADIENTES DE CRISTAL */}
        <div className="relative h-60 w-full pt-2">
          {rendimientoAreas.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-20">Sin datos de áreas registrados.</p>
          ) : (
            <div className="h-full w-full relative flex flex-col justify-between">
              <svg className="w-full h-44 overflow-visible" viewBox={`0 0 ${Math.max(100, (rendimientoAreas.length - 1) * 100)} 100`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="glowGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="glowSky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Líneas guía horizontales */}
                <line x1="0" y1="0" x2="1000" y2="0" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <line x1="0" y1="50" x2="1000" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <line x1="0" y1="100" x2="1000" y2="100" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

                {/* Área bajo la curva verde */}
                <polygon
                  fill="url(#glowGreen)"
                  points={`0,100 ${rendimientoAreas.map((a, i) => `${i * 100},${100 - a.rendimiento}`).join(' ')} ${(rendimientoAreas.length - 1) * 100},100`}
                />

                {/* Curva principal verde (Rendimiento por Área) */}
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={rendimientoAreas.map((a, i) => `${i * 100},${100 - a.rendimiento}`).join(' ')}
                  className="drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                />

                {/* Curva secundaria azul sky */}
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                  points={rendimientoAreas.map((a, i) => `${i * 100},${100 - Math.max(15, a.rendimiento * 0.65)}`).join(' ')}
                />

                {/* Nodos fosforescentes */}
                {rendimientoAreas.map((a, i) => (
                  <circle
                    key={a.id}
                    cx={i * 100}
                    cy={100 - a.rendimiento}
                    r="5"
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                ))}
              </svg>

              {/* Leyenda Eje X */}
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

        {/* 5 CONTADORES EN EL PIE DE LA GRÁFICA TIPO COREUI */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-white/10 text-center">
          <div className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/10">
            <span className="text-[10px] text-white/50 block">Proyectos Totales</span>
            <strong className="text-sm font-bold text-white font-mono">{metricas.total} Órdenes</strong>
          </div>
          <div className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/10">
            <span className="text-[10px] text-white/50 block">En Proceso</span>
            <strong className="text-sm font-bold text-sky-400 font-mono">{metricas.enProceso} Órdenes</strong>
          </div>
          <div className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/10">
            <span className="text-[10px] text-white/50 block">Finalizados</span>
            <strong className="text-sm font-bold text-emerald-400 font-mono">{metricas.completados} Órdenes</strong>
          </div>
          <div className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/10">
            <span className="text-[10px] text-white/50 block">Atrasados</span>
            <strong className="text-sm font-bold text-red-400 font-mono">{metricas.atrasados} Órdenes</strong>
          </div>
          <div className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/10 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-white/50 block">Eficiencia Global</span>
            <strong className="text-sm font-bold text-amber-300 font-mono">{metricas.pctEficiencia}%</strong>
          </div>
        </div>
      </div>

      {/* 3. BLOQUE INFERIOR DE TARJETAS HORIZONTALES CON GRADIENTES CROMÁTICOS DE SULA MOB */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* TARJETA CANAL 1: ÓRDENES EN PLANTA */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900/80 p-5 shadow-xl backdrop-blur-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-bold text-indigo-300">Órdenes en Planta</span>
            <h3 className="text-xl font-black text-white font-mono">{metricas.enProceso} Fabricándose</h3>
            <p className="text-[11px] text-white/50">Monitoreo activo por estaciones</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* TARJETA CANAL 2: CUMPLIMIENTO */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900/80 p-5 shadow-xl backdrop-blur-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-bold text-emerald-300">Entregas Listas</span>
            <h3 className="text-xl font-black text-white font-mono">{metricas.completados} Concluidas</h3>
            <p className="text-[11px] text-white/50">Control de calidad aprobado</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* TARJETA CANAL 3: INCIDENCIAS */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-gradient-to-r from-red-950 via-slate-900 to-red-900/80 p-5 shadow-xl backdrop-blur-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-bold text-red-300">Nivel de Riesgo</span>
            <h3 className="text-xl font-black text-white font-mono">{metricas.atrasados} Alertas</h3>
            <p className="text-[11px] text-white/50">Atención urgente requerida</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-400/30 flex items-center justify-center shrink-0 text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 4. TABLA GENERAL DE PROYECTOS REGISTRADOS */}
      <div className="relative overflow-hidden rounded-[30px] border border-white/20 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-2xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-white/10 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-400" /> Catálogo de Proyectos Activos
            </h3>
            <p className="text-[11px] text-white/50">Desglose de porcentaje y cliente de cada pedido</p>
          </div>
          <span className="text-xs font-mono font-bold text-sky-300 bg-sky-500/10 px-3 py-1 rounded-xl border border-sky-500/20 self-start sm:self-auto">
            {proyectosFiltrados.length} Registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/50 font-bold uppercase text-[10px] tracking-wider">
                <th className="pb-3">Código</th>
                <th className="pb-3">Proyecto</th>
                <th className="pb-3">Cliente</th>
                <th className="pb-3">Avance</th>
                <th className="pb-3 text-right">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {proyectosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-white/40">
                    No se encontraron proyectos.
                  </td>
                </tr>
              ) : (
                proyectosFiltrados.slice(0, 6).map((p) => {
                  const estaFinalizado = p.progreso === 100;
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 font-mono font-bold text-sky-400">{p.codigo}</td>
                      <td className="py-3 font-bold text-white max-w-[180px] truncate">{p.nombre}</td>
                      <td className="py-3 text-white/60 max-w-[140px] truncate">{p.cliente || 'General'}</td>
                      <td className="py-3 font-mono font-bold text-emerald-400">{p.progreso}%</td>
                      <td className="py-3 text-right">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          estaFinalizado
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {estaFinalizado ? 'Completado' : 'En Planta'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}