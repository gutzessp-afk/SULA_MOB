/**
 * plano-pendiente.ts
 * El PDF que se suelta en /admin/despiece viaja a /admin/despiece/plano, donde se
 * confirma la clave antes de analizarlo. Un File no cabe en la URL, así que se guarda
 * aquí en memoria (la navegación dentro de la app no recarga la página). Solo en el navegador.
 *
 * RUTA: src/lib/plano-pendiente.ts
 */

let pendiente: File | null = null;

export function dejarPlanoPendiente(archivo: File) {
  pendiente = archivo;
}

/** El PDF pendiente, sin quitarlo (se puede leer varias veces mientras se monta la página) */
export function verPlanoPendiente(): File | null {
  return pendiente;
}

/** Ya se usó: la próxima visita a la página empieza sin archivo */
export function limpiarPlanoPendiente() {
  pendiente = null;
}
