'use client';

import { useEffect, useState, useCallback } from 'react';
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
  Users,
  Search,
  Download
} from 'lucide-react';

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  progreso: number;
  cliente?: string;
}

interface Area {
  id: string;
  nombre: string;
  activo: boolean;
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
  const [stats, setStats] = useState({ total: 0, completados: 0, enProceso: 0, alertas: 0 });
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    const [{ data: pData }, { data: aData }, { count: nCount }] = await Promise.all([
      supabase.from('proyectos').select('*').order('created_at', { ascending: false }).limit(6),
      supabase.from('areas').select('*').order('created_at', { ascending: true }),
      supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leido', false)
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
  }, []);

  const handleManualRefresh = async () => {
    setLoading(true);
    await fetchMetrics();
    setLoading(false);
  };

  useEffect(() => {
    let isMounted = true;

    async function init() {
      await fetchMetrics();
      if (isMounted) setLoading(false);
    }

    void init();
    return () => { isMounted = false; };
  }, [fetchMetrics]);

  const getAreaImage = (nombreArea: string) => {
    const normalized = nombreArea.trim().toLowerCase();
    return defaultAreaImages[normalized] || '/images/nueva.png';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      
      {/* HEADER DE CONTROL SUPERIOR */}
      <div className="relative overflow-hidden rounded-[24px] border border-white/20 bg-white/[0.05] p-5 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Panel General de Producción
          </h1>
          <p className="text-xs text-white/60 mt-0.5">
            Resumen operativo y métricas de manufactura SULA MOB en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden sm:flex items-center">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5" />
            <input
              type="text"
              placeholder="Buscar en el panel..."
              className="bg-white/[0.07] border border-white/15 rounded-xl text-xs text-white pl-9 pr-3 py-2 outline-none focus:border-white/40 w-48 transition-all"
            />
          </div>

          <button
            onClick={() => void handleManualRefresh()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/15 backdrop-blur-md transition-all shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Sincronizar
          </button>
        </div>
      </div>

      {/* BLOQUE SUPERIOR 1: MÉTIRCAS EN TARJETAS DE PASTEL Y GRÁFICO DE LÍNEAS DE RENDIMIENTO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* TARJETAS RESUMEN DE KPIs (ESTILO SOFT GLASS PASTEL) */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white">Resumen Diario de Órdenes</h2>
              <p className="text-[11px] text-white/50">Métricas acumuladas del turno</p>
            </div>
            <button className="flex items-center gap-1.5 text-[11px] text-white/70 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 transition-colors">
              <Download className="w-3 h-3" /> Reporte
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            {/* KPI 1: Órdenes Totales (Acento Azul Suave) */}
            <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 space-y-2 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-2xl font-black text-white">{stats.total}</div>
                <div className="text-[10px] font-medium text-sky-200/70 mt-0.5">Órdenes Totales</div>
              </div>
            </div>

            {/* KPI 2: En Proceso (Acento Ámbar Suave) */}
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 space-y-2 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-2xl font-black text-amber-300">{stats.enProceso}</div>
                <div className="text-[10px] font-medium text-amber-200/70 mt-0.5">En Proceso</div>
              </div>
            </div>

            {/* KPI 3: Completadas (Acento Esmeralda Suave) */}
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 space-y-2 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-300">{stats.completados}</div>
                <div className="text-[10px] font-medium text-emerald-200/70 mt-0.5">Completadas</div>
              </div>
            </div>

            {/* KPI 4: Incidencias (Acento Rojo Sutil) */}
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
        </div>

        {/* GRÁFICO TIPO TRENDS DE CLIENTES Y VISITAS */}
        <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white">Rendimiento Taller</h2>
              <p className="text-[11px] text-white/50">Comportamiento semanal</p>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              +14%
            </span>
          </div>

          {/* ONDAS ILUSTRATIVAS SIMULANDO VISITOR INSIGHTS DEL COMPONENTE DABANG */}
          <div className="h-28 w-full flex items-end justify-between gap-1.5 px-2 pt-2">
            {[40, 65, 30, 85, 55, 90, 70, 95, 60, 80].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                <div 
                  className="w-full bg-gradient-to-t from-sky-500 via-indigo-400 to-emerald-400 rounded-t-md opacity-70 group-hover:opacity-100 transition-all duration-300"
                  style={{ height: `${h}%` }}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center text-[10px] text-white/50 pt-1 border-t border-white/10">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400" />Corte</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-400" />Soldadura</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Empaque</span>
          </div>
        </div>

      </div>

      {/* BLOQUE MEDIO 2: GRÁFICOS COMPARATIVOS DE BARRAS Y LISTA DESTACADA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRÁFICO COMPARATIVO DE AVANCE DE PROYECTOS (ESTILO REVENUE BARS) */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-6">
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-sky-400" /> Avance Comparativo por Orden
              </h3>
              <p className="text-xs text-white/60">Porcentaje de fabricación respecto al tiempo estimado.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/60">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Progreso</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-white/20" /> Meta</span>
            </div>
          </div>

          <div className="space-y-4">
            {proyectos.length === 0 ? (
              <p className="text-xs text-white/50 text-center py-10">No hay proyectos activos para mostrar.</p>
            ) : (
              proyectos.map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">{p.codigo} — {p.nombre}</span>
                    <span className="font-mono text-emerald-400 font-bold">{p.progreso}%</span>
                  </div>
                  
                  {/* Barra Doble Típica del Dashboard Dabang */}
                  <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/10 p-0.5 flex gap-1">
                    <div 
                      className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all duration-700 shadow-sm"
                      style={{ width: `${p.progreso}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* LISTA DESTACADA PROYECTOS / CLIENTES (TOP PRODUCTS DABANG LOOK) */}
        <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4">
          <div className="border-b border-white/10 pb-3 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-white">Proyectos Principales</h3>
              <p className="text-[11px] text-white/50">Clientes activos</p>
            </div>
            <Users className="w-4 h-4 text-white/40" />
          </div>

          <div className="space-y-3">
            {proyectos.slice(0, 4).map((p, idx) => (
              <div key={p.id} className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-white/40 font-mono">0{idx + 1}</span>
                  <div>
                    <h4 className="text-xs font-bold text-white">{p.nombre}</h4>
                    <p className="text-[10px] text-white/50">{p.cliente || 'Cliente Comercial'}</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  {p.progreso}%
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* BLOQUE INFERIOR 3: RADAR DE ESTACIONES CON IMÁGENES INDUSTRIALES Y MAPEO */}
      <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4">
        <div className="border-b border-white/10 pb-3 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" /> Estado de Estaciones en Planta
            </h3>
            <p className="text-[11px] text-white/50">Monitoreo dinámico por área de manufactura</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {areas.map((a) => {
            const bgImg = getAreaImage(a.nombre);
            return (
              <div 
                key={a.id}
                className="relative overflow-hidden rounded-2xl border border-white/15 p-3 flex items-center justify-between bg-cover bg-center transition-all hover:border-white/40"
                style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.92), rgba(18,24,36,0.8)), url('${bgImg}')` }}
              >
                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900/80 border border-white/20 overflow-hidden relative shrink-0">
                    <Image src={bgImg} alt={a.nombre} fill className="object-cover" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{a.nombre}</h4>
                    <span className="text-[10px] text-white/50">Estación activa</span>
                  </div>
                </div>

                <span className={`relative z-10 text-[10px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-md ${
                  a.activo ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' : 'bg-black/60 text-white/40 border-white/10'
                }`}>
                  {a.activo ? 'Online' : 'Offline'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}