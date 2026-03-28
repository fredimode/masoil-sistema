-- =============================================
-- Migración 2026-03-28: Iteración cambios cliente
-- =============================================

-- SECCIÓN 1: PROVEEDORES — email_pagos
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS email_pagos TEXT;

-- SECCIÓN 2: ÓRDENES DE COMPRA — nro factura proveedor + fecha recepción
ALTER TABLE compras ADD COLUMN IF NOT EXISTS nro_factura_proveedor TEXT;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_recepcion DATE;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS nro_factura_proveedor TEXT;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS fecha_recepcion DATE;

-- SECCIÓN 3: FACTURAS PROVEEDOR
CREATE TABLE IF NOT EXISTS facturas_proveedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id UUID REFERENCES proveedores(id),
  proveedor_nombre TEXT,
  orden_compra_id UUID,
  tipo TEXT DEFAULT 'FACTURA',
  letra TEXT,
  punto_venta TEXT,
  numero TEXT,
  fecha DATE,
  fecha_vencimiento DATE,
  neto NUMERIC(14,2),
  iva NUMERIC(14,2),
  percepciones_iva NUMERIC(14,2) DEFAULT 0,
  percepciones_iibb NUMERIC(14,2) DEFAULT 0,
  otros_impuestos NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2),
  estado TEXT DEFAULT 'pendiente',
  saldo_pendiente NUMERIC(14,2),
  razon_social TEXT,
  comprobante_url TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facturas_prov_proveedor ON facturas_proveedor(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_facturas_prov_estado ON facturas_proveedor(estado);
ALTER TABLE facturas_proveedor ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'facturas_prov_auth_all') THEN
    CREATE POLICY "facturas_prov_auth_all" ON facturas_proveedor FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- SECCIÓN 4: CHEQUES EMITIDOS
CREATE TABLE IF NOT EXISTS cheques_emitidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id UUID REFERENCES pagos_proveedores(id),
  numero TEXT,
  banco TEXT,
  importe NUMERIC(14,2),
  fecha_emision DATE,
  fecha_pago DATE,
  tipo TEXT DEFAULT 'cheque',
  estado TEXT DEFAULT 'emitido',
  imagen_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE cheques_emitidos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cheques_auth_all') THEN
    CREATE POLICY "cheques_auth_all" ON cheques_emitidos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- SECCIÓN 5: CUENTA CORRIENTE CLIENTE
CREATE TABLE IF NOT EXISTS cuenta_corriente_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  fecha DATE,
  tipo_comprobante TEXT,
  punto_venta TEXT,
  numero_comprobante TEXT,
  debe NUMERIC(14,2) DEFAULT 0,
  haber NUMERIC(14,2) DEFAULT 0,
  saldo NUMERIC(14,2) DEFAULT 0,
  referencia_id UUID,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cc_cliente ON cuenta_corriente_cliente(client_id);
ALTER TABLE cuenta_corriente_cliente ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_cliente_auth_all') THEN
    CREATE POLICY "cc_cliente_auth_all" ON cuenta_corriente_cliente FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- SECCIÓN 6: RETENCIONES
CREATE TABLE IF NOT EXISTS retenciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  tipo TEXT,
  numero_comprobante TEXT,
  fecha DATE,
  importe NUMERIC(14,2),
  provincia TEXT,
  recibo_id UUID,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE retenciones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'retenciones_auth_all') THEN
    CREATE POLICY "retenciones_auth_all" ON retenciones FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
