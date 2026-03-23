-- ============================================================
-- Migración: Tablas facturas + facturacion_logs (TusFacturas)
-- Fecha: 2026-03-23
-- Nota: facturas no existía previamente, se crea completa aquí
-- ============================================================

-- 1. FACTURAS
CREATE TABLE IF NOT EXISTS facturas (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  numero TEXT,
  tipo TEXT NOT NULL DEFAULT 'Factura B',
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  cuit_cliente TEXT,
  razon_social TEXT NOT NULL,
  base_gravada NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_21 NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  cae TEXT,
  vencimiento_cae DATE,
  pdf_url TEXT,
  client_id UUID REFERENCES clients(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_facturas_order_id ON facturas(order_id);
CREATE INDEX idx_facturas_fecha ON facturas(fecha);
CREATE INDEX idx_facturas_numero ON facturas(numero) WHERE numero IS NOT NULL;
CREATE INDEX idx_facturas_client_id ON facturas(client_id);

ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facturas_auth_all" ON facturas
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. FACTURACION_LOGS
CREATE TABLE IF NOT EXISTS facturacion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id BIGINT REFERENCES facturas(id),
  paso TEXT NOT NULL,
  estado TEXT NOT NULL,
  detalle JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_facturacion_logs_factura ON facturacion_logs(factura_id);
CREATE INDEX idx_facturacion_logs_estado ON facturacion_logs(estado);
CREATE INDEX idx_facturacion_logs_created ON facturacion_logs(created_at DESC);

ALTER TABLE facturacion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facturacion_logs_auth_all" ON facturacion_logs
  FOR ALL USING (auth.role() = 'authenticated');
