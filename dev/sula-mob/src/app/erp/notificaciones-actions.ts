'use server'

/**
 * Avisos de la campana del panel ERP (src/components/erp/CampanaErp.tsx).
 *
 * Solo los de la sesión (notificaciones.destinatario_id = id de la cookie). Cada aviso trae la
 * explosión de su pedido para abrirla al dar clic (null en pedidos "sin alta": abre la lista).
 * Los escribe src/lib/notificar-erp.ts cuando finanzas o almacén cambian un estado.
 *
 * RUTA: src/app/erp/notificaciones-actions.ts
 */

import { cookies } from 'next/headers'
import { supabaseServidor } from '@/lib/admin-api'

export interface AvisoErp {
  id: string
  tipo: string
  mensaje: string
  leida: boolean
  explosionId: string | null
  createdAt: string
}

async function idSesion(): Promise<string | null> {
  try {
    const s = JSON.parse((await cookies()).get('sula_session')?.value || '{}')
    return typeof s.id === 'string' && s.id ? s.id : null
  } catch {
    return null
  }
}

export async function getAvisos(limite = 40): Promise<{ avisos: AvisoErp[]; error?: string }> {
  const id = await idSesion()
  if (!id) return { avisos: [] }
  const supabase = supabaseServidor()
  const { data, error } = await supabase
    .from('notificaciones')
    .select('id, tipo, mensaje, leida, proyecto_id, created_at')
    .eq('destinatario_id', id)
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) return { avisos: [], error: error.message }

  const proyectos = [...new Set((data ?? []).map(n => n.proyecto_id as string | null).filter((x): x is string => !!x))]
  const explosionDe = new Map<string, string>()
  if (proyectos.length) {
    const { data: exps } = await supabase.from('bom_explosiones').select('id, proyecto_id').in('proyecto_id', proyectos)
    for (const e of exps ?? []) explosionDe.set(String(e.proyecto_id), String(e.id))
  }
  return {
    avisos: (data ?? []).map(n => ({
      id: String(n.id),
      tipo: String(n.tipo ?? ''),
      mensaje: String(n.mensaje ?? ''),
      leida: !!n.leida,
      explosionId: n.proyecto_id ? explosionDe.get(String(n.proyecto_id)) ?? null : null,
      createdAt: String(n.created_at),
    })),
  }
}

export async function marcarAvisoLeido(avisoId: string): Promise<void> {
  const id = await idSesion()
  if (!id) return
  const { error } = await supabaseServidor().from('notificaciones').update({ leida: true }).eq('id', avisoId).eq('destinatario_id', id)
  if (error) console.error('[campana erp] No se pudo marcar leído:', error.message)
}

export async function marcarTodosLeidos(): Promise<void> {
  const id = await idSesion()
  if (!id) return
  const { error } = await supabaseServidor().from('notificaciones').update({ leida: true }).eq('destinatario_id', id).or('leida.eq.false,leida.is.null')
  if (error) console.error('[campana erp] No se pudieron marcar leídos:', error.message)
}
