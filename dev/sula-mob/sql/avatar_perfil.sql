-- Foto de perfil de los administradores (/admin/perfil).
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
--
-- Cuentas de la tabla usuarios: la URL va en usuarios.avatar_url.
-- Cuentas de Supabase Auth: la URL va en sus metadatos (no necesita columna).

alter table public.usuarios add column if not exists avatar_url text;

-- Bucket público: las fotos se muestran con su URL directa (como las evidencias)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La app sube desde el servidor con la llave anónima (no hay service role configurada)
drop policy if exists avatares_subir on storage.objects;
create policy avatares_subir on storage.objects for insert with check (bucket_id = 'avatares');

drop policy if exists avatares_leer on storage.objects;
create policy avatares_leer on storage.objects for select using (bucket_id = 'avatares');

-- Comprobación: debe mostrar 1 fila
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'usuarios' and column_name = 'avatar_url';
