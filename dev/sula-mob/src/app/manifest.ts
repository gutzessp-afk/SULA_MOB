import type { MetadataRoute } from 'next'

// Manifiesto de la PWA: Next.js lo sirve en /manifest.webmanifest y lo enlaza solo en el <head>
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SULA MOB — Control de Producción',
    short_name: 'SULA MOB',
    description: 'Sistema de seguimiento de proyectos de manufactura',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#07080c',
    theme_color: '#07080c',
    lang: 'es-MX',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
