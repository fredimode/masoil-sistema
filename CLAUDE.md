# CLAUDE.md — Masoil Sistema

Memoria persistente del proyecto. Leé esto antes de tocar nada. Captura lo
**no obvio** (convenciones, gotchas, deuda) — el resto se deriva del código.

## Qué es
ERP comercial para Masoil (distribuidora/equipamiento). Factura ante AFIP bajo
**dos razones sociales**: Aquiles Equipamientos SRL y Conancap SRL. Cubre
ventas, facturación electrónica, compras, cobranzas, logística, inventario,
finanzas y contabilidad de IVA. Ver `docs/ESTADO_SISTEMA.md` (auditoría) y
`docs/PLAN_REMEDIACION_CONTABLE.md`.

## Stack
- Next.js 16.2.3 (App Router) · React 19.2 · TypeScript 5 · Tailwind 4 · shadcn/ui.
- Supabase: auth + Postgres con RLS. PDFs con `pdf-lib` / `jspdf`. Email: Resend.
- Facturación AFIP vía **TusFacturas.app** (`lib/tusfacturas.ts`).
- Gestor de paquetes: **pnpm** (`pnpm-lock.yaml`).

## Comandos
- Typecheck: `npx tsc --noEmit` · Build: `npx next build` (o `pnpm build`).
- **Correr SIEMPRE typecheck + build antes de cada push.** `next.config.mjs`
  ya NO tiene `ignoreBuildErrors` (se limpió): el build valida tipos de verdad.
- Lint: `pnpm lint`. Tests: `pnpm test:db` (tsx), `test:e2e` (playwright), `test:unit` (vitest).

## Arquitectura
- Dos interfaces por rol: `/admin` (desktop) y `/vendedor` (mobile-first, BottomNav).
- Supabase: `lib/supabase/client.ts` (browser, anon), `lib/supabase/server.ts`
  (SSR + `createServiceClient()` que bypassa RLS). Hook `lib/hooks/useCurrentVendedor.ts`.
- Capa de datos central: **`lib/supabase/queries.ts`** (~2900 líneas, wrappers
  finos por tabla, patrón `if (error) throw error`).
- Auth/roles en `middleware.ts` + tabla `vendedores` (vínculo `auth_user_id = auth.uid()`).

## ⚠️ Gotchas críticos (la causa de la mayoría de los bugs)
- **Las migraciones se aplican A MANO en Supabase.** Hay drift entre
  `supabase/migrations/*.sql` y la DB real. Al agregar columnas: escribí la
  migración idempotente y **pasásela a Fredi para que la aplique** (no la
  ejecutás vos). Verificá el esquema real antes de asumir.
- **Para diagnosticar/verificar prod: SELECT read-only vía REST** con la
  `SUPABASE_SERVICE_ROLE_KEY` del `.env.local` (bypassa RLS). NUNCA hagas
  writes a prod sin OK explícito de Fredi.
- **No hay transacciones** (Supabase JS no las da). Operaciones multi-tabla
  (crear pedido/OC/factura/pago) y numeración correlativa (MAX+1 client-side)
  tienen race conditions conocidas. Mover stock es read-modify-write.
- **`updateClient` tolera columnas faltantes** (borra la col ante error 42703 y
  reintenta) → puede "guardar" sin persistir si la columna no existe en prod.

## Fuente única de saldo (cobranzas) — NO romper
- **`lib/saldos.ts`** es la única fuente de cálculo de saldo. Las 3 pantallas
  (Cuenta Corriente, Informe de Saldos, Facturación) la consumen:
  `calcularSaldoPorCuit` (neto debe−haber, **agrupado por CUIT**) y
  `calcularEstadoFacturas` (estado de pago por factura).
- Convención NC: vive en `cuenta_corriente_cliente` como **haber** (resta del
  neto); en listados de comprobantes se emite con saldo NEGATIVO para que todos
  sumen sin lógica de signo.
- Los saldos son **REALES** (deuda migrada de GestionPro, ~$92,7M). NO resetear
  `cuenta_corriente_cliente` ni `cobranzas_pendientes`. Lo migrado se distingue
  por `observaciones LIKE 'GestionPro%'`.
- **Deuda por factura (Facturación) vía recibo — `construirMovimientosPorFactura`
  en `lib/saldos.ts`.** La pestaña Emitidas imputa cobros/retenciones **por
  factura**, pero el ~98% de los RC/RT en `cuenta_corriente_cliente` referencian
  el **recibo** (UUID) o vienen NULL, no la factura → sin esto las facturas
  cobradas mostraban su deuda total. El helper resuelve cada `haber`: si
  `referencia_id` es numérico → acredita directo a esa factura; si es UUID de un
  **recibo** → distribuye entre las facturas `f-` de `recibos_cobranza.facturas_ids`
  **proporcional al total** (single-factura = exacto); NULL / UUID que no es
  recibo → queda como deuda. Cada fila cc se procesa una vez (sin doble conteo:
  RC directo + RT vía recibo son filas distintas). Así Facturación queda
  consistente con Cobranzas (que netea por CUIT). Cubierto por `lib/saldos.test.ts`.

## Retenciones — editar/eliminar solo las SUELTAS
- **Regla**: `retenciones.recibo_id IS NULL` = **suelta** = editable/eliminable
  (se cargan por "carga rápida sin recibo"). `recibo_id` poblado = incluida en un
  recibo emitido = **candado, no se toca** (su importe vive agregado en el RT del
  recibo y en los totales del recibo). Predicado puro `esRetencionEditable`.
- **Cada suelta tiene UN movimiento RT** en `cuenta_corriente_cliente`
  (`referencia_id = retención.id`, `tipo='RT'`, `haber = importe`) que resta del
  saldo del CUIT. Por eso `deleteRetencion`/`updateRetencion` (`queries.ts`)
  **sincronizan ese RT**: borrar/editar la retención borra/actualiza el RT (haber,
  fecha, numero). **Orden: el RT PRIMERO**, así ante fallo parcial (no hay
  transacciones) el saldo ya queda bien. Helpers JS de 2 llamadas (patrón del
  subsistema; RPC se reserva a `ajustar_stock`).
- **Guard de servidor OBLIGATORIO `assertRetencionEditable`**: re-lee `recibo_id`
  contra la DB antes de mutar y aborta si no es NULL (defensa ante UI vieja). UI:
  columna Acciones en `TabRetenciones` (Editar/Eliminar vs candado "En recibo").

## Facturación
- **Camino real = `app/api/facturar/route.ts`.** Existen dos legacy a evitar:
  `app/api/facturacion` POST (stub muerto) y `app/api/facturacion/generar`
  (emisor viejo con otra lógica de IVA). No usar/ampliar los legacy.
- Empresas facturables: **Aquiles** y **Conancap** (`lib/empresas.ts`,
  `EMPRESAS_DATA`). **Masoil NO es facturable** — es marca/lista de precios.
- `EMAIL_ENABLED=false` hardcodeado en `/api/facturar` (no envía mail al cliente).
- Razón social del cliente: usar `clients.business_name` (la columna
  `razon_social` quedó contaminada por un import; ver P4 en el plan contable).

## Precios: `unit_price` CON IVA — `netoAConIva` es la fuente única del ×1.21
- **Convención invariante**: `order_items.unit_price` se guarda **CON IVA**
  (neto ×1.21). La facturación (`/api/facturar`, modal en
  `app/admin/pedidos/[id]`) **divide `unit_price / 1.21`** para mandar
  `precio_unitario_sin_iva` a TusFacturas. Romper esta convención sub-factura.
  - *Excepción*: las **cotizaciones** (`cotizacion_venta_items.precio_unitario`)
    guardan **NETO** (sin IVA) — son presupuestos, suman +21% al mostrar/exportar.
  - `products.price` es **NETO** (las pantallas de armado trabajan en neto y
    aplican el ×1.21 recién al persistir el pedido).
- **Fuente única del ×1.21: `netoAConIva(neto)` en `lib/descuentos.ts`**
  (`round2(neto × 1.21)`, preserva el signo de los renglones de descuento). NO
  escribir `* 1.21` inline. **Las 3 vías que persisten `unit_price` lo usan**:
  1. **Pedido directo** — `app/admin/pedidos/nuevo` y `app/vendedor/pedidos/nuevo`.
  2. **Conversión cotización→pedido** — `app/admin/cotizaciones-venta/[id]` y
     `app/vendedor/cotizaciones/[id]` (la cotización guarda neto → al convertir
     se pasa a CON IVA; también arrastra `descuento_general_pct`).
  3. **Agregar producto a un pedido** — `addItemsToOrder` (`lib/supabase/queries.ts`).
- **Bug histórico (cerrado en código y datos):** la conversión y `addItemsToOrder`
  guardaban NETO sin ×1.21 → al dividir por 1.21 en la emisión sub-facturaban
  ~17,4% (factor 1/1.21). Se centralizó en `netoAConIva` (cubierto por tests:
  `lib/descuentos.test.ts`, `lib/supabase/queries.addItems.test.ts`) y se corrigió
  el dato de los 5 pedidos convertidos sin facturar
  (`supabase/fixes/20260630_fix_subfacturacion_conversion.sql`, aplicado por Fredi).
- **Las facturas viejas sub-facturadas NO se corrigen**: son emisiones de
  **testing** (CAE en blanco, `vencimiento_cae=2000-01-01`); se limpian en el
  go-live. Solo 2 de 153 facturas tienen CAE real, ninguna del set afectado.

## Remitos — UN SOLO REMITO POR FACTURA (3 capas)
- Regla invariante: **una factura = un remito**. El remito vive en la tabla
  `remitos` y se vincula por **`remitos.factura_id`** (= `orders.factura_id`).
  Se genera desde el detalle de pedido (`app/admin/pedidos/[id]/page.tsx`) →
  `POST /api/remito` (`app/api/remito/route.ts`).
- Bloqueo en **3 capas** (no romper ninguna):
  1. **UI**: si la factura actual ya tiene remito, el botón "Generar Remito" se
     reemplaza por "Imprimir Remito" (abre el PDF con signed URL fresca vía
     `getRemitoPdfUrl`). Match por `factura_id` (una parcial con factura nueva sí
     habilita su propio remito); sin factura asociada (legacy) cae a `order_id`.
  2. **Backend**: `/api/remito` chequea duplicado antes de emitir y devuelve
     **409** con el remito existente (no crea el segundo). La UI sincroniza estado.
  3. **DB**: constraint **`uq_remitos_factura`** = UNIQUE parcial sobre
     `remitos(factura_id) WHERE factura_id IS NOT NULL` (creado en prod).
- Histórico: hubo duplicados del bug previo (8 facturas / 11 pedidos). Se
  deduplicó a 1 remito por factura antes de crear el constraint. Caso cerrado.

## Descuento general por cliente
- Porcentaje de descuento configurable por cliente que se aplica al armar
  cotizaciones y pedidos. Columna **`clients.descuento_general_pct`** NUMERIC(5,2)
  DEFAULT 0 (editable en la ficha, `app/admin/clientes/[id]`, sección "Términos
  Comerciales"). Auditoría: se persiste el % efectivo en
  **`orders.descuento_general_pct`** y **`cotizaciones_venta.descuento_general_pct`**.
- **Fuente única de cálculo: `lib/descuentos.ts`** (cubierto por tests). No
  duplicar la lógica: `baseProductos` (neto de PRODUCTOS — excluye renglones de
  descuento y aportes negativos, NO se descuenta sobre descuentos),
  `montoDescuentoGeneral` (monto negativo del renglón),
  `construirLineaDescuentoGeneral` y `calcularTotales`
  (subtotal productos → descuento general → subtotal → IVA 21% → total).
  Redondeo `Math.round(x*100)/100`, consistente con el resto del sistema.
- **Renglón derivado**: el descuento se materializa como un renglón aparte
  `tipo_linea="descuento"` con `productCode = CODIGO_DESCUENTO_GENERAL`
  (`"DESCUENTO_GENERAL"`, sentinela para distinguirlo de un descuento manual).
  NO vive en el estado de items: se calcula del % + productos y **se regenera
  solo**; se agrega como item real recién al persistir. Por eso la facturación lo
  hereda igual que cualquier descuento (**no se tocó `/api/facturar` ni
  `lib/tusfacturas.ts`**).
- **Se aplica en las 4 pantallas de armado** (cálculo antes duplicado, ahora vía
  el helper): `app/admin/pedidos/nuevo`, `app/vendedor/pedidos/nuevo`,
  `app/admin/cotizaciones-venta/nueva`, `app/vendedor/cotizaciones/nueva`. El %
  se **precarga del cliente** al seleccionarlo (effect sobre `selectedClientId`)
  y es editable por documento (el vendedor puede ajustarlo o ponerlo en 0).
- Gotcha de redondeo: en **pedidos** el `unit_price` se guarda CON IVA (`×1.21`
  por línea), así que `orders.total` vs el `Σ cantidad×unit_price` del detalle
  pueden diferir 1 centavo con precios decimales (pre-existente, afecta a todo
  descuento con decimales). **Cotizaciones** guardan neto directo y reconcilian
  exacto. El total que ve el operador y el del helper son exactos.

## Circuito de Compras (Plan A — implementado)
- Tabs en `app/admin/compras/page.tsx`: Solicitudes / Órdenes de Compra / Seguimiento.
- Estados de **OC**: `Pendiente | Facturado | Eliminado` (automáticos, no
  editables; borrar = soft-delete a "Eliminado"). Estados de **Seguimiento**:
  `Pendiente | Recibido Completo | Recibido Incompleto`.
- El **Seguimiento se crea automático al crear la OC** (Nueva y Q.2), atado por
  `compras.orden_compra_id`. El detalle lee `orden_compra_items` y permite
  tildar recepción por ítem.
- **El stock sube SOLO al guardar la recepción en Seguimiento** (`recibirSeguimiento`
  en queries.ts, por delta — idempotente), NO en la factura de proveedor. Pide
  confirmación antes de mover stock.
- **Gating a nivel app**: solo `compras@masoil.com.ar` (Agustín) y
  `matias@aquilesweb.com` (Matías) pueden recibir/mover stock.

## Modelo de stock (Plan B — implementado, 4 fases)
**3 columnas en `products`** con invariante **`stock = stock_fisico − stock_reservado`**
(donde `products.stock` = DISPONIBLE; se mantiene ese nombre por compat).
- **Toda** mutación de stock pasa por la RPC Postgres **`ajustar_stock`**
  (`FOR UPDATE` + escribe en `movimientos_stock` en la misma transacción).
  NO actualizar `products.stock*` con UPDATE directo — usar la RPC (helper
  `ajustarStock` en queries.ts, o `supabase.rpc("ajustar_stock", …)` en routes).
- Circuito: **crear pedido** → reservado+ (disp−, físico igual) ·
  **facturar** (`/api/facturar`) → físico− y reservado− *solo si el ítem seguía
  `reservado=true`* (disp igual) · **recepción Seguimiento** (`recibirSeguimiento`)
  → físico+ (disp+) · **cancelar / quitar ítem / expirar** → reservado− (disp+).
- **`order_items.reservado`** debe limpiarse al facturar/cancelar/expirar (si
  queda pegado en true rompe el cálculo de reservas; fue la causa del backfill).
- **Historial**: tabla `movimientos_stock` (ledger con antes/después). UI en
  `/admin/stock/movimientos`. Ajuste manual de físico: gateado Agustín/Matías
  (`ajusteManualStock`).
- **Expiración (Fase 4)**: `orders.reserva_expira_at = now()+RESERVA_EXPIRA_DIAS`
  (const, default 30) en `createOrder`. Cron diario `/api/cron/expirar-reservas`
  (en `vercel.json`, `0 6 * * *`, auth `Bearer CRON_SECRET`, soporta `?dry_run=true`)
  libera reservas vencidas de pedidos abiertos (BORRADOR/INGRESADO/FACTURADO_PARCIAL),
  marca `orders.reserva_expirada=true` y registra en `order_status_history`. El
  pedido **sigue activo** (opción a). Pedidos viejos con `reserva_expira_at` NULL
  NO expiran (los maneja el equipo a mano).
- **Requiere en Vercel**: env var `CRON_SECRET` + el cron de `vercel.json`.

## Seguridad — DEUDA ABIERTA (no resuelta aún)
- **RLS permisiva**: casi todas las tablas tienen `USING(true)` (ver
  `20260410_fix_rls_all_tables.sql`). El aislamiento por vendedor existió y se
  removió porque las políticas exigían `role='admin'` pero los usuarios reales
  son `role='usuario'`. Cualquier autenticado lee/escribe todo desde el browser.
- **Middleware no separa admin de vendedor** (default permite `/admin`).
- **`is_active` no se verifica** en login/middleware.
- Roles reales en prod: `admin` y `usuario` (el enum dice
  admin/vendedor/operaciones/cobranzas — hay drift). Permiso extra: `contabilidad`.
- → Pendiente: Sprint Z (diagnóstico hecho, fix sin aplicar). No tocar RLS sin
  decisión explícita de Fredi.

## Contabilidad
- Es **contabilidad de IVA** (subdiarios ventas/compras, IVA a pagar, IIBB en
  `app/admin/contabilidad`), NO doble partida: no hay libro diario ni asientos.

## Cómo trabajamos (Fredi)
- Patrón: **diagnóstico previo → confirmar decisiones → implementar**. Para
  cambios grandes o que tocan el modelo de datos, frená y preguntá antes.
- **1 commit por item lógico.** Typecheck + build OK antes de cada push.
  **Push automático** tras verificar (no pedir confirmación por sprint).
- **El SQL de datos lo aplica Fredi**, no Claude. Escribí la migración/SQL y
  pasásela; verificación previa y posterior incluidas.
- Si algo amplía trabajo previo, reportá qué había y qué cambiaste. Si algo no
  cierra con la spec, listalo aparte y preguntá.
- Mensajes de commit terminan con la línea Co-Authored-By correspondiente.
- Entorno Windows + PowerShell/Git Bash; cuidado con CRLF (warnings esperados).
