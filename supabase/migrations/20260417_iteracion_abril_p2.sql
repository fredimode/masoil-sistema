-- ============================================================
-- MIGRACIÓN 17/04 - Iteración abril parte 2
-- Asociación producto-proveedor + PDF cotización + envíos
-- ============================================================

-- 1. PRODUCTO-PROVEEDOR --------------------------------------------------
CREATE TABLE IF NOT EXISTS producto_proveedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE CASCADE,
  precio_proveedor NUMERIC(14,2),
  codigo_proveedor TEXT,
  ultimo_precio_fecha DATE,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, proveedor_id)
);
CREATE INDEX IF NOT EXISTS idx_prod_prov_product ON producto_proveedor(product_id);
CREATE INDEX IF NOT EXISTS idx_prod_prov_proveedor ON producto_proveedor(proveedor_id);
ALTER TABLE producto_proveedor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prod_prov_auth_all" ON producto_proveedor;
CREATE POLICY "prod_prov_auth_all" ON producto_proveedor
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. PDF COTIZACIÓN + ENVÍOS ---------------------------------------------
ALTER TABLE cotizaciones_venta ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE cotizaciones_venta ADD COLUMN IF NOT EXISTS enviada BOOLEAN DEFAULT false;
ALTER TABLE cotizaciones_venta ADD COLUMN IF NOT EXISTS enviada_at TIMESTAMPTZ;
ALTER TABLE cotizaciones_venta ADD COLUMN IF NOT EXISTS enviada_medio TEXT;

-- 3. BUCKET DE STORAGE ---------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('cotizaciones', 'cotizaciones', false)
ON CONFLICT DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "cotizaciones_storage_read" ON storage.objects;
CREATE POLICY "cotizaciones_storage_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'cotizaciones' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "cotizaciones_storage_write" ON storage.objects;
CREATE POLICY "cotizaciones_storage_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'cotizaciones' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "cotizaciones_storage_update" ON storage.objects;
CREATE POLICY "cotizaciones_storage_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'cotizaciones' AND auth.role() = 'authenticated');
