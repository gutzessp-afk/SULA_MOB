/**
 * push.ts
 * ───────
 * Envía notificaciones push (Web Push) a los celulares y computadoras de los
 * administradores que las activaron. Solo se importa desde el servidor.
 *
 * Necesita la variable VAPID_PRIVATE_KEY (la pública está en src/lib/vapid.ts)
 * y la tabla push_suscripciones (sql/push_suscripciones.sql). Si falta algo, no envía
 * nada y no interrumpe a quien la llama.
 *
 * RUTA: src/lib/push.ts
 */

import { after } from 'next/server'
import webpush from 'web-push'
import { supabaseServidor } from '@/lib/admin-api'
import { VAPID_PUBLICA } from '@/lib/vapid'

export interface MensajePush {
  titulo: string
  cuerpo: string
  /** Página que se abre al tocar la notificación */
  url: string
  /** Notificaciones con la misma etiqueta se reemplazan en vez de apilarse */
  etiqueta?: string
}

let configurado: boolean | null = null

function configurar(): boolean {
  if (configurado !== null) return configurado
  const publica = VAPID_PUBLICA
  const privada = process.env.VAPID_PRIVATE_KEY
  configurado = !!publica && !!privada
  if (configurado) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://sula-mob.vercel.app', publica!, privada!)
  return configurado
}

/** Manda la notificación a todos los dispositivos suscritos; borra los que ya no existen */
export async function enviarPushAdmins(mensaje: MensajePush): Promise<number> {
  try {
    if (!configurar()) return 0
    const supabase = supabaseServidor()
    const { data, error } = await supabase.from('push_suscripciones').select('id, endpoint, p256dh, auth')
    if (error || !data?.length) return 0

    const carga = JSON.stringify(mensaje)
    const vencidas: string[] = []
    let enviadas = 0
    await Promise.all(
      data.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 60 * 60, urgency: 'high' })
          enviadas++
        } catch (err) {
          // 404/410: el usuario desinstaló la app o quitó el permiso
          const codigo = (err as { statusCode?: number }).statusCode
          if (codigo === 404 || codigo === 410) vencidas.push(s.id)
          else console.error('[push] No se pudo enviar:', codigo, (err as Error).message)
        }
      }),
    )
    if (vencidas.length) await supabase.from('push_suscripciones').delete().in('id', vencidas)
    return enviadas
  } catch (err) {
    console.error('[push] Error al enviar notificaciones:', err)
    return 0
  }
}

/** Notificación de prueba a UN dispositivo (botón "Enviar prueba" de Mi perfil) */
export async function enviarPrueba(sub: { endpoint: string; p256dh: string; auth: string }): Promise<string | null> {
  if (!configurar()) return 'Faltan las llaves VAPID en el servidor (variables de entorno).'
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ titulo: '🔔 SULA MOB', cuerpo: 'Las notificaciones funcionan en este dispositivo.', url: '/admin/perfil', etiqueta: 'prueba' }),
      { TTL: 60, urgency: 'high' },
    )
    return null
  } catch (err) {
    return 'No se pudo enviar: ' + (err as Error).message
  }
}

/** Aviso de un atraso reportado por un operador */
export async function pushRetraso(datos: { retrasoId: string; motivo: string; area?: string | null; operador?: string | null; proyecto?: string | null }) {
  return enviarPushAdmins({
    titulo: `⚠️ Atraso${datos.proyecto ? ` · ${datos.proyecto}` : ''}`,
    cuerpo: [datos.motivo, [datos.area, datos.operador].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
    url: `/admin/reportes?retraso=${datos.retrasoId}#incidencias`,
    etiqueta: `retraso-${datos.retrasoId}`,
  })
}

/**
 * Programa el aviso push de un atraso para DESPUÉS de responder al operador
 * (no lo hace esperar). Busca el motivo, el área, el operador y el proyecto por su id.
 * Se llama desde las Server Actions que crean atrasos.
 */
export function avisarRetrasoDespues(retrasoId: string) {
  after(async () => {
    const { data } = await supabaseServidor()
      .from('retrasos')
      .select('motivo, areas (nombre), usuarios (nombre, apellidos), proyectos (codigo)')
      .eq('id', retrasoId)
      .maybeSingle()
    if (!data) return
    const uno = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x)
    const u = uno(data.usuarios as unknown as { nombre: string | null; apellidos: string | null } | null)
    await pushRetraso({
      retrasoId,
      motivo: (data.motivo as string | null) || 'Sin motivo',
      area: uno(data.areas as unknown as { nombre: string } | null)?.nombre,
      operador: u ? `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim() : null,
      proyecto: uno(data.proyectos as unknown as { codigo: string | null } | null)?.codigo,
    })
  })
}
