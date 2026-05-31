-- Sprint N
-- N.2: descuento por ítem en órdenes de compra (la columna no existía;
-- createOrdenCompra recibía descuento_porcentaje pero no lo persistía).
ALTER TABLE orden_compra_items
  ADD COLUMN IF NOT EXISTS descuento_porcentaje NUMERIC(5,2) DEFAULT 0;
