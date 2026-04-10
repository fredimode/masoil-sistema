-- =============================================
-- MIGRACIÓN: Plan de Cuentas Contables + Imputaciones
-- Fecha: 2026-04-10
-- =============================================

-- === 1. Plan de Cuentas Contables ===
CREATE TABLE IF NOT EXISTS plan_cuentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  sub_categoria TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE plan_cuentas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'plan_cuentas_auth_all') THEN
    CREATE POLICY "plan_cuentas_auth_all" ON plan_cuentas
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- === 2. Imputaciones contables en facturas proveedor ===
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS imputaciones JSONB DEFAULT '[]';

-- === 3. Campos NC/ND en facturas ===
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS factura_referencia_id BIGINT REFERENCES facturas(id);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS comprobante_nro TEXT;
