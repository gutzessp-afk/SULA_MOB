-- PRUEBA: registro del operador por ensambles y subensambles (despiece del plano).
-- Tabla aparte: no toca piezas, relojes, avances ni el progreso que ve el administrador.
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.

create table if not exists public.prueba_despiece_avance (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  partida_id uuid not null references public.partidas (id) on delete cascade,
  -- Identifica la pieza dentro del despiece de la partida (subensamble + descripción + material + medidas)
  pieza_clave text not null,
  piezas integer not null check (piezas > 0),
  operador_id uuid references public.usuarios (id) on delete set null,
  dispositivo text,
  created_at timestamptz not null default now()
);

create index if not exists prueba_despiece_avance_proyecto_area
  on public.prueba_despiece_avance (proyecto_id, area_id);

-- La app la usa con la llave anon desde el servidor. Supabase activa RLS solo en las tablas
-- nuevas, así que se deja activa y se da permiso explícito a la app.
grant select, insert, delete on public.prueba_despiece_avance to anon, authenticated;
alter table public.prueba_despiece_avance enable row level security;
drop policy if exists "app operador" on public.prueba_despiece_avance;
create policy "app operador" on public.prueba_despiece_avance
  for all to anon, authenticated using (true) with check (true);

-- Reloj de cada paso (Iniciar → Finalizar). Las piezas hechas se siguen sumando en prueba_despiece_avance.
create table if not exists public.prueba_despiece_trabajos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  partida_id uuid not null references public.partidas (id) on delete cascade,
  pieza_clave text not null,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'finalizado')),
  inicio timestamptz not null default now(),
  fin timestamptz,
  piezas integer,
  operador_id uuid references public.usuarios (id) on delete set null,
  dispositivo text
);

create index if not exists prueba_despiece_trabajos_proyecto_area
  on public.prueba_despiece_trabajos (proyecto_id, area_id, estado);

grant select, insert, update, delete on public.prueba_despiece_trabajos to anon, authenticated;
alter table public.prueba_despiece_trabajos enable row level security;
drop policy if exists "app operador" on public.prueba_despiece_trabajos;
create policy "app operador" on public.prueba_despiece_trabajos
  for all to anon, authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARA QUITAR LA PRUEBA (si no se queda): correr solo estas dos líneas
-- drop table if exists public.prueba_despiece_trabajos;
-- drop table if exists public.prueba_despiece_avance;
