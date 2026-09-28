
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  BellOff,
  CheckCheck,
  FolderPlus,
  AlertOctagon,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react'
import {
  getNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  type Notificacion,
} from '../notificaciones-actions'

interface ConfigTipo {
  icono: LucideIcon
  color: string
  fondo: string
  etiqueta: string
  ruta: string | null
}

function configTipo(tipo: string): ConfigTipo {
  switch (tipo) {
    case 'nuevo_proyecto':
      return {
        icono: FolderPlus,
        color: 'text-red-500',
        fondo: 'bg-red-500/10',
        etiqueta: 'Nuevo proyecto',
        ruta: '/operator/avances',
      }
    case 'retraso':
      return {
        icono: AlertOctagon,
        color: 'text-amber-500',
        fondo: 'bg-amber-500/10',
        etiqueta: 'Retraso',
        ruta: null,
      }
    case 'comentario':
      return {
        icono: MessageSquare,
        color: 'text-emerald-500',
        fondo: 'bg-emerald-500/10',
        etiqueta: 'Comentario',
        ruta: null,
      }
    default:
      return {
        icono: Bell,
        color: 'text-blue-400',
        fondo: 'bg-blue-500/10',
        etiqueta: 'Aviso',
        ruta: null,
      }
  }
}

function tiempoRelativo(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'Ahora'
  if (minutos < 60) return `Hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `Hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return `Hace ${dias} d`
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NotificacionesPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [filtro, setFiltro] = useState<'todas' | 'sin_leer'>('todas')

  const cargar = useCallback(async () => {
    const data = await getNotificaciones(50)
    setNotificaciones(data)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    const intervalo = setInterval(cargar, 30000)
    window.addEventListener('notificaciones-actualizadas', cargar)
    return () => {
      clearInterval(intervalo)
      window.removeEventListener('notificaciones-actualizadas', cargar)
    }
  }, [cargar])

  const sinLeer = notificaciones.filter((n) => !n.leida).length
  const visibles =
    filtro === 'sin_leer' ? notificaciones.filter((n) => !n.leida) : notificaciones

  async function abrir(n: Notificacion) {
    const cfg = configTipo(n.tipo)

    if (!n.leida) {
      setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)))
      await marcarNotificacionLeida(n.id)
      window.dispatchEvent(new Event('notificaciones-actualizadas'))
    }

    if (cfg.ruta) router.push(cfg.ruta)
  }

  async function leerTodas() {
    setNotificaciones((prev) => prev.map((x) => ({ ...x, leida: true })))
    await marcarTodasLeidas()
    window.dispatchEvent(new Event('notificaciones-actualizadas'))
  }

  if (cargando) {
    return (
      <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl text-slate-400 text-sm">
        Cargando notificaciones...
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
            <Bell className="w-5 h-5 text-red-600" />
            Mis <span className="text-red-600">Notificaciones</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {sinLeer > 0
              ? `Tienes ${sinLeer} ${sinLeer === 1 ? 'aviso sin leer' : 'avisos sin leer'}`
              : 'Est├ís al d├¡a, no tienes avisos pendientes'}
          </p>
        </div>

        <button
          onClick={leerTodas}
          disabled={sinLeer === 0}
          className="flex items-center justify-center gap-2 border border-slate-800 hover:border-slate-600 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:border-slate-800 disabled:hover:text-slate-300 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-xl transition"
        >
          <CheckCheck className="w-4 h-4" />
          Marcar todas como le├¡das
        </button>
      </div>

      <div className="flex gap-2">
        {(
          [
            ['todas', `Todas (${notificaciones.length})`],
            ['sin_leer', `Sin leer (${sinLeer})`],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setFiltro(valor)}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition ${
              filtro === valor
                ? 'bg-red-700 border-red-700 text-white'
                : 'bg-[#0e1017]/80 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {visibles.length === 0 && (
        <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <BellOff className="w-8 h-8 text-slate-700 mx-auto" />
          <p className="text-sm text-slate-500">
            {filtro === 'sin_leer'
              ? 'No tienes notificaciones sin leer.'
              : 'Todav├¡a no tienes notificaciones.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {visibles.map((n) => {
          const cfg = configTipo(n.tipo)
          const Icono = cfg.icono

          return (
            <button
              key={n.id}
              onClick={() => abrir(n)}
              className={`w-full text-left flex items-start gap-3 p-4 rounded-2xl border transition hover:border-slate-600 ${
                n.leida
                  ? 'bg-[#0e1017]/60 border-slate-800/70'
                  : 'bg-[#0e1017]/90 border-red-900/50 shadow-lg shadow-red-950/20'
              }`}
            >
              <div className={`p-2.5 rounded-xl flex-shrink-0 ${cfg.fondo} ${cfg.color}`}>
                <Icono className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
                    {cfg.etiqueta}
                  </span>
                  <span className="text-[10px] text-slate-500 flex-shrink-0">
                    {tiempoRelativo(n.createdAt)}
                  </span>
                </div>

                <p
                  className={`text-sm leading-snug break-words ${
                    n.leida ? 'text-slate-400' : 'text-white font-medium'
                  }`}
                >
                  {n.mensaje}
                </p>

                <p className="text-[11px] text-slate-600 break-words">
                  De: {n.remitenteNombre ?? 'Sistema'}
                  {n.proyectoNombre ? ` ┬À ${n.proyectoNombre}` : ''} ┬À {fechaCorta(n.createdAt)}
                </p>
              </div>

              {!n.leida && (
                <span className="w-2.5 h-2.5 mt-1 rounded-full bg-red-600 flex-shrink-0" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
