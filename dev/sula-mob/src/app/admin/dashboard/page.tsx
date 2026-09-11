'use client'

import { 
  FolderKanban, 
  Layers, 
  Users, 
  Activity, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  AlertTriangle 
} from 'lucide-react'

export default function AdminDashboardPage() {
  // Datos simulados (puedes conectarlos a tu base de datos de Supabase más adelante)
  const stats = [
    { title: 'Proyectos Activos', value: '12', change: '+2 este mes', icon: FolderKanban, color: 'text-red-500', bg: 'bg-red-500/10' },
    { title: 'Áreas Operativas', value: '8', change: '100% operativas', icon: Layers, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Operadores en Turno', value: '34', change: 'Activos ahora', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { title: 'Eficiencia Global', value: '94.2%', change: '+1.5% vs ayer', icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ]

  const areasStatus = [
    { name: 'Corte Láser', progress: 85, status: 'Normal', statusColor: 'text-emerald-400 bg-emerald-950/50 border-emerald-800' },
    { name: 'Doblez y CNC', progress: 62, status: 'Atención', statusColor: 'text-amber-400 bg-amber-950/50 border-amber-800' },
    { name: 'Soldadura', progress: 90, status: 'Normal', statusColor: 'text-emerald-400 bg-emerald-950/50 border-emerald-800' },
    { name: 'Ensamblaje', progress: 45, status: 'Retrasado', statusColor: 'text-red-400 bg-red-950/50 border-red-800' },
    { name: 'Pintura y Acabados', progress: 78, status: 'Normal', statusColor: 'text-emerald-400 bg-emerald-950/50 border-emerald-800' },
  ]

  const recentActivity = [
    { id: 1, user: 'Carlos Mendoza', action: 'Completó lote de piezas #402', area: 'Corte Láser', time: 'Hace 5 min', type: 'success' },
    { id: 2, user: 'Roberto Gómez', action: 'Reportó incidencia de material', area: 'Doblez y CNC', time: 'Hace 15 min', type: 'warning' },
    { id: 3, user: 'Ana Torres', action: 'Inició turno y escaneo de orden', area: 'Ensamblaje', time: 'Hace 32 min', type: 'info' },
    { id: 4, user: 'Admin System', action: 'Actualizó catálogo de productos TEGEC', area: 'Sistema', time: 'Hace 1 hora', type: 'info' },
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* Título de Bienvenida */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-xl font-black text-white tracking-wider uppercase">
            Panel de Control <span className="text-red-600">General</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitoreo en tiempo real de áreas, producción y rendimiento de operadores.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/80">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Sistema Conectado
          </span>
        </div>
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
                <span className="text-[10px] text-slate-500 mt-1 block font-medium">{stat.change}</span>
              </div>
              <div className={`p-3.5 rounded-xl ${stat.bg} ${stat.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Sección Inferior: Estado por Área y Actividad Reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Estado por Área (Ocupa 2 columnas) */}
        <div className="lg:col-span-2 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-red-600" />
              Estado de Producción por Área
            </h2>
            <span className="text-xs text-slate-400">Progreso general</span>
          </div>

          <div className="space-y-5 flex-1">
            {areasStatus.map((area, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">{area.name}</span>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] border ${area.statusColor}`}>
                      {area.status}
                    </span>
                    <span className="text-white font-mono">{area.progress}%</span>
                  </div>
                </div>
                <div className="w-full bg-[#08090d] h-2 rounded-full overflow-hidden border border-slate-800/60">
                  <div 
                    className="bg-gradient-to-r from-red-600 to-red-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${area.progress}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actividad Reciente (Ocupa 1 columna) */}
        <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-600" />
              Actividad Reciente
            </h2>
          </div>

          <div className="space-y-4 flex-1">
            {recentActivity.map((act) => (
              <div key={act.id} className="flex items-start gap-3 pb-3 border-b border-slate-800/60 last:border-0 last:pb-0">
                <div className="mt-0.5">
                  {act.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {act.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  {act.type === 'info' && <Clock className="w-4 h-4 text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{act.action}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-400 font-semibold">{act.user} • <span className="text-red-500">{act.area}</span></span>
                    <span className="text-[10px] text-slate-600">{act.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}