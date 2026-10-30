/**
 * google-drive.ts
 * ───────────────
 * La carpeta PLANOS de Google Drive con una cuenta de servicio: el Catálogo busca ahí
 * los planos directamente (sin copiarlos) y puede reemplazar el PDF de uno.
 * Sin librerías de Google: el token se firma aquí (JWT RS256) y se usa la API REST v3.
 * Solo en el servidor.
 *
 * Variables de entorno:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY  correo y llave de la cuenta de servicio
 *     (o bien GOOGLE_SERVICE_ACCOUNT_KEY con el JSON completo de la llave)
 *   GOOGLE_DRIVE_FOLDER_ID      el id de la carpeta PLANOS (lo que va después de /folders/ en la URL)
 * La carpeta se comparte con el client_email de la cuenta de servicio: como Lector basta
 * para buscar y ver; para reemplazar PDFs desde el Catálogo tiene que ser Editor.
 *
 * RUTA: src/lib/google-drive.ts
 */

import { createSign } from 'node:crypto'
import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'

// Node prueba cada dirección de Google (8 IPv4 + 8 IPv6) solo 250 ms: en una red sin IPv6
// o con Wi-Fi lenta fallan todas y fetch truena con "fetch failed / ETIMEDOUT"
if (getDefaultAutoSelectFamilyAttemptTimeout() < 2500) setDefaultAutoSelectFamilyAttemptTimeout(2500)

const API = 'https://www.googleapis.com/drive/v3'
/** Carpetas que se leen al mismo tiempo al recorrer PLANOS */
const CARPETAS_A_LA_VEZ = 8
const REINTENTOS = 3
const CARPETA = 'application/vnd.google-apps.folder'

interface Credenciales {
  client_email: string
  private_key: string
}

export interface ArchivoDrive {
  id: string
  nombre: string
  /** Ruta de carpetas dentro de PLANOS, ej. "VENTO" o "KFC/SILLAS" ('' = en la raíz) */
  carpeta: string
  bytes: number
  modificado: string
}

function credenciales(): Credenciales {
  // También sirven por separado: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY (campos client_email y private_key del JSON)
  const correo = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const llave = process.env.GOOGLE_PRIVATE_KEY
  if (correo && llave) return { client_email: correo, private_key: llave.replace(/^"|"$/g, '').replace(/\\n/g, '\n') }

  const texto = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!texto) throw new Error('Faltan las credenciales de Google: GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY (o GOOGLE_SERVICE_ACCOUNT_KEY con el JSON completo).')
  let json: Partial<Credenciales>
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY no es un JSON válido: pega el contenido completo del archivo .json.')
  }
  if (!json.client_email || !json.private_key) throw new Error('A GOOGLE_SERVICE_ACCOUNT_KEY le faltan client_email o private_key.')
  // Al pegarlo en una sola línea, los saltos de la llave a veces quedan como "\n" literal
  return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, '\n') }
}

/** Correo de la cuenta de servicio, para decirle al admin con quién compartir la carpeta */
export function correoCuentaServicio(): string | null {
  try {
    return credenciales().client_email
  } catch {
    return null
  }
}

export function carpetaPlanos(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()
  if (!id) throw new Error('Falta la variable GOOGLE_DRIVE_FOLDER_ID (el id de la carpeta PLANOS).')
  return id
}

/* ── Token de acceso (dura una hora; se reutiliza mientras sirva) ── */

const LECTURA = 'https://www.googleapis.com/auth/drive.readonly'
const ESCRITURA = 'https://www.googleapis.com/auth/drive'
const tokens = new Map<string, { valor: string; vence: number }>()

async function tokenAcceso(scope = LECTURA): Promise<string> {
  const token = tokens.get(scope)
  if (token && token.vence > Date.now() + 60_000) return token.valor
  const { client_email, private_key } = credenciales()
  const ahora = Math.floor(Date.now() / 1000)
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const sinFirma = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600,
  })}`
  let firma: string
  try {
    firma = createSign('RSA-SHA256').update(sinFirma).sign(private_key, 'base64url')
  } catch {
    throw new Error('La llave privada de la cuenta de servicio no es válida: pega en GOOGLE_PRIVATE_KEY el campo private_key del JSON (empieza con -----BEGIN PRIVATE KEY-----).')
  }

  const res = await pedir('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${sinFirma}.${firma}` }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.access_token) {
    throw new Error(`Google no aceptó la cuenta de servicio: ${json?.error_description || json?.error || res.status}.`)
  }
  tokens.set(scope, { valor: json.access_token, vence: Date.now() + (json.expires_in ?? 3600) * 1000 })
  return json.access_token
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * fetch que reintenta los cortes de red y las respuestas pasajeras de Google (429 y 5xx),
 * esperando un poco más cada vez (0.5 s, 1.5 s). Los demás errores se regresan tal cual.
 */
async function pedir(url: string, init?: RequestInit): Promise<Response> {
  for (let intento = 1; ; intento++) {
    try {
      const res = await fetch(url, init)
      if ((res.status === 429 || res.status >= 500) && intento < REINTENTOS) {
        await res.body?.cancel()
      } else {
        return res
      }
    } catch (err) {
      if (intento >= REINTENTOS) throw new Error('No se pudo conectar con Google Drive (la red no respondió). Intenta de nuevo.', { cause: err })
    }
    await esperar(500 * 3 ** (intento - 1))
  }
}

async function drive(ruta: string, params: Record<string, string>): Promise<Response> {
  const url = `${API}/${ruta}?${new URLSearchParams({ supportsAllDrives: 'true', ...params })}`
  return pedir(url, { headers: { Authorization: `Bearer ${await tokenAcceso()}` } })
}

/* ── Listar ── */

/** Todos los PDF de la carpeta y sus subcarpetas, con la ruta de carpetas de cada uno */
export async function listarPDFs(carpetaId: string): Promise<ArchivoDrive[]> {
  const archivos: ArchivoDrive[] = []
  const visitadas = new Set<string>()

  /** Lee una carpeta (todas sus páginas) y regresa sus subcarpetas */
  const leerCarpeta = async ({ id, ruta }: { id: string; ruta: string }) => {
    const subcarpetas: { id: string; ruta: string }[] = []
    let pageToken = ''
    do {
      const res = await drive('files', {
        q: `'${id}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='${CARPETA}')`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
        pageSize: '1000',
        includeItemsFromAllDrives: 'true',
        ...(pageToken ? { pageToken } : {}),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        if (res.status === 404) throw new Error(`No se encontró la carpeta. ¿Está compartida con ${correoCuentaServicio() ?? 'la cuenta de servicio'}?`)
        throw new Error(`Google Drive respondió ${res.status}: ${json?.error?.message ?? 'error desconocido'}.`)
      }
      for (const f of json.files ?? []) {
        if (f.mimeType === CARPETA) subcarpetas.push({ id: f.id, ruta: ruta ? `${ruta}/${f.name}` : f.name })
        else archivos.push({ id: f.id, nombre: f.name, carpeta: ruta, bytes: Number(f.size) || 0, modificado: f.modifiedTime })
      }
      pageToken = json.nextPageToken ?? ''
    } while (pageToken)
    return subcarpetas
  }

  // Por niveles, varias carpetas a la vez (una tras otra tardaba ~30 s con cientos de carpetas)
  let nivel = [{ id: carpetaId, ruta: '' }]
  while (nivel.length) {
    const siguiente: { id: string; ruta: string }[] = []
    const porLeer = nivel.filter(c => !visitadas.has(c.id) && visitadas.add(c.id))
    for (let i = 0; i < porLeer.length; i += CARPETAS_A_LA_VEZ) {
      const tanda = await Promise.all(porLeer.slice(i, i + CARPETAS_A_LA_VEZ).map(leerCarpeta))
      siguiente.push(...tanda.flat())
    }
    nivel = siguiente
  }
  return archivos.sort((a, b) => `${a.carpeta}/${a.nombre}`.localeCompare(`${b.carpeta}/${b.nombre}`, 'es'))
}

/* ── Descargar ── */

/** El contenido de un PDF (que ya se sabe que es PDF: viene de la lista de PLANOS) */
export async function descargarPDF(id: string): Promise<ArrayBuffer> {
  const res = await drive(`files/${encodeURIComponent(id)}`, { alt: 'media' })
  if (!res.ok) throw new Error(`No se pudo bajar el archivo de Drive (${res.status}).`)
  return res.arrayBuffer()
}

/* ── Catálogo: búsqueda directa en la carpeta PLANOS ── */

/** "2-1-0072-0003 VITRINA.pdf" → "2-1-0072-0003"; null si el nombre no trae clave */
export const claveDeNombre = (nombre: string) => nombre.match(/\d+-\d+-\d+-\d+/)?.[0] ?? null

/** Revisa que de verdad sea un PDF (empieza con "%PDF"), no solo que se llame .pdf */
export const esPdf = (bytes: ArrayBuffer) => new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))).startsWith('%PDF')

/** Recorrer toda la carpeta toma varios segundos: la lista se guarda unos minutos en memoria */
const VIGENCIA_LISTA_MS = 5 * 60_000
let lista: { archivos: ArchivoDrive[]; leida: number } | null = null

/** Todos los PDF de la carpeta PLANOS (con caché de 5 minutos; refrescar=true la vuelve a leer) */
export async function planosDrive(refrescar = false): Promise<ArchivoDrive[]> {
  if (!refrescar && lista && Date.now() - lista.leida < VIGENCIA_LISTA_MS) return lista.archivos
  const archivos = await listarPDFs(carpetaPlanos())
  lista = { archivos, leida: Date.now() }
  return archivos
}

/** El PDF con ese id, solo si está dentro de la carpeta PLANOS (no se sirve cualquier archivo del Drive) */
export async function planoDrive(id: string): Promise<ArchivoDrive | null> {
  const buscar = (archivos: ArchivoDrive[]) => archivos.find(a => a.id === id) ?? null
  // Si no está en la lista guardada, puede ser nuevo: se vuelve a leer una vez
  return buscar(await planosDrive()) ?? buscar(await planosDrive(true))
}

/**
 * Reemplaza el contenido de un PDF del Drive (mismo archivo, mismo id; Drive guarda la versión anterior).
 * La cuenta de servicio necesita ser Editor de la carpeta.
 */
export async function reemplazarArchivo(id: string, bytes: ArrayBuffer): Promise<void> {
  const res = await pedir(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await tokenAcceso(ESCRITURA)}`, 'Content-Type': 'application/pdf' },
    body: bytes,
  })
  if (res.ok) {
    lista = null // el tamaño y la fecha cambiaron
    return
  }
  const json = await res.json().catch(() => null)
  if (res.status === 403 || res.status === 404) {
    throw new Error(`Google Drive no dejó reemplazar el PDF: comparte la carpeta PLANOS como Editor con ${correoCuentaServicio() ?? 'la cuenta de servicio'}.`)
  }
  throw new Error(`Google Drive respondió ${res.status}: ${json?.error?.message ?? 'error desconocido'}.`)
}
