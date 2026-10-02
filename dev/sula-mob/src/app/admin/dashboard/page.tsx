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

  // Eficiencia global
  const eficienciaGlobal = useMemo(() => {
    if (!proyectos.length) return 0;
    const sum = proyectos.reduce((acc, p) => acc + p.progreso, 0);
    return Math.round(sum / proyectos.length);
  }, [proyectos]);

  const exportarReporte = () => {
    const fecha = new Date();
    const fechaStr = fecha.toISOString().slice(0, 10);
    const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    const lines: string[] = [];

    // ═══ ENCABEZADO DEL REPORTE ═══
    lines.push('REPORTE DE PRODUCCIÓN — SULA MOB');
    lines.push(`Fecha de generación:,${fechaStr} ${horaStr}`);
    lines.push(`Total de proyectos:,${proyectos.length}`);
    lines.push(`Eficiencia global:,${eficienciaGlobal}%`);
    lines.push('');

    // ═══ SECCIÓN 1: RESUMEN EJECUTIVO ═══
    lines.push('═══ RESUMEN EJECUTIVO ═══');
    lines.push('Métrica,Valor');
    lines.push(`Proyectos totales,${proyectos.length}`);
    lines.push(`En proceso,${proyectos.filter(p => p.progreso > 0 && p.progreso < 100).length}`);
    lines.push(`Finalizados,${proyectos.filter(p => p.progreso === 100).length}`);
    lines.push(`Sin iniciar,${proyectos.filter(p => p.progreso === 0).length}`);
    lines.push(`Atrasados,${metricasAtrasos.atrasados}`);
    lines.push(`En riesgo,${metricasAtrasos.riesgo}`);
    lines.push(`A tiempo,${metricasAtrasos.aTiempo}`);
    lines.push(`% de atraso,${metricasAtrasos.pctAtraso}%`);
    lines.push(`Eficiencia global,${eficienciaGlobal}%`);
    lines.push('');

    // ═══ SECCIÓN 2: DETALLE POR PROYECTO ═══
    lines.push('═══ DETALLE POR PROYECTO ═══');
    lines.push('Código,Proyecto,Cliente,Prioridad,Progreso %,Estado,Fecha Entrega');
    proyectos.forEach(p => {
      let fechaEntrega = '—';
      if (p.descripcion && p.descripcion.includes('Entrega:')) {
        const match = p.descripcion.match(/Entrega:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
        if (match?.[1]) fechaEntrega = match[1];
      }

      let estado = 'Sin iniciar';
      if (p.progreso === 100) estado = 'Finalizado';
      else if (p.progreso > 0) estado = 'En proceso';

      // Verificar atraso
      if (fechaEntrega !== '—' && p.progreso < 100) {
        const fEntrega = new Date(fechaEntrega);
        if (fEntrega < new Date()) estado = '⚠ ATRASADO';
      }

      lines.push(`${p.codigo},"${p.nombre}","${p.cliente || 'General'}",${(p.prioridad || 'media').toUpperCase()},${p.progreso}%,${estado},${fechaEntrega}`);
    });
    lines.push('');

    // ═══ SECCIÓN 3: RENDIMIENTO POR ÁREA ═══
    lines.push('═══ RENDIMIENTO POR ÁREA / ESTACIÓN ═══');
    lines.push('Área,Peso %,Rendimiento %,Piezas Completadas,Piezas Totales');
    rendimientoAreas.forEach(a => {
      lines.push(`"${a.nombre}",${a.peso || 0}%,${a.rendimiento}%,${a.piezasCompletadas},${a.piezasTotales}`);
    });
    lines.push('');

    // ═══ PIE DE REPORTE ═══
    lines.push('═══ FIN DEL REPORTE ═══');
    lines.push(`Generado por SULA MOB — ${fechaStr}`);

    const csvContent = '﻿' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Produccion_SULA_${fechaStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /* ── Glass card base ── */
  const glass = 'backdrop-blur-2xl backdrop-saturate-[1.7] bg-white/[0.04] border border-white/[0.10] rounded-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)]';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 px-2 sm:px-4 text-white">

      {/* ═══ HEADER PRINCIPAL ═══ */}
      <div className={`relative overflow-hidden ${glass} p-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold font-mono">
            <Cpu className="w-3.5 h-3.5 animate-pulse" /> Telemetría de Planta
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Control y Monitoreo General
          </h1>
          <p className="text-xs text-white/50">Monitoreo general de proyectos en planta y rendimiento por área.</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="relative flex items-center flex-1 md:flex-initial">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5" />
            <input
              type="text"
              placeholder="Buscar proyecto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-white/[0.07] border border-white/20 hover:border-white/30 focus:border-blue-400/60 focus:ring-1 focus:ring-blue-500/15 rounded-xl text-xs text-white pl-9 pr-3 py-2.5 outline-none w-full sm:w-52 transition-all placeholder:text-white/30"
            />
          </div>

          <button
            onClick={() => void fetchMetrics()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs border border-blue-500/30 transition-all shrink-0 active:scale-95 shadow-lg shadow-blue-900/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Sincronizar
          </button>
        </div>
      </div>

      {/* ═══ STAT CARDS — 4 métricas principales ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Proyectos */}
        <div className={`${glass} !bg-blue-500/[0.08] !border-blue-500/20 p-4 sm:p-5 space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-3xl sm:text-4xl font-black text-blue-400 font-mono">{proyectos.length}</span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <p className="text-xs text-white/50 font-semibold">Proyectos</p>
          <p className="text-[10px] text-white/35">Órdenes Totales</p>
        </div>

        {/* Áreas */}
        <div className={`${glass} !bg-cyan-500/[0.08] !border-cyan-500/20 p-4 sm:p-5 space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-3xl sm:text-4xl font-black text-cyan-400 font-mono">{areas.filter(a => a.activo).length}</span>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
              <Layers className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <p className="text-xs text-white/50 font-semibold">Áreas</p>
          <p className="text-[10px] text-white/35">Estaciones Activas</p>
        </div>

        {/* Eficiencia */}
        <div className={`${glass} !bg-emerald-500/[0.08] !border-emerald-500/20 p-4 sm:p-5 space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono">{eficienciaGlobal}%</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <p className="text-xs text-white/50 font-semibold">Eficiencia</p>
          <p className="text-[10px] text-white/35">Tasa de Eficiencia</p>
        </div>

        {/* Atrasados */}
        <div className={`${glass} !bg-red-500/[0.08] !border-red-500/20 p-4 sm:p-5 space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-3xl sm:text-4xl font-black text-red-400 font-mono">{metricasAtrasos.atrasados}</span>
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
          </div>
          <p className="text-xs text-white/50 font-semibold">Atrasados</p>
          <p className="text-[10px] text-white/35">Órdenes Atrasadas</p>
        </div>
      </div>

      {/* ═══ GRÁFICA DE BARRAS — Avance por Proyecto ═══ */}
      <div className={`${glass} p-5 sm:p-6 space-y-5`}>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" /> Avance Total por Proyecto
            </h2>
            <p className="text-[11px] text-white/40">Cada barra representa el porcentaje de avance global</p>
          </div>
          <button onClick={exportarReporte} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold bg-white/[0.06] border border-white/10 px-3 py-1.5 rounded-xl self-start sm:self-auto transition-colors">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>

        {proyectosFiltrados.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-12">No hay proyectos registrados o que coincidan con la búsqueda.</p>
        ) : (
          <div className="pt-6 pb-2">
            <div className="h-56 sm:h-64 w-full flex items-end justify-between gap-2 sm:gap-4 overflow-x-auto pb-6 px-2 border-b border-white/[0.08] relative">
              <div className="absolute inset-x-0 top-0 border-b border-dashed border-white/[0.08] text-[9px] font-mono text-white/25 pl-1">100%</div>
              <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-white/[0.08] text-[9px] font-mono text-white/25 pl-1">50%</div>

              {proyectosFiltrados.map((p) => {
                const alturaPorcentaje = Math.max(5, p.progreso);
                const esCompletado = p.progreso === 100;

                return (
                  <div key={p.id} className="flex-1 min-w-[50px] max-w-[85px] h-full flex flex-col justify-end items-center group relative">

                    <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-[#0a0c14] border border-white/20 text-[10px] p-2.5 rounded-xl text-center shadow-xl z-20 pointer-events-none whitespace-nowrap">
                      <p className="font-bold text-white">{p.nombre}</p>
                      <p className="text-blue-400 font-mono">{p.progreso}% completado</p>
                    </div>

                    <span className={`text-[10px] font-mono font-bold mb-1.5 group-hover:scale-110 transition-transform ${esCompletado ? 'text-emerald-400' : 'text-blue-400'}`}>
                      {p.progreso}%
                    </span>

                    <div className="w-full bg-white/[0.03] rounded-t-xl p-0.5 border-t border-x border-white/[0.08] h-full flex items-end">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-1000 relative ${
                          esCompletado
                            ? 'bg-gradient-to-t from-emerald-600 via-emerald-500 to-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                            : 'bg-gradient-to-t from-blue-700 via-blue-500 to-cyan-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                        }`}
                        style={{ height: `${alturaPorcentaje}%` }}
                      >
                        <div className="absolute top-0 inset-x-0 h-[2px] bg-white/50" />
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-blue-300 font-bold mt-2 truncate w-full text-center" title={p.nombre}>
                      {p.codigo}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═══ GRÁFICA DE LÍNEAS + INDICADOR DE ATRASOS ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* Gráfica de líneas — Desempeño por Área */}
        <div className={`lg:col-span-2 ${glass} p-5 sm:p-6 space-y-4`}>
          <div className="border-b border-white/[0.08] pb-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" /> Desempeño Comparativo por Área
              </h3>
              <p className="text-[11px] text-white/40">Porcentaje promedio de trabajo terminado en cada taller</p>
            </div>
            <span className="text-[10px] font-mono text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
              Análisis Comparativo
            </span>
          </div>

          <div className="relative h-56 w-full pt-4">
            {rendimientoAreas.length === 0 ? (
              <p className="text-xs text-white/40 text-center py-16">Sin datos para la comparativa de áreas.</p>
            ) : (
              <div className="h-full w-full relative flex flex-col justify-between">
                <svg className="w-full h-40 overflow-visible" viewBox={`0 0 ${Math.max(100, (rendimientoAreas.length - 1) * 100)} 100`} preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="0" x2="1000" y2="0" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <line x1="0" y1="50" x2="1000" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <line x1="0" y1="100" x2="1000" y2="100" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

                  {/* Área bajo la curva */}
                  <polygon
                    fill="url(#areaGradient)"
                    points={`0,100 ${rendimientoAreas.map((a, i) => `${i * 100},${100 - a.rendimiento}`).join(' ')} ${(rendimientoAreas.length - 1) * 100},100`}
                  />
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Línea principal */}
                  <polyline
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={rendimientoAreas.map((a, i) => `${i * 100},${100 - a.rendimiento}`).join(' ')}
                    className="drop-shadow-[0_4px_10px_rgba(59,130,246,0.5)] transition-all duration-1000"
                  />

                  {/* Puntos */}
                  {rendimientoAreas.map((a, i) => (
                    <g key={a.id}>
                      <circle
                        cx={i * 100}
                        cy={100 - a.rendimiento}
                        r="5"
                        fill="#3b82f6"
                        stroke="#ffffff"
                        strokeWidth="2"
                        className="transition-all hover:scale-150 cursor-pointer"
                      />
                    </g>
                  ))}
                </svg>

                <div className="flex justify-between items-center text-[10px] text-white/50 font-semibold pt-2 border-t border-white/[0.08]">
                  {rendimientoAreas.map(a => (
                    <div key={a.id} className="text-center truncate px-1" style={{ width: `${100 / rendimientoAreas.length}%` }}>
                      <span className="block truncate font-bold text-white/70">{a.nombre}</span>
                      <span className={`font-mono ${a.rendimiento > 50 ? 'text-emerald-400' : a.rendimiento > 0 ? 'text-amber-400' : 'text-white/30'}`}>
                        {a.rendimiento}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Indicador de Atrasos */}
        <div className={`${glass} p-5 sm:p-6 flex flex-col justify-between space-y-4`}>
          <div className="flex justify-between items-center border-b border-white/[0.08] pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" /> Indicador de Atrasos
              </h3>
              <p className="text-[11px] text-white/40">Cumplimiento de fechas</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-red-500/15 text-red-300 border border-red-500/20">
              {metricasAtrasos.pctAtraso}% Crítico
            </span>
          </div>

          <div className="space-y-3 my-auto">
            <div className="bg-emerald-500/[0.08] p-3 rounded-xl border border-emerald-500/15 flex justify-between items-center">
              <span className="text-xs text-emerald-300 font-bold">A Tiempo / En Regla</span>
              <span className="text-lg font-black text-emerald-400 font-mono">{metricasAtrasos.aTiempo}</span>
            </div>

            <div className="bg-amber-500/[0.08] p-3 rounded-xl border border-amber-500/15 flex justify-between items-center">
              <span className="text-xs text-amber-300 font-bold">En Riesgo</span>
              <span className="text-lg font-black text-amber-400 font-mono">{metricasAtrasos.riesgo}</span>
            </div>

            <div className="bg-red-500/[0.08] p-3 rounded-xl border border-red-500/15 flex justify-between items-center">
              <span className="text-xs text-red-300 font-bold">Órdenes Atrasadas</span>
              <span className="text-lg font-black text-red-400 font-mono">{metricasAtrasos.atrasados}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/[0.08] text-[10px] text-white/40 text-center">
            Total de pedidos en análisis: <strong className="text-white/70">{proyectos.length}</strong>
          </div>
        </div>

      </div>

      {/* ═══ RESUMEN INFERIOR — métricas clave ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className={`${glass} p-4 text-center space-y-1`}>
          <p className="text-[11px] text-white/40 font-medium">Proyectos Totales</p>
          <p className="text-xl font-black text-white font-mono">{proyectos.length} <span className="text-xs font-normal text-white/40">órdenes</span></p>
        </div>
        <div className={`${glass} p-4 text-center space-y-1`}>
          <p className="text-[11px] text-white/40 font-medium">En Proceso</p>
          <p className="text-xl font-black text-blue-400 font-mono">{proyectos.filter(p => p.progreso > 0 && p.progreso < 100).length} <span className="text-xs font-normal text-white/40">órdenes</span></p>
        </div>
        <div className={`${glass} p-4 text-center space-y-1`}>
          <p className="text-[11px] text-white/40 font-medium">Finalizados</p>
          <p className="text-xl font-black text-emerald-400 font-mono">{proyectos.filter(p => p.progreso === 100).length} <span className="text-xs font-normal text-white/40">órdenes</span></p>
        </div>
        <div className={`${glass} p-4 text-center space-y-1`}>
          <p className="text-[11px] text-white/40 font-medium">Atrasados</p>
          <p className="text-xl font-black text-red-400 font-mono">{metricasAtrasos.atrasados} <span className="text-xs font-normal text-white/40">órdenes</span></p>
        </div>
        <div className={`${glass} col-span-2 sm:col-span-1 p-4 text-center space-y-1`}>
          <p className="text-[11px] text-white/40 font-medium">Eficiencia Global</p>
          <p className="text-xl font-black text-cyan-400 font-mono">{eficienciaGlobal}%</p>
        </div>
      </div>

      {/* ═══ CRONOLOGÍA DE PROYECTOS ═══ */}
      <div className={`${glass} p-5 sm:p-6 space-y-5`}>
        <div className="border-b border-white/[0.08] pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" /> Avances por Fechas y Programación
            </h3>
            <p className="text-[11px] text-white/40">Progreso registrado según fecha compromiso de entrega</p>
          </div>
          <span className="text-[10px] font-mono text-white/50 bg-white/[0.06] px-3 py-1 rounded-full border border-white/[0.08]">
            Línea del Tiempo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {avancesPorFechas.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl ${glass} !border-white/[0.08] hover:!border-blue-500/30 transition-all flex items-center justify-between gap-3`}
            >
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] text-blue-400 font-mono font-bold block">{item.codigo}</span>
                <h4 className="text-xs font-bold text-white truncate" title={item.nombre}>{item.nombre}</h4>
                <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Entrega: {item.fechaTarget}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className={`text-base font-black font-mono ${item.progreso === 100 ? 'text-emerald-400' : item.progreso > 50 ? 'text-blue-400' : 'text-amber-400'}`}>
                  {item.progreso}%
                </div>
                <div className="w-12 h-1.5 bg-white/[0.06] rounded-full overflow-hidden border border-white/[0.08] mt-1">
                  <div className={`h-full rounded-full ${item.progreso === 100 ? 'bg-emerald-400' : item.progreso > 50 ? 'bg-blue-400' : 'bg-amber-400'}`} style={{ width: `${item.progreso}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}