# Backlog técnico

Items conocidos que no entran en sprints actuales pero deben resolverse.
No es exhaustivo — solo cosas detectadas durante sprints recientes.

## Seguridad

### Restringir acceso a rutas /admin/* por rol
**Origen:** Sprint G2 (mayo 2026).

Hoy el sidebar admin se renderiza condicionalmente segun `userRole`
(`navSections[].roles`), pero **no hay bloqueo técnico real** a nivel
middleware ni RLS. Un usuario con rol `vendedor` puede escribir
`/admin/cotizaciones-venta` (u otra ruta admin) en la URL y acceder a
todos los datos del sistema porque:

  - El middleware `lib/supabase/middleware.ts` solo verifica que haya
    sesión, no rol.
  - Las RLS policies actuales son `auth.role() = 'authenticated'`
    permitiendo ALL — cualquier usuario logueado lee/escribe todo.
  - El sidebar oculta los items pero la ruta sigue siendo accesible.

**A hacer (sprint dedicado de seguridad):**
- Middleware: leer `vendedores.role` por `auth_user_id` y bloquear
  rutas `/admin/*` para roles distintos de `admin` (redirect a
  `/vendedor` o página 403).
- RLS: ajustar policies para que `SELECT/UPDATE/DELETE` filtre por
  rol o vendedor_id según corresponda. Empezar por tablas con datos
  sensibles (facturas, cuenta_corriente_cliente, recibos_cobranza).
- Tests manuales con un usuario `vendedor` para confirmar que las
  rutas admin tiran 403 / redirect.

**Workaround actual:** ocultamiento por sidebar — funciona para
usuarios bien intencionados, no para amenazas internas o accidentes.

## Persistencia de items de factura

### C.3 — Facturas manuales con descuento no persisten detalle
**Origen:** Sprint C (mayo 2026).

El detalle de items de una factura emitida se reconstruye filtrando
`order_items` por `factura_id` (post fix A.1). Funciona bien cuando la
factura proviene de un pedido. Pero `/admin/facturacion/nueva` permite
emitir facturas manuales SIN pedido — en ese caso no hay `order_items`
asociados y el detalle interno queda vacío. El PDF de TusFacturas
contiene los items (incluyendo descuentos) pero la app no puede
re-mostrarlos.

**A hacer (si el caso se vuelve frecuente):**
- Crear tabla `factura_items` propia (cantidad, precio, descripcion,
  tipo_linea, factura_id).
- Mover lectura del detalle de `order_items` (post-fix A.1) a esa
  tabla cuando la factura sea manual.
- Mantener compatibilidad con facturas legacy que sí venían de pedido.

**Workaround actual:** las facturas manuales con descuento muestran
detalle vacío al abrir desde `/admin/facturacion`. El operador ve el
PDF generado en `pdf_url` que sí incluye todo. Aceptado porque la
mayoría de facturas vienen de pedidos.

## Forms y schema

### Dialog de editar proveedor en `/admin/proveedores/[id]`
**Origen:** sprint AFIP sync (mayo 2026).

Hoy la ficha de proveedor solo permite editar `observaciones_pagos`. Los datos
principales (`nombre`, `razon_social`, `cuit`, `condicion_iva`, `domicilio`,
`localidad`, `provincia`, `cp`, `email_comercial`, `condicion_pago`, etc.) no
se pueden modificar desde la UI — sólo desde Supabase Studio o re-creando.

**A hacer:**
- Crear un dialog "Editar proveedor" con los campos principales.
- Integrar el componente `<BotonSincAfip />` al lado del input CUIT, mismo
  patrón que `clientes/[id]`.
- Decidir si el dialog reemplaza la card readonly o convive.

**Workaround actual:** botón "Sincronizar AFIP" solo está en `proveedores/nuevo`.

### Campos faltantes en form de `/admin/proveedores/nuevo`
**Origen:** sprint AFIP sync (mayo 2026).

El form solo captura `nombre`, `cuit`, `condicion_pago`, `cbu`,
`email_comercial`, `email_pagos`, `contactos`, `observaciones`. La columna
`proveedores.condicion_iva` existe en DB y se ve en la ficha, pero no se
puede cargar al crear.

**A hacer:**
- Agregar al form: `condicion_iva` (Select), `domicilio` (texto), `localidad`,
  `provincia`, `cp`.
- Una vez agregados, extender el caller del `<BotonSincAfip />` en
  `proveedores/nuevo` para aplicar también esos campos (hoy solo aplica
  `razon_social → nombre`).
- Considerar también: `razon_social` como campo separado de `nombre`
  (la DB tiene ambas columnas).

**Workaround actual:** los datos se cargan editando manualmente la fila en
Supabase después de crear.

### Mismatch strings de `condicion_iva` entre forms y DB
**Origen:** sprint AFIP sync (mayo 2026).

- DB usa: `"RESP. INSCRIPTO"`, `"MONOTRIBUTISTA"`, `"EXENTO"`,
  `"CONSUMIDOR FINAL"`, `"NO CATEGORIZADO"`, `"NO RESPONSABLE"`,
  `"MONOTRIBUTISTA SOCIAL"`, `"PEQUEÑO CONTR. EVENTUAL"`, `"BIENES DE USO"`.
- Forms (`<Select>` de `clientes/nuevo` línea 205-209 y `clientes/[id]` dialog
  línea 688-692) usan TitleCase: `"Responsable Inscripto"`, `"Monotributo"`,
  `"Exento"`, `"Consumidor Final"`, `"No Responsable"`.

Cuando se carga un cliente con `condicion_iva = "RESP. INSCRIPTO"`, el
`<select>` no encuentra esa opción y muestra vacío.

**A hacer:**
- Decidir el formato canónico (recomendación: el de DB, ya tiene 2.6k filas).
- Migrar las opciones de los `<Select>` para que coincidan con los strings
  reales de DB.
- Eliminar el helper `mapCondicionIvaToSelectOption()` en `lib/afip-sync.ts`
  (queda inocuo pero deja de tener uso).
- Hacer un `UPDATE` masivo de variantes del mismo concepto si aparecen
  (`"Monotributo"` vs `"MONOTRIBUTISTA"` vs `"Monotributista"`).

**Workaround actual:** `mapCondicionIvaToSelectOption()` traduce DB → Select
on-the-fly. Funciona pero los datos guardados quedan en formatos inconsistentes.

## Bugs reportados sin reproducción determinística

### Bug 9.1 — Códigos de productos no se levantan al cargar factura proveedor
**Origen:** sprint 9 (auditoría de bugs reportados, mayo 2026).

**Reportado por usuarios:** "los códigos de productos no se levantan en factura proveedor".

**Estado:** no reproducible deterministicamente. Verificado que `products.code` no es null en ningún row (4485 productos). La función `selectProducto` (`app/admin/facturas-proveedor/page.tsx:896-904`) sí asigna `codigo: p.code ?? ""` correctamente cuando se clickea una opción del dropdown.

**Sospecha:** race condition en `onBlur` con `setTimeout` de 150ms (líneas 916, 946). Cuando el dropdown se cierra antes del click registrar, la selección se pierde y el código queda vacío. Hay `onMouseDown={(e) => e.preventDefault()}` que debería prevenirlo, pero es susceptible a timing en máquinas lentas.

**Fix candidato (NO aplicado, esperando reproducción):**
- Subir `setTimeout` a 250ms.
- O reemplazar `onClick`+`preventDefault` por `onMouseDown` directo en los items del dropdown — elimina la condición de carrera.
- Defensivo: en `onBlur` del input, autobuscar match exacto en `products` por code/name y autocompletar el otro campo si matchea exactamente. Cubre el caso "tipié el código entero, salí sin clickear dropdown".

**Antes de aplicar:** pedirle screencast al reporter para confirmar el flujo exacto.

### Bug 9.3 — Cotización → Pedido genera error
**Origen:** sprint 9 (auditoría de bugs reportados, mayo 2026).

**Reportado:** "al pasar cotización a pedido genera error".

**Estado:** no reproducible. 7/9 cotizaciones se convirtieron exitosamente (`estado = convertida_pedido`). Las 2 pendientes están vacías y son bloqueadas correctamente antes del flow con el alert "No hay items aprobados para convertir" (cotizaciones-venta/[id]/page.tsx:272), nunca llegan al `try/catch` de error.

**Hipótesis:**
- Vendedor sin `iniciales` y email no matchable hardcoded (`pablo@`, `jestevez@`, `cobranzas@` en `createOrder` queries.ts:196-201) → `prefix` queda como `"PED-"` y la query del último serial puede colisionar con otros formats → 23505 unique violation.
- FK violation a producto/cliente borrado en `order_items.product_id` o `orders.client_id`.
- Race condition en `order_number_serial` con conversiones simultáneas.

**Mejoras propuestas (NO aplicadas):**
- Agregar `e?.code` y `e?.hint` al alert (`cotizaciones-venta/[id]/page.tsx:306`) para diagnóstico instantáneo cuando vuelva a aparecer.
- Hacer `createOrder` transaccional con RPC, o al menos rollback explícito si falla items post-orders.

**Antes de aplicar:** pedir nro de cotización exacto al reporter cuando vuelva a aparecer.

## Alerts genéricos que ocultan errores reales (deuda técnica de UX)

**Origen:** sprint 9. El bug 9.2 ("Error al crear la compra") quedó abierto mucho tiempo porque el alert mostraba solo el mensaje genérico, sin la causa real (columna `email_comercial` faltante en DB). Para evitar repetir el patrón, conviene migrar todos los alerts genéricos al formato que muestra `e.message` o `e.details`.

**Patrón malo** (muestra al user un cartel inútil):
```ts
} catch (err) {
  console.error(err)
  alert("Error al hacer X")
}
```

**Patrón bueno** (al menos lo que ya hace cobranzas/cotizaciones/logística):
```ts
} catch (err) {
  console.error(err)
  alert("Error al hacer X: " + (err instanceof Error ? err.message : (err as any)?.message || (err as any)?.details || "desconocido"))
}
```

### Lista detectada (24 alerts), agrupada por módulo

**Módulos críticos para producción** (priorizar):
- `app/admin/pagos/nuevo/page.tsx:394` — "Error al crear el pago"
- `app/admin/pagos/page.tsx:183` — "Error al enviar email"
- `app/admin/pagos/page.tsx:382` — "Error al crear lote"
- `app/admin/pagos/page.tsx:441` — "Error al enviar a lote"
- `app/admin/pedidos/nuevo/page.tsx:227` — "Error al crear producto"
- `app/admin/pedidos/nuevo/page.tsx:291` — "Error al crear el pedido"
- `app/admin/pedidos/[id]/page.tsx:154` — "Error de conexión al generar factura"
- `app/admin/pedidos/[id]/page.tsx:189` — "Error al actualizar el estado del pedido"
- `app/admin/pedidos/[id]/page.tsx:246` — "Error al cancelar el pedido"

**Operativos** (medium priority):
- `app/admin/cobranzas/page.tsx:360` — "Error guardando ajuste"
- `app/admin/clientes/[id]/page.tsx:162` — "Error al guardar"
- `app/admin/clientes/[id]/page.tsx:196` — "Error al guardar"
- `app/admin/proveedores/[id]/page.tsx:349` — "Error al guardar" (observaciones_pagos)
- `app/admin/facturacion/nueva/page.tsx:300` — "Error cargando items de la factura original"
- `app/admin/cotizaciones-venta/[id]/page.tsx:324` — "Error al generar PDF"
- `app/admin/stock/nuevo/page.tsx:82` — "Error al crear el producto"

**Tesorería / finanzas:**
- `app/admin/caja-chica/page.tsx:135` — "Error guardando cambios"
- `app/admin/caja-chica/page.tsx:156` — "Error creando movimiento"
- `app/admin/finanzas/comisiones/page.tsx:124` — "Error guardando pago"
- `app/admin/finanzas/egresos/page.tsx:285` — "Error guardando egreso"
- `app/admin/finanzas/egresos/page.tsx:432` — "Error creando servicio fijo"
- `app/admin/finanzas/egresos/page.tsx:515` — "Error creando movimiento"

**Ya arreglados en sprint 9** (commit `<este>`):
- `app/admin/compras/nueva/page.tsx:393` — ahora muestra `e.message`
- `app/admin/compras/page.tsx:231` — ahora muestra `e.message`

**Recomendación:** sprint dedicado de 1-2 horas para migrar los 22 restantes. Cambio mecánico, sin lógica nueva, riesgo bajo.

## Remitos sin pedido (manuales)

### Crear remito desde factura sin pedido vinculado
**Origen:** sprint 7 (mayo 2026), Fix 7.1.

Hoy `/api/remito` exige `orderId`. Los items del remito se sacan de
`order_items` vía `factura.order_id`. **No hay path para emitir un remito a
partir de una factura manual** (creada desde `/admin/facturacion/nueva` sin
pedido) ni para devoluciones/regalos sin pedido base.

**A hacer cuando aparezca la necesidad real:**
- Decidir fuente de items para el caso "remito sin pedido":
  - Opción A: tabla nueva `factura_items` para todas las facturas
    (también ayuda al detalle del modal de factura).
  - Opción B: input manual del usuario (form con cantidad + descripción).
- Modificar `/api/remito` para aceptar `facturaId` como alternativa a
  `orderId`. Insertar en remitos con `factura_id` directo y `order_id = null`.
- Agregar UI: botón "Generar remito" en `/admin/facturacion/[id]` o modal
  de detalle de factura.

**Hoy:** la columna `remitos.factura_id` ya está disponible (commit
sprint 7) y se popula automáticamente desde `orders.factura_id` cuando se
emite un remito desde pedido facturado. El backfill cubrió 6 de 8 remitos
existentes (2 quedan en NULL porque sus pedidos no estaban facturados).

## Hallazgos de auditoría corregidos

### Auditoría #19 — botón "Cargar NC" supuestamente en TabCuentaCorriente
**Origen:** sprint 8 (mayo 2026), durante diagnóstico previo.

Auditoría #19 reportó incorrectamente que el botón "Cargar NC" estaba en
`TabCuentaCorriente` y debía moverse a `TabRegistrarCobro`. Verificación con
`git log` mostró que el botón ya estaba en `TabRegistrarCobro` desde commit
`919f5e8` (28-abr-2026). El reporte original probablemente confundió el rango
de líneas entre `TabCuentaCorriente` (196-616) y `TabRegistrarCobro` (617-1447).

**Estado actual:** botón "Cargar NC" en `app/admin/cobranzas/page.tsx:1014-1021`
junto a "Cargar Retenciones" dentro de la card "Datos generales del recibo"
de `TabRegistrarCobro`. Es donde debe estar según la spec original.

**No hay acción pendiente** — el estado del código es correcto.

## Seguridad y RLS

### RLS de `plan_cuentas` abierta a cualquier autenticado
**Origen:** sprint 10 (mayo 2026, fix 10.2).

La policy actual (`plan_cuentas_auth_all` en
`supabase/migrations/20260410_plan_cuentas_imputaciones.sql`) permite a
cualquier usuario autenticado hacer SELECT/INSERT/UPDATE/DELETE en el plan
de cuentas. Con el botón "+ Nueva imputación" del flow de carga de factura
proveedor, ahora cualquier usuario puede agregar cuentas al catálogo.

**A hacer:** restringir INSERT/UPDATE/DELETE a `role = 'admin'` cuando exista
el sistema de roles real (hoy `vendedores.role` existe pero el filtrado por
role en RLS de otras tablas tampoco está aplicado).

**Por qué se aceptó hoy:** Masoil tiene equipo chico y confiable. Plan de
cuentas tiene 109 filas, agregar 3-5 más por descuido no es crítico y se
puede limpiar con un DELETE manual. La fricción de pasar por un módulo Plan
de Cuentas standalone no compensa el riesgo actual.

## Otros (sin urgencia inmediata)

### `xlsx` sin parche en npm
Ver `SECURITY.md` — riesgo aceptado, backlog para reemplazar por `exceljs`.

### `lodash` via `recharts` sin path de fix
Ver `SECURITY.md` — riesgo aceptado, esperar a que `recharts` actualice.
