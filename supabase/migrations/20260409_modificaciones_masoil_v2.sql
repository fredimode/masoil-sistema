-- =============================================
-- MIGRACIÓN: Modificaciones Masoil Abril 2026 (v2)
-- Fecha: 2026-04-09
-- =============================================

-- === 1. FIX: order_status_history - agregar columnas user_id y user_name ===
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS user_name TEXT;

-- === 2. PEDIDOS: Observaciones de entrega ===
ALTER TABLE orders ADD COLUMN IF NOT EXISTS observaciones_entrega TEXT;

-- === 3. COBRANZAS: Mails y teléfonos múltiples (JSON arrays) ===
ALTER TABLE clients ALTER COLUMN cobranzas_mail TYPE JSONB
  USING CASE WHEN cobranzas_mail IS NOT NULL THEN to_jsonb(ARRAY[cobranzas_mail]) ELSE '[]'::jsonb END;
ALTER TABLE clients ALTER COLUMN cobranzas_telefono TYPE JSONB
  USING CASE WHEN cobranzas_telefono IS NOT NULL THEN to_jsonb(ARRAY[cobranzas_telefono]) ELSE '[]'::jsonb END;

-- === 4. PROVEEDORES: Contacto cobranzas + nombre fantasía ===
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS contacto_cobranzas TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tel_cobranzas TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS nombre_fantasia TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS razon_social TEXT;

-- === 5. CUENTA CORRIENTE PROVEEDOR ===
CREATE TABLE IF NOT EXISTS cuenta_corriente_proveedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id UUID REFERENCES proveedores(id),
  fecha DATE,
  tipo_comprobante TEXT, -- FC, NC, ND, OP, PC (pago a cuenta)
  punto_venta TEXT,
  numero_comprobante TEXT,
  debe NUMERIC(14,2) DEFAULT 0,
  haber NUMERIC(14,2) DEFAULT 0,
  saldo NUMERIC(14,2) DEFAULT 0,
  referencia_id UUID,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cc_proveedor ON cuenta_corriente_proveedor(proveedor_id);
ALTER TABLE cuenta_corriente_proveedor ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_prov_auth_all') THEN
    CREATE POLICY "cc_prov_auth_all" ON cuenta_corriente_proveedor
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- === 6. FACTURAS PROVEEDOR: Items/detalle de productos ===
CREATE TABLE IF NOT EXISTS factura_proveedor_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id UUID REFERENCES facturas_proveedor(id) ON DELETE CASCADE,
  producto_nombre TEXT,
  producto_codigo TEXT,
  cantidad NUMERIC(14,2) DEFAULT 1,
  precio_unitario NUMERIC(14,2) DEFAULT 0,
  subtotal NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_items_factura ON factura_proveedor_items(factura_id);
ALTER TABLE factura_proveedor_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fp_items_auth_all') THEN
    CREATE POLICY "fp_items_auth_all" ON factura_proveedor_items
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- === 7. Products: policy FOR ALL para authenticated (fix UPDATE/DELETE) ===
-- Reemplaza admin_write_products que solo permitía role='admin'
DROP POLICY IF EXISTS "admin_write_products" ON products;
DROP POLICY IF EXISTS "admin_delete_products" ON products;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products' AND policyname = 'products_authenticated_all'
  ) THEN
    CREATE POLICY "products_authenticated_all" ON products
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
