
'use server'

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from './actions'

export interface Notificacion {
  id: string
  tipo: string
  mensaje: string
  leida: boolean
  proyectoId: string | null
  proyectoNombre: string | null
  remitenteNombre: string | null
  createdAt: string
}

interface FilaNotificacion {
  id: string
  tipo: string | null
  mensaje: string
  leida: boolean | null
  proyecto_id: string | null
  remitente_id: string | null
  created_at: string
}

export async function getNotificaciones(limite = 50): Promise<Notificacion[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('notificaciones')
    .select('id, tipo, mensaje, leida, proyecto_id, remitente_id, created_at')
    .eq('destinatario_id', usuario.id)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) {
    console.error('Error al traer notificaciones:', error)
    return []
  }

  const filas = (data ?? []) as FilaNotificacion[]

  const proyectoIds = Array.from(
    new Set(filas.map((f) => f.proyecto_id).filter((x): x is string => !!x))
  )
  const remitenteIds = Array.from(
    new Set(filas.map((f) => f.remitente_id).filter((x): x is string => !!x))
  )

  const nombresProyecto = new Map<string, string>()
  if (proyectoIds.length > 0) {
    const { data: proyectos } = await supabase
      .from('proyectos')
      .select('id, nombre')
      .in('id', proyectoIds)
    ;(proyectos ?? []).forEach((p) => nombresProyecto.set(p.id as string, p.nombre as string))
  }

  const nombresRemitente = new Map<string, string>()
  if (remitenteIds.length > 0) {
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre, apellidos')
      .in('id', remitenteIds)
    ;(usuarios ?? []).forEach((u) =>
      nombresRemitente.set(u.id as string, `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim())
    )
  }

  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo ?? '',
    mensaje: f.mensaje,
    leida: f.leida ?? false,
    proyectoId: f.proyecto_id,
    proyectoNombre: f.proyecto_id ? nombresProyecto.get(f.proyecto_id) ?? null : null,
    remitenteNombre: f.remitente_id
      ? nombresRemitente.get(f.remitente_id) || 'Administración'
      : null,
    createdAt: f.created_at,
  }))
}

export async function getConteoNoLeidas(): Promise<number> {
  const usuario = await getUsuarioActual()
  if (!usuario) return 0

  const supabase = await createClient()

  const { count, error } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('destinatario_id', usuario.id)
    .or('leida.eq.false,leida.is.null')

  if (error) {
    console.error('Error al contar notificaciones:', error)
    return 0
  }

  return count ?? 0
}

export async function marcarNotificacionLeida(id: string): Promise<void> {
  const usuario = await getUsuarioActual()
  if (!usuario) return

  const supabase = await createClient()

  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', id)
    .eq('destinatario_id', usuario.id)
}

export async function marcarTodasLeidas(): Promise<void> {
  const usuario = await getUsuarioActual()
  if (!usuario) return

  const supabase = await createClient()

  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('destinatario_id', usuario.id)
    .or('leida.eq.false,leida.is.null')
}