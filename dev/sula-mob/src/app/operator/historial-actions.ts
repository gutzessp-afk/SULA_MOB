'use server'

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from './actions'

export interface PdfHistorial {
  id: string
  fecha: string
  pdfUrl: string
  creadoEn: string
  creadoPor: string
  proyectoId: string
  proyectoCodigo: string
  proyectoNombre: string
}

interface FilaEvidencia {
  id: string
  fecha: string
  pdf_url: string
  created_at: string
  creado_por: string | null
  proyecto_id: string
  proyectos: { codigo: string | null; nombre: string | null } | null
}

/** PDFs de evidencia del día de todos los proyectos (lo que se guarda con "Enviar al historial") */
export async function listarHistorial(limite = 300): Promise<PdfHistorial[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('evidencias_dia')
    .select('id, fecha, pdf_url, created_at, creado_por, proyecto_id, proyectos ( codigo, nombre )')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) {
    console.error('Error al traer el historial de PDFs:', error)
    return []
  }

  const filas = (data ?? []) as unknown as FilaEvidencia[]

  const ids = Array.from(new Set(filas.map((f) => f.creado_por).filter((v): v is string => Boolean(v))))
  const { data: usuarios } = ids.length
    ? await supabase.from('usuarios').select('id, nombre, apellidos').in('id', ids)
    : { data: [] as Record<string, unknown>[] }
  const quien = new Map(
    ((usuarios ?? []) as Record<string, unknown>[]).map((u) => [
      u.id as string,
      `${u.nombre as string} ${(u.apellidos as string | null) ?? ''}`.trim(),
    ])
  )

  return filas.map((f) => ({
    id: f.id,
    fecha: f.fecha,
    pdfUrl: f.pdf_url,
    creadoEn: f.created_at,
    creadoPor: (f.creado_por && quien.get(f.creado_por)) || 'Operador',
    proyectoId: f.proyecto_id,
    proyectoCodigo: f.proyectos?.codigo ?? '',
    proyectoNombre: f.proyectos?.nombre ?? 'Proyecto',
  }))
}
