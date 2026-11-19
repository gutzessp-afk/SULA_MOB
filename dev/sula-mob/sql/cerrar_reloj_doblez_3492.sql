-- Cierra el reloj que quedó corriendo en Doblez del Pedido 3492 (bug 5 del SPEC de operador).
-- Correr en Supabase → SQL Editor. NO borra nada.
--
-- El reloj 1516f5ef… está "en_curso" desde el 26-oct-2026 en el producto DISP-00004, que no se
-- muestra en Doblez (no tiene renglón de avance en esa área), así que el operador nunca lo pudo
-- finalizar desde la pantalla. Mientras siga abierto, "Marcar área terminada" de Doblez responde
-- "Hay 1 pieza(s) con el reloj corriendo".
--
-- Se cierra igual que lo cierra la app al finalizar (finalizarPieza: estado 'finalizado', fin,
-- piezas_hechas), con 0 piezas y fin = inicio: así no suma piezas y el PDF de evidencia no le cuenta
-- 23 días de trabajo. No tiene pausas abiertas (pausas_pieza vacía para ese reloj).

-- Paso 1 (revisar): debe salir 1 renglón, Doblez, estado en_curso, inicio 2026-10-26
SELECT t.id, a.nombre AS area, pp.nombre AS producto, t.estado, t.inicio, t.fin, t.piezas_hechas
FROM trabajos_pieza t
JOIN areas a ON a.id = t.area_id
LEFT JOIN proyecto_productos pp ON pp.id = t.producto_id
WHERE t.id = '1516f5ef-ea1c-4d3b-b721-c79021794124';

-- Paso 2 (cerrar): debe regresar 1 renglón ya 'finalizado'
UPDATE trabajos_pieza
SET estado = 'finalizado', fin = inicio, piezas_hechas = 0
WHERE id = '1516f5ef-ea1c-4d3b-b721-c79021794124'
  AND estado = 'en_curso'
RETURNING id, estado, inicio, fin, piezas_hechas;
