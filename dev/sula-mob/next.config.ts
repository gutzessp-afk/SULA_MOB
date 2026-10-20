import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler solo en producción (Vercel): en `next dev` corre con Babel en procesos de Node
  // aparte por cada componente y en PCs con poca memoria tumba el servidor de desarrollo
  reactCompiler: process.env.NODE_ENV === 'production',
  // pdf-parse y @napi-rs/canvas son módulos nativos de Node.js
  // que NO deben ser bundleados por webpack — se cargan directo.
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  // Optimización de imágenes: <Image> sirve AVIF/WebP del tamaño de cada pantalla
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    qualities: [75],
    // Fotos de evidencia del almacenamiento de Supabase: se sirven en miniatura (no la foto completa)
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [{ protocol: 'https', hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  // El service worker no se guarda en caché del navegador: así las actualizaciones llegan de inmediato
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
};

export default nextConfig;