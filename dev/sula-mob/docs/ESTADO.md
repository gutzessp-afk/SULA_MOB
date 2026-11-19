# ESTADO DEL PROYECTO — bitácora de relevo entre agentes

> **Este archivo es el "dónde nos quedamos".** Lo leen y lo actualizan TODOS los agentes que trabajen en SULA MOB: Claude en la nube, Claude local (Orca), Hermes…
> - **Al empezar:** lee `AGENTS.md`, luego este archivo completo, luego el spec de la tarea en curso (`docs/specs/`).
> - **Al terminar** (o si te vas a quedar sin tokens o contexto): actualiza las secciones "En curso", "Siguiente paso exacto" y "Bitácora", y haz commit **aunque el trabajo vaya a medias**.
> - Nunca dejes cambios sin commit y sin nota aquí. El siguiente agente no ve tu conversación, **solo ve el repo**.

**Última actualización:** 2026-11-19 · Claude local

---

## 1. En producción / ya instalado

- Producción: proyectos, despiece, catálogo, calendario, áreas, reportes, usuarios, notificaciones (push, correo, realtime).
- Pedidos PDF de Click Balance (plantilla anterior **y** nueva) → proyecto `PED-####`.
- **BOM / Explosión v4.x:**
  - Hoja de explosión con revisiones REV-xx (azul, rosa, rojo).
  - Importar y exportar el Excel SULA; quitar o reemplazar el Excel.
  - OC desde PDF con el folio en la columna OC.
  - Compra/Almacén con fechas y pagos por OC (total, pagado, por pagar).
- **Área de madera** (`/madera`, rol `madera`, cuenta en Supabase Auth):
  - Sidebar propio con colores de madera.
  - "Subir archivos" con la franja Excel → explosión | PDF → OC.
  - Hoja con descargas Excel/PDF.
- **Mobi** (Groq) en admin, operador y madera, con conocimiento ampliado.
- **Arrastrar un pedido PDF** en el Dashboard del admin → orden nueva.
- **Lector de OC** que entiende el PDF original de Click Balance (acomodo pegado) y el de antes.
- **Indicador por material:** PEDIDO · OC xxxx / FALTA PEDIR, resumen "Pedidos X de Y", filtros y columna SE COMPRA.
- **Madera "SIN ALTA":** subir Excel/PDF sin elegir pedido y aunque el pedido no esté dado de alta (OC en espera).

## 2. Entregado, por confirmar que quedó completo

Revisa en el código o pregunta a Gutz; si ya está, muévelo a la sección 1.

- [ ] Bugs del operador (`docs/specs/SPEC-operador-bugs-y-reportes.md`):
  - "faltan piezas" con 4518/4518,
  - corrección que no se guarda,
  - mensajes verde y rojo juntos,
  - "2 piezas por hacer" estando al 100%,
  - reloj en curso en un área cerrada,
  - % general en 95%,
  - "Failed to fetch".
- [ ] Rediseño de la tarjeta de retrasos en Reportes (`TarjetaRetraso.tsx`).
- [ ] Borrar el reporte de prueba del Pedido 3517. Es SQL que corre Gutz.
- [ ] Columnas de pagos en `bom_ordenes_compra` (subtotal, iva, total, monto_pagado, fecha_pago). Salió el error "Could not find the 'iva' column" y se le dio a Gutz el SQL para agregarlas.

## 3. En curso

### Tarea A (AHORA): Perfiles ERP — compras, finanzas, almacén (solo Dashboard + BOM)
**Spec:** `docs/specs/SPEC-perfiles-erp.md`  ·  **SQL:** `sql/roles_erp.sql` (+ plantilla de cuentas que NO se sube)

| Paso | Qué | Estado |
|---|---|---|
| 1 | SQL de roles + cuentas en Supabase Auth (Gutz) | ✅ 19-nov (3 cuentas listas) |
| 2 | `admin-api.ts`: `puedeVerBom`, `puede(accion)`, `verCostos` | 🟨 hecho, sin commit |
| 3 | Login + proxy → `/erp` | 🟨 hecho, sin commit |
| 4 | Panel `/erp` (layout, dashboard por perfil, BOM lista y detalle) | 🟨 hecho, sin commit |
| 5 | `HojaExplosion` con prop `perfil` | 🟨 hecho, sin commit |
| 6 | APIs con permiso por acción (403 real) y sin costos para almacén | 🟨 hecho, sin commit |
| 7 | Mobi con los roles nuevos | 🟨 hecho, sin commit |
| 8 | Pruebas con una cuenta por perfil + commit | 🟨 probado local con sesión simulada; falta Gutz con las 3 cuentas y el commit |

### Tarea B (DESPUÉS de A): Estados de Finanzas y Almacén por partida + campana + plantilla Excel de SULA
**Spec:** `docs/specs/SPEC-explosion-estados-finanzas-almacen.md` · **SQL:** `sql/explosion_estados.sql`
Reemplaza a `SPEC-explosion-v5-plantilla-v2-y-roles.md` (obsoleto: el pago ahora es por partida y el Excel usa la plantilla de SULA).

| Paso | Qué | Estado |
|---|---|---|
| 1 | SQL de estados (Gutz) | ✅ corrido (las 4 columnas existen) |
| 2 | Tipos/constantes de estados | 🟨 hecho, sin commit |
| 3 | Al subir explosión: PENDIENTE DE PAGO / PENDIENTE DE RECIBIR | 🟨 hecho, sin commit |
| 4 | API: cambiar estados, fecha automática, permisos | 🟨 hecho; permisos y validaciones probados (403/400); escritura sin probar por Claude |
| 5 | Notificaciones + campana en `/erp` | 🟨 hecho, sin probar con avisos reales |
| 6 | Hoja con columnas FINANZAS / ALMACÉN | 🟨 hecho, sin commit |
| 7 | Excel con la plantilla de SULA (leer y escribir) | 🟨 hecho; regresión OK (P-0002, P-3492, P-3518, Quarry: mismos materiales y totales) |
| 8 | PDF y Mobi | 🟨 hecho, sin commit |

### Tarea C: Almacén — RECIBIDO / FALTAN + "pagado incompleto" + arreglos de la hoja
**Spec:** pegado por Gutz el 19-nov (sin SQL) · 🟨 hecho en local por Claude local, sin commit
- RECIBIDO ("4 de 5", "+ llegada" que suma) y FALTAN (calculado); el estado se ajusta solo con la cantidad (`estadoAlmacenPorCantidad`).
- "Pagado incompleto" (PAGADO y parcial, o por recibir 3+ días después del pago): pastilla, filtro, resumen, KPI en `/erp` (almacén y compras), aviso a compras y finanzas, Mobi.
- Excel: ALMACEN O7:R7 (O estado · P RECIBIDO · Q FALTAN con fórmula · R FECHA · S SE COMPRA); lee el formato nuevo y el anterior (CANTIDAD).
- Hoja: Clave + Descripción fijas al desplazar, secciones y "Totales X:" siempre visibles, sin renglón vacío para quien no edita materiales, fechas dd/mm/aaaa.

 · 🟨 a medias · ✅ terminado y con commit

## 4. Siguiente paso exacto

1. ✅ Base de datos lista (roles, 3 cuentas y columnas de estados).
2. ✅ Tareas A y B hechas en local por Claude local (19-nov), sin commit.
3. Gutz prueba en `npm run dev` con las 3 cuentas: pruebas 1-8 de la Tarea A y 1-11 de la Tarea B (sobre todo: avisos en la campana, PARCIALMENTE RECIBIDO con cantidad, masivo por OC, Excel descargado y vuelto a subir).
3. Al final, con Gutz: guardar todo y subir a GitHub ("Paso final" del spec). Hasta hoy, nada de lo hecho después del BOM v4.3 está en GitHub.

## 5. Decisiones abiertas (solo Gutz las cierra)

- Cuentas reales de Compras, Finanzas y Almacén: las da de alta Gutz en Supabase Auth. Los correos **no** se escriben en el repo.
- ¿Madera sigue capturando pagos o pasa todo a Finanzas? Por ahora: los sigue capturando.
- Recepción parcial: por ahora se captura la cantidad recibida (decidido en el spec).
- En los Excel reales de P-3492 y P-3518 hay **costos estimados escritos a mano que no cuadran** con costo × cantidad. Hay que revisarlo con el ingeniero; la plantilla v2 usa fórmulas.

## 6. Reglas de relevo

- **Una tarea a la vez.** No empieces la fase siguiente si la actual no compila.
- Antes de un cambio grande: `git checkout -b <tarea>`. Al terminar cada fase: commit (`feat(erp): fase 2 — permisos por perfil`) y actualiza la tabla de la sección 3.
- Si te vas a quedar sin contexto: deja **lo que funciona** en commit; lo que no compila va comentado o en una rama, con nota aquí.
- Los specs nuevos los escribe Claude (nube) en `docs/specs/`. Si un agente necesita cambiar una decisión, la anota en la sección 5 y no la inventa.
- El código de `src/app/operator` es de los compañeros: solo se toca con un spec que lo pida.

## 7. Bitácora (lo más nuevo arriba)

| Fecha | Agente | Qué hizo | Commit |
|---|---|---|---|
| 2026-11-19 | Claude local | Tarea C: RECIBIDO/FALTAN, "+ llegada", pagado incompleto (pastilla, filtro, KPI, aviso, Mobi), Excel O–R, arreglos de la hoja (columnas fijas, secciones, fechas dd/mm/aaaa) | pendiente (Paso final con Gutz) |
| 2026-11-19 | Claude local | Tarea B: estados FINANZAS/ALMACÉN por partida (API con fecha automática, masivo por OC, Historial), campana `/erp` + `notificar-erp.ts`, hoja con grupos COMPRAS/FINANZAS/ALMACÉN, Excel con la plantilla de SULA (J–Q, leyenda, listas, "Se compra" en R), PDF, Mobi | pendiente (Paso final con Gutz) |
| 2026-11-19 | Claude local | Tarea A: perfiles ERP pasos 2-7 (permisos 403, login/proxy `/erp`, panel, hoja por perfil, almacén sin costos, Mobi) | pendiente (Paso final con Gutz) |
| 2026-11-19 | Claude (nube) | Spec de estados Finanzas/Almacén por partida + campana + plantilla SULA (Tarea B) | (lo sube Gutz) |
| 2026-11-19 | Claude (nube) | Spec de perfiles ERP (compras, finanzas, almacén) + SQL de roles y plantilla de cuentas | (lo sube Gutz) |
| 2026-11-18 | Claude (nube) | `AGENTS.md` completo, matriz de roles, plantilla v2 (Excel), spec Explosión v5, este archivo de relevo | (lo sube Gutz) |
| 2026-11-18 | Claude local | Lector de OC real + indicador "ya pedido" + madera SIN ALTA | (ver git log) |
