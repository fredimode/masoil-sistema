-- ============================================================
-- Migration: remitos.factura_id (desnormalización defensiva)
-- Fecha: 2026-05-08
-- ============================================================
-- Asociación directa remito→factura. Hoy es transitiva via
-- remitos.order_id → orders.factura_id → facturas.id (2 hops).
-- Esta columna agrega un atajo y deja la base lista para futuros
-- flujos de "remito desde factura sin pedido" (devolución, regalo, etc.).

ALTER TABLE remitos
  ADD COLUMN IF NOT EXISTS factura_id BIGINT REFERENCES facturas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_remitos_factura ON remitos(factura_id);

-- Backfill: traer factura_id desde orders.factura_id de cada remito.
-- Si un pedido tiene FACTURADO_PARCIAL, orders.factura_id apunta a la
-- última factura emitida (convención del endpoint /api/facturar).
UPDATE remitos r
  SET factura_id = o.factura_id
  FROM orders o
  WHERE r.factura_id IS NULL
    AND r.order_id = o.id
    AND o.factura_id IS NOT NULL;
