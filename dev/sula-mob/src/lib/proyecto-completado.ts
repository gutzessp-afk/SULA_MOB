/**
 * proyecto-completado.ts
 * ──────────────────────
 * Marca la fecha en que un proyecto llegó al 100% (proyectos.fecha_real_fin) y
 * avisa por push a los administradores; queda en el historial como pedido_completado.
 * Se llama cada vez que se recalcula el progreso del proyecto (Server Actions del
 * operador), así que no depende de que alguien tenga el navegador abierto.
 *
 * Idempotente: la fecha solo se escribe si estaba vacía, y solo quien la escribe
 * manda el aviso. Si un avance se corrige y el proyecto baja del 100%, la fecha
 * se borra para que vuelva a contar (y avisar) cuando se termine de verdad.
 *
 * RUTA: src/lib/proyecto-completado.ts
 */

import { after } from 'next/server'
import { supabaseServidor } from '@/lib/admin-api'
import { pushProyectoCompletado } from '@/lib/push'
import { obtenerUsuarioDeSesion, registrarActividad } from '@/lib/registrar-actividad'

export async function revisarFinalizacion(proyectoId: string, progreso: number) {
  const supabase = supabaseServidor()

  if (progreso < 100) {
    await supabase.from('proyectos').update({ fecha_real_fin: null }).eq('id', proyectoId).not('fecha_real_fin', 'is', null)
    return
  }

  const { data, error } = await supabase
    .from('proyectos')
    .update({ fecha_real_fin: new Date().toISOString() })
    .eq('id', proyectoId)
    .is('fecha_real_fin', null)
    .select('codigo, nombre, cliente, created_at')
  if (error) {
    console.error('[proyecto-completado] No se pudo marcar la fecha de fin:', error.message)
    return
  }
  // Sin fila: ya estaba marcado (o no existe): no se avisa otra vez
  const proyecto = data?.[0]
  if (!proyecto) return

  // Quien registró el último avance (la sesión se lee antes de responder)
  const usuario = await obtenerUsuarioDeSesion()
  after(() =>
    Promise.all([
      pushProyectoCompletado({
        proyectoId,
        codigo: proyecto.codigo as string | null,
        nombre: proyecto.nombre as string,
        cliente: proyecto.cliente as string | null,
      }),
      registrarActividad({
        tipo: 'pedido_completado',
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        referenciaId: proyectoId,
        referenciaTipo: 'proyecto',
        detalle: { codigo: proyecto.codigo, nombre: proyecto.nombre, cliente: proyecto.cliente, fecha_inicio: proyecto.created_at },
      }),
    ]),
  )
}
