-- Acceso directo del operador: el botón "Operador" del login entra sin correo ni contraseña.
-- Correr una vez en Supabase → SQL Editor ANTES de publicar el cambio. Se puede volver a correr sin problema.

-- 1. Usuario operador compartido. Todas las tabletas/celulares de planta entran con él.
--    password_hash no es un hash bcrypt válido, así que ninguna contraseña coincide nunca:
--    este usuario no sirve para el formulario de login (ese queda solo para Administrador).
--    Los registros se distinguen por area_id, no por persona.
insert into public.usuarios (nombre, apellidos, correo, username, password_hash, rol_id, area_id, activo)
select 'Operador', 'de planta', 'operador.planta@sula.local', 'operador.planta', '!sin-contraseña', r.id, null, true
from public.roles r
where lower(r.nombre) = 'operador'
  and not exists (select 1 from public.usuarios u where u.username = 'operador.planta')
limit 1;

-- 2. El acceso a un área (12 h) se guarda por dispositivo: desbloquear un área en una tableta
--    no la abre en las demás, y "Salir" en una no saca a las otras.
alter table public.area_accesos add column if not exists dispositivo text not null default '';

-- Quita la llave única vieja (operador_id, area_id), sea constraint o índice
do $$
declare
  i record;
begin
  for i in
    select ix.indexrelid::regclass as indice, con.conname
    from pg_index ix
    left join pg_constraint con on con.conindid = ix.indexrelid and con.conrelid = ix.indrelid
    where ix.indrelid = 'public.area_accesos'::regclass
      and ix.indisunique
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(ix.indkey) k
        join pg_attribute a on a.attrelid = ix.indrelid and a.attnum = k
      ) = array['area_id', 'operador_id']
  loop
    if i.conname is not null then
      execute format('alter table public.area_accesos drop constraint %I', i.conname);
    else
      execute format('drop index %s', i.indice);
    end if;
  end loop;
end $$;

create unique index if not exists area_accesos_operador_area_dispositivo
  on public.area_accesos (operador_id, area_id, dispositivo);

-- Los accesos de antes del cambio ya no se usan (vencen solos en 12 h; se limpian aquí)
delete from public.area_accesos where dispositivo = '';

-- 3. area_intentos no cambia de estructura: como todos usan el mismo usuario,
--    la fila (operador compartido, área) ya es el contador del área.

-- 4. Contador del botón "Entrar a mi área": la clave sola dice el área, así que cada intento
--    se prueba contra todas. 5 fallos lo bloquean 5 min (tocar el área sigue funcionando).
create table if not exists public.clave_intentos (
  clave text primary key,
  fallidos integer not null default 0,
  bloqueado_hasta timestamptz
);
-- La app lo usa con la llave anon desde el servidor. Supabase activa RLS solo en las tablas
-- nuevas, así que se deja activa y se da permiso explícito a la app.
grant select, insert, update, delete on public.clave_intentos to anon, authenticated;
alter table public.clave_intentos enable row level security;
drop policy if exists "app operador" on public.clave_intentos;
create policy "app operador" on public.clave_intentos
  for all to anon, authenticated using (true) with check (true);

-- Revisión: debe salir 1 fila con rol "operador"
select u.id, u.username, r.nombre as rol, u.activo
from public.usuarios u
join public.roles r on r.id = u.rol_id
where u.username = 'operador.planta';
