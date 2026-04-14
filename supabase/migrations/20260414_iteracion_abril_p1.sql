-- ============================================================
-- MIGRACIÓN ABRIL PARTE 1
-- Pedidos: facturación parcial, reserva stock, hoja de ruta,
-- solicitudes compra, campos entrega, nuevos estados
-- Clientes: domicilio entrega
-- ============================================================

-- 1. Nuevos estados en el enum order_status
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'FACTURADO_PARCIAL';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'EN_PROCESO_ENTREGA';

-- 3. Facturación parcial - columnas en order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS facturado BOOLEAN DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS factura_id BIGINT REFERENCES facturas(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cantidad_facturada INTEGER DEFAULT 0;

-- 4. Reserva de stock - columnas en order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS reservado BOOLEAN DEFAULT true;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS reservado_at TIMESTAMPTZ DEFAULT now();

-- 5. Campos de entrega separados en orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS solicita TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recibe TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS entrega_otra_sucursal TEXT;

-- 6. Hoja de ruta URL en orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hoja_ruta_url TEXT;

-- 7. Solicitudes de compra (tabla nueva)
CREATE TABLE IF NOT EXISTS solicitudes_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  order_item_id UUID REFERENCES order_items(id),
  product_id UUID REFERENCES products(id),
  producto_nombre TEXT,
  producto_codigo TEXT,
  cantidad_solicitada INTEGER,
  cantidad_stock INTEGER,
  cantidad_faltante INTEGER,
  estado TEXT DEFAULT 'borrador',
  orden_compra_id UUID,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sol_compra_estado ON solicitudes_compra(estado);
ALTER TABLE solicitudes_compra ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'solicitudes_compra' AND policyname = 'sol_compra_auth_all'
  ) THEN
    CREATE POLICY "sol_compra_auth_all" ON solicitudes_compra
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 14. Domicilio de entrega en clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS domicilio_entrega TEXT;
