'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FolderKanban, Factory, FileSpreadsheet, Users, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const [counts, setCounts] = useState({ proyectos: 0, areas: 0, operadores: 0 });

  useEffect(() => {
    async function loadStats() {
      const [{ count: pCount }, { count: aCount }, { count: uCount }] = await Promise.all([
        supabase.from('proyectos').select('*', { count: 'exact', head: true }),
        supabase.from('areas').select('*', { count: 'exact', head: true }),
        supabase.from('usuarios').select('*', { count: 'exact', head: true })
      ]);

      setCounts({
        proyectos: pCount || 0,
        areas: aCount || 0,
        operadores: uCount || 0
      });
    }
    void loadStats();
  }, []);

  const accesosRapidos = [
    { title: 'Gestión de Proyectos', desc: 'Crear, editar y dar seguimiento a órdenes o escanear PDF', href: '/admin/proyectos', icon: FolderKanban },
    { title: 'Áreas de Producción', desc: 'Monitorear las estaciones de trabajo', href: '/admin/actividades', icon: Factory },
    { title: 'Reportes', desc: 'Métricas de desempeño e incidentes', href: '/admin/reportes', icon: FileSpreadsheet },
    { title: 'Usuarios', desc: 'Administración de roles u operadores', href: '/admin/usuarios', icon: Users },
  ];

  return (
    <div className="p-8 space-y-8 bg-[#0B0F17] min-h-screen text-slate-100">
      {/* Banner Principal */}
      <div className="bg-[#121824] border border-slate-800 rounded-2xl p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-wider text-white">SULA MOB</span>
            <span className="text-[10px] font-bold bg-red-950/80 text-red-500 border border-red-800/50 px-2.5 py-0.5 rounded-full uppercase tracking-wide">
              Control de Manufactura
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Cada proyecto, cada área, cada pieza.</h1>
          <p className="text-slate-400 text-sm">Seguimiento de proyectos por área, registro de producción y reportes en un solo lugar.</p>
        </div>

        {/* Métricas Dinámicas */}
        <div className="flex items-center gap-8 bg-[#0B0F17]/60 border border-slate-800/80 px-6 py-4 rounded-xl">
          <div className="text-center">
            <div className="text-3xl font-black text-white">{counts.proyectos}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Proyectos</div>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div className="text-center">
            <div className="text-3xl font-black text-white">{counts.areas}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Áreas</div>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div className="text-center">
            <div className="text-3xl font-black text-white">{counts.operadores}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Usuarios</div>
          </div>
        </div>
      </div>

      {/* Grid de Accesos Rápidos */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white uppercase tracking-wider">Accesos Rápidos</h2>
        <p className="text-xs text-slate-400">Selecciona un módulo del menú o accede directamente desde aquí.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5 pt-2">
          {accesosRapidos.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="bg-[#121824] border border-slate-800 hover:border-slate-700 p-6 rounded-2xl space-y-4 flex flex-col justify-between transition-all">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-red-500">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{card.title}</h3>
                  <p className="text-slate-400 text-xs">{card.desc}</p>
                </div>
                <Link href={card.href} className="inline-flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-400 uppercase tracking-wider pt-2">
                  Abrir Módulo <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}