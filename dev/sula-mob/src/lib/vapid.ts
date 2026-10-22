/**
 * vapid.ts
 * Llave PÚBLICA VAPID de las notificaciones push. No es secreta (el navegador la
 * necesita para suscribirse), por eso va en el código. La llave PRIVADA solo vive en
 * las variables de entorno (VAPID_PRIVATE_KEY en .env.local y en Vercel).
 *
 * RUTA: src/lib/vapid.ts
 */
export const VAPID_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BLUKz9IWxkZFRhFLVaY711-pP4kzVk4c5F7igaEdXZS64-Oj8HXz12xRA6aar5chLo8VH7PlUjlwg9w4Yc9a72s'
