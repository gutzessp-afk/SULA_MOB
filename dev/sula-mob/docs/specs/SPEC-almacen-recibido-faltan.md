# SPEC — Almacén: columnas RECIBIDO y FALTAN + caso "pagado pero llegó incompleto" + arreglos de la hoja

**Estado:** LISTO PARA IMPLEMENTAR (pedido por Gutz el 19-nov-2026, después de probar la Tarea B).
**Va después de:** `SPEC-explosion-estados-finanzas-almacen.md` (Tarea B, ya implementada).
**SQL:** **no lleva**. `cantidad_recibida` ya existe y "faltan" se calcula.

---

## 1. Qué pidió Gutz

1. Le gustó el campo **"¿Cuánto?"** de Almacén. Ahora quiere que haga **la cuenta de la diferencia**: si el pedido era de **5** y llegaron **4**, que diga que **falta 1**.
2. En lugar de una sola columna CANTIDAD, **dos columnas**: **RECIBIDO** y **FALTAN**.
3. El caso que **sí pasa**: Finanzas pone **PAGADO**, pero a Almacén le llega **incompleto** (parcialmente recibido). Eso se tiene que ver claro y avisar.

## 2. Cómo debe funcionar

### Columnas de ALMACÉN (en la hoja y en el Excel)

| Columna | Qué es | Quién la edita |
|---|---|---|
| **ALMACÉN** | Estado: PENDIENTE DE RECIBIR · PARCIALMENTE RECIBIDO · RECIBIDO | admin, almacén, madera |
| **RECIBIDO** | Cuánto ha llegado en total (`cantidad_recibida`). Se muestra como `4 de 5` (lo recibido **de** la cantidad necesaria) | admin, almacén, madera |
| **FALTAN** | **Se calcula sola**: `max(0, cantidad necesaria − recibido)`. Solo lectura | nadie (es cálculo) |
| **FECHA** | Fecha del último cambio de estado (automática, editable) | admin, almacén, madera |

### Reglas (estado ↔ cantidad, siempre coherentes)

| El usuario hace… | Resultado |
|---|---|
| Elige **RECIBIDO** | RECIBIDO = cantidad necesaria · FALTAN = 0 · fecha = hoy |
| Elige **PARCIALMENTE RECIBIDO** | Pide RECIBIDO en el mismo renglón (el campo "¿Cuánto?" que ya existe, con el foco puesto). Debe ser **> 0 y < necesaria** |
| Escribe una cantidad en RECIBIDO | El estado se ajusta solo: `0` o vacío → PENDIENTE DE RECIBIR · `0 < x < necesaria` → PARCIALMENTE RECIBIDO · `x ≥ necesaria` → RECIBIDO. Fecha = hoy si cambió el estado |
| Elige **PENDIENTE DE RECIBIR** | RECIBIDO vacío · FALTAN = necesaria · fecha se borra |
| Llega **otra entrega** del mismo material | Botón chico **"+ llegada"** junto a RECIBIDO: pide cuánto llegó ahora y lo **suma** al total (4 + 1 = 5 → pasa solo a RECIBIDO) |

- Si llega **más** de lo necesario (ej. 6 de 5): se acepta, estado RECIBIDO, FALTAN 0, y un aviso ámbar chico **"+1 de más"**.
- Cantidades con decimales (kilos, metros): se permiten hasta 3 decimales, igual que la cantidad necesaria.
- `almacen` (booleano viejo) = `true` solo si el estado es RECIBIDO (como ya está).

### Caso "PAGADO pero llegó incompleto"

Cuando una partida tiene **Finanzas = PAGADO** y **Almacén = PARCIALMENTE RECIBIDO** (o PENDIENTE pasados unos días):

1. **En la hoja**: junto al estado de almacén, pastilla roja **"⚠ Pagado · faltan 1"** (con la cantidad que falta y su unidad).
2. **Filtro rápido nuevo**: **"Pagado incompleto (N)"**, para que Finanzas y Compras vean todo lo que se pagó y no ha llegado completo.
3. **Resumen arriba**: agrega `· Pagado incompleto N` en la línea de Almacén.
4. **Notificación** (campana) al guardar un PARCIALMENTE RECIBIDO de algo PAGADO → a **Compras y Finanzas**:
   *"PED-3492 · 1-03-0110 PINTURA EN POLVO… — PAGADO completo pero llegaron 4 de 5 Kilo: faltan 1. Revisar con el proveedor."*
   (Si la partida NO estaba pagada, el aviso normal de la Tarea B: *"llegaron 4 de 5"*).
5. **Dashboard de Almacén y de Compras** (`/erp`): KPI **"Pagado incompleto"**.

## 3. Arreglos que se ven en la captura de Gutz (perfil almacén, `/erp/bom/[id]`)

Arreglarlos de raíz, sin tapar:

1. **No se ve la Descripción**: la columna quedó aplastada (el encabezado muestra solo `)` y en cada renglón se asoma `edir` de la pastilla "Falta pedir"). La columna Descripción necesita ancho mínimo (`min-w-[260px]`, con texto en 2 líneas) y la pastilla de estado de compra va **debajo** de la descripción o en su propia columna, no encima.
2. **Renglón vacío con "Clave"** (el de agregar material) aparece para almacén: ese renglón solo debe existir para quien puede editar materiales (admin). En perfiles sin ese permiso, no se renderiza.
3. **Encabezados de sección vacíos**: las barras grises de "Kilo" / "Pieza" salen sin texto, y la fila de totales dice solo `670.35`. Deben decir **"Kilo"** y **"Totales Kilo: 670.35"** también cuando se ocultan las columnas de costo (el texto debe ir en una columna que siempre se ve: Clave/Descripción).
4. **Fechas en formato gringo** (`11/19/2026`, `mm/dd/yyyy`): mostrar **dd/mm/aaaa** (`19/11/2026`). Cuando la celda no se está editando, mostrar el texto formateado con `toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })`; el `<input type="date">` solo al dar clic (el formato del input nativo depende del navegador).
5. Revisar lo mismo en los perfiles compras y finanzas y en madera (que no tenga el mismo problema de columnas).

## 4. Archivos que se tocan

| # | Archivo | Qué cambia |
|---|---|---|
| 1 | `src/lib/explosion-revisiones.ts` | `faltanDe(linea)` y `estadoAlmacenPorCantidad(recibido, necesaria)` (una sola regla para pantalla, servidor y Excel) |
| 2 | `src/app/api/bom/revisiones/compras/route.ts` | Acepta `cantidad_recibida` sola (ajusta el estado), acción `sumar_llegada`, validaciones, aviso "pagado incompleto" a compras y finanzas |
| 3 | `src/app/admin/bom/[id]/HojaExplosion.tsx` | Columnas RECIBIDO ("4 de 5" + "+ llegada") y FALTAN; pastilla "⚠ Pagado · faltan N"; filtro y resumen; arreglos 1–4 de la sección 3 |
| 4 | `src/lib/explosion-excel.ts` | Grupo ALMACÉN = **O7:R7** con O ALMACEN · P RECIBIDO · Q FALTAN (fórmula `=MAX(0,G{fila}-P{fila})`) · R FECHA. **Leer**: acepta el formato nuevo **y** el anterior (P CANTIDAD · Q FECHA); FALTAN no se importa (se calcula) |
| 5 | `src/lib/explosion-pdf.ts` | Columnas Recibido y Faltan |
| 6 | `src/app/erp/page.tsx` | KPI "Pagado incompleto" en almacén y compras |
| 7 | `src/app/api/mobi/route.ts` | Conteo "pagado incompleto" en el contexto (sin montos para almacén) |

**No se tocan:** operador, `globals.css`, `parse-pdf`, `analizar-plano`, el panel de madera (solo gana las columnas en su hoja).

## 5. API (`compras/route.ts`)

```ts
// Escribir el total recibido (el estado se calcula con estadoAlmacenPorCantidad)
{ explosion_id, linea_id, cantidad_recibida: 4 }
// Sumar una llegada al total
{ explosion_id, linea_id, sumar_llegada: 1 }
// Elegir estado (como ya existe); PARCIALMENTE RECIBIDO exige cantidad_recibida
{ explosion_id, linea_id, estado_almacen: 'RECIBIDO' }
```
- Permiso `puede('almacen')` (403 si no).
- Validar número `>= 0` con hasta 3 decimales; `sumar_llegada > 0`.
- Fecha = `hoyMexico()` cuando cambia el estado; se borra si regresa a PENDIENTE.
- Validar con `.select('id')` que se guardó (nada de éxito falso).
- Historial: `registrarActividad` tipo `bom_estado_almacen` con recibido anterior → nuevo.
- Avisos: ver sección 2 ("Pagado incompleto" → compras y finanzas; si no estaba pagado, el aviso normal).

## 6. Pruebas

1. Partida de 5: escribir 4 → PARCIALMENTE RECIBIDO, RECIBIDO "4 de 5", **FALTAN 1**, fecha de hoy.
2. "+ llegada" 1 → RECIBIDO "5 de 5", FALTAN 0, estado RECIBIDO solo.
3. Elegir RECIBIDO directo → RECIBIDO = necesaria, FALTAN 0.
4. Elegir PENDIENTE → RECIBIDO vacío, FALTAN = necesaria, sin fecha.
5. Finanzas pone PAGADO; Almacén registra 4 de 5 → pastilla "⚠ Pagado · faltan 1", filtro "Pagado incompleto" lo muestra, y **Compras y Finanzas** reciben aviso en la campana.
6. Decimales: 255.8 kg necesarios, llegan 100 → faltan 155.8.
7. Descargar Excel: columnas ALMACEN · RECIBIDO · FALTAN (con fórmula) · FECHA. Volver a subirlo → se conserva lo recibido. Un Excel con el formato anterior (CANTIDAD) también se importa bien.
8. Perfil almacén: se ve la Descripción completa, no aparece el renglón vacío "Clave", las secciones dicen "Kilo"/"Pieza" y "Totales Kilo: …", fechas en dd/mm/aaaa, y sigue sin ver ningún $.
9. `npx tsc --noEmit`, `npm run lint`, `npm run build`, 390 px y escritorio. Actualizar `docs/ESTADO.md`.
