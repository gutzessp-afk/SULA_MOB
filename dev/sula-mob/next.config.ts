import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // pdf-parse es un módulo de Node.js que NO debe ser bundleado por
  // webpack/Turbopack — se carga directo desde node_modules en runtime.
  // (Se quitó @napi-rs/canvas: era una dependencia de pdf-parse@2.x,
  // que arrastraba pdfjs-dist con worker y causaba el error en Vercel.
  // Con pdf-parse@1.1.1 ya no se necesita.)
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;