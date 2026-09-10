// Layout del área de administrador.
// Incluye: guard de rol (solo admin), sidebar y contenedor de contenido.
// Responsable: Dev 1 (base) — usado por Dev 2 y Dev 3.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
