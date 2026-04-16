-- ============================================================
-- MIGRACIÓN 16/04 - Iteración abril parte 1
-- Cotizaciones de venta + numeración por vendedor + OC items + empresa
-- ============================================================

-- 1. COTIZACIONES DE VENTA ----------------------------------------------
CREATE TABLE IF NOT EXISTS cotizaciones_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE,
  fecha DATE DEFAULT CURRENT_DATE,
  client_id UUID REFERENCES clients(id),
  client_name TEXT,
  vendedor_id UUID REFERENCES vendedores(id),
  vendedor_nombre TEXT,
  vendedor_iniciales TEXT,
  razon_social TEXT,
  zona TEXT,
  estado TEXT DEFAULT 'pendiente',
  validez_fecha DATE,
  forma_pago TEXT,
  plazo_entrega TEXT,
  observaciones TEXT,
  total NUMERIC(14,2) DEFAULT 0,
  order_id TEXT REFERENCES orders(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cot_venta_estado ON cotizaciones_venta(estado);
CREATE INDEX IF NOT EXISTS idx_cot_venta_client ON cotizaciones_venta(client_id);
ALTER TABLE cotizaciones_venta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cot_venta_auth_all" ON cotizaciones_venta;
CREATE POLICY "cot_venta_auth_all" ON cotizaciones_venta
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS cotizacion_venta_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id UUID REFERENCES cotizaciones_venta(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  producto_nombre TEXT,
  producto_codigo TEXT,
  cantidad INTEGER DEFAULT 1,
  precio_unitario NUMERIC(14,2) DEFAULT 0,
  subtotal NUMERIC(14,2) DEFAULT 0,
  aprobado BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE cotizacion_venta_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cot_venta_items_auth_all" ON cotizacion_venta_items;
CREATE POLICY "cot_venta_items_auth_all" ON cotizacion_venta_items
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. INICIALES EN VENDEDORES ---------------------------------------------
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS iniciales TEXT;
UPDATE vendedores SET iniciales = 'PSG' WHERE email = 'pablo@masoil.com.ar';
UPDATE vendedores SET iniciales = 'JGE' WHERE email = 'jestevez@masoil.com.ar';
UPDATE vendedores SET iniciales = 'DDM' WHERE email = 'cobranzas@masoil.com.ar';

-- 3. ITEMS EN ORDEN DE COMPRA --------------------------------------------
CREATE TABLE IF NOT EXISTS orden_compra_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_compra_id UUID REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  producto_nombre TEXT,
  producto_codigo TEXT,
  cantidad INTEGER DEFAULT 1,
  precio_unitario NUMERIC(14,2),
  subtotal NUMERIC(14,2),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE orden_compra_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oc_items_auth_all" ON orden_compra_items;
CREATE POLICY "oc_items_auth_all" ON orden_compra_items
  FOR ALL USING (auth.role() = 'authenticated');

-- 4. EMPRESA EN OC -------------------------------------------------------
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS empresa TEXT;

-- 5. NRO OC EN SEGUIMIENTO DE COMPRAS ------------------------------------
ALTER TABLE compras ADD COLUMN IF NOT EXISTS nro_oc TEXT;
