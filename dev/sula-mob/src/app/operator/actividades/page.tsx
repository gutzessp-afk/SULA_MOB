
'use client'

import { useEffect, useState } from 'react'
import KanbanBoard from '@/components/operator/kanban-board'
import type { Activity } from '@/components/operator/activity-card'
import { getActividades } from '../dashboard-actions'

export default function ActividadesPage() {
  const [cargando, setCargando] = useState(true)
  const [activities, setActivities] = useState<Activity[]>([])

  useEffect(() => {
    getActividades().then((data) => {
      setActivities(data)
      setCargando(false)
    })
  }, [])

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
        <h1 className="text-xl font-black text-white tracking-wider uppercase">
          Mis <span className="text-red-600">Actividades</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Módulos de cada proyecto, organizados por estado. Se actualizan solos con tus avances.
        </p>
      </div>

      {cargando ? (
        <div className="bg-[#0e1017]/80 border border-slate-800 p-6 rounded-2xl text-slate-400 text-sm">
          Cargando actividades...
        </div>
      ) : activities.length === 0 ? (
        <div className="bg-[#0e1017]/80 border border-slate-800 p-6 rounded-2xl text-slate-500 text-sm text-center">
          Todavía no hay actividades. Aparecen cuando el administrador carga proyectos con sus módulos.
        </div>
      ) : (
        <KanbanBoard activities={activities} />
      )}
    </div>
  )
}