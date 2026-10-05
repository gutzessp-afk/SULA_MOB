
'use server'

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from './actions'

// Pega aquí el rol_id del administrador (ver Paso 4). Si está vacío, no se envía el aviso.
const ADMIN_ROL_ID = 'a8e49af9-e975-43e2-9db4-d54cf301a33e'

export interface OpcionProyecto {
  id: string
  codigo: string
  nombre: string
}

export interface OpcionArea {
  id: string
  nombre: string
}

export interface RetrasoReciente {
  id: string
  proyecto: string
  area: string
  motivo: string
  descripcion: string
  horas: number | null
  evidenciaUrl: string | null
  createdAt: string
}

interface FilaProyecto {
  id: string
  codigo: string | null
  nombre: string
}

interface FilaRetraso {
  id: string
  motivo: string | null
  descripcion: string | null
  tiempo_estimado_retraso: number | null
  evidencia_url: string | null
  created_at: string | null
  areas: { nombre: string } | null
  proyectos: { nombre: string } | null
}

export async function getProyectosRetraso(): Promise<OpcionProyecto[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proyectos')
    .select('id, codigo, nombre')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error al traer proyectos:', error)
    return []
  }

  return ((data ?? []) as FilaProyecto[]).map((p) => ({
    id: p.id,
    codigo: p.codigo ?? '',
    nombre: p.nombre,
  }))
}

export async function getAreasDeProyecto(proyectoId: string): Promise<OpcionArea[]> {
  const usuario = await getUsuarioActual()
  if (!usuario || !proyectoId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('producto_area_avance')
    .select('area_id, areas ( id, nombre ), proyecto_productos!inner ( proyecto_id )')
    .eq('proyecto_productos.proyecto_id', proyectoId)

  if (error) {
    console.error('Error al traer áreas del proyecto:', error)
    return []
  }

  const filas = (data ?? []) as unknown as { areas: { id: string; nombre: string } | null }[]
  const unicas = new Map<string, OpcionArea>()
  filas.forEach((f) => {
    if (f.areas) unicas.set(f.areas.id, { id: f.areas.id, nombre: f.areas.nombre })
  })

  return Array.from(unicas.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export async function getMisRetrasos(limite = 5): Promise<RetrasoReciente[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('retrasos')
    .select(
      'id, motivo, descripcion, tiempo_estimado_retraso, evidencia_url, created_at, areas ( nombre ), proyectos ( nombre )'
    )
    .eq('operador_id', usuario.id)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) {
    console.error('Error al traer retrasos:', error)
    return []
  }

  return ((data ?? []) as unknown as FilaRetraso[]).map((r) => ({
    id: r.id,
    proyecto: r.proyectos?.nombre ?? 'Proyecto',
    area: r.areas?.nombre ?? 'Sin área',
    motivo: r.motivo ?? '',
    descripcion: r.descripcion ?? '',
    horas: r.tiempo_estimado_retraso,
    evidenciaUrl: r.evidencia_url,
    createdAt: r.created_at ?? '',
  }))
}

export async function crearRetraso(
  formData: FormData
): Promise<{ ok: boolean; error?: string; avisado?: boolean }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const proyectoId = String(formData.get('proyectoId') ?? '')
  const areaId = String(formData.get('areaId') ?? '')
  const motivo = String(formData.get('motivo') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  const horasTxt = String(formData.get('horas') ?? '').trim()
  const archivo = formData.get('evidencia')

  if (!proyectoId) return { ok: false, error: 'Elige el proyecto.' }
  if (!motivo) return { ok: false, error: 'El motivo es obligatorio.' }

  let horas: number | null = null
  if (horasTxt !== '') {
    horas = Number(horasTxt)
    if (Number.isNaN(horas) || horas < 0) {
      return { ok: false, error: 'El tiempo estimado debe ser un número válido.' }
    }
  }

  const supabase = await createClient()

  // Foto de evidencia (opcional)
  let evidenciaUrl: string | null = null
  if (archivo instanceof File && archivo.size > 0) {
    if (!archivo.type.startsWith('image/')) {
      return { ok: false, error: 'La evidencia debe ser una imagen.' }
    }
    if (archivo.size > 5 * 1024 * 1024) {
      return { ok: false, error: 'La foto pesa más de 5 MB.' }
    }
    const ruta = `${usuario.id}/${Date.now()}.jpg`
    const { error: errSubida } = await supabase.storage
      .from('evidencias')
      .upload(ruta, archivo, { contentType: 'image/jpeg' })

    if (errSubida) {
      console.error('Error al subir evidencia:', errSubida)
      return { ok: false, error: 'No se pudo subir la foto. Intenta de nuevo.' }
    }
    evidenciaUrl = supabase.storage.from('evidencias').getPublicUrl(ruta).data.publicUrl
  }

  const { error } = await supabase.from('retrasos').insert({
    proyecto_id: proyectoId,
    area_id: areaId || null,
    operador_id: usuario.id,
    motivo,
    descripcion: descripcion || null,
    tiempo_estimado_retraso: horas,
    evidencia_url: evidenciaUrl,
  })

  if (error) {
    console.error('Error al guardar retraso:', error)
    return { ok: false, error: 'No se pudo guardar el retraso. Intenta de nuevo.' }
  }

  // Aviso al administrador
  let avisado = false
  if (ADMIN_ROL_ID) {
    const { data: proyecto } = await supabase
      .from('proyectos')
      .select('nombre')
      .eq('id', proyectoId)
      .single()

    const { data: admins } = await supabase
      .from('usuarios')
      .select('id')
      .eq('rol_id', ADMIN_ROL_ID)

    const mensaje =
      `Retraso en ${proyecto?.nombre ?? 'un proyecto'}: ${motivo}` +
      (evidenciaUrl ? ` · Evidencia: ${evidenciaUrl}` : '')

    const avisos = (admins ?? []).map((a: { id: string }) => ({
      remitente_id: usuario.id,
      destinatario_id: a.id,
      proyecto_id: proyectoId,
      tipo: 'retraso',
      mensaje,
      leida: false,
    }))

    if (avisos.length > 0) {
      const { error: errAviso } = await supabase.from('notificaciones').insert(avisos)
      if (errAviso) console.error('Error al avisar al admin:', errAviso)
      else avisado = true
    }
  }

  return { ok: true, avisado }
}