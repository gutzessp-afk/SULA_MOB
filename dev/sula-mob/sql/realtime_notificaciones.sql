-- Notificaciones y atrasos al instante en el panel del admin (campanita y tono de celular).
-- Sin esto llegan igual, pero con unos segundos de retraso (se revisa cada 5 s).
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'retrasos') then
    alter publication supabase_realtime add table public.retrasos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones') then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end $$;
