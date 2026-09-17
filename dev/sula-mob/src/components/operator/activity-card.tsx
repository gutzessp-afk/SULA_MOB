
import { Clock, CheckCircle2, AlertTriangle } from 'lucide-react'

// Tarjeta individual de una actividad para el tablero Kanban del operador.
// Responsable: Dev 3.

export type ActivityStatus = 'pendiente' | 'en_proceso' | 'completado'

export interface Activity {
  id: string
  proyecto: string
  area: string
  descripcion: string
  status: ActivityStatus
  fecha: string
}

const statusConfig = {
  pendiente: {
    label: 'Pendiente',
    icon: Clock,
    color: 'text-amber-400',
    bg: 'bg-amber-950/50',
    border: 'border-amber-800/60',
  },
  en_proceso: {
    label: 'En Proceso',
    icon: AlertTriangle,
    color: 'text-blue-400',
    bg: 'bg-blue-950/50',
    border: 'border-blue-800/60',
  },
  completado: {
    label: 'Completado',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/50',
    border: 'border-emerald-800/60',
  },
}

export default function ActivityCard({ activity }: { activity: Activity }) {
  const config = statusConfig[activity.status]
  const Icon = config.icon

  return (
    <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition cursor-pointer">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white truncate">{activity.proyecto}</span>
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border ${config.bg} ${config.color} ${config.border}`}>
          <Icon className="w-3 h-3" />
          {config.label}
        </span>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">{activity.descripcion}</p>
      <div className="flex items-center justify-between text-[10px] text-slate-600">
        <span className="text-red-500 font-semibold">{activity.area}</span>
        <span>{activity.fecha}</span>
      </div>
    </div>
  )
}