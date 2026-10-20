-- Despiece del plano en el operador: las piezas que el admin analiza se reparten solas por área.
-- Correr una vez en Supabase → SQL Editor, ANTES de probar. Se puede volver a correr sin problema.

-- 1. Marca de las piezas que salen del plano (las cargadas a mano quedan con origen vacío)
alter table public.piezas_proyecto add column if not exists origen text;
alter table public.piezas_proyecto add column if not exists origen_clave text;

-- Una fila por pieza y área en cada proyecto (las cargadas a mano tienen origen_clave vacío y no chocan)
create unique index if not exists piezas_proyecto_origen
  on public.piezas_proyecto (proyecto_id, area_id, origen_clave);

-- 2. Permisos: la app escribe estas tablas con la llave anon desde el servidor.
--    Si una tabla tiene RLS activa, se agrega el permiso; si no, no se cambia nada.
grant select, insert, update, delete on public.piezas_proyecto to anon, authenticated;
grant select, insert, update, delete on public.producto_area_avance to anon, authenticated;
grant select, update on public.partidas to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['piezas_proyecto', 'producto_area_avance'] loop
    if (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      execute format('drop policy if exists "app operador" on public.%I', t);
      execute format('create policy "app operador" on public.%I for all to anon, authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- 3. La prueba de "trabajo por pasos" ya quedó integrada: sus tablas aparte ya no se usan
drop table if exists public.prueba_despiece_trabajos;
drop table if exists public.prueba_despiece_avance;

-- Revisión: debe decir origen y origen_clave
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'piezas_proyecto' and column_name like 'origen%';

-- ─────────────────────────────────────────────────────────────────────────────
-- PARA QUITAR LA INTEGRACIÓN (si no se queda): quitar el comentario y correr este bloque.
-- Borra SOLO las piezas que salieron del plano y lo que se registró en ellas (relojes, pausas).
-- Las piezas cargadas a mano y el resto de la plataforma no se tocan.
--
-- delete from public.pausas_pieza where trabajo_id in (
--   select t.id from public.trabajos_pieza t
--   join public.piezas_proyecto p on p.id = t.pieza_id
--   where p.origen = 'despiece');
-- delete from public.trabajos_pieza where pieza_id in (
--   select id from public.piezas_proyecto where origen = 'despiece');
-- delete from public.piezas_proyecto where origen = 'despiece';
-- drop index if exists public.piezas_proyecto_origen;
-- alter table public.piezas_proyecto drop column if exists origen_clave;
-- alter table public.piezas_proyecto drop column if exists origen;
