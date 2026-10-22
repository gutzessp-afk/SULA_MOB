/**
 * push-cliente.ts
 * ───────────────
 * Activar y desactivar las notificaciones push en ESTE dispositivo (navegador).
 *   - Android (Chrome): funcionan con la app instalada o desde el navegador.
 *   - iPhone (iOS 16.4+): solo con la app instalada en la pantalla de inicio.
 * El permiso solo se puede pedir después de que el usuario toque un botón.
 *
 * RUTA: src/lib/push-cliente.ts
 */

export type EstadoPush = 'no-soportado' | 'instalar-primero' | 'bloqueado' | 'inactivo' | 'activo'

import { VAPID_PUBLICA as LLAVE_PUBLICA } from '@/lib/vapid'

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** La llave VAPID viene en base64url; el navegador la quiere en bytes */
function bytesDeLlave(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const texto = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(texto.length))
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i)
  return bytes
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** ¿La suscripción se hizo con la llave pública actual? Si se cambió el par de llaves, ya no sirve */
function llaveVigente(sub: PushSubscription): boolean {
  const llave = sub.options.applicationServerKey
  if (!llave) return true
  const actual = bytesDeLlave(LLAVE_PUBLICA)
  const usada = new Uint8Array(llave)
  return usada.length === actual.length && usada.every((b, i) => b === actual[i])
}

/** Suscripción de este dispositivo con la llave actual: reemplaza la que se hizo con una llave vieja */
async function suscripcionVigente(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const sub = await reg.pushManager.getSubscription()
  if (sub && llaveVigente(sub)) return sub
  if (sub) {
    await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeLlave(LLAVE_PUBLICA) })
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === 'undefined' || !LLAVE_PUBLICA) return 'no-soportado'
  // En iPhone, las notificaciones solo existen con la app instalada
  if (esIOS() && !instalada()) return 'instalar-primero'
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return 'no-soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  return Notification.permission === 'granted' && sub ? 'activo' : 'inactivo'
}

/** Pide permiso, suscribe este dispositivo y lo guarda en el servidor */
export async function activarPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return { ok: false, error: 'No se dio permiso para las notificaciones.' }
    const reg = (await registro()) ?? (await navigator.serviceWorker.ready)
    const sub = await suscripcionVigente(reg)
    const r = await guardar(sub)
    // Si el servidor no la guardó, se quita también del navegador: así no aparece "activada" sin estarlo
    if (!r.ok) await sub.unsubscribe().catch(() => {})
    return r
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudieron activar las notificaciones.' }
  }
}

/** Deja de recibir notificaciones en este dispositivo */
export async function desactivarPush(): Promise<void> {
  const sub = await (await registro())?.pushManager.getSubscription()
  if (!sub) return
  await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}

/** Guarda (o actualiza) la suscripción en el servidor */
async function guardar(sub: PushSubscription): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json().catch(() => null))?.error || `Error ${res.status}` }
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.' }
  }
}

/** Con el permiso ya dado, vuelve a guardar la suscripción (por si el navegador la renovó o el servidor no la tiene) */
export async function refrescarPush(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return { ok: true }
  const reg = await registro()
  if (!reg || !(await reg.pushManager.getSubscription())) return { ok: true }
  try {
    return await guardar(await suscripcionVigente(reg))
  } catch {
    return { ok: false, error: 'No se pudo renovar la suscripción de este dispositivo. Toca "Quitar" y vuelve a activarlas.' }
  }
}

/** Pide al servidor una notificación de prueba para este dispositivo */
export async function probarPush(): Promise<{ ok: boolean; error?: string }> {
  const sub = await (await registro())?.pushManager.getSubscription()
  if (!sub) return { ok: false, error: 'Este dispositivo no tiene las notificaciones activadas.' }
  const res = await fetch('/api/push', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
  return res.ok ? { ok: true } : { ok: false, error: (await res.json().catch(() => null))?.error || `Error ${res.status}` }
}
