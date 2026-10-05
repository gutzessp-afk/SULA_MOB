
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  Package,
  Bell,
  PlusCircle,
  AlertOctagon,
  ClipboardList,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'
import { getResumenDashboard, type ResumenDashboard } from './dashboard-actions'
import { getNotificaciones, type Notificacion } from './notificaciones-actions'

function inicioDelDiaISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function tiempoRelativo(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'Ahora'
  if (minutos < 60) return `Hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `Hace ${horas} h`
  return `Hace ${Math.floor(horas / 24)} d`
}

export default function OperatorDashboardPage() {
  const [cargando, setCargando] = useState(true)
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [avisos, setAvisos] = useState<Notificacion[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    async function cargar() {
      const [r, n] = await Promise.all([
        getResumenDashboard(inicioDelDiaISO()),
        getNotificaciones(5),
      ])
      setResumen(r)
      setAvisos(n)
      setCargando(false)
    }
    cargar()
  }, [])

  if (cargando || !resumen) {
    return (
      <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl text-slate-400 text-sm">
        Cargando tu resumen...
      </div>
    )
  }

  const stats = [
    { title: 'Proyectos Asignados', value: String(resumen.proyectos.length), icon: FolderKanban, color: 'text-red-500', bg: 'bg-red-500/10' },
    { title: 'Actividades Pendientes', value: String(resumen.pendientes), icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { title: 'Actividades Realizadas', value: String(resumen.realizadas), icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { title: 'Producción del Día', value: `${resumen.piezasHoy} pzs`, icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  ]

  const accesos = [
    { href: '/operator/avances', texto: 'Registrar Avance', icon: PlusCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', borde: 'hover:border-emerald-700' },
    { href: '/operator/retrasos', texto: 'Reportar Retraso', icon: AlertOctagon, color: 'text-red-500', bg: 'bg-red-500/10', borde: 'hover:border-red-700' },
    { href: '/operator/actividades', texto: 'Ver Actividades', icon: ClipboardList, color: 'text-blue-500', bg: 'bg-blue-500/10', borde: 'hover:border-blue-700' },
  ]

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
        <h1 className="text-xl font-black text-white tracking-wider uppercase">
          Mi <span className="text-red-600">Dashboard</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Resumen de tus proyectos, actividades y producción de hoy.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {accesos.map((a) => {
          const Icon = a.icon
          return (
            <Link
              key={a.href}
              href={a.href}
              className={`flex items-center gap-3 bg-[#0e1017]/80 border border-slate-800 ${a.borde} p-4 rounded-2xl transition group`}
            >
              <div className={`p-2.5 rounded-xl ${a.bg} ${a.color} group-hover:scale-110 transition`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-wide">{a.texto}</span>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.title}
              className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {stat.title}
                </p>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-1">{stat.value}</h3>
              </div>
              <div className={`p-2.5 sm:p-3.5 rounded-xl flex-shrink-0 ${stat.bg} ${stat.color}`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Proyectos asignados */}
          <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-red-600" />
              Proyectos Asignados
            </h2>
            <p className="text-[11px] text-slate-500 mb-5">
              Los sube el administrador. Aquí solo puedes consultarlos.
            </p>

            {resumen.proyectos.length === 0 && (
              <p className="text-xs text-slate-600">Todavía no hay proyectos cargados.</p>
            )}

            <div className="space-y-4">
              {resumen.proyectos.map((p) => (
                <div key={p.id} className="space-y-2">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-slate-200 font-semibold truncate">{p.nombre}</span>
                    <span className="text-slate-500 text-xs flex-shrink-0">{p.progreso}%</span>
                  </div>
                  <div className="w-full bg-[#08090d] h-2 rounded-full overflow-hidden border border-slate-800/60">
                    <div
                      className="bg-gradient-to-r from-red-600 to-red-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${p.progreso}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-600 truncate">
                    {p.codigo}
                    {p.cliente ? ` · ${p.cliente}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Producción del día */}
          <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-red-600" />
              Producción del día
            </h2>
            <p className="text-[11px] text-slate-500 mb-5">
              Toca un proyecto para ver qué módulos avanzaste.
            </p>

            {resumen.produccion.length === 0 && (
              <p className="text-xs text-slate-600">Todavía no registras piezas hoy.</p>
            )}

            <div className="space-y-2">
              {resumen.produccion.map((g) => {
                const activo = abierto === g.proyecto
                return (
                  <div key={g.proyecto} className="border border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setAbierto(activo ? null : g.proyecto)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/30 transition"
                    >
                      <span className="text-sm font-semibold text-white truncate">{g.proyecto}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">{g.total} pzs</span>
                        <ChevronRight
                          className={`w-4 h-4 text-slate-500 transition-transform ${activo ? 'rotate-90' : ''}`}
                        />
                      </span>
                    </button>

                    {activo && (
                      <div className="border-t border-slate-800 bg-[#08090d]/60 px-4 py-2">
                        {g.lineas.map((l, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 py-2 border-b border-slate-800/50 last:border-0 text-xs"
                          >
                            <span className="text-slate-300 min-w-0">
                              <span className="text-slate-500">{l.hora} · </span>
                              {l.area}
                              {l.operacion ? ` · ${l.operacion}` : ''}
                            </span>
                            <span className="text-white font-bold flex-shrink-0">{l.piezas}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Notificaciones */}
        <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl h-fit">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-5">
            <Bell className="w-4 h-4 text-red-600" />
            Notificaciones
          </h2>

          {avisos.length === 0 && (
            <p className="text-xs text-slate-600">No tienes notificaciones todavía.</p>
          )}

          <div className="space-y-4">
            {avisos.map((n) => (
              <div key={n.id} className="pb-3 border-b border-slate-800/60 last:border-0 last:pb-0">
                <p className={`text-xs font-medium ${n.leida ? 'text-slate-400' : 'text-white'}`}>
                  {n.mensaje}
                </p>
                <span className="text-[10px] text-slate-600">{tiempoRelativo(n.createdAt)}</span>
              </div>
            ))}
          </div>

          <Link
            href="/operator/notificaciones"
            className="block mt-5 text-center text-[11px] font-bold uppercase tracking-wide text-red-500 hover:text-red-400 transition"
          >
            Ver todas
          </Link>
        </div>
      </div>
    </div>
  )
}