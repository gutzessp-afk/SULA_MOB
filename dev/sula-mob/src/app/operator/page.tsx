
'use client'

import Link from 'next/link'
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  TrendingUp,
  Package,
  Bell,
  PlusCircle,
  AlertOctagon,
  ClipboardList,
} from 'lucide-react'

// Dashboard del operador (/operator/dashboard).
// Muestra las actividades del área del operador logueado. Responsable: Dev 3.
export default function OperatorDashboardPage() {
  // Datos simulados (se conectarán a Supabase más adelante)
  const stats = [
    { title: 'Proyectos Asignados', value: '3', icon: FolderKanban, color: 'text-red-500', bg: 'bg-red-500/10' },
    { title: 'Actividades Pendientes', value: '5', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { title: 'Actividades Realizadas', value: '12', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { title: 'Producción del Día', value: '184 pzs', icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  ]

  const proyectoActual = {
    nombre: 'Proyecto ABC',
    area: 'Ensamblaje',
    avance: 62,
  }

  const notificaciones = [
    { id: 1, mensaje: 'Nueva orden asignada en Ensamblaje', tiempo: 'Hace 10 min', urgente: false },
    { id: 2, mensaje: 'El administrador solicitó actualizar avance', tiempo: 'Hace 40 min', urgente: true },
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* Título */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-xl font-black text-white tracking-wider uppercase">
            Mi <span className="text-red-600">Dashboard</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Resumen de tus proyectos, actividades y producción de hoy.
          </p>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/operator/avances"
          className="flex items-center gap-3 bg-[#0e1017]/80 border border-slate-800 hover:border-emerald-700 p-4 rounded-2xl transition group"
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition">
            <PlusCircle className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-white uppercase tracking-wide">Registrar Avance</span>
        </Link>

        <Link
          href="/operator/retrasos"
          className="flex items-center gap-3 bg-[#0e1017]/80 border border-slate-800 hover:border-red-700 p-4 rounded-2xl transition group"
        >
          <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 group-hover:scale-110 transition">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-white uppercase tracking-wide">Reportar Retraso</span>
        </Link>

        <Link
          href="/operator/produccion"
          className="flex items-center gap-3 bg-[#0e1017]/80 border border-slate-800 hover:border-blue-700 p-4 rounded-2xl transition group"
        >
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition">
            <ClipboardList className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-white uppercase tracking-wide">Registrar Producción</span>
        </Link>
      </div>

      {/* Tarjetas de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div
              key={index}
              className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 rounded-2xl shadow-xl flex items-center justify-between transition hover:border-slate-700"
            >
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{stat.title}</p>
                <h3 className="text-2xl font-black text-white mt-1">{stat.value}</h3>
              </div>
              <div className={`p-3.5 rounded-xl ${stat.bg} ${stat.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Proyecto actual + Notificaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Proyecto actual (2 columnas) */}
        <div className="lg:col-span-2 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-6">
            <TrendingUp className="w-4 h-4 text-red-600" />
            Proyecto Actual
          </h2>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-300 font-semibold">{proyectoActual.nombre}</span>
              <span className="text-slate-500 text-xs">Área: {proyectoActual.area}</span>
            </div>
            <div className="w-full bg-[#08090d] h-2 rounded-full overflow-hidden border border-slate-800/60">
              <div
                className="bg-gradient-to-r from-red-600 to-red-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${proyectoActual.avance}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">{proyectoActual.avance}% completado</p>
          </div>
        </div>

        {/* Notificaciones (1 columna) */}
        <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-6">
            <Bell className="w-4 h-4 text-red-600" />
            Notificaciones
          </h2>

          <div className="space-y-4">
            {notificaciones.map((n) => (
              <div key={n.id} className="pb-3 border-b border-slate-800/60 last:border-0 last:pb-0">
                <p className={`text-xs font-medium ${n.urgente ? 'text-red-400' : 'text-white'}`}>
                  {n.mensaje}
                </p>
                <span className="text-[10px] text-slate-600">{n.tiempo}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
