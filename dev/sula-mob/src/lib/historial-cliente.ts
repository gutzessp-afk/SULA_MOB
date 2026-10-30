/**
 * historial-cliente.ts
 * ────────────────────
 * Registra desde el navegador en el historial (/api/historial/registrar) lo que pasa
 * en una página: pedido creado, plano analizado, Matriz de Corte generada.
 * No espera ni falla: si no se puede registrar, la acción del usuario sigue igual.
 *
 * RUTA: src/lib/historial-cliente.ts
 */

export function registrarEnHistorial(evento: {
  tipo: 'pedido_creado' | 'plano_analizado' | 'despiece_generado'
  referenciaId?: string
  referenciaTipo?: 'proyecto' | 'plano'
  detalle?: Record<string, unknown>
}) {
  void fetch('/api/historial/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evento),
    keepalive: true,
  }).catch(() => {})
}
