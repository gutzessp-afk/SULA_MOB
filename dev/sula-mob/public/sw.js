// Service Worker de SULA MOB (solo se registra en producción, lo hace RegistrarServiceWorker en src/components/InstallPWA.tsx)
//
// - Archivos de /_next/static/: se sirven del caché (su nombre cambia en cada despliegue)
// - Imágenes e íconos: primero internet, y si no hay, la copia guardada
// - Páginas: siempre de internet; sin conexión se muestra /offline.html
//
// No se guardan páginas ni llamadas a /api o Supabase: llevan datos de la sesión
// y de producción que deben venir siempre del servidor.

const CACHE = 'sula-mob-v1'
const PRECACHE = ['/offline.html', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  )
})

function guardar(request, response) {
  if (response.ok) {
    const copia = response.clone()
    caches.open(CACHE).then((cache) => cache.put(request, copia))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((guardado) => guardado || fetch(request).then((res) => guardar(request, res)))
    )
    return
  }

  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      fetch(request)
        .then((res) => guardar(request, res))
        .catch(() => caches.match(request).then((guardado) => guardado || Response.error()))
    )
  }
})
