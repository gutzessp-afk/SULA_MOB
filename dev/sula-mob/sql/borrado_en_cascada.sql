-- ═══════════════════════════════════════════════════════════════════════
-- Borrado en cascada de proyectos (OPCIONAL)
-- ═══════════════════════════════════════════════════════════════════════
-- La app ya borra un proyecto con todos sus registros (src/lib/eliminar-proyecto.ts).
-- Con este script, además, la base lo hace sola: al borrar un proyecto se borran
-- sus productos, avances por área, partidas, subensambles, componentes, avances,
-- retrasos y notificaciones, aunque el borrado venga de otro lado (por ejemplo,
-- desde el panel de Supabase).
--
-- Cómo usarlo: Supabase → SQL Editor → pegar y ejecutar. Se puede correr varias veces.
--
-- 1) (Solo para revisar) Llaves foráneas que hoy NO borran en cascada:
SELECT c.conrelid::regclass AS tabla, c.conname AS llave, pg_get_constraintdef(c.oid) AS definicion
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid::regclass::text IN ('proyectos', 'proyecto_productos', 'partidas', 'subensambles', 'componentes')
  AND pg_get_constraintdef(c.oid) NOT ILIKE '%ON DELETE%';

-- 2) Las vuelve a crear con ON DELETE CASCADE (las que ya tienen otra regla ON DELETE no se tocan)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tabla, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid::regclass::text IN ('proyectos', 'proyecto_productos', 'partidas', 'subensambles', 'componentes')
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%ON DELETE%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s ON DELETE CASCADE', r.tabla, r.conname, r.def);
  END LOOP;
END $$;
