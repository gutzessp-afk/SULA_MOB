/**
 * vapid.ts
 * Llave PÚBLICA VAPID de las notificaciones push. No es secreta (el navegador la
 * necesita para suscribirse), por eso va en el código. La llave PRIVADA solo vive en
 * las variables de entorno (VAPID_PRIVATE_KEY en .env.local y en Vercel).
 *
 * RUTA: src/lib/vapid.ts
 */
export const VAPID_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BPRy7whGOauMOIOAelhYU_mHmlKh2z3Jgxu-zJKXWxYDc8BKEGVkNfk77XMU2daFlTzwtVc5e6ccLuAwZUdhLlE'
