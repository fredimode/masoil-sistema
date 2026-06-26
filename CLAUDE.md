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

## Facturación
- **Camino real = `app/api/facturar/route.ts`.** Existen dos legacy a evitar:
  `app/api/facturacion` POST (stub muerto) y `app/api/facturacion/generar`
  (emisor viejo con otra lógica de IVA). No usar/ampliar los legacy.
- Empresas facturables: **Aquiles** y **Conancap** (`lib/empresas.ts`,
  `EMPRESAS_DATA`). **Masoil NO es facturable** — es marca/lista de precios.
- `EMAIL_ENABLED=false` hardcodeado en `/api/facturar` (no envía mail al cliente).
- Razón social del cliente: usar `clients.business_name` (la columna
  `razon_social` quedó contaminada por un import; ver P4 en el plan contable).

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
