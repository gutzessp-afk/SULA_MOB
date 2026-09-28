
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, FolderPlus, CheckCheck } from 'lucide-react'
import {
  getNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  type Notificacion,
} from '@/app/operator/notificaciones-actions'

function tiempoRelativo(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'Ahora'
  if (minutos < 60) return `Hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `Hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return `Hace ${dias} d`
}

export default function NotificacionesBell() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const contenedor = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    const data = await getNotificaciones()
    setNotificaciones(data)
  }, [])

  useEffect(() => {
    cargar()
    const intervalo = setInterval(cargar, 30000)
    return () => clearInterval(intervalo)
  }, [cargar])

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', alHacerClicFuera)
    return () => document.removeEventListener('mousedown', alHacerClicFuera)
  }, [])

  const sinLeer = notificaciones.filter((n) => !n.leida).length

  async function abrirNotificacion(n: Notificacion) {
    if (!n.leida) await marcarNotificacionLeida(n.id)
    setAbierto(false)
    router.push('/operator/avances')
    await cargar()
  }

  async function leerTodas() {
    await marcarTodasLeidas()
    await cargar()
  }

  return (
    <div className="relative" ref={contenedor}>
      <button
        onClick={() => setAbierto((a) => !a)}
        className="relative p-2 rounded-xl border border-slate-800 bg-[#0e1017]/60 text-slate-400 hover:text-white hover:border-slate-700 transition"
        aria-label="Notificaciones"
      >
        <Bell className="w-4 h-4" />
        {sinLeer > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[85vw] bg-[#0e1017] border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Notificaciones
            </span>
            {sinLeer > 0 && (
              <button
                onClick={leerTodas}
                className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 hover:text-white transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notificaciones.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-slate-600">
                No tienes notificaciones todavía
              </p>
            )}

            {notificaciones.map((n) => (
              <button
                key={n.id}
                onClick={() => abrirNotificacion(n)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40 transition ${
                  n.leida ? 'opacity-60' : ''
                }`}
              >
                <div className="p-2 rounded-lg bg-red-500/10 text-red-500 flex-shrink-0">
                  <FolderPlus className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white leading-snug">{n.mensaje}</p>
                  <span className="text-[10px] text-slate-600">{tiempoRelativo(n.createdAt)}</span>
                </div>
                {!n.leida && <span className="w-2 h-2 mt-1 rounded-full bg-red-600 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}