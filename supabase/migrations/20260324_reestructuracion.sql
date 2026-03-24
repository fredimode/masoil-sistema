-- ============================================================
-- Migración: Reestructuración completa Masoil
-- Fecha: 2026-03-24
-- ============================================================

-- ============================================================
-- A) Nuevo enum de estados de pedido (6 estados)
-- ============================================================

-- Renombrar el enum viejo
ALTER TYPE order_status RENAME TO order_status_old;

-- Crear el nuevo enum
CREATE TYPE order_status AS ENUM (
  'INGRESADO',
  'PREPARADO',
  'FACTURADO',
  'ESPERANDO_MERCADERIA',
  'ENTREGADO',
  'CANCELADO'
);

-- Migrar orders.status
ALTER TABLE orders ALTER COLUMN status TYPE TEXT;
UPDATE orders SET status = 'INGRESADO' WHERE status IN ('RECIBIDO', 'CONFIRMADO');
UPDATE orders SET status = 'PREPARADO' WHERE status IN ('EN_ARMADO', 'LISTO');
UPDATE orders SET status = 'FACTURADO' WHERE status = 'FACTURADO';
UPDATE orders SET status = 'ESPERANDO_MERCADERIA' WHERE status IN ('EN_FABRICACION', 'CON_PROVEEDOR', 'SIN_STOCK');
UPDATE orders SET status = 'ENTREGADO' WHERE status IN ('EN_ENTREGA', 'ENTREGADO');
UPDATE orders SET status = 'CANCELADO' WHERE status = 'CANCELADO';
ALTER TABLE orders ALTER COLUMN status TYPE order_status USING status::order_status;

-- F) Migrar order_status_history.status
ALTER TABLE order_status_history ALTER COLUMN status TYPE TEXT;
UPDATE order_status_history SET status = 'INGRESADO' WHERE status IN ('RECIBIDO', 'CONFIRMADO');
UPDATE order_status_history SET status = 'PREPARADO' WHERE status IN ('EN_ARMADO', 'LISTO');
UPDATE order_status_history SET status = 'FACTURADO' WHERE status = 'FACTURADO';
UPDATE order_status_history SET status = 'ESPERANDO_MERCADERIA' WHERE status IN ('EN_FABRICACION', 'CON_PROVEEDOR', 'SIN_STOCK');
UPDATE order_status_history SET status = 'ENTREGADO' WHERE status IN ('EN_ENTREGA', 'ENTREGADO');
UPDATE order_status_history SET status = 'CANCELADO' WHERE status = 'CANCELADO';
ALTER TABLE order_status_history ALTER COLUMN status TYPE order_status USING status::order_status;

-- Eliminar enum viejo
DROP TYPE order_status_old;

-- ============================================================
-- B) Agregar campos a orders
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS requiere_cotizacion BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cotizacion_aceptada BOOLEAN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS factura_id BIGINT REFERENCES facturas(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelado_motivo TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelado_at TIMESTAMPTZ;

-- ============================================================
-- C) Tabla cotizaciones
-- ============================================================

CREATE TABLE IF NOT EXISTS cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT REFERENCES orders(id),
  proveedor_id UUID REFERENCES proveedores(id),
  proveedor_nombre TEXT,
  items JSONB NOT NULL,  -- [{producto, cantidad, precio_proveedor}]
  total NUMERIC(14,2),
  estado TEXT DEFAULT 'pendiente',  -- pendiente, aceptada, rechazada
  fecha_respuesta DATE,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cotizaciones_order ON cotizaciones(order_id);
CREATE INDEX idx_cotizaciones_estado ON cotizaciones(estado);

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotizaciones_auth_all" ON cotizaciones
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- D) Agregar campo sucursal a clients
-- ============================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS sucursal TEXT;

-- ============================================================
-- E) Nuevo enum de roles expandido
-- ============================================================

ALTER TYPE user_role RENAME TO user_role_old;

CREATE TYPE user_role AS ENUM ('admin', 'vendedor', 'operaciones', 'cobranzas');

ALTER TABLE vendedores ALTER COLUMN role TYPE TEXT;
ALTER TABLE vendedores ALTER COLUMN role TYPE user_role USING role::user_role;

DROP TYPE user_role_old;
