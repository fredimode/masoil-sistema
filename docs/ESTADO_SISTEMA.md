# Estado del Sistema Masoil — Auditoría integral

> **Auditoría de solo lectura (Sprint Y).** Documento para balance interno y conversación con el cliente. No se modificó código. Generado el 2026-06-25.
>
> Stack: **Next.js 16.2.3** (App Router) · **React 19.2** · **TypeScript 5** · **Tailwind 4** · **Supabase** (auth + Postgres con RLS) · **TusFacturas** (AFIP) · **Resend** (email) · **Recharts**.
> Dos interfaces por rol: **`/admin`** (desktop) y **`/vendedor`** (mobile-first).

## Índice
- [Resumen ejecutivo](#resumen-ejecutivo) *(leer primero)*
- [Parte 1 — Inventario de funcionalidades](#parte-1)
- [Parte 2 — Madurez por módulo](#parte-2)
- [Parte 3 — Deuda técnica y riesgos](#parte-3)
- [Parte 4 — Bloqueantes para producción](#parte-4)
- [Parte 5 — Conteo objetivo](#parte-5)

---

<a name="resumen-ejecutivo"></a>
## Resumen ejecutivo

**Qué hace el sistema hoy.** Masoil dejó de ser un MVP: es un **ERP comercial completo** para una distribuidora/equipamiento que factura ante AFIP bajo dos razones sociales (Aquiles y Conancap). Cubre el ciclo completo: **ventas** (pedidos con máquina de estados, cotizaciones con conversión a pedido, clientes con sync AFIP), **facturación electrónica real** (FC A/B, NC, ND con CAE + QR, PDF fiscal, remitos con CAI), **compras** (proveedores, órdenes de compra, solicitudes, facturas de proveedor con imputación contable, pagos en lotes con cheques), **cobranzas** (cuenta corriente, registro de cobros, retenciones, recibos, informe de saldos — recientemente unificados en una sola fuente de saldo), **logística** (repartos y hojas de ruta), **inventario** (productos, stock con reserva automática y alertas), **finanzas** (caja chica, egresos/ingresos, plan de cuentas, cheques) y **contabilidad de IVA** (subdiarios ventas/compras, IVA a pagar, jurisdicciones IIBB). Tiene una app mobile para vendedores en la calle. Son ~48.000 líneas, 52 pantallas, 43 tablas, 401 commits en ~5 meses (ene–jun 2026).

**Nivel de madurez general: 🟡 funcional y avanzado, pero todavía no "production-safe".** La gran mayoría de los módulos funcionan de punta a punta sobre datos reales (la deuda real migrada de GestionPro es ~$92,7M, ya validada). El código es coherente y la facturación electrónica emite contra AFIP de verdad. Pero hay **riesgos sistémicos de robustez y seguridad** que conviene resolver antes de operar a full, y un par de módulos a medio terminar.

**Los 5 puntos críticos para producción:**

1. **🔴 Seguridad de datos (RLS permisiva).** Las políticas de Row Level Security son `USING(true)` en todas las tablas: el aislamiento por vendedor existió y fue removido (porque `get_current_user_role()` fallaba). Hoy cualquier usuario autenticado puede leer/escribir TODA la data —incluido el módulo financiero— desde el browser. El único control real es el filtrado en JavaScript, evadible. **Bloqueante de seguridad.**
2. **🔴 Middleware no separa admin de vendedor.** Un usuario con rol `vendedor` puede entrar a `/admin` (salvo 5 rutas). El selector de módulo en el login no valida el rol real.
3. **🟠 Operaciones críticas sin atomicidad ni control de concurrencia.** Reserva de stock, numeración de comprobantes (pedidos/cotizaciones/OC/OP/remitos) y altas multi-tabla (factura, OC, pago) se hacen con read-modify-write o MAX+1 desde el cliente, sin transacción. Riesgo de sobreventa, números duplicados y datos huérfanos bajo uso concurrente. Requiere mover lógica a funciones/RPC de Postgres.
4. **🟠 Tres caminos de facturación conviven** (dos emiten en AFIP con lógica de IVA distinta + uno es stub muerto). Hay que consolidar en `/api/facturar` antes de escalar el volumen, para no emitir comprobantes inconsistentes.
5. **🟡 Módulos a medio terminar y bugs concretos.** Comisiones es un placeholder (no calcula). Bugs accionables: pago dividido descuenta el total a cada factura; `changed_by:"sistema"` en columna UUID; `EMAIL_ENABLED=false` hardcodeado; CAI de Conancap vencido sin bloqueo; botones de reposición de stock que no persisten.

**Recomendación:** el sistema está **listo para un piloto controlado** (pocos usuarios, supervisado), pero **antes de producción plena** hay que cerrar #1 y #2 (seguridad), mitigar #3 (atomicidad de stock y numeración) y resolver los bugs puntuales de #5. La parte contable-fiscal funciona pero no es un sistema de contabilidad de doble partida (no hay libro diario/asientos; es contabilidad de IVA).

---

<a name="parte-1"></a>
## Parte 1 — Inventario de funcionalidades

### 1. Ventas
- **Pedidos** — `app/admin/pedidos/`, `app/vendedor/pedidos/`, `lib/supabase/queries.ts` (`createOrder` L204-420). Máquina de 8 estados (`order_status` enum + `lib/status-config.ts`), historial (`order_status_history`), creación con numeración correlativa por iniciales de vendedor, reserva de stock, detección de faltantes → `solicitudes_compra`, edición de ítems con ajuste de stock, facturación parcial por ítem, cancelación con restauración de stock.
- **Cotizaciones de venta** — `app/admin/cotizaciones-venta/`, `app/vendedor/cotizaciones/`. Numeración `COT-{INICIALES}-NNNN`, edición inline, aprobación parcial, PDF (jsPDF), envío por email (Resend), **conversión a pedido**.
- **Clientes** — `app/admin/clientes/`, `app/vendedor/clientes/`. CRUD + export XLSX + borrado masivo, **sync AFIP por CUIT** (`boton-sinc-afip` + `lib/afip-sync.ts` + `app/api/afip-padron`), contactos de cobranzas (mails/teléfonos múltiples + portal proveedores).

### 2. Facturación electrónica
- **TusFacturas (lib)** — `lib/tusfacturas.ts`. FC A/B, NC A/B, ND A/B; bases/totales por alícuota con redondeo AFIP; credenciales multi-empresa por env; comprobantes asociados para NC/ND.
- **Emisión** — `app/api/facturar/route.ts` (**camino real**, 13 pasos, facturación parcial, CAE+PDF+storage+cta cte). Conviven `/api/facturacion/generar` (emisor legacy, también real) y `/api/facturacion` POST (**stub muerto**).
- **Multi-empresa** — `lib/empresas.ts`: Aquiles y Conancap son facturables; Masoil es marca/lista de precios.
- **Comprobantes PDF** — `lib/pdf/factura-masoil.ts` (CAE + QR AFIP, régimen transparencia fiscal), `lib/pdf/remito-masoil.ts` (CAI, barcode). Remitos: `app/api/remito/route.ts`.
- **Pantalla** — `app/admin/facturacion/page.tsx`: FC emitidas (con deuda vía `lib/saldos.ts`), historial GestionPro, remitos emitidos.

### 3. Compras
- **Proveedores** — `app/admin/proveedores/`. CRUD + XLSX + bulk, sync AFIP, sucursales de retiro (CRUD), contacto cobranzas, descuentos por proveedor (`producto_proveedor`).
- **Órdenes de compra** — `app/admin/compras/` (hub 3 tabs), `compras/nueva`, `compras/[id]/editar`. Alta con ítems (catálogo o libre), N° secuencial, PDF, edición de estado/ítems, vínculo a pedidos de venta.
- **Solicitudes de compra** — tab en `app/admin/compras/`. Requisiciones con estados, aprobar/rechazar, **conversión 1-click a OC**.
- **Facturas de proveedor** — `app/admin/facturas-proveedor/page.tsx`. Alta en 2 pasos (cabecera con IVA/percepciones/IIBB multi-jurisdicción + ítems con **imputación contra plan de cuentas**), vínculo a OC, adjuntos, anti-duplicado.
- **Pagos a proveedores** — `app/admin/pagos/page.tsx` (6 tabs): cuenta corriente proveedor, lotes de pago, órdenes de pago (con adjuntos), pagos en proceso, servicios, reclamos. `pagos/nuevo` con multi-forma de pago y cheques.

### 4. Cobranzas
- `app/admin/cobranzas/page.tsx` (5 tabs) + **`lib/saldos.ts` (fuente única de saldo)**: Cuenta Corriente (neto por CUIT), Registrar Cobro (con selector de empresa, medios de pago, retenciones), Cobros Realizados, Retenciones, Informe de Saldos Pendientes. Tablas: `cuenta_corriente_cliente`, `recibos_cobranza`, `retenciones`, `cheques_recibidos`. **P1/P2/P3 resueltos** (saldos unificados, cobro imputa por factura, NC restan).

### 5. Logística
- `app/admin/logistica/page.tsx`. Repartos por fecha (`repartos`, `reparto_items`), hoja de ruta en **PDF** y export **XLSX**, estados de entrega, reordenamiento, destinos manuales (cliente/proveedor), sucursales de proveedor, N° de pedido legible.

### 6. Inventario
- **Productos** — `app/admin/stock/`. CRUD + XLSX + bulk, filtros por categoría/grupo/stock, ~40 columnas en DB (costo, listas de precios, ubicación).
- **Stock/alertas** — `app/admin/stock/alertas/`. Categorización disponible/bajo/crítico/agotado por umbrales. **Reserva automática de stock en pedidos** (el flujo más sólido). Movimientos de mercadería (`app/admin/movimiento-mercaderia/`).

### 7. Finanzas
- **Plan de cuentas** — `app/admin/plan-cuentas/`. CRUD.
- **Egresos / Ingresos** — `app/admin/finanzas/egresos`, `/ingresos` + APIs. Egresos con centro de costo y registro de pago; ingresos read-only agrupados por medio de pago.
- **Caja chica** — `app/admin/caja-chica/` + API movimientos, saldo corrido.
- **Cheques** — `app/admin/cheques/`. Emitidos/recibidos, cambio de estado.
- **Comisiones** — `app/admin/finanzas/comisiones/` (**placeholder de cálculo** + registro real de pagos).
- **Servicios fijos** — gestionados desde egresos y pagos.

### 8. Vista vendedor (mobile)
- `app/vendedor/` (12 páginas, BottomNav). Crear/listar/ver/editar **pedidos propios**, crear/listar **clientes**, crear/listar/convertir **cotizaciones**, **historial** (read-only), **stock** (consulta), perfil. Hook `useCurrentVendedor`.

### 9. Contabilidad (IVA)
- `app/admin/contabilidad/page.tsx` (4 tabs): **IVA a pagar**, **Subdiario Ventas**, **Subdiario Compras**, **Jurisdicción** (IIBB). `iva_a_pagar`. **No** hay libro diario / asientos de doble partida.
- **Estadísticas** — `app/admin/estadisticas/` (dashboards Recharts). **Configuración** — `app/admin/configuracion/`.

---

<a name="parte-2"></a>
## Parte 2 — Madurez por módulo

| Módulo / submódulo | Estado | Notas |
|---|:---:|---|
| **Ventas — Pedidos** | 🟡 | Completo; reserva de stock no atómica, transiciones validadas solo en UI, IVA 21% hardcodeado, bug `changed_by:"sistema"` (UUID) |
| **Ventas — Cotizaciones** | 🟡 | Flujo completo + conversión; numeración con race, `?print/resend` no-ops, email solo en admin |
| **Ventas — Clientes** | 🟡 | Muy completo + AFIP; AFIP descarta localidad/prov/CP, `updateClient` silencia drift, bulk delete sin chequeo FK |
| **Facturación — TusFacturas (lib)** | 🟢 | FC A/B, NC, ND; multi-empresa; bases por alícuota correctas |
| **Facturación — `/api/facturar`** | 🟡 | Camino real, defensivo; `EMAIL_ENABLED=false`, sin transacción |
| **Facturación — `/api/facturacion` POST** | 🔴 | **Stub muerto** (TODO, no llama AFIP, sin callers) |
| **Facturación — `/api/facturacion/generar`** | 🟡 | Emisor **legacy** real, IVA distinto, aún conectado al flujo "FACTURADO" |
| **Facturación — multi-empresa / PDF / remito** | 🟢/🟡 | Multi-empresa 🟢; PDF y remito 🟡 (layout fijo sin paginación) |
| **Facturación — CAE/CAI** | 🟡 | CAE+QR OK; **CAI Conancap vencido** sin bloqueo (default permite emitir) |
| **Compras — Proveedores** | 🟢 | CRUD + AFIP + sucursales sólido |
| **Compras — Órdenes de compra** | 🟡 | Funcional; no transaccional, race en N° OC, `orden_compra_archivos` sin UI |
| **Compras — Solicitudes** | 🟡 | Funcional; conversión por heurística frágil, sin PDF |
| **Compras — Facturas de proveedor** | 🟢 | Maduro; imputación contable opcional (puede quedar null), no transaccional |
| **Compras — Pagos** | 🟡 | Mayormente sólido; **bug pago dividido**, race en N° OP, fallos silenciosos |
| **Cobranzas** | 🟢 | Recientemente unificado (fuente única `lib/saldos.ts`); P1/P2/P3 resueltos |
| **Logística** | 🟡 | Funcional; PDF de layout fijo, numeración de reparto no atómica |
| **Inventario — Productos** | 🟡 | CRUD; modal edita pocos campos, sin UNIQUE en code, import CSV stub |
| **Inventario — Alertas** | 🟡 | Categorización OK; **botones de reposición no persisten** (solo console.log) |
| **Inventario — Reserva de stock** | 🟢 | Simétrico, con detección de faltantes; sin locking (race) |
| **Inventario — Movimientos / producto_proveedor** | 🟡 | Movimientos sin validación/autorización; producto_proveedor capturado pero no usado en flujos |
| **Finanzas — Plan de cuentas / Ingresos / Servicios** | 🟢 | CRUD/listados funcionales |
| **Finanzas — Egresos / Caja chica / Cheques** | 🟡 | Funcionales; año 2024 hardcodeado, fallos silenciosos, sin transacción saldo |
| **Finanzas — Comisiones** | 🔴 | **Cálculo placeholder** (montos a 0); registro de pagos sí funciona |
| **Vendedor (mobile)** | 🟢/🟡 | Pedidos/cotizaciones 🟢; dashboard/historial/perfil 🟡; scoping solo client-side |
| **Auth / Middleware / RLS** | 🔴 | RLS permisiva, middleware no separa roles (ver Parte 4) |
| **Contabilidad (IVA)** | 🟡 | Subdiarios + IVA a pagar + IIBB; **sin libro diario/asientos** (no es doble partida) |
| **Estadísticas / Configuración** | 🟡 | Dashboards Recharts; configuración básica |

---

<a name="parte-3"></a>
## Parte 3 — Deuda técnica y riesgos

### 3.1 TODOs / placeholders en el código (8 marcadores reales)
- **Comisiones** (`app/admin/finanzas/comisiones/page.tsx:7-9,55-79`): porcentaje y cálculo sin definir; `montoVenta`/`comisionAPagar` hardcodeados a 0.
- **IVA pedidos** (`app/admin/pedidos/[id]/page.tsx:584-585`): alícuota 21% hardcodeada, `precio_sin_iva = precio/1.21` asume todo 21%.
- **`/api/facturacion` POST** (`route.ts:108`): TODO de integración — stub muerto.
- **Import CSV de productos** y **botones "Ordenar Ahora"/"Planificar Pedido"** en alertas: "Pendiente de integración".

### 3.2 Robustez / concurrencia (el riesgo más extendido)
- **Sin transacciones** en escrituras multi-tabla: `createOrder`, `createOrdenCompra`, `createFacturaProveedor`, `enviarFacturaALote`, alta de pago, APIs de egresos/movimientos. Un fallo intermedio deja datos parciales/huérfanos (Supabase JS no da transacciones nativas → requiere RPC/funciones Postgres).
- **Race conditions en numeración** generada client-side por MAX+1: pedidos, cotizaciones, OC, OP. (Remitos mitigados por `UNIQUE(empresa, numero_remito)`.)
- **Reserva de stock** read-modify-write desde el browser sin lock → sobreventa posible.
- **~19 queries** que destructuran solo `data` sin chequear `error`; **fallos silenciosos** (`.catch(()=>...)`, `console.error` sin feedback) extendidos en cobranzas/pagos/finanzas/vendedor.

### 3.3 Bugs concretos accionables
- **Pago dividido** (`pagos/nuevo` ~L345): descuenta el total completo a cada factura seleccionada en vez de distribuir.
- **`changed_by:"sistema"`** en columna UUID (`queries.ts:2088`) → `22P02` al auto-asignar reparto.
- **`EMAIL_ENABLED=false`** hardcodeado (`api/facturar/route.ts:501`): nunca envía la factura por email.
- **CAI Conancap vencido** (22/03/2026) y rango chico (100 remitos); por default el sistema deja emitir igual.
- **Año "2024" hardcodeado** en el saldo de caja del tab egresos (inconsistente con caja-chica).
- **Inconsistencia clientes vendedor**: "Mis Clientes" usa `fetchClients()` (todos) pero el dropdown de nuevo pedido usa `fetchClientsByVendedor()` (propios).

### 3.4 Schema drift y migraciones
- **43 migraciones versionadas** (`supabase/migrations/`), pero el patrón histórico es **aplicar cambios a mano en prod**; hay una migración dedicada a reconciliar drift (`20260609_schema_drift_fix.sql`).
- `updateClient` **tolera columnas faltantes** (borra la columna ante error 42703 y reintenta) → si una columna no existe en prod, "guarda" sin persistir, en silencio.

### 3.5 Infra / dependencias
- **`next.config.mjs` está limpio**: ya **no** tiene `ignoreBuildErrors` (la deuda histórica fue resuelta). El proyecto compila con `tsc --noEmit` y `next build` sin errores.
- Next **16.2.3**, React **19.2**, TS 5, Tailwind 4 — versiones actuales. Aviso conocido de Next 16: convención `middleware` deprecada en favor de `proxy` (sigue funcionando).
- **Tipado `any` generalizado** en el estado de las páginas; sin validación por esquema (no se usa Zod); validaciones ad-hoc presentes en altas, ausentes en ediciones y en movimientos de mercadería.

### 3.6 Seguridad (detalle en Parte 4)
- **RLS permisiva (`USING(true)`)** en todas las tablas; **middleware no separa admin/vendedor**; **`is_active` del vendedor no se verifica**; logging verboso de payloads con PII del cliente en `/api/facturar`.

---

<a name="parte-4"></a>
## Parte 4 — Bloqueantes para producción

### 🔴 Críticos (seguridad — resolver sí o sí)
1. **Re-introducir RLS real por vendedor/rol.** Hoy `20260410_fix_rls_all_tables.sql` dejó `FOR ALL TO authenticated USING(true)`. Cualquier vendedor con la anon key lee/escribe todo (incluido finanzas). Hay que arreglar `get_current_user_role()` (falla silenciosamente) y restaurar el aislamiento por `auth.uid()` que existía en `20260324/25`.
2. **Separar admin de vendedor en el middleware.** Un `vendedor` entra a `/admin` salvo 5 rutas. El selector de módulo del login no valida el rol real. Agregar regla por defecto que bloquee `/admin` a no-admins.
3. **Verificar `is_active`** en login/middleware: un vendedor dado de baja sigue accediendo.

### 🟠 Importantes (robustez de datos)
4. **Atomicidad y concurrencia**: mover a RPC/funciones Postgres la reserva de stock y la numeración correlativa (pedidos/cotizaciones/OC/OP); envolver las altas multi-tabla (factura, OC, pago) en transacciones.
5. **Consolidar facturación en `/api/facturar`** y retirar `/api/facturacion/generar` (legacy) y el stub `/api/facturacion` POST, para no tener dos lógicas de IVA emitiendo en AFIP.
6. **Corregir el bug de pago dividido** y los fallos silenciosos (dar feedback real al usuario).

### 🟡 Configuración / datos pendientes
7. **Credenciales y env**: confirmar variables de producción de TusFacturas por empresa (`getCredentials`), CAI vigentes (renovar **CAI Conancap vencido**), `RESEND_API_KEY`, y activar `EMAIL_ENABLED` cuando corresponda.
8. **Validaciones de datos**: CUIT/email en formularios (hoy solo al sincronizar AFIP), montos ≥ 0, fechas; idealmente un esquema (Zod) compartido. Completar `condicion_iva`/zona de clientes para poder facturarlos.
9. **Funcionalidades a terminar**: cálculo de **comisiones** (definir reglas con Masoil), botones de **reposición de stock** (hoy no persisten), import CSV de productos.
10. **Observabilidad**: no hay tracking de errores (Sentry) ni toasts estructurados; en producción conviene tenerlo para diagnosticar.

### Alcance contable (a conversar con el cliente)
- El sistema hace **contabilidad de IVA** (subdiarios, IVA a pagar, IIBB) pero **no es contabilidad de doble partida**: no hay libro diario ni asientos. Si el cliente espera balances/estados contables formales, es un desarrollo aparte.

---

<a name="parte-5"></a>
## Parte 5 — Conteo objetivo

| Métrica | Valor |
|---|---|
| Páginas (`page.tsx`) | **52** (39 admin · 12 vendedor · 1 login) |
| Layouts | 3 (admin, vendedor, root) |
| API routes (`route.ts`) | **15** |
| Componentes (`components/*.tsx`) | **76** |
| Módulos lib (`lib/*.ts`) | 23 |
| Tablas en la DB | **~43** (44 referenciadas / 43 `CREATE TABLE`) |
| Migraciones | **43** (versionadas) |
| Scripts (import/migración/utilidades) | 15 |
| Commits | **401** |
| Rango de desarrollo | **2026-01-14 → 2026-06-25** (~5,4 meses) |
| Marcadores de deuda reales (TODO/FIXME) | 8 |

**Líneas de código aproximadas (~48.400 en TS/TSX de la app):**

| Carpeta | LOC |
|---|---|
| `app/` (páginas + API) | 33.294 |
| `components/` | 8.725 |
| `lib/` | 6.382 |
| `scripts/` (import/migración) | 3.918 |
| `supabase/` (migraciones SQL) | 2.219 |

> Archivos más pesados (indicador de complejidad): `lib/supabase/queries.ts` (~2.868 LOC, capa de datos de todo el sistema), `app/admin/pedidos/[id]/page.tsx` (~2.318), `app/admin/pagos/page.tsx` (~2.013), `app/admin/cobranzas/page.tsx` y `app/admin/facturas-proveedor/page.tsx` (~1.700).

---

*Auditoría Sprint Y — solo lectura. Datos objetivos por inspección directa del repo; inventario de módulos por exploración del código. No se modificó ningún archivo del sistema.*
