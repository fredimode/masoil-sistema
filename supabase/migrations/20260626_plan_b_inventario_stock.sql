-- ============================================================
-- Plan B — Control de Inventario: 3 columnas de stock + historial + expiración
-- Fecha: 2026-06-26   (FASE 1 — SCHEMA)
-- APLICAR A MANO EN SUPABASE. Idempotente.
--
-- Convención: products.stock = DISPONIBLE (se mantiene, no romper lo existente)
--             + nuevas stock_fisico y stock_reservado.
--   Invariante objetivo:  stock (disponible) = stock_fisico − stock_reservado
--
-- IMPORTANTE: aditivo. Las columnas nuevas no rompen el código actual; la
-- reconexión de la lógica (Fase 2) usa estas columnas, así que aplicá esto
-- ANTES de deployar la Fase 2.
-- ============================================================

-- 1) products: físico + reservado (stock queda como disponible)
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_fisico NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_reservado NUMERIC NOT NULL DEFAULT 0;

-- 2) orders: fecha límite de la reserva (expiración)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reserva_expira_at TIMESTAMPTZ;

-- 3) Tabla nueva: historial de movimientos de stock (ledger unificado).
--    `tipo` es TEXT (no enum) para evitar el dolor de drift de enums (ver
--    CLAUDE.md). Valores esperados:
--      Compra(+) | Venta(−) | DevolucionCliente(+) | DevolucionProveedor(−)
--      AjustePositivo(+) | AjusteNegativo(−) | Reserva | LiberaReserva
--    `referencia_*` es polimórfico (igual patrón que cuenta_corriente_cliente):
--      referencia_tipo: 'order' | 'orden_compra' | 'ajuste' | null
--      referencia_id:   id del pedido / OC / etc (TEXT)
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo TEXT NOT NULL,
  cantidad NUMERIC NOT NULL,
  stock_fisico_antes NUMERIC,
  stock_fisico_despues NUMERIC,
  stock_disponible_antes NUMERIC,
  stock_disponible_despues NUMERIC,
  usuario_id UUID,
  usuario_nombre TEXT,
  observacion TEXT,
  referencia_tipo TEXT,
  referencia_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_product ON movimientos_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_fecha ON movimientos_stock(fecha DESC);

-- RLS: consistente con el resto del sistema (posture permisiva — la deuda de
-- RLS se trata en Sprint Z, no acá). Sin esto, las lecturas/escrituras fallan.
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='movimientos_stock' AND policyname='movimientos_stock_auth_all') THEN
    CREATE POLICY "movimientos_stock_auth_all" ON movimientos_stock
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 4) BACKFILL  (revisar las verificaciones antes/después)
-- ============================================================

-- --- Verificación PREVIA (read-only) ---
-- (a) Estado actual de stock:
--   SELECT COUNT(*) AS productos, SUM(COALESCE(stock,0)) AS suma_disponible_actual FROM products;
-- (b) Reservas calculables = pedidos con PENDIENTE REAL de entrega
--     (BORRADOR / INGRESADO / FACTURADO_PARCIAL):
--   SELECT COUNT(DISTINCT oi.product_id) AS productos_con_reserva,
--          SUM(oi.quantity) AS total_a_reservar
--   FROM order_items oi
--   JOIN orders o ON o.id = oi.order_id
--   WHERE oi.reservado = true AND oi.product_id IS NOT NULL
--     AND o.status IN ('BORRADOR','INGRESADO','FACTURADO_PARCIAL');

-- 4.1) stock_reservado = Σ cantidades reservadas en pedidos con PENDIENTE REAL
--      de entrega, por producto. Solo cuentan los estados con mercadería aún
--      no entregada: BORRADOR, INGRESADO, FACTURADO_PARCIAL. (Los FACTURADO
--      total, ENTREGADO y CANCELADO NO reservan: su stock ya salió o se liberó.)
UPDATE products p
SET stock_reservado = COALESCE(r.total, 0)
FROM (
  SELECT oi.product_id, SUM(oi.quantity) AS total
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.reservado = true
    AND oi.product_id IS NOT NULL
    AND o.status IN ('BORRADOR','INGRESADO','FACTURADO_PARCIAL')
  GROUP BY oi.product_id
) r
WHERE p.id = r.product_id;
-- Productos sin reservas quedan en 0 (default).

-- 4.2) stock_fisico = disponible actual + reservado.
--      (Hoy `stock` ya tiene las reservas restadas; el físico = lo libre + lo comprometido.)
UPDATE products
SET stock_fisico = COALESCE(stock, 0) + COALESCE(stock_reservado, 0);

-- --- Verificación POSTERIOR (read-only) ---
-- (a) Invariante: fisico = disponible + reservado  → debe dar 0 inconsistentes:
--   SELECT COUNT(*) AS inconsistentes FROM products
--   WHERE COALESCE(stock_fisico,0) <> COALESCE(stock,0) + COALESCE(stock_reservado,0);
-- (b) Muestra de los que tienen reserva:
--   SELECT code, name, stock_fisico, stock_reservado, stock AS disponible
--   FROM products WHERE stock_reservado > 0 ORDER BY stock_reservado DESC LIMIT 15;
-- (c) Productos con disponible negativo (sobreventa preexistente — NO los corrige el backfill):
--   SELECT code, name, stock_fisico, stock_reservado, stock AS disponible
--   FROM products WHERE stock < 0;
