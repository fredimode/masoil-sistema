# Plan de Remediación Contable — Sprint X.2

> **Estado: PROPUESTO — NO EJECUTADO.**
> Este documento es un plan para revisión y aprobación de Fredi. **Nada de
> lo que aparece acá (SQL, diffs de código, scripts) fue ejecutado ni
> commiteado** salvo este propio archivo. Todo el SQL está marcado como
> `PROPUESTO - NO EJECUTADO`.
>
> Base: diagnóstico del **Sprint X** (problemas P1–P5 confirmados, varios con
> datos reales de producción vía SELECT read-only).
> Contexto: estamos por arrancar la operación real → **la seguridad de los
> datos es prioridad #1**.

## Índice

- [Mapa de problemas y causas raíz](#mapa)
- [Sección 1 — Limpieza de datos (P4 + P5)](#seccion-1)
- [Sección 2 — Lógica contable (P1 + P2 + P3)](#seccion-2)
- [Sección 3 — Orden de ejecución y riesgos](#seccion-3)
- [Sección 4 — Casos de prueba](#seccion-4)

---

<a name="mapa"></a>
## Mapa de problemas y causas raíz

| # | Síntoma | Causa raíz | Naturaleza | Comparte raíz con |
|---|---------|-----------|------------|-------------------|
| **P4** | Razón social del cliente sale "Conancap"/"Aquiles" en la FC | `clients.razon_social` poblado con el **nombre de la emisora** por el import; el código lo lee con `razon_social \|\| business_name` | Datos + código frágil | **P5** (mismo import) |
| **P5** | Crear pedido a Andecam/Buswagen tira error | Esos clientes tienen `zona = NULL`; `orders.zona` es enum **NOT NULL** y el código pasa la zona sin sanitizar | Datos + código frágil | **P4** (mismo import) |
| **P1** | Saldo de Cta Cte ≠ Informe de Saldos | No hay **fuente única** de saldo: (A) lee neto `debe−haber` por CUIT; (B) reimputa FIFO por `client_id` + bug de campo `saldo_pendiente` | Lógica contable | **P2, P3** |
| **P2** | Cobro hecho sigue figurando como deuda en Facturación | El cobro graba `referencia_id = id de recibo`; Facturación cruza por `id de factura` → nunca matchea | Lógica contable | **P1** |
| **P3** | NC suma en vez de restar en Informe | `TabInforme` no aplica signo a las NC: las suma como FC | Lógica contable | **P1** |

**Dos clusters de causa raíz:**
- **Cluster A (datos del import):** P4 + P5 nacen del mismo import `scripts/migrate-data.ts` (hoja "CONTACTO DE CLIENTES COBRANZAS"), que seteó `razon_social = emisora` y dejó `vendedor_id`/`zona` sin asignar.
- **Cluster B (sin fuente única de saldo):** P1 + P2 + P3 son la misma deuda de diseño: conviven el neto de `cuenta_corriente_cliente`, una imputación FIFO, y un cruce por `referencia_id`, sin reconciliar.

---

<a name="seccion-1"></a>
## Sección 1 — Limpieza de datos (P4 + P5)

### Origen común

`scripts/migrate-data.ts:154-172`:

```ts
const SHEET_RAZON_MAP = { "CONTACTOS MASOIL":"Masoil", "CONTACTOS AQUILES":"Aquiles", "CONTACTOS CONANCAP":"Conancap" }
...
allClients.push({
  business_name: businessName,
  razon_social: razonSocial,        // ← nombre de la HOJA/emisora, no la razón social del cliente
  zona: mapZona(...),               // ← NULL si la celda venía vacía/no mapeable
  // NO se asigna vendedor_id
})
```

---

### P4 — 155 clientes con `razon_social` = nombre de emisora

**Alcance medido en producción (SELECT read-only):**

| `razon_social` | Clientes |
|----------------|----------|
| `Conancap` | 47 |
| `Aquiles` | 108 |
| `Masoil` | 0 |
| `NULL` | 947 |
| **Total tabla** | **1102** |

→ **Ningún** cliente tiene un nombre de cliente real en `razon_social`: o es una emisora o es NULL.

**Cómo lo consume el código** (`app/api/facturar/route.ts:146`):

```ts
const razonSocial = cliente.razon_social || cliente.business_name || ""
```

Como `razon_social = "Conancap"` (no vacío), el `||` lo toma y **nunca** llega al fallback `business_name = "BUSWAGEN S.A."`. El CUIT, en cambio, sale de otra columna (`route.ts:138`) → por eso el CUIT sale bien y la razón social mal. Luego se persiste igual en `facturas.razon_social` (`route.ts:383`).

> Nota: `clients.razon_social` **no se lee en ningún otro lado** de la app — `mapClient` (`lib/supabase/queries.ts:82-85`) ni siquiera lo mapea. Su único consumidor es `/api/facturar`. Esto hace que limpiarlo sea de bajo riesgo.

#### Recomendación: opción (a) — setear `razon_social = NULL`

**Comparativa:**

| | (a) `razon_social = NULL` | (b) copiar `business_name` |
|---|---|---|
| Resultado en la FC | Cae al fallback `business_name` → correcto | Igual a `business_name` → correcto |
| Datos fabricados | No (solo borra dato erróneo) | Sí (duplica un valor) |
| Fuente de verdad | Única: `business_name` | Dos columnas a mantener en sync |
| Reversibilidad | Alta (backup → restaurar) | Alta (backup → restaurar) |
| Riesgo de pisar dato legítimo | Nulo (no hay razón social legítima distinta hoy) | Nulo |

**Elijo (a)** porque: no fabrica datos, deja `business_name` como única fuente de verdad, y depende del fallback que **ya existe** en el código. (b) duplica información y crea riesgo futuro de desincronización entre las dos columnas.

> Importante: el WHERE se limita a los 3 nombres de emisora exactos, **nunca** a un blanket update. Si en el futuro hubiera una razón social legítima que casualmente sea "Aquiles"/"Conancap", revisar antes (hoy no existe).

**Verificación PREVIA** (read-only — confirma cuántas filas se tocan):

```sql
-- PROPUESTO - NO EJECUTADO (read-only)
SELECT razon_social, COUNT(*) AS filas
FROM clients
WHERE razon_social IN ('Masoil','Aquiles','Conancap')
GROUP BY razon_social
ORDER BY razon_social;
-- Esperado: Aquiles=108, Conancap=47
```

**Backup de la tabla antes de tocar** (ver Sección 3):

```sql
-- PROPUESTO - NO EJECUTADO
CREATE TABLE clients_backup_xrem AS SELECT * FROM clients;
```

**UPDATE de limpieza:**

```sql
-- PROPUESTO - NO EJECUTADO
UPDATE clients
SET razon_social = NULL
WHERE razon_social IN ('Masoil','Aquiles','Conancap');
-- Esperado: UPDATE 155
```

**Verificación POSTERIOR:**

```sql
-- PROPUESTO - NO EJECUTADO (read-only)
SELECT COUNT(*) AS deberia_ser_cero
FROM clients
WHERE razon_social IN ('Masoil','Aquiles','Conancap');
-- Esperado: 0

-- Spot-check de los dos clientes confirmados en el diagnóstico
SELECT business_name, razon_social, numero_docum
FROM clients
WHERE business_name IN ('BUSWAGEN S.A.','ANDECAM S.A.');
-- Esperado: razon_social = NULL en ambos
```

#### Fix de código defensivo (para que no vuelva a pasar)

Aunque limpiemos los datos, conviene blindar el endpoint. **Archivo:** `app/api/facturar/route.ts:146`.

```diff
- const razonSocial = cliente.razon_social || cliente.business_name || ""
+ // X.2-P4: priorizar business_name. razon_social quedó contaminado por el
+ // import (traía el nombre de la emisora), así que lo ignoramos si coincide
+ // con una emisora conocida y caemos al business_name del cliente.
+ const EMISORAS = ["masoil", "aquiles", "conancap"]
+ const razonSocialCliente =
+   cliente.razon_social && !EMISORAS.includes(String(cliente.razon_social).trim().toLowerCase())
+     ? cliente.razon_social
+     : cliente.business_name
+ const razonSocial = razonSocialCliente || cliente.business_name || ""
```

> Decisión de diseño: invertir simplemente a `business_name || razon_social` también funciona, pero la variante de arriba es más explícita y tolera el caso (improbable) de que algún cliente tenga una razón social legítima distinta del business_name. Marcado **PROPUESTO**.

#### Las 3 FC ya emitidas con el cruce (ids 125, 135 = Conancap; +1 Aquiles)

Muestra de producción:

```
facturas id=125  numero 00008-00000009  tipo "FACTURA A"  empresa="Conancap"
  razon_social="Conancap"  cuit_cliente="33714317119"   ← CUIT correcto, razón social mal
facturas id=135  numero 00008-00000012  tipo "FACTURA A"  empresa="Conancap"
  razon_social="Conancap"  cuit_cliente="33697949939"
```

**Recomendación contable:** estas FC están en **entorno de testing** (no son comprobantes fiscales reales de la operación). Por lo tanto:

- **NO hace falta reemitir ni emitir nota de crédito** para AFIP: son datos de prueba que se van a limpiar/resetear al arrancar la operación real.
- Para mantener consistencia en las pantallas mientras se sigue probando, se puede corregir el dato **local** en `facturas` (solo 3 filas):

```sql
-- PROPUESTO - NO EJECUTADO (solo testing; corrige el dato LOCAL, no afecta AFIP)
UPDATE facturas f
SET razon_social = c.business_name
FROM clients c
WHERE f.razon_social IN ('Masoil','Aquiles','Conancap')
  AND regexp_replace(COALESCE(c.cuit, c.numero_docum), '\D', '', 'g')
      = regexp_replace(f.cuit_cliente, '\D', '', 'g');
-- Esperado: UPDATE 3  (verificar que toque exactamente 3 filas)
```

> **Regla para producción real (a futuro):** una vez emitido un comprobante con CAE ante AFIP, un error en la razón social **no se corrige con un UPDATE** — requiere nota de crédito + reemisión. Por eso el fix de datos + el fix de código deben estar aplicados **antes** de emitir la primera FC real. Confirmar con el contador el criterio para comprobantes ya CAE-ados si llegara a ocurrir en prod.

---

### P5 — Clientes con `zona` (y `vendedor_id`) NULL → error al crear pedido

**Confirmado:**
- `orders.zona` es enum (`udt_name = 'zona'`), **NOT NULL**. Valores válidos: `Norte`, `Capital`, `Sur`, `Oeste`, `GBA`.
- Andecam (`33-69794993-9`) y Buswagen (`33-71431711-9`) tienen `zona = NULL` y `vendedor_id = NULL`.
- `createOrder` pasa la zona del cliente **sin sanitizar** (`lib/supabase/queries.ts:272` → `zona: order.zona`), y las páginas la pasan cruda:
  - Admin (`app/admin/pedidos/nuevo/page.tsx:304`): `zona: client.zona` → `NULL` → **`23502` not-null violation**.
  - Vendedor (`app/vendedor/pedidos/nuevo/page.tsx:199`): `zona: selectedClient?.zona ?? ""` → `""` → **`22P02` invalid enum**.

#### Fix de código (primario — desbloquea de inmediato)

El fix de código debe garantizar que **`zona` nunca llegue NULL ni `""`** al insert. **Archivo:** `lib/supabase/queries.ts`, dentro de `createOrder`, antes del insert (~línea 262).

```diff
  const vendedorIdSafe = order.vendedorId && order.vendedorId.trim() !== "" ? order.vendedorId : null

+ // X.2-P5: orders.zona es enum NOT NULL (Norte|Capital|Sur|Oeste|GBA).
+ // Clientes importados sin zona traen NULL o "" y rompen el insert
+ // (23502 / 22P02). Sanitizamos a un valor válido por defecto.
+ const ZONAS_VALIDAS = ["Norte", "Capital", "Sur", "Oeste", "GBA"]
+ const zonaSafe = ZONAS_VALIDAS.includes(order.zona) ? order.zona : "Capital"
+
  // Insert order
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      ...
-     zona: order.zona,
+     zona: zonaSafe,
      ...
    })
```

**Propagar el error real al usuario** (hoy ve un alert genérico y el detalle queda solo en consola):

```diff
// app/admin/pedidos/nuevo/page.tsx:349 (aprox)
- alert("Error al crear el pedido")
+ alert("Error al crear el pedido: " + (err?.message || "intentá de nuevo"))

// app/vendedor/pedidos/nuevo/page.tsx:231 (aprox) — además hoy NO loguea el error
- alert("Error al crear el pedido. Intenta de nuevo.")
+ console.error("crear pedido:", err)
+ alert("Error al crear el pedido: " + (err?.message || "intentá de nuevo"))
```

#### Limpieza de datos (secundaria — asignar zona/vendedor reales)

La zona correcta de cada cliente es **decisión de negocio** (no se puede adivinar). El fix de código ya evita el error usando `Capital` por defecto, pero conviene que Fredi/equipo asigne la zona real.

**Listar los clientes a completar** (read-only):

```sql
-- PROPUESTO - NO EJECUTADO (read-only)
SELECT id, business_name, zona, vendedor_id, numero_docum
FROM clients
WHERE zona IS NULL
ORDER BY business_name;
```

**Plantilla de UPDATE puntual** (un cliente, con zona decidida por negocio):

```sql
-- PROPUESTO - NO EJECUTADO — repetir por cliente con la zona REAL
UPDATE clients SET zona = 'Capital'  -- ← reemplazar por la zona real
WHERE id = '<client_id>';
```

> No se propone un UPDATE masivo de zona porque pondría una zona inventada a 947 clientes. El default `Capital` vive en el código (desbloquea), y la asignación real es manual/por negocio.

---

<a name="seccion-2"></a>
## Sección 2 — Lógica contable (P1 + P2 + P3)

Raíz común: **no existe una única fuente de verdad del saldo.** Hoy hay tres mecanismos distintos:

1. **Cta Cte** (`TabCuentaCorriente`): neto `Σdebe − Σhaber` de `cuenta_corriente_cliente`, agrupado por **CUIT**.
2. **Informe de Saldos** (`TabInforme` + `fetchCobranzasPendientes`): reimputación **FIFO** sobre `facturas` + snapshot legacy, agrupado por **client_id**, con NC mal signada y bug de campo `saldo_pendiente`.
3. **Facturación** (`deudaMap`): cruce por `referencia_id` contra `cuenta_corriente_cliente`.

### 2.1 — Fuente única de saldo (resuelve P1)

**Propuesta:** crear `lib/saldos.ts` con dos funciones puras que sean el **único** punto de cálculo, consumidas por las tres pantallas.

```ts
// PROPUESTO - NO EJECUTADO — lib/saldos.ts (boceto)

// Agrupación SIEMPRE por CUIT (sucursales del mismo CUIT suman juntas).
// Fuente única: cuenta_corriente_cliente (debe/haber ya reflejan FC, cobros y NC).

export type SaldoCuit = {
  cuit: string
  debe: number
  haber: number
  saldo: number          // debe - haber  (>0 = deudor)
}

// Saldo neto por CUIT a partir de los movimientos de cuenta_corriente_cliente.
export function calcularSaldoPorCuit(
  movimientos: Array<{ client_id: string; debe: number; haber: number }>,
  clientIdToCuit: Map<string, string>,
): Map<string, SaldoCuit> { /* Σdebe - Σhaber agrupando por CUIT */ }

// Estado de pago POR FACTURA (para Facturación e Informe detallado):
// imputa los haberes con referencia_id = id de factura sobre cada FC.
export function calcularEstadoFacturas(
  facturas: Array<{ id: string; total: number; tipo: string }>,
  movimientosPorFactura: Map<string, number>,  // suma de haberes por referencia_id
): Map<string, { total: number; pagado: number; saldo: number }> { /* ... */ }
```

- **`TabCuentaCorriente`** y **`TabInforme`** usan `calcularSaldoPorCuit` → mismo número garantizado.
- **Facturación** usa `calcularEstadoFacturas` (depende del fix P2, abajo).
- Se **elimina** la reimputación FIFO ad-hoc de `fetchCobranzasPendientes` y el bug `saldo_pendiente ?? total` (`app/admin/cobranzas/page.tsx:1612,1651`).
- Agrupación unificada a **CUIT** en ambas pantallas (hoy A=CUIT, B=client_id, `queries.ts:1311` / `page.tsx:1647`).

### 2.2 — Convención única para NC (resuelve P3)

**Convención propuesta:** la NC vive en `cuenta_corriente_cliente` como **`haber`** (igual que un cobro) → reduce el neto deudor automáticamente. Esa es ya la semántica de la Cta Cte y es la fuente única.

- En cualquier listado de "pendientes" que muestre comprobantes individuales, **emitir la NC con saldo NEGATIVO**, de modo que **todos** los consumidores simplemente **sumen** sin lógica de signo especial. Así se elimina el `esNC ? -monto : monto` disperso (que existe en `TabRegistrarCobro:788-792` pero falta en `TabInforme:1654`).
- Resultado: la NC resta consistentemente en las dos pantallas (hoy: Cta Cte resta vía `haber`, Informe suma → divergencia P3).

> Punto a evitar (doble conteo): hoy `fetchCobranzasPendientes` baja el neto por la NC (vía `haber`) **y además** emite la NC como fila positiva. Con la fuente única + NC negativa, el crédito impacta una sola vez.

### 2.3 — Cobro por factura (resuelve P2)

**Estado actual** (`app/admin/cobranzas/page.tsx:944-955`): un único movimiento de haber con `referencia_id = reciboId`. Facturación busca `referencia_id = String(facturaId)` (`app/admin/facturacion/page.tsx:238`) → nunca matchea.

**Fix propuesto:** al confirmar el cobro, generar **un movimiento de haber por factura cobrada**, con `referencia_id = String(facturaId)` y el `haber` imputado a esa factura (repartir el total entre las `selectedIds` / `recibos_cobranza.facturas_ids`).

```ts
// PROPUESTO - NO EJECUTADO — esquema de la imputación por factura
for (const facturaId of facturasCobradas) {
  const imputado = montoImputadoA(facturaId)  // min(saldo de la FC, restante del cobro)
  await createMovimientoCuentaCorriente({
    client_id, empresa, fecha,
    tipo_comprobante: "RC",
    referencia_id: String(facturaId),          // ← id de la FACTURA, no del recibo
    haber: imputado, debe: 0,
    observaciones: `Cobro recibo ${reciboLabel} imputado a FC ${facturaId}`,
  })
}
```

Mantener además el registro del recibo en `recibos_cobranza` (con su `facturas_ids`) como cabecera; los movimientos por factura son el detalle imputable.

#### Migración de los cobros YA registrados (referencia_id = id de recibo)

**Sí se pueden re-imputar**, porque `recibos_cobranza.facturas_ids` guarda qué facturas saldaba cada recibo. Plan de backfill (script Node de un solo uso, **PROPUESTO - NO EJECUTADO**):

1. Leer todos los movimientos `tipo_comprobante = 'RC'` cuyo `referencia_id` sea un id de recibo (formato distinto al id de factura).
2. Para cada uno, buscar el recibo en `recibos_cobranza` y su `facturas_ids` + el saldo de cada FC en ese momento.
3. **Reemplazar** el movimiento agregado por N movimientos (uno por factura), repartiendo el `haber` (FIFO o proporcional al saldo de cada FC). Idempotente: marcar los migrados (p. ej. `observaciones` con un tag `[migrado-x2]`) para no duplicar si se corre dos veces.
4. Backup previo de `cuenta_corriente_cliente` (ver Sección 3).

> Casos sin `facturas_ids` (cobros viejos sin detalle): no se pueden re-imputar automáticamente → quedan como ajuste manual o se documentan como "cobro a cuenta" sin factura asociada. Listarlos para revisión.
>
> Alternativa mínima si el backfill se considera riesgoso: aplicar el fix **solo de ahora en más** y re-imputar a mano los pocos cobros de testing existentes. Dado que estamos en testing con pocos datos, **esta alternativa es aceptable** y es la recomendada para no arriesgar (ver Sección 3).

### 2.4 — Agrupación: todo por CUIT

Unificar a **CUIT** en todas las pantallas y cálculos (Sprint K1.5 ya agrupa así en Cta Cte). Sucursales con mismo CUIT (caso Andecam/Buswagen y otros) suman su deuda juntas. Esto elimina la divergencia (2) de P1.

---

<a name="seccion-3"></a>
## Sección 3 — Orden de ejecución y riesgos

### Snapshot previo — OBLIGATORIO

**Sí**, antes de cualquier limpieza de datos:

1. **Snapshot completo de la DB**: backup manual desde el dashboard de Supabase (o, si está disponible, Point-in-Time Recovery / branch de la base). Es la red de seguridad principal.
2. **Backups por tabla** (rápidos de restaurar para un rollback puntual):
   ```sql
   -- PROPUESTO - NO EJECUTADO
   CREATE TABLE clients_backup_xrem               AS SELECT * FROM clients;
   CREATE TABLE facturas_backup_xrem              AS SELECT * FROM facturas;
   CREATE TABLE cuenta_corriente_cliente_bkp_xrem AS SELECT * FROM cuenta_corriente_cliente;
   ```
   Rollback de una tabla: restaurar desde su `_backup_xrem`.

### Orden recomendado

| Paso | Acción | Reversible | Si sale mal | Momento |
|------|--------|-----------|-------------|---------|
| 0 | **Snapshot** + backups por tabla | — | — | ANTES de todo |
| 1 | **Fix código P5** (sanitizar `zona` + propagar error) | Sí (revert commit) | Pedidos siguen fallando como hoy; sin daño de datos | Antes del corte |
| 2 | **Fix código P4** (precedencia `business_name`) | Sí (revert commit) | Razón social sigue saliendo mal; sin daño de datos | Antes del corte |
| 3 | **UPDATE datos P4** (`razon_social = NULL` en 155) | Sí (restaurar `clients_backup_xrem`) | Restaurar tabla; el fix de código (paso 2) ya mitiga el síntoma igual | Antes del corte |
| 4 | **UPDATE datos P4 facturas** (3 filas, solo testing) | Sí (restaurar `facturas_backup_xrem`) | Restaurar; cosmético | Antes del corte |
| 5 | **Limpieza zona/vendedor** (manual, por negocio) | Sí (backup) | Quedan con default `Capital`; sin error | Puede esperar |
| 6 | **Lógica contable P1/P2/P3** (fuente única + cobro por factura) | Parcial | Ver abajo | Antes del corte si se quiere arrancar con saldos confiables |
| 7 | **Backfill cobros viejos** (opcional) | Riesgoso | Restaurar `cuenta_corriente_cliente_bkp_xrem` | **Evaluar saltar** en testing |

**Criterio "antes del corte vs puede esperar":**
- **Antes del corte (operación real):** pasos 0–4 y 6. Son los que garantizan que la primera FC real salga con la razón social correcta y que los saldos sean confiables.
- **Puede esperar:** paso 5 (asignación fina de zonas; el default ya desbloquea) y paso 7 (backfill de cobros de testing; conviene **resetear** los datos de prueba en vez de migrarlos).

### Riesgos por paso

- **Pasos 1–2 (código):** riesgo bajo. Reversibles con `git revert`. Requieren `tsc + build` OK antes de pushear.
- **Paso 3 (UPDATE P4):** riesgo bajo-medio. Mitigaciones: WHERE acotado a 3 nombres exactos; verificación previa cuenta = 155; backup. `razon_social` no tiene otros consumidores (mapClient no lo expone).
- **Paso 6 (lógica contable):** riesgo medio-alto. Es refactor de cálculo de saldo. Mitigación: implementar la fuente única **sin** borrar las pantallas viejas hasta validar con los casos de prueba (Sección 4) sobre un cliente conocido; comparar número viejo vs nuevo.
- **Paso 7 (backfill):** riesgo alto sobre `cuenta_corriente_cliente` (es el libro mayor). **Recomendación: en testing, NO migrar — resetear los cobros de prueba y arrancar limpio.** Si se hiciera, debe ser idempotente y con backup.

### Verificaciones después de cada fix

- **Después de P5:** crear pedido a Andecam y a Buswagen → no tira error; `orders.zona` quedó en un valor válido del enum.
- **Después de P4 (datos+código):** facturar (o previsualizar payload) a Buswagen → razón social = "BUSWAGEN S.A."; query `COUNT(*) WHERE razon_social IN (emisoras) = 0`.
- **Después de P1/P3:** elegir 2-3 clientes y comparar saldo en Cta Cte vs Informe → deben coincidir al centavo; cliente con NC → ambas restan.
- **Después de P2:** registrar un cobro de una FC → en Facturación esa FC pasa a "Pagado" / deuda 0; el haber aparece con `referencia_id = id de la factura`.

---

<a name="seccion-4"></a>
## Sección 4 — Casos de prueba

> Ejecutar tras aplicar los fixes, sobre datos de testing controlados. Cada caso indica **acción → resultado esperado**.

1. **FC + cobro total → deuda baja en las DOS pantallas.**
   Cliente con una FC de $100k, registrar cobro de $100k. Esperado: en *Cuenta Corriente* saldo = 0; en *Informe de Saldos* no aparece (o saldo 0); en *Facturación* la FC figura "Pagado". (Valida P2 + P1.)

2. **FC + cobro PARCIAL → deuda parcial coherente.**
   FC de $100k, cobro de $40k. Esperado: las tres pantallas muestran saldo $60k para esa FC/cliente. (Valida imputación por factura + fuente única.)

3. **Cliente con NC → resta en las dos pantallas.**
   Cliente con FC $100k y NC $30k. Esperado: saldo deudor = $70k tanto en *Cuenta Corriente* como en *Informe de Saldos* (la NC **resta**, no suma). (Valida P3.)

4. **Cliente con sucursales (mismo CUIT) → suma agrupada.**
   Dos `client_id` con el mismo CUIT, uno con FC $50k y otro con FC $30k. Esperado: ambas pantallas muestran $80k agrupado por CUIT (no $50k y $30k por separado, ni descuadre entre pantallas). (Valida P1 agrupación.)

5. **Facturar a Buswagen → razón social correcta.**
   Emitir FC a "BUSWAGEN S.A." por Conancap. Esperado: en el payload/PDF, *Cliente → Razón social* = "BUSWAGEN S.A." (no "Conancap"); CUIT = 33-71431711-9; encabezado emisor = CONANCAP SRL. (Valida P4 datos + código.)

6. **Crear pedido a Andecam → no tira error.**
   Crear pedido a "ANDECAM S.A." por Conancap. Esperado: el pedido se crea OK con una zona válida; si la zona del cliente era NULL, queda `Capital` (default) sin romper. (Valida P5.)

7. **(Regresión) Cliente "normal" no se rompe.**
   Facturar y crear pedido a un cliente con `razon_social = NULL` y zona válida ya existente. Esperado: comportamiento idéntico al actual (la razón social usa `business_name`, la zona se respeta). (Valida que los fixes no introducen regresiones.)

---

## Anexo — Referencias de código (diagnóstico Sprint X)

| Tema | Archivo:línea |
|------|---------------|
| Origen del import (razon_social = emisora) | `scripts/migrate-data.ts:154-172,218` |
| Lectura razón social en facturación | `app/api/facturar/route.ts:138,146` |
| Guardado en `facturas.razon_social` | `app/api/facturar/route.ts:375-394` |
| `mapClient` no expone `razon_social` | `lib/supabase/queries.ts:82-108` |
| `createOrder` (insert con `zona`) | `lib/supabase/queries.ts:204-292` (zona en :272) |
| Pasaje de zona (admin / vendedor) | `app/admin/pedidos/nuevo/page.tsx:304` · `app/vendedor/pedidos/nuevo/page.tsx:199` |
| Alert genérico de error de pedido | `app/admin/pedidos/nuevo/page.tsx:349` · `app/vendedor/pedidos/nuevo/page.tsx:231` |
| Saldo Cta Cte (neto, por CUIT) | `lib/supabase/queries.ts:2247-2258` · `app/admin/cobranzas/page.tsx:258-282,315-317` |
| Informe (FIFO, por client_id, bug `saldo_pendiente`) | `lib/supabase/queries.ts:1230-1352` · `app/admin/cobranzas/page.tsx:1610-1658` |
| NC: resta en RegistrarCobro, falta en Informe | `app/admin/cobranzas/page.tsx:788-792` vs `:1654` |
| Cobro graba `referencia_id = reciboId` | `app/admin/cobranzas/page.tsx:944-955` |
| Facturación cruza por `id` de factura | `app/admin/facturacion/page.tsx:231-243` |
| `facturas` sin columnas de estado de pago | `supabase/migrations/20260310_finanzas_facturacion.sql:7-22` |

---

*Documento generado en Sprint X.2. Estado: PROPUESTO — pendiente de aprobación de Fredi. Nada fue ejecutado salvo la creación de este archivo.*
