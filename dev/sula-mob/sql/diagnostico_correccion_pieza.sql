-- Diagnóstico del bug 2 (corregir 4518 → 4517 y la pieza sigue en 4518). SOLO LECTURA.
-- Correr en Supabase → SQL Editor y pasarle el resultado a Claude.
--
-- Dice si la corrección la bloquea una política RLS (el update afecta 0 renglones sin dar error)
-- o un trigger que vuelve a escribir piezas_completadas.

-- 1. Políticas RLS de las tablas que toca corregirPieza
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('trabajos_pieza', 'producto_area_avance', 'avances', 'pausas_pieza')
ORDER BY tablename, cmd;

-- 2. ¿Tienen RLS encendido?
SELECT relname AS tabla, relrowsecurity AS rls_encendido, relforcerowsecurity AS rls_forzado
FROM pg_class
WHERE relname IN ('trabajos_pieza', 'producto_area_avance', 'avances', 'pausas_pieza');

-- 3. Triggers (no internos) en esas tablas
SELECT c.relname AS tabla, t.tgname AS trigger, pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND c.relname IN ('trabajos_pieza', 'producto_area_avance', 'avances', 'pausas_pieza');

-- 4. Doblez del 3492 (DISP-00005): avance guardado contra la suma de sus registros de reloj
SELECT
  (SELECT piezas_completadas FROM producto_area_avance
    WHERE producto_id = '8137dbe2-b1d0-4095-81bd-cf0dd75b9481' AND area_id = 'a0ed614b-133a-4449-bd81-fd7bb1b1acb3') AS avance_guardado,
  (SELECT sum(piezas_hechas) FROM trabajos_pieza
    WHERE producto_id = '8137dbe2-b1d0-4095-81bd-cf0dd75b9481' AND area_id = 'a0ed614b-133a-4449-bd81-fd7bb1b1acb3' AND estado = 'finalizado') AS suma_relojes,
  (SELECT sum(piezas) FROM avances
    WHERE producto_id = '8137dbe2-b1d0-4095-81bd-cf0dd75b9481' AND area_id = 'a0ed614b-133a-4449-bd81-fd7bb1b1acb3' AND estado = 'terminado') AS suma_historial;
