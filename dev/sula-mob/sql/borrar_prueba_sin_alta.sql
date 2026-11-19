-- Borra la explosión de PRUEBA que creó Claude al probar "subir sin elegir pedido" (PED-999999).
-- Ya no tiene revisiones ni materiales; la llave anónima no puede borrar explosiones.
-- Debe borrar exactamente 1 renglón.
DELETE FROM bom_explosiones
WHERE id = '44d69dd9-7a9c-4429-aec3-db51eeef50f2'
  AND proyecto_id IS NULL
  AND usuario_nombre = 'prueba-claude'
RETURNING id;
