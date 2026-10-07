import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // pdf-parse y @napi-rs/canvas son módulos nativos de Node.js
  // que NO deben ser bundleados por webpack — se cargan directo.
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  // Optimización de imágenes: <Image> sirve AVIF/WebP del tamaño de cada pantalla
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    qualities: [75],
  },
};

export default nextConfig;