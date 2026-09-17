
'use client'

import ActivityCard, { Activity, ActivityStatus } from './activity-card'

// Tablero Kanban de actividades del operador.
// Organiza las actividades en columnas según su estado. Responsable: Dev 3.

interface KanbanBoardProps {
  activities: Activity[]
}

const columns: { status: ActivityStatus; title: string }[] = [
  { status: 'pendiente', title: 'Pendiente' },
  { status: 'en_proceso', title: 'En Proceso' },
  { status: 'completado', title: 'Completado' },
]

export default function KanbanBoard({ activities }: KanbanBoardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((col) => {
        const items = activities.filter((a) => a.status === col.status)

        return (
          <div
            key={col.status}
            className="bg-[#0e1017]/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {col.title}
              </h3>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            </div>

            <div className="space-y-3 flex-1 min-h-[100px]">
              {items.length === 0 ? (
                <p className="text-[11px] text-slate-600 text-center py-6">
                  Sin actividades
                </p>
              ) : (
                items.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}