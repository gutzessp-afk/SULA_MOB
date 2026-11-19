'use client'

/**
 * CampanaErp.tsx — campana de avisos del panel ERP (/erp)
 * ────────────────────────────────────────────────────────
 * Copia adaptada de la campana del operador (no se importa de operator). Contador de no leídos,
 * lista (más nuevos arriba), clic → abre la explosión del pedido y marca leído, "Marcar todas".
 * Se actualiza en tiempo real (Supabase Realtime sobre notificaciones de este usuario) y, por si el
 * tiempo real no llega, cada 30 s con la pantalla a la vista.
 * Suena (playNotificacion, el mismo tono de la campana del admin) cuando llega un aviso nuevo, nunca en la
 * primera carga. El layout monta dos campanas (celular y escritorio): suena solo la que está a la vista.
 *
 * RUTA: src/components/erp/CampanaErp.tsx
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, PackageCheck, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useConsultaPeriodica } from '@/hooks/useConsultaPeriodica'
import { getAvisos, marcarAvisoLeido, marcarTodosLeidos, type AvisoErp } from '@/app/erp/notificaciones-actions'
import { playNotificacion } from '@/lib/mobiSound'

function tiempoRelativo(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'Ahora'
  if (minutos < 60) return `Hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `Hace ${horas} h`
  return `Hace ${Math.floor(horas / 24)} d`
}

export default function CampanaErp({ usuarioId }: { usuarioId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [avisos, setAvisos] = useState<AvisoErp[]>([])
  const [error, setError] = useState('')
  const contenedor = useRef<HTMLDivElement>(null)
  // El layout monta una campana para celular y otra para escritorio: cada una con su canal
  const instancia = useId()

  // Fecha del aviso más nuevo ya visto: null = primera carga (no suena)
  const masNuevo = useRef<number | null>(null)

  const cargar = useCallback(async () => {
    const r = await getAvisos()
    const ultimo = r.avisos.reduce((m, a) => Math.max(m, Date.parse(a.createdAt) || 0), 0)
    const anterior = masNuevo.current
    const visible = (contenedor.current?.getClientRects().length ?? 0) > 0
    if (anterior !== null && visible && r.avisos.some(a => !a.leida && Date.parse(a.createdAt) > anterior)) playNotificacion()
    if (!r.error) masNuevo.current = Math.max(anterior ?? 0, ultimo)
    setAvisos(r.avisos)
    setError(r.error ? 'No se pudieron cargar los avisos.' : '')
  }, [])

  useConsultaPeriodica(cargar, 30000)

  // Tiempo real: un aviso nuevo para este usuario recarga la lista
  useEffect(() => {
    if (!usuarioId) return
    const ch = supabase
      .channel(`campana-erp-${usuarioId}-${instancia}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones', filter: `destinatario_id=eq.${usuarioId}` }, () => void cargar())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [usuarioId, instancia, cargar])

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [])

  const sinLeer = avisos.filter(a => !a.leida).length

  async function abrir(a: AvisoErp) {
    setAbierto(false)
    if (!a.leida) {
      setAvisos(prev => prev.map(x => (x.id === a.id ? { ...x, leida: true } : x)))
      await marcarAvisoLeido(a.id)
    }
    router.push(a.explosionId ? `/erp/bom/${a.explosionId}` : '/erp/bom')
  }

  async function leerTodas() {
    setAvisos(prev => prev.map(x => ({ ...x, leida: true })))
    await marcarTodosLeidos()
    await cargar()
  }

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl border border-white/[0.1] bg-[#0b0f17]/70 backdrop-blur-xl text-slate-300 hover:text-white hover:border-white/20 transition"
        aria-label={sinLeer ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}
        aria-expanded={abierto}
      >
        <Bell className="w-[18px] h-[18px]" />
        {sinLeer > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-2rem)] bg-[#0d111a] border border-white/15 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] z-[60] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Avisos</span>
            {sinLeer > 0 && (
              <button type="button" onClick={() => void leerTodas()} className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 hover:text-white transition">
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {error && <p className="px-4 py-3 text-xs text-red-300">{error}</p>}
            {!error && avisos.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-500">No tienes avisos todavía</p>}
            {avisos.map(a => {
              const pago = a.tipo === 'bom_pago'
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => void abrir(a)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.05] transition ${a.leida ? 'opacity-60' : ''}`}
                >
                  <div className={`p-2 rounded-lg flex-shrink-0 ${pago ? 'bg-blue-500/15 text-blue-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                    {pago ? <Wallet className="w-3.5 h-3.5" /> : <PackageCheck className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white leading-snug">{a.mensaje}</p>
                    <span className="text-[10px] text-slate-500">{tiempoRelativo(a.createdAt)}</span>
                  </div>
                  {!a.leida && <span className="w-2 h-2 mt-1 rounded-full bg-red-600 flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
