-- =============================================================================
-- Sprint R — R.9: Mover un producto pendiente de un pedido a otro
-- Fecha: 2026-06-06
-- =============================================================================
-- Permite mover un item no facturado de un pedido a otro pedido del mismo
-- cliente (en estado INGRESADO/BORRADOR) para poder facturar todo junto. El
-- item se copia al pedido destino y en el pedido origen queda marcado como
-- "movido": sigue visible con un badge pero no se factura ni afecta stock/total.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS movido BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS movido_a_order_id UUID REFERENCES orders(id);
