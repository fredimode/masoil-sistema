-- ============================================================================
-- FIX DE DATOS — Pedidos convertidos desde cotización con unit_price NETO
-- ----------------------------------------------------------------------------
-- CONTEXTO
--   La conversión cotización→pedido guardaba `order_items.unit_price` en NETO
--   (sin ×1.21), porque la cotización guarda precio neto y la conversión lo
--   copiaba tal cual. Al facturar, el sistema divide `unit_price / 1.21`
--   asumiendo que está CON IVA → el pedido convertido se sub-factura ~17,4%
--   (factor 1/1.21).
--
--   El FIX DE CÓDIGO ya corrige los pedidos NUEVOS (la conversión ahora aplica
--   `netoAConIva` = ×1.21, igual que un pedido directo). Este script corrige los
--   pedidos YA convertidos que TODAVÍA NO se facturaron.
--
-- ALCANCE (verificado read-only contra prod 2026-06-30)
--   Son 5 pedidos, todos estado INGRESADO, SIN factura asociada y SIN ningún
--   `order_items.facturado = true`:
--     COT-DDM-0002  ORD-20260507-6473047897   20936.56 → 25333.24
--     COT-DDM-0003  ORD-20260604-2791170978     152.87 →   184.97
--     COT-DDM-0006  ORD-20260610-6683084134     891.00 →  1078.11
--     COT-DDM-0009  ORD-20260624-1755993149     595.20 →   720.19
--     COT-DDM-0010  ORD-20260624-3070638644     131.30 →   158.87
--   Todos sus order_items están en NETO de forma uniforme (los renglones de la
--   conversión Y los agregados después con "Agregar producto" — `addItemsToOrder`
--   también guarda neto). Por eso el ×1.21 por renglón es uniforme y seguro:
--   ninguno tiene precio ya-con-IVA que se duplicaría. Se verificó que en los 5
--   `orders.total == Σ(unit_price × quantity)` (consistencia neto).
--
-- ⚠️ NO ES IDEMPOTENTE. Correr EXACTAMENTE UNA VEZ. Si se corre dos veces,
--    duplica el ×1.21. Por eso va dentro de una transacción: revisá la
--    verificación posterior ANTES de hacer COMMIT (si algo no cierra: ROLLBACK).
--
-- ⚠️ NO toca pedidos facturados (esos son emisiones de TESTING sin CAE; se
--    limpian en el go-live, no vale la pena corregirlos).
--
-- Aplicar a mano en el SQL editor de Supabase. NO se ejecuta automáticamente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) VERIFICACIÓN PREVIA — confirmá que aparecen EXACTAMENTE estos 5 pedidos,
--    que `items_facturados = 0` en todos, y que `total_actual == suma_items`.
-- ----------------------------------------------------------------------------
WITH objetivo AS (
  SELECT o.id AS order_id, o.order_number, o.total AS total_actual,
         cv.numero AS cot
  FROM cotizaciones_venta cv
  JOIN orders o ON o.id = cv.order_id
  WHERE cv.estado = 'convertida_pedido'
    AND cv.order_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.order_id = o.id)
    AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.facturado = TRUE)
)
SELECT ob.cot, ob.order_number, ob.order_id, ob.total_actual,
       ROUND(SUM(oi.unit_price * oi.quantity)::numeric, 2)  AS suma_items_actual,
       ROUND(ob.total_actual * 1.21, 2)                     AS total_nuevo_propuesto,
       COUNT(oi.id)                                         AS n_items,
       COUNT(*) FILTER (WHERE oi.facturado)                 AS items_facturados  -- DEBE ser 0
FROM objetivo ob
JOIN order_items oi ON oi.order_id = ob.order_id
GROUP BY ob.cot, ob.order_number, ob.order_id, ob.total_actual
ORDER BY ob.cot;


-- ----------------------------------------------------------------------------
-- 1) APLICAR EL FIX (transacción). Descomentá el bloque y corré todo junto.
--    Revisá el SELECT de verificación posterior ANTES de COMMIT.
-- ----------------------------------------------------------------------------
/*
BEGIN;

-- 1.a) order_items: NETO → CON IVA. ROUND a 2 decimales preserva el signo de
--      eventuales renglones de descuento (negativo × 1.21 sigue negativo).
UPDATE order_items oi
SET unit_price = ROUND(oi.unit_price * 1.21, 2)
WHERE oi.order_id IN (
  SELECT o.id
  FROM cotizaciones_venta cv
  JOIN orders o ON o.id = cv.order_id
  WHERE cv.estado = 'convertida_pedido'
    AND cv.order_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.order_id = o.id)
    AND NOT EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.facturado = TRUE)
);

-- 1.b) orders.total acorde. Se escala el total neto una sola vez (misma
--      convención que un pedido directo: total = ROUND(neto × 1.21, 2)). Puede
--      diferir 1 centavo de Σ(unit_price×qty) por redondeo por línea — es el
--      drift ya conocido y documentado del sistema, inofensivo.
UPDATE orders o
SET total = ROUND(o.total * 1.21, 2),
    updated_at = now()
WHERE o.id IN (
  SELECT o2.id
  FROM cotizaciones_venta cv
  JOIN orders o2 ON o2.id = cv.order_id
  WHERE cv.estado = 'convertida_pedido'
    AND cv.order_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.order_id = o2.id)
    AND NOT EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o2.id AND x.facturado = TRUE)
);

-- ----------------------------------------------------------------------------
-- 2) VERIFICACIÓN POSTERIOR (dentro de la misma transacción, antes de COMMIT).
--    Esperá: total_nuevo ≈ Σ(unit_price×qty) nuevo, y los totales ×1.21 de la
--    tabla del paso 0 (25333.24 / 184.97 / 1078.11 / 720.19 / 158.87).
-- ----------------------------------------------------------------------------
SELECT cv.numero AS cot, o.order_number, o.total AS total_nuevo,
       ROUND(SUM(oi.unit_price * oi.quantity)::numeric, 2) AS suma_items_nueva
FROM cotizaciones_venta cv
JOIN orders o ON o.id = cv.order_id
JOIN order_items oi ON oi.order_id = o.id
WHERE cv.estado = 'convertida_pedido'
  AND cv.order_id IS NOT NULL
  AND o.order_number IN (
    'ORD-20260507-6473047897','ORD-20260604-2791170978','ORD-20260610-6683084134',
    'ORD-20260624-1755993149','ORD-20260624-3070638644')
GROUP BY cv.numero, o.order_number, o.total
ORDER BY cv.numero;

-- Si los números cierran:
-- COMMIT;
-- Si algo no cierra:
-- ROLLBACK;
*/
