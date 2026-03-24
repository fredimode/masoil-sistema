-- ============================================================
-- Migración: Reestructuración completa Masoil
-- Fecha: 2026-03-24
-- NOTA: Este SQL refleja lo que se ejecutó en Supabase
-- ============================================================

-- A) Nuevo enum de estados de pedido
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE order_status_history ALTER COLUMN status DROP DEFAULT;

ALTER TYPE order_status RENAME TO order_status_old;
CREATE TYPE order_status AS ENUM (
  'INGRESADO', 'PREPARADO', 'FACTURADO',
  'ESPERANDO_MERCADERIA', 'ENTREGADO', 'CANCELADO'
);

ALTER TABLE orders ALTER COLUMN status TYPE TEXT;
UPDATE orders SET status = 'INGRESADO' WHERE status IN ('RECIBIDO', 'CONFIRMADO');
UPDATE orders SET status = 'PREPARADO' WHERE status IN ('EN_ARMADO', 'LISTO');
UPDATE orders SET status = 'FACTURADO' WHERE status = 'FACTURADO';
UPDATE orders SET status = 'ESPERANDO_MERCADERIA' WHERE status IN ('EN_FABRICACION', 'CON_PROVEEDOR', 'SIN_STOCK');
UPDATE orders SET status = 'ENTREGADO' WHERE status IN ('EN_ENTREGA', 'ENTREGADO');
UPDATE orders SET status = 'CANCELADO' WHERE status = 'CANCELADO';
ALTER TABLE orders ALTER COLUMN status TYPE order_status USING status::order_status;
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'INGRESADO';

ALTER TABLE order_status_history ALTER COLUMN status TYPE TEXT;
UPDATE order_status_history SET status = 'INGRESADO' WHERE status IN ('RECIBIDO', 'CONFIRMADO');
UPDATE order_status_history SET status = 'PREPARADO' WHERE status IN ('EN_ARMADO', 'LISTO');
UPDATE order_status_history SET status = 'FACTURADO' WHERE status = 'FACTURADO';
UPDATE order_status_history SET status = 'ESPERANDO_MERCADERIA' WHERE status IN ('EN_FABRICACION', 'CON_PROVEEDOR', 'SIN_STOCK');
UPDATE order_status_history SET status = 'ENTREGADO' WHERE status IN ('EN_ENTREGA', 'ENTREGADO');
UPDATE order_status_history SET status = 'CANCELADO' WHERE status = 'CANCELADO';
ALTER TABLE order_status_history ALTER COLUMN status TYPE order_status USING status::order_status;

DROP TYPE order_status_old;

-- B) Campos nuevos en orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS requiere_cotizacion BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cotizacion_aceptada BOOLEAN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS factura_id BIGINT REFERENCES facturas(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelado_motivo TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelado_at TIMESTAMPTZ;

-- C) Tabla cotizaciones (order_id UUID)
CREATE TABLE IF NOT EXISTS cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  proveedor_id UUID REFERENCES proveedores(id),
  proveedor_nombre TEXT,
  items JSONB NOT NULL,
  total NUMERIC(14,2),
  estado TEXT DEFAULT 'pendiente',
  fecha_respuesta DATE,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_cotizaciones_order ON cotizaciones(order_id);
CREATE INDEX idx_cotizaciones_estado ON cotizaciones(estado);
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cotizaciones_auth_all" ON cotizaciones FOR ALL USING (auth.role() = 'authenticated');

-- D) Sucursal en clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sucursal TEXT;

-- E) Roles expandidos
ALTER TABLE vendedores ALTER COLUMN role DROP DEFAULT;
ALTER TYPE user_role RENAME TO user_role_old;
CREATE TYPE user_role AS ENUM ('admin', 'vendedor', 'operaciones', 'cobranzas');
ALTER TABLE vendedores ALTER COLUMN role TYPE TEXT;
ALTER TABLE vendedores ALTER COLUMN role TYPE user_role USING role::user_role;
ALTER TABLE vendedores ALTER COLUMN role SET DEFAULT 'vendedor';
DROP TYPE user_role_old CASCADE;

-- Recrear función y policies que dependían del enum viejo
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
  SELECT role FROM vendedores WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "admin_full_access_vendedores" ON vendedores;
CREATE POLICY "admin_full_access_vendedores" ON vendedores
  FOR ALL USING (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_write_products" ON products;
CREATE POLICY "admin_write_products" ON products
  FOR ALL USING (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_full_access_clients" ON clients;
CREATE POLICY "admin_full_access_clients" ON clients
  FOR ALL USING (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_full_access_orders" ON orders;
CREATE POLICY "admin_full_access_orders" ON orders
  FOR ALL USING (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "access_via_order" ON order_items;
CREATE POLICY "access_via_order" ON order_items
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "access_via_order_history" ON order_status_history;
CREATE POLICY "access_via_order_history" ON order_status_history
  FOR ALL USING (auth.role() = 'authenticated');
