
'use client'

import KanbanBoard from '@/components/operator/kanban-board'
import { Activity } from '@/components/operator/activity-card'

// Página de actividades del operador (/operator/actividades).
// Muestra el tablero Kanban con las actividades asignadas. Responsable: Dev 3.
export default function ActividadesPage() {
  // Datos simulados (se conectarán a Supabase más adelante)
  const activities: Activity[] = [
    {
      id: '1',
      proyecto: 'Proyecto ABC',
      area: 'Ensamblaje',
      descripcion: 'Ensamblar lote de piezas #402',
      status: 'pendiente',
      fecha: '17/09/2026',
    },
    {
      id: '2',
      proyecto: 'Proyecto ABC',
      area: 'Ensamblaje',
      descripcion: 'Verificar calidad de soldadura',
      status: 'en_proceso',
      fecha: '17/09/2026',
    },
    {
      id: '3',
      proyecto: 'Proyecto XYZ',
      area: 'Empaque',
      descripcion: 'Empacar orden #189',
      status: 'en_proceso',
      fecha: '16/09/2026',
    },
    {
      id: '4',
      proyecto: 'Proyecto ABC',
      area: 'Ensamblaje',
      descripcion: 'Reportar avance de turno matutino',
      status: 'completado',
      fecha: '16/09/2026',
    },
    {
      id: '5',
      proyecto: 'Proyecto XYZ',
      area: 'Empaque',
      descripcion: 'Etiquetado de cajas',
      status: 'completado',
      fecha: '15/09/2026',
    },
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* Título */}
      <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
        <h1 className="text-xl font-black text-white tracking-wider uppercase">
          Mis <span className="text-red-600">Actividades</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Consulta y organiza tus actividades por estado.
        </p>
      </div>

      {/* Tablero Kanban */}
      <KanbanBoard activities={activities} />
    </div>
  )
}
