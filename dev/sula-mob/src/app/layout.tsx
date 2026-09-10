// Layout raíz de toda la app.
// Aquí van: la fuente global (Plus Jakarta Sans), el <html>/<body>,
// metadata (título, descripción) y el tema oscuro.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
