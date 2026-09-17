'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FolderKanban, Factory, FileSpreadsheet, Users, Bell, ArrowRight, Sparkles } from 'lucide-react';

export default function DashboardPage() {
  const [counts, setCounts] = useState({ proyectos: 0, areas: 0, operadores: 0, notificaciones: 0 });

  useEffect(() => {
    async function loadStats() {
      const [{ count: pCount }, { count: aCount }, { count: uCount }, { count: nCount }] = await Promise.all([
        supabase.from('proyectos').select('*', { count: 'exact', head: true }),
        supabase.from('areas').select('*', { count: 'exact', head: true }),
        supabase.from('usuarios').select('*', { count: 'exact', head: true }),
        supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leido', false)
      ]);

      setCounts({
        proyectos: pCount || 0,
        areas: aCount || 0,
        operadores: uCount || 0,
        notificaciones: nCount || 0
      });
    }
    void loadStats();
  }, []);

  const accesosRapidos = [
    { title: 'Gestión de Proyectos', desc: 'Crear, editar u ordenes en PDF', href: '/admin/proyectos', icon: FolderKanban },
    { title: 'Áreas de Producción', desc: 'Monitorear estaciones fijas', href: '/admin/actividades', icon: Factory },
    { title: 'Notificaciones', desc: `Mensajes de operadores`, href: '/admin/notificaciones', icon: Bell, badge: counts.notificaciones },
    { title: 'Reportes', desc: 'Métricas de desempeño e incidentes', href: '/admin/reportes', icon: FileSpreadsheet },
    { title: 'Usuarios', desc: 'Administración de roles u operadores', href: '/admin/usuarios', icon: Users },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* BANNER ESTILO HERO / YAMAHA CONCEPT */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-br from-[#121824] via-[#0E131F] to-[#070A0F] p-6 sm:p-10 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/60 border border-red-500/30 text-red-400 text-xs font-bold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5" /> Control de Manufactura SULA MOB
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              Cada proyecto, <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-400 to-amber-200">
                cada área, cada pieza.
              </span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-base font-normal">
              Seguimiento de producción en tiempo real, trazabilidad por áreas y comunicación directa con operadores.
            </p>
          </div>

          {/* MÉTRICAS FLOTANTES RESPONSIVAS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3 bg-[#070A0F]/60 backdrop-blur-xl border border-slate-800/80 p-4 rounded-2xl shadow-inner">
            <div className="text-center p-3 rounded-xl bg-slate-900/40 border border-slate-800/40">
              <div className="text-2xl sm:text-3xl font-black text-white">{counts.proyectos}</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Proyectos</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-slate-900/40 border border-slate-800/40">
              <div className="text-2xl sm:text-3xl font-black text-white">{counts.areas}</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Áreas</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-slate-900/40 border border-slate-800/40">
              <div className="text-2xl sm:text-3xl font-black text-white">{counts.operadores}</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Usuarios</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-red-950/20 border border-red-900/30">
              <div className="text-2xl sm:text-3xl font-black text-red-500">{counts.notificaciones}</div>
              <div className="text-[10px] font-bold text-red-400/80 uppercase tracking-widest mt-0.5">Avisos</div>
            </div>
          </div>
        </div>
      </div>

      {/* TARJETAS DE ACCESO RÁPIDO */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-black text-white tracking-wider uppercase">Accesos Rápidos</h2>
          <p className="text-xs text-slate-400">Selecciona un módulo para gestionar la planta de producción.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {accesosRapidos.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                href={card.href}
                className="group relative bg-[#0E131F]/80 hover:bg-[#121824] border border-slate-800/80 hover:border-red-500/50 p-6 rounded-2xl flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 shadow-xl hover:shadow-red-950/20 overflow-hidden"
              >
                {card.badge && card.badge > 0 ? (
                  <span className="absolute top-4 right-4 bg-red-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full animate-pulse shadow-md shadow-red-600/40">
                    {card.badge} NUEVOS
                  </span>
                ) : null}

                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-red-500 group-hover:border-red-500/30 transition-all duration-300">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-red-400 transition-colors">{card.title}</h3>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed">{card.desc}</p>
                  </div>
                </div>

                <div className="pt-6 flex items-center gap-2 text-xs font-bold text-red-500 uppercase tracking-wider">
                  <span>Abrir Módulo</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}