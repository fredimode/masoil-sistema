-- ============================================================
-- MIGRACIÓN ABRIL PARTE 2
-- Cobranzas: recibo correlativo, cheques/echeqs tabla
-- Pagos: lotes de pago
-- Proveedores: quitar empresa del esquema
-- ============================================================

-- 1. Recibos cobranza con correlativo automático
CREATE TABLE IF NOT EXISTS recibos_cobranza (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  client_id UUID REFERENCES clients(id),
  cuit_cliente TEXT,
  razon_social_cliente TEXT,
  vendedor_id UUID REFERENCES vendedores(id),
  vendedor_nombre TEXT,
  empresa TEXT,
  total_facturas NUMERIC(14,2) DEFAULT 0,
  total_retenciones NUMERIC(14,2) DEFAULT 0,
  total_valores NUMERIC(14,2) DEFAULT 0,
  saldo_a_favor NUMERIC(14,2) DEFAULT 0,
  medios_pago JSONB DEFAULT '[]',
  facturas_ids JSONB DEFAULT '[]',
  observaciones TEXT,
  estado TEXT DEFAULT 'confirmado',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE recibos_cobranza ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recibos_cobranza_auth_all" ON recibos_cobranza
  FOR ALL USING (auth.role() = 'authenticated');

CREATE SEQUENCE IF NOT EXISTS recibo_cobranza_numero_seq START 1;

-- 2. Cheques y Echeqs recibidos
CREATE TABLE IF NOT EXISTS cheques_recibidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recibo_id UUID REFERENCES recibos_cobranza(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  numero TEXT,
  banco TEXT,
  importe NUMERIC(14,2) NOT NULL,
  fecha_emision DATE,
  fecha_deposito DATE,
  estado TEXT DEFAULT 'en_cartera',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE cheques_recibidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cheques_recibidos_auth_all" ON cheques_recibidos
  FOR ALL USING (auth.role() = 'authenticated');

-- 3. Lotes de pago
CREATE TABLE IF NOT EXISTS lotes_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_lote DATE NOT NULL,
  empresa TEXT,
  estado TEXT DEFAULT 'borrador',
  aprobado_por UUID REFERENCES vendedores(id),
  aprobado_at TIMESTAMPTZ,
  observaciones TEXT,
  total NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE lotes_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lotes_pago_auth_all" ON lotes_pago
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS lote_pago_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID REFERENCES lotes_pago(id) ON DELETE CASCADE,
  factura_proveedor_id UUID REFERENCES facturas_proveedor(id),
  proveedor_nombre TEXT,
  proveedor_cuit TEXT,
  empresa TEXT,
  fecha_fc DATE,
  nro_fc TEXT,
  importe NUMERIC(14,2),
  forma_pago TEXT,
  estado TEXT DEFAULT 'pendiente',
  valores_utilizados TEXT,
  orden_pago_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE lote_pago_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lote_items_auth_all" ON lote_pago_items
  FOR ALL USING (auth.role() = 'authenticated');

-- 4. Vincular facturas_proveedor con lotes
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS lote_pago_id UUID REFERENCES lotes_pago(id);

-- 5. Vincular pagos_proveedores con facturas y lotes
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS facturas_ids JSONB DEFAULT '[]';
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS lote_pago_id UUID REFERENCES lotes_pago(id);
