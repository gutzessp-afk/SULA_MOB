# SPEC — Explosión: estados de Finanzas y Almacén por partida + campana + plantilla Excel de SULA

**Estado:** LISTO PARA IMPLEMENTAR (pedido por Gutz el 19-nov-2026).
**Va DESPUÉS de:** `SPEC-perfiles-erp.md` (necesita los perfiles `compras`, `finanzas` y `almacen` y el panel `/erp`).
**Reemplaza a:** `SPEC-explosion-v5-plantilla-v2-y-roles.md`. Ese spec queda **obsoleto**: el pago ahora es **por partida** (no se calcula de la OC) y el Excel usa **la plantilla de SULA tal cual**, no la v2.
**SQL:** `sql/explosion_estados.sql` (lo corre Gutz antes de empezar).
**Plantilla de referencia:** el Excel de ingeniería `EXPLOSION DE MATERIALES P-3518 REV-00.xlsx` (columnas COMPRAS / FINANZAS / ALMACEN). Gutz lo tiene; **no se sube al repo** porque trae datos de un cliente.

---

## 1. Cómo funciona (las palabras de Gutz, ordenadas)

1. Se sube el **pedido** (PDF de Click Balance) → nace `PED-####` y su explosión **pendiente** en el BOM. *(Ya existe.)*
2. En la explosión se arrastra el **Excel de explosión** y los **PDF de órdenes de compra**. *(Ya existe.)*
3. **Nuevo — al subir la explosión, en automático, cada partida (material) queda:**
   - **FINANZAS → `PENDIENTE DE PAGO`**
   - **ALMACÉN → `PENDIENTE DE RECIBIR`**

   Esos estados se ven en el sistema (hoja de explosión de todos los perfiles) y **dentro del Excel** que se descarga.
4. **Finanzas** cambia el estado de cada partida: `PENDIENTE DE PAGO` → `PARCIALMENTE PAGADO` → `PAGADO`.
   - **La fecha se pone sola** cada vez que cambia el estado: al pasar a PARCIALMENTE PAGADO se pone la fecha de hoy; al pasar a PAGADO se **vuelve a poner** la fecha de hoy.
   - Se puede corregir a mano si hace falta.
5. **Campana de notificaciones:** cada vez que Finanzas pone una partida en **PARCIALMENTE PAGADO** o **PAGADO**, se avisa a **Almacén**:
   - *"PED-3518 · 1-03-0001 PINTURA POLVO NEGRO MATE — PARCIALMENTE PAGADO: llegará solo una parte del material."*
   - *"PED-3518 · 1-03-0001 PINTURA POLVO NEGRO MATE — PAGADO: ya se pagó, debe llegarte el material completo."*
6. **Almacén** se queda en **`PENDIENTE DE RECIBIR`** hasta que llegue algo. Cuando llega, **lo cambia a mano**:
   - **`PARCIALMENTE RECIBIDO`** + la **cantidad** que llegó. Pasa, por ejemplo, cuando Finanzas solo pagó la mitad, **o** cuando se pagó completo pero el proveedor mandó la mitad.
   - **`RECIBIDO`** cuando llegó todo.
   - La **fecha** se pone sola al cambiar el estado (editable).
   - **El estado de almacén NUNCA se cambia solo por un pago.** Siempre es manual, porque lo pagado no siempre es lo que llega.
7. El **Excel que descarga el sistema** usa **la misma plantilla de SULA** (la de ingeniería), con estas columnas llenas.

## 2. Columnas (idénticas a la plantilla de SULA)

| Grupo (fila 7) | Columna Excel | Encabezado (fila 8) | Campo en BD | Quién edita |
|---|---|---|---|---|
| **COMPRAS** (J7:L7) | J | ORDEN DE COMPRA | `oc` (ya existe) | admin, compras, madera |
| | K | FECHA | `fecha_compra` (ya existe) | admin, compras, madera |
| | L | CHECK | `comprado` (ya existe) | admin, compras, madera |
| **FINANZAS** (M7:N7) | M | FINANZAS | `estado_pago` **(nuevo)** | admin, finanzas, madera |
| | N | FECHA | `fecha_estado_pago` **(nuevo)** | sola al cambiar el estado (editable) |
| **ALMACEN** (O7:Q7) | O | ALMACEN | `estado_almacen` **(nuevo)** | admin, almacen, madera |
| | P | CANTIDAD | `cantidad_recibida` **(nuevo)** | admin, almacen, madera |
| | Q | FECHA | `fecha_almacen` (ya existe) | sola al cambiar el estado (editable) |

**Leyenda** (como en la plantilla, celdas N3:N5 y P3:P5, que también son la fuente de las listas desplegables M y O):

| Pago | Almacén | Color |
|---|---|---|
| PENDIENTE DE PAGO | PENDIENTE DE RECIBIR | rojo `#FEE4E2` / texto `#B42318` |
| PARCIALMENTE PAGADO | PARCIALMENTE RECIBIDO | ámbar `#FEF0C7` / texto `#B54708` |
| PAGADO | RECIBIDO | verde `#D1FADF` / texto `#05603A` |

> La plantilla original dice **"PEDIENTE DE RECIBIR"** (con error). El sistema **escribe** "PENDIENTE DE RECIBIR" y al **leer** acepta las dos formas.

**Compatibilidad:** `almacen` (booleano que ya existe) = `true` solo cuando `estado_almacen = 'RECIBIDO'`. Así siguen funcionando el dashboard de madera, los KPIs y filtros que ya usan `almacen`.

---

## 3. Archivos que se tocan

Rutas desde `dev/sula-mob`:

| # | Archivo | Tipo | Qué cambia |
|---|---|---|---|
| 1 | `sql/explosion_estados.sql` | nuevo | Columnas `estado_pago`, `fecha_estado_pago`, `estado_almacen`, `cantidad_recibida` (+ checks e índice de la campana) |
| 2 | `src/lib/explosion-revisiones.ts` | cambia | Tipos `EstadoPago`/`EstadoAlmacen`, constantes `ESTADOS_PAGO`/`ESTADOS_ALMACEN`, colores, `normalizarEstado()` |
| 3 | `src/lib/explosion-servidor.ts` | cambia | Al copiar líneas a la siguiente revisión se copian también los 4 campos nuevos |
| 4 | `src/lib/explosion-excel.ts` | cambia | **Leer**: columnas M–Q de la plantilla; **escribir**: la plantilla de SULA con J–Q, leyenda y listas |
| 5 | `src/lib/explosion-pdf.ts` | cambia | Columnas Finanzas/Almacén en el PDF |
| 6 | `src/app/api/bom/revisiones/importar/route.ts` (y el de `/api/madera/subir` si importa por su lado) | cambia | Partidas nuevas nacen PENDIENTE DE PAGO / PENDIENTE DE RECIBIR; si el Excel ya trae estados, se respetan |
| 7 | `src/app/api/bom/revisiones/compras/route.ts` | cambia | Nuevas acciones `estado_pago` y `estado_almacen` (+ cantidad), fecha automática, permisos, **notificaciones** |
| 8 | `src/lib/notificar-erp.ts` | nuevo | `avisarRol(rol, mensaje, proyectoId)`: inserta en `notificaciones` para todos los usuarios activos de ese rol (+ push si hay suscripción) |
| 9 | `src/components/erp/CampanaErp.tsx` | nuevo | Campana con contador y lista de avisos del usuario (como la del operador, **copiada**, no importada de `operator`) |
| 10 | `src/app/erp/layout.tsx` (del spec de perfiles) | cambia | Monta `<CampanaErp />` arriba a la derecha |
| 11 | `src/app/admin/bom/[id]/HojaExplosion.tsx` | cambia | Columnas FINANZAS y ALMACEN con selector de estado, fecha y cantidad; colores; acción masiva "Marcar partidas de la OC ___ como…" |
| 12 | `src/app/api/mobi/route.ts` | cambia | Mobi conoce los estados y puede responder "¿qué falta por pagar / por recibir?" |

**No se tocan:** `src/app/operator/**`, `globals.css`, `parse-pdf`, `analizar-plano`. Madera **solo gana** las columnas nuevas en su hoja; su panel no cambia.

---

## 4. Detalle por paso

### Paso 1 — SQL (Gutz)
Correr `sql/explosion_estados.sql`. Las partidas que ya existen quedan en `PENDIENTE DE PAGO` / `PENDIENTE DE RECIBIR` (por el `DEFAULT`), y las que ya estaban palomeadas en Almacén quedan `RECIBIDO`. Debe listar 4 columnas.

### Paso 2 — Tipos y constantes (`explosion-revisiones.ts`)
```ts
export const ESTADOS_PAGO = ['PENDIENTE DE PAGO', 'PARCIALMENTE PAGADO', 'PAGADO'] as const
export const ESTADOS_ALMACEN = ['PENDIENTE DE RECIBIR', 'PARCIALMENTE RECIBIDO', 'RECIBIDO'] as const
export type EstadoPago = typeof ESTADOS_PAGO[number]
export type EstadoAlmacen = typeof ESTADOS_ALMACEN[number]
/** Acepta "PEDIENTE DE RECIBIR" (error de la plantilla), minúsculas y espacios de más */
export function normalizarEstado(texto: string): EstadoPago | EstadoAlmacen | null { … }
export const COLOR_ESTADO: Record<string, { fondo: string; texto: string }> = { … } // rojo / ámbar / verde
```
Agregar los 4 campos a `LineaRev`. En `compararRevision`, **los estados NO cuentan como "cambio" de revisión** (igual que hoy no cuentan OC/Compra/Almacén): cambiar un estado **no abre REV nueva**.

### Paso 3 — Al subir la explosión
- Partidas nuevas: `estado_pago = 'PENDIENTE DE PAGO'`, `estado_almacen = 'PENDIENTE DE RECIBIR'` (el `DEFAULT` de la BD ya lo hace; en el código **no** mandes `null`).
- Si se sube un Excel que **ya trae** estados en M/O (por ejemplo uno descargado del sistema), se **respetan** con `normalizarEstado()`, junto con N, P y Q.
- Al subir otra revisión, las partidas que ya existían (misma **Clave**) **conservan** sus estados, fechas y cantidad (como ya se conservan OC/Compra/Almacén).

### Paso 4 — Editar estados (`compras/route.ts`)
Nuevas acciones en el `PATCH` (mismo endpoint que OC/Compra/Almacén):

```ts
// FINANZAS
{ explosion_id, linea_id, estado_pago: 'PARCIALMENTE PAGADO' }             // fecha = hoy (hoyMexico())
{ explosion_id, linea_id, fecha_estado_pago: '2026-11-18' }                // corrección manual
{ explosion_id, oc: '5621', estado_pago: 'PAGADO' }                        // masivo: todas las partidas con esa OC
// ALMACÉN
{ explosion_id, linea_id, estado_almacen: 'PARCIALMENTE RECIBIDO', cantidad_recibida: 100 }  // fecha = hoy
{ explosion_id, linea_id, fecha_almacen: '2026-11-18' }                    // corrección manual
```

Reglas del servidor:
- **Permisos** (del spec de perfiles): `estado_pago`/`fecha_estado_pago` → `puede('pagos')`; `estado_almacen`/`cantidad_recibida`/`fecha_almacen` → `puede('almacen')`. Sin permiso → **403** con mensaje claro.
- **Fecha automática:** si cambia el estado (distinto al anterior) y no viene fecha → `hoyMexico()`. Si regresa a `PENDIENTE…`, la fecha se **borra**.
- **Almacén:**
  - `RECIBIDO` → `almacen = true`; si `cantidad_recibida` está vacía, se llena con la cantidad necesaria.
  - `PARCIALMENTE RECIBIDO` → `almacen = false`; **exige** `cantidad_recibida > 0` y menor que la necesaria (si no, 400: *"Escribe cuánto llegó (menos de lo necesario)"*).
  - `PENDIENTE DE RECIBIR` → `almacen = false`, `cantidad_recibida = null`.
- Valida con `.select('id')` que de verdad se actualizó (si no, error real; nada de éxito falso).
- Los cambios van **sobre la revisión actual** y **no** abren revisión nueva.
- Registrar en el Historial (`registrarActividad`): `tipo: 'bom_estado_pago'` / `'bom_estado_almacen'`, con clave, estado anterior y nuevo.

### Paso 5 — Notificaciones (`notificar-erp.ts` + campana)
```ts
/** Inserta un aviso para cada usuario activo con ese rol (y push si tiene suscripción) */
export async function avisarRol(supabase, rol: 'almacen' | 'finanzas' | 'compras', mensaje: string, proyectoId: string, remitenteId: string | null)
```
- Busca `usuarios` activos cuyo `roles.nombre = rol` e inserta en `notificaciones` (`remitente_id`, `destinatario_id`, `proyecto_id`, `tipo: 'bom_pago'`, `mensaje`, `leida: false`).
- Si existe el envío push (`src/lib/push.ts`), mándalo también; si falla el push, **no** falla el cambio de estado (pero sí se registra el error en consola).
- **Cuándo se avisa:**
  | Cambio | A quién | Mensaje |
  |---|---|---|
  | Finanzas → `PARCIALMENTE PAGADO` | **almacén** | `PED-#### · {clave} {descripción} — PARCIALMENTE PAGADO: llegará solo una parte del material.` |
  | Finanzas → `PAGADO` | **almacén** | `PED-#### · {clave} {descripción} — PAGADO: ya se pagó, debe llegarte el material completo.` |
  | Masivo por OC | **almacén** | **un solo aviso**: `PED-#### · OC 5621 — PAGADO: N partidas, debe llegarte el material.` |
  | Almacén → `PARCIALMENTE RECIBIDO` / `RECIBIDO` | **compras y finanzas** | `PED-#### · {clave} — RECIBIDO (o "llegó 100 de 255.8").` *(para que sepan que ya llegó)* |
- **Campana** `CampanaErp.tsx` en el layout de `/erp`: contador de no leídas, lista (más nuevas arriba), clic → abre la explosión de ese pedido y marca leída, "Marcar todas como leídas". Tiempo real con Supabase Realtime sobre `notificaciones` filtrado por `destinatario_id` (como ya hace el operador). Madera y admin ya tienen su campana: que **también** reciban si su rol está en la lista (admin: no; para no llenarle la campana).

### Paso 6 — Hoja de explosión (`HojaExplosion.tsx`)
- Encabezado de grupos sobre la tabla: **COMPRAS** (verde) · **FINANZAS** (azul) · **ALMACÉN** (ámbar), con las columnas de la sección 2.
- **FINANZAS:** selector con los 3 estados (pastilla de color); al elegir, se guarda y aparece la fecha de hoy (editable con un date input chico).
- **ALMACÉN:** selector de estado; si elige PARCIALMENTE RECIBIDO, pide la **cantidad** en el mismo renglón antes de guardar; fecha automática.
- Lo que el perfil no puede editar se ve en **solo lectura** (pastilla sin selector).
- **Acción masiva** (finanzas/admin/madera), en el panel de Órdenes de compra: en cada OC, botón *"Marcar sus N partidas como → Parcialmente pagado / Pagado"*.
- **Filtros rápidos** nuevos: "Pendiente de pago", "Por recibir", "Parciales".
- **Resumen** arriba: `Pagadas X · Parciales Y · Pendientes Z` y `Recibidas X · Parciales Y · Por recibir Z`.
- En celular (tarjetas): un bloque por sección con su pastilla.
- Almacén **sigue sin ver costos** (spec de perfiles).

### Paso 7 — Excel con la plantilla de SULA (`explosion-excel.ts`)
**Escribir** (`crearExcelExplosion`) — misma estructura que el Excel de ingeniería:
- Encabezado igual que hoy (REV en A1, GRUPO AVANT CIM, FECHA en A2/A3, CLIENTE/PEDIDO/ORDEN PRODUCCIÓN).
- **Leyenda** N3:N5 (estados de pago) y P3:P5 (estados de almacén) con su color.
- **Grupos** J7:L7 "COMPRAS", M7:N7 "FINANZAS", O7:Q7 "ALMACEN" (combinadas, con relleno: verde `92D050` en J8:K8 como la plantilla, amarillo `FFFF00` en L8).
- **Encabezados fila 8**: A–H como hoy + J "ORDEN DE COMPRA", K "FECHA", L "CHECK", M "FINANZAS", N "FECHA", O "ALMACEN", P "CANTIDAD", Q "FECHA".
- **Cada partida** con sus valores; CHECK = "✓" si `comprado`. M y O con **lista desplegable** (`$N$3:$N$5` y `$P$3:$P$5`) y **formato condicional** de color por estado.
- Secciones por unidad, "Totales X:", "Usuario:", colores de revisión y clasificación, líneas QUITADAS en rojo con "QUITADO" en ORDEN DE COMPRA: **igual que hoy**.
- Se conservan las hojas REPORTE, REGISTRO y FORMATO DE CONTROL.
- Perfil **almacén**: F (Costo) y H (Costo Estimado) y totales en $ **vacíos**.
- **No uses comentarios de celda** (exceljs truena al leerlos).

**Leer** (`leerExcelExplosion`) — además de lo que ya lee:
| Encabezado fila 8 | Campo |
|---|---|
| "ORDEN DE COMPRA" (o "OC") | `oc` (también sirve para detectar QUITADO) |
| primera "FECHA" después de ORDEN DE COMPRA | `fecha_compra` |
| "CHECK" | `comprado` (✓ / SI / X / true) |
| "FINANZAS" | `estado_pago` (con `normalizarEstado`) |
| "FECHA" después de FINANZAS | `fecha_estado_pago` |
| "ALMACEN" / "ALMACÉN" | `estado_almacen` |
| "CANTIDAD" (la **segunda** columna que empieza con "cantidad"; la primera es Cantidad Necesaria) | `cantidad_recibida` |
| "FECHA" después de ALMACEN | `fecha_almacen` |

Celdas vacías → los defaults (PENDIENTE…). **Prueba de regresión:** los Excel viejos (P-0002, P-3492, Quarry Sendero) y el P-3518 deben dar el mismo número de materiales y el mismo total que hoy.

### Paso 8 — PDF y Mobi
- PDF: columnas FINANZAS y ALMACÉN (estado abreviado con color: "Pend.", "Parcial", "Pagado" / "Por recibir", "Parcial", "Recibido").
- Mobi: en `contextoBom()` agrega conteos por estado (pagadas/parciales/pendientes, recibidas/parciales/por recibir) y en el prompt explica el flujo de la sección 1. A almacén, sin montos.

---

## 5. Pruebas

1. Subir el Excel de un pedido: **todas** las partidas aparecen en `PENDIENTE DE PAGO` y `PENDIENTE DE RECIBIR`, en la hoja y en el Excel descargado.
2. **Finanzas** pone una partida en PARCIALMENTE PAGADO → fecha de hoy; luego PAGADO → fecha de hoy otra vez. Regresarla a PENDIENTE borra la fecha.
3. **Almacén** recibe en la **campana** el aviso de cada cambio (parcial y pagado), con el pedido y la partida; clic → abre esa explosión.
4. **Almacén** pone PARCIALMENTE RECIBIDO con cantidad 100 de 255.8 → fecha de hoy; sin cantidad → error claro. RECIBIDO → `almacen = true` y se ve palomeado en el dashboard de madera.
5. Pagado completo pero llegó la mitad: Almacén puede poner PARCIALMENTE RECIBIDO aunque Finanzas diga PAGADO.
6. Compras y Finanzas reciben aviso cuando Almacén marca recibido/parcial.
7. Masivo: "Marcar partidas de la OC 5621 como PAGADO" → todas cambian, **un solo** aviso a almacén.
8. Descargar Excel → misma plantilla de SULA con J–Q llenas, leyenda y listas desplegables funcionando en Excel. Volverlo a subir → se conservan estados, fechas y cantidades.
9. Permisos: finanzas no puede cambiar almacén ni compras; almacén no puede cambiar pagos ni ve costos (probar también llamando la API directo → 403).
10. Cambiar estados **no** crea revisión nueva.
11. `npx tsc --noEmit`, `npm run lint`, `npm run build`, 390 px y escritorio. Actualizar `docs/ESTADO.md`.
