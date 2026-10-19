-- Avisos de atraso al instante en el panel del admin (tono de celular).
-- Sin esto el aviso igual llega, pero tarda hasta 20 segundos (se revisa cada 20 s).
-- Correr una sola vez en Supabase → SQL Editor.

alter publication supabase_realtime add table public.retrasos;
