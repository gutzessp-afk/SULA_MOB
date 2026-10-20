'use client'

/**
 * Notificaciones del operador — /operator/notificaciones
 * Solo muestra lo que el administrador le manda a los operadores (avisos, proyectos, comentarios).
 * Los proyectos nuevos no se descargan aquí: aparecen solos en "Registrar avance".
 *
 * RUTA: src/app/operator/notificaciones/page.tsx
 */

import { useEffect, useState } from 'react'
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
}

function configTipo(tipo: string): ConfigTipo {
  switch (tipo) {
    case 'nuevo_proyecto':
      return { icono: FolderPlus, color: 'text-red-500', fondo: 'bg-red-500/10', etiqueta: 'Nuevo proyecto' }
    case 'retraso':
      return { icono: AlertOctagon, color: 'text-amber-500', fondo: 'bg-amber-500/10', etiqueta: 'Retraso' }
    case 'comentario':
      return { icono: MessageSquare, color: 'text-emerald-500', fondo: 'bg-emerald-500/10', etiqueta: 'Comentario' }
    default:
      return { icono: Bell, color: 'text-blue-400', fondo: 'bg-blue-500/10', etiqueta: 'Aviso' }
  }
}

/** A dónde lleva el aviso al tocarlo: al proyecto si trae uno; los proyectos nuevos, a Registrar avance */
function rutaDe(n: Notificacion): string | null {
  if (n.proyectoId) return `/operator/avances/${n.proyectoId}`
  if (n.tipo === 'nuevo_proyecto') return '/operator/avances'
  return null
}

function tiempoRelativo(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'Ahora'
  if (minutos < 60) return `Hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `Hace ${horas} h`
  return `Hace ${Math.floor(horas / 24)} d`
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NotificacionesOperatorPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [filtro, setFiltro] = useState<'todas' | 'sin_leer'>('todas')

  // Se revisa cada 30 s y cuando otra pantalla marca avisos como leídos
  useEffect(() => {
    let vigente = true
    const cargar = () => {
      getNotificaciones(50).then((data) => {
        if (!vigente) return
        setNotificaciones(data)
        setCargando(false)
      })
    }
    cargar()
    const intervalo = setInterval(cargar, 30000)
    window.addEventListener('notificaciones-actualizadas', cargar)
    return () => {
      vigente = false
      clearInterval(intervalo)
      window.removeEventListener('notificaciones-actualizadas', cargar)
    }
  }, [])

  const sinLeer = notificaciones.filter((n) => !n.leida).length
  const visibles = filtro === 'sin_leer' ? notificaciones.filter((n) => !n.leida) : notificaciones

  async function abrir(n: Notificacion) {
    if (!n.leida) {
      setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)))
      await marcarNotificacionLeida(n.id)
      window.dispatchEvent(new Event('notificaciones-actualizadas'))
    }
    const ruta = rutaDe(n)
    if (ruta) router.push(ruta)
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
            <span className="text-red-600">Notificaciones</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {sinLeer > 0
              ? `Tienes ${sinLeer} ${sinLeer === 1 ? 'aviso sin leer' : 'avisos sin leer'} del administrador`
              : 'Estás al día: no hay avisos pendientes del administrador'}
          </p>
        </div>

        <button
          onClick={leerTodas}
          disabled={sinLeer === 0}
          className="min-h-[44px] flex items-center justify-center gap-2 border border-slate-800 hover:border-slate-600 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:border-slate-800 disabled:hover:text-slate-300 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-xl transition"
        >
          <CheckCheck className="w-4 h-4" />
          Marcar todas como leídas
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
            className={`min-h-[44px] flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition ${
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
              ? 'No hay avisos sin leer.'
              : 'Todavía no llegan avisos del administrador.'}
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
                  <span className="text-[10px] text-slate-500 flex-shrink-0">{tiempoRelativo(n.createdAt)}</span>
                </div>

                <p className={`text-sm leading-snug break-words ${n.leida ? 'text-slate-400' : 'text-white font-medium'}`}>
                  {n.mensaje}
                </p>

                <p className="text-[11px] text-slate-500 break-words">
                  De: {n.remitenteNombre ?? 'Administración'}
                  {n.proyectoNombre ? ` · ${n.proyectoNombre}` : ''} · {fechaCorta(n.createdAt)}
                </p>
              </div>

              {!n.leida && <span className="w-2.5 h-2.5 mt-1 rounded-full bg-red-600 flex-shrink-0" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
