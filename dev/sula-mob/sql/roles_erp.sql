-- ════════════════════════════════════════════════════════════════════════════
-- PERFILES ERP — roles nuevos: compras, finanzas, almacen
-- Correr UNA vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- No borra ni cambia nada existente (madera, admin y operador se quedan igual).
-- Este archivo SÍ se sube al repo (no trae correos ni contraseñas).
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.roles (nombre)
SELECT v.nombre
FROM (VALUES ('compras'), ('finanzas'), ('almacen')) AS v(nombre)
WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE lower(r.nombre) = v.nombre);

-- Comprobación: deben salir los 3 (y los que ya existían, como madera)
SELECT id, nombre FROM public.roles
WHERE lower(nombre) IN ('admin', 'operador', 'madera', 'compras', 'finanzas', 'almacen')
ORDER BY nombre;
