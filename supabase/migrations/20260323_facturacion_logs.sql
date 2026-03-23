-- ============================================================
-- Migración: Tabla de logs de facturación electrónica (TusFacturas)
-- Fecha: 2026-03-23
-- ============================================================

-- 1. FACTURACION_LOGS - Logs de cada paso del proceso de facturación
CREATE TABLE IF NOT EXISTS facturacion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id BIGINT REFERENCES facturas(id),
  paso TEXT NOT NULL,                    -- 'preparando_datos', 'enviando_tusfacturas', 'procesando_respuesta'
  estado TEXT NOT NULL,                  -- 'ok', 'error', 'pendiente'
  detalle JSONB,                         -- request/response JSON completo
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_facturacion_logs_factura ON facturacion_logs(factura_id);
CREATE INDEX idx_facturacion_logs_estado ON facturacion_logs(estado);
CREATE INDEX idx_facturacion_logs_created ON facturacion_logs(created_at DESC);

-- RLS
ALTER TABLE facturacion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facturacion_logs_auth_all" ON facturacion_logs
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. ALTER facturas: permitir facturas sin order_id (facturación directa)
ALTER TABLE facturas ALTER COLUMN order_id DROP NOT NULL;

-- 3. Agregar client_id a facturas para facturación directa
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
CREATE INDEX IF NOT EXISTS idx_facturas_client_id ON facturas(client_id);
