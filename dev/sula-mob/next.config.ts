import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // pdf-parse y @napi-rs/canvas son módulos nativos de Node.js
  // que NO deben ser bundleados por webpack — se cargan directo.
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
};

export default nextConfig;