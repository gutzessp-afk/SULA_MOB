# SPEC — Perfiles ERP: Compras, Finanzas y Almacén (solo Dashboard + BOM)

**Estado:** LISTO PARA IMPLEMENTAR (pedido por Gutz el 19-nov-2026).
**Para:** el agente local (Claude en Orca o Hermes). Lee antes `AGENTS.md` y `docs/ESTADO.md`.
**Base:** el panel de **madera** que ya funciona (`/madera`). **Madera NO se toca: ya quedó.**
**Después de esto sigue:** `SPEC-explosion-v5-plantilla-v2-y-roles.md` (plantilla v2 con cantidad recibida, estados, etc.).

---

## Qué quiere Gutz

Tres perfiles nuevos: **compras**, **finanzas** y **almacen**.

- Al entrar, cada uno ve **solo 2 módulos**: **Dashboard** y **BOM (explosiones)**. No ven Proyectos, Despiece, Reportes, Usuarios ni nada más del admin.
- En el BOM pueden **editar su parte**, igual que madera edita la suya hoy.
- El **admin sigue igual** (default): ve y edita todo.

## Qué puede hacer cada perfil

**Regla: se valida en el SERVIDOR, no solo escondiendo botones.**

| Acción en el BOM | admin | compras | finanzas | almacen | madera (sin cambios) |
|---|---|---|---|---|---|
| Ver lista de explosiones (producción **y** madera) | ✅ | ✅ | ✅ | ✅ | solo las suyas, como hoy |
| Ver la hoja de explosión | ✅ | ✅ | ✅ | ✅ **sin costos** | ✅ |
| Subir / reemplazar el **Excel de explosión** | ✅ | ✅ | — | — | ✅ |
| Editar materiales, cerrar o descartar revisión | ✅ | — | — | — | — |
| **OC**: escribir folio, subir y quitar **PDF de OC** | ✅ | ✅ | — | — | ✅ |
| Palomear **Compra** + fecha de compra | ✅ | ✅ | — | — | ✅ |
| **Pagos por OC** (Pagado $, Pagada, fecha de pago) | ✅ | ver | ✅ | — | ✅ |
| Palomear **Almacén** + fecha de almacén | ✅ | ver | — | ✅ | ✅ |
| Descargar Excel / PDF | ✅ | ✅ | ✅ | ✅ **sin costos** | ✅ |
| Cronómetro, iniciar o terminar explosión, estatus del pedido | ✅ | — | — | — | — |

"Ver" = la columna se ve pero en solo lectura. **Almacén** no ve: Costo, Costo estimado, totales en $, panel de pagos ni el KPI "por pagar".

---

## Archivos que se tocan

Gutz quiere verlos **antes** del código. Rutas desde `dev/sula-mob`:

| # | Archivo | Tipo | Qué cambia |
|---|---|---|---|
| 1 | `sql/roles_erp.sql` | nuevo | Roles `compras`, `finanzas`, `almacen` (lo corre Gutz) |
| 2 | `src/lib/admin-api.ts` | cambia | `puedeVerBom()` incluye los 3 roles; nuevo `puede(accion)`; nuevo `verCostos()` |
| 3 | `src/proxy.ts` | cambia | Rutas de los 3 roles → `/erp`; matcher con `/erp/:path*` |
| 4 | `src/app/(auth)/login/actions.ts` | cambia | Cuentas con esos roles van a `/erp` (Supabase Auth **y** usuario/contraseña) |
| 5 | `src/app/erp/layout.tsx` | nuevo | Sidebar con **Dashboard** y **BOM**, tarjeta de usuario con su perfil, Cerrar sesión, `<MobiChat />` |
| 6 | `src/app/erp/page.tsx` | nuevo | Dashboard del perfil (KPIs según rol) |
| 7 | `src/app/erp/bom/page.tsx` | nuevo | Lista de explosiones |
| 8 | `src/app/erp/bom/[id]/page.tsx` | nuevo | Encabezado del pedido + `<HojaExplosion perfil={rol} />` |
| 9 | `src/app/admin/bom/[id]/HojaExplosion.tsx` | cambia | Prop nueva `perfil`; editar o no cada columna según perfil; almacén sin costos |
| 10 | `src/app/api/bom/route.ts` | cambia | GET para los 3 roles (con `puedeVerBom`); para almacén sin importes |
| 11 | `src/app/api/bom/revisiones/route.ts` | cambia | GET para los 3 roles. Escribir: igual que hoy |
| 12 | `src/app/api/bom/revisiones/compras/route.ts` | cambia | Permiso **por acción** con `puede()`: OC/compra · pagos · almacén |
| 13 | `src/app/api/bom/revisiones/importar/route.ts` | cambia | Subir Excel: admin, madera y **compras** |
| 14 | `src/app/api/bom/revisiones/excel/route.ts` | cambia | Descarga para los 3 roles; almacén sin columnas de costo |
| 15 | `src/app/api/mobi/route.ts` | cambia | `ROLES` + qué ve cada perfil en `buildSystemPrompt` |

**No se tocan:** `src/app/madera/**`, `src/app/admin/**` (salvo `HojaExplosion.tsx`), `src/app/operator/**`, `globals.css`, `parse-pdf`, `analizar-plano`.

> Para no duplicar código, `/erp` puede **importar** los componentes que ya usa madera (por ejemplo, `src/app/madera/compras.tsx` o los de su lista y su dashboard). Pero **no los muevas ni los renombres**: madera debe quedar idéntico. Si un componente de madera trae colores de madera fijos, recibe una prop `tema` o se copia a `src/app/erp/`.

---

## Paso 1 — SQL (Gutz) ✅ HECHO el 19-nov-2026

> Ya están en Supabase los roles `compras`, `finanzas`, `almacen` y **3 cuentas** (una por perfil), con su fila en `usuarios` y su rol. **Ojo:** mientras no esté el Paso 3, el login trata a esas cuentas como **admin** (así funcionan hoy las cuentas de Supabase Auth sin rol madera). Por eso el **Paso 3 es prioridad** y no se les da acceso hasta terminarlo.


1. Correr **`sql/roles_erp.sql`** en Supabase. Debe listar los 3 roles nuevos.
2. Crear las cuentas en **Supabase → Authentication → Add user** (Auto Confirm). La contraseña la pone Gutz ahí; **no va en ningún archivo**.
3. Llenar su copia de **`cuentas_erp.PLANTILLA.sql`** (correo, nombre y rol de cada persona) y correrla. **Esa copia con correos reales NO se sube al repo**, que es público.

## Paso 2 — Permisos (`src/lib/admin-api.ts`)

```ts
export const ROLES_BOM = ['admin', 'madera', 'compras', 'finanzas', 'almacen'] as const

/** Ver explosiones (lista, hoja, descargas) */
export async function puedeVerBom() { return ROLES_BOM.includes((await rolSesion()) as never) }

type Accion = 'excel' | 'oc' | 'pagos' | 'almacen'
const PERMISOS: Record<Accion, string[]> = {
  excel:   ['admin', 'madera', 'compras'],   // subir/reemplazar el Excel de explosión
  oc:      ['admin', 'madera', 'compras'],   // folio OC, PDF de OC, Compra + fecha
  pagos:   ['admin', 'madera', 'finanzas'],  // pagado, pagada, fecha de pago
  almacen: ['admin', 'madera', 'almacen'],   // Almacén + fecha
}
export async function puede(accion: Accion) { const r = await rolSesion(); return !!r && PERMISOS[accion].includes(r) }

/** Almacén no ve costos ni importes */
export async function verCostos() { return (await rolSesion()) !== 'almacen' }
```

- **`esAdmin()` no cambia.** Lo que hoy es solo admin (editar materiales, revisiones, cronómetro, estatus) se queda con `esAdmin()`.
- Si tu `admin-api.ts` local ya tiene otra forma, adapta los nombres, pero **la tabla de permisos es la regla**.

## Paso 3 — Login y proxy

**`login/actions.ts`**, en las dos vías:
- **Supabase Auth:** hoy revisa si el rol es `madera`. Agrega: si el rol es `compras`, `finanzas` o `almacen`, `rolAuth` = ese rol y se redirige a **`/erp`**. Cualquier otra cuenta de Auth sigue siendo admin, igual que hoy.
- **Usuario/contraseña** (bcrypt): esos 3 roles también entran por la pestaña de correo y van a `/erp`.
- En la cookie se guarda `{ id, correo, nombre, rol }`, como madera.

**`proxy.ts`:**
```ts
const ERP = ['compras', 'finanzas', 'almacen']
if (ERP.includes(rol)) {
  if (!pathname.startsWith('/erp')) return NextResponse.redirect(new URL('/erp', request.url))
  return NextResponse.next()
}
// /erp solo para esos roles y admin (el admin puede revisarlo)
if (pathname.startsWith('/erp') && rol !== 'admin') {
  return NextResponse.redirect(new URL(rol === 'madera' ? '/madera' : '/operator', request.url))
}
```
Y en `matcher`: agrega `'/erp/:path*'`. Las reglas de madera, admin y operador **no cambian**.

## Paso 4 — Panel `/erp`

**Diseño:** el mismo esqueleto del panel de madera (sidebar a la izquierda, contenido a la derecha), pero con los **colores del admin**: vidrio oscuro, acento azul, fondo global del admin. Ver "Sistema de diseño" en `AGENTS.md`.

- **Etiqueta arriba:** "COMPRAS", "FINANZAS" o "ALMACÉN", según el rol. Usa el verde, azul o ámbar de los grupos de la plantilla v2: `#1F6F43`, `#1D4ED8`, `#B54708`.
- **Menú:** **Dashboard** (`/erp`) y **BOM** (`/erp/bom`). Nada más.
- **Tarjeta de usuario:** nombre + perfil. Botón **Cerrar sesión**.
- `<MobiChat />` en el layout.
- **Admin entrando a `/erp`:** ve un selector para revisar cómo lo ve cada perfil y un botón "Admin" para regresar.

**Dashboard según el perfil.** Usa los datos que ya regresa `GET /api/bom`, igual que el dashboard de madera:

| Perfil | KPIs | Lista debajo |
|---|---|---|
| compras | Materiales **sin OC** (falta pedir) · Con OC · Comprados (%) | Pedidos con más materiales sin OC |
| finanzas | **Total en OC** · Pagado · **Por pagar** | OC con saldo, por pedido/proveedor |
| almacen | **Por llegar** (comprados sin almacén) · En almacén (%) | Pedidos con más material por llegar |

**BOM:**
- **Lista:** todas las explosiones (producción y madera), con búsqueda por pedido o sucursal y filtro por clasificación.
- **Detalle:** encabezado del pedido en solo lectura + `<HojaExplosion perfil={rol} />`.

## Paso 5 — `HojaExplosion.tsx`

- Prop nueva: `perfil?: 'admin' | 'madera' | 'compras' | 'finanzas' | 'almacen'` (default `'admin'`).
  - **No quites** los props que ya existen (`soloCompras`, `filtroInicial`…). Con `soloCompras` debe funcionar exactamente como hoy (madera).
- Qué se puede editar sale de la misma tabla de permisos (en el navegador solo para mostrar u ocultar). Ejemplos:
  - **finanzas:** OC, Compra y Almacén en solo lectura. Solo edita el panel de pagos.
  - **almacen:** solo la casilla Almacén y su fecha. **No se renderizan** Costo, Costo estimado, totales en $ ni el panel de pagos.
  - **compras:** zona de arrastre con Excel y PDF de OC, columnas OC y Compra + fecha. Pagos y Almacén en solo lectura.
- Las acciones de admin (editar materiales, cerrar o descartar revisión, cronómetro, estatus) **no aparecen** para los 3 perfiles.

## Paso 6 — APIs (validación real)

- **`compras/route.ts`:** antes de cada escritura, revisa **qué campo** se cambia:
  - `oc`, PDF de OC, `comprado`, `fecha_compra` → `puede('oc')`.
  - `monto_pagado`, `pagada`, `fecha_pago` → `puede('pagos')`.
  - `almacen`, `fecha_almacen` → `puede('almacen')`.
  - Si no tiene permiso → **403** con un mensaje claro ("Tu perfil no puede editar pagos"). Nada de éxito falso. Valida con `.select('id')` que el `update` sí cambió algo.
- **`importar/route.ts`:** `puede('excel')`.
- **`route.ts` (GET lista)** y **`revisiones/route.ts` (GET):** `puedeVerBom()`. Si `!verCostos()`, quita `costo`, importes, totales y pagos de la respuesta **en el servidor**.
- **`excel/route.ts`:** `puedeVerBom()`. Si `!verCostos()`, el Excel/PDF sale sin las columnas de costo ni los totales en $.

## Paso 7 — Mobi

En `src/app/api/mobi/route.ts`:
- `ROLES`: agrega `compras: 'COMPRAS'`, `finanzas: 'FINANZAS'` y `almacen: 'ALMACÉN'`.
- En `buildSystemPrompt`, una línea por perfil con lo que ve y puede hacer (la tabla de arriba). Si pregunta por otros módulos, que le diga que eso lo ve un administrador.
- **Almacén:** que Mobi **no le dé importes ni pagos**. Si `rol === 'almacen'`, no agregues `contextoBom()` al contexto, o quita los montos.

---

## Pruebas (con una cuenta de prueba por perfil)

1. Cada cuenta entra y va a **`/erp`**, con solo Dashboard y BOM en el menú y su etiqueta (COMPRAS, FINANZAS o ALMACÉN).
2. Escribir a mano `/admin/proyectos` o `/madera` en la barra: regresa a `/erp`.
3. **Compras:** sube un Excel y una OC en PDF y palomea Compra. No puede tocar pagos ni Almacén.
4. **Finanzas:** captura un pago parcial y luego marca "Pagada". No puede tocar OC, Compra ni Almacén.
5. **Almacén:** palomea Almacén con fecha. **No ve ningún $** en la hoja, el dashboard, el Excel descargado ni Mobi.
6. Llamar la API **directo** con la cookie de cada perfil y una acción que no le toca: **403**.
7. **Admin:** todo igual que antes; puede abrir `/erp` y revisar cada perfil.
8. **Madera:** todo igual que antes (su sidebar, Subir archivos, sus explosiones).
9. `npx tsc --noEmit`, `npm run lint`, `npm run build`, y probar a 390 px y en escritorio.
10. Actualizar `docs/ESTADO.md` (tabla y bitácora).

## Paso final — Guardar todo y subir a GitHub (AL ÚLTIMO, con Gutz)

Gutz pidió dejar esto para el final. Hazlo **con él** y paso por paso:

1. `git status --short`: enséñale la lista. **Nunca** debe aparecer `.env.local` ni archivos con correos o contraseñas (por ejemplo, su copia de `cuentas_erp.PLANTILLA.sql` con correos reales).
2. `git remote -v`: debe ser `github.com/gutzessp-afk/SULA_MOB`.
3. Guardar y subir **todo lo que ya funciona**: este trabajo y los cambios locales anteriores (madera, OC, sin pedido, operador):
   ```bash
   git add -A -- src public sql docs AGENTS.md
   git commit -m "feat(erp): perfiles compras, finanzas y almacén con Dashboard y BOM"
   git push origin main
   ```
4. El despliegue a Vercel lo decide Gutz aparte; el push no despliega solo.
