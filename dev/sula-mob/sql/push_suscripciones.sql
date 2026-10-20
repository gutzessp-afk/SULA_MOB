-- Notificaciones push en el celular (como las de WhatsApp) para los administradores.
-- Cada celular o computadora que activa las notificaciones guarda aquí su suscripción.
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
--
-- La suscripción sola no permite mandar notificaciones: el envío va firmado con la
-- llave privada VAPID, que solo tiene el servidor (variable VAPID_PRIVATE_KEY).

create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  created_at timestamptz not null default now()
);

create index if not exists push_suscripciones_usuario on public.push_suscripciones (usuario_id);

alter table public.push_suscripciones enable row level security;

-- La app usa la llave anónima desde el servidor (no hay service role configurada)
drop policy if exists push_suscripciones_todo on public.push_suscripciones;
create policy push_suscripciones_todo on public.push_suscripciones for all using (true) with check (true);
