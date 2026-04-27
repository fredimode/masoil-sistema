-- ============================================================
-- Migration: tabla remitos + storage bucket + RLS
-- Fecha: 2026-04-27
-- ============================================================

-- TABLA remitos
CREATE TABLE IF NOT EXISTS remitos (
  id BIGSERIAL PRIMARY KEY,
  numero TEXT NOT NULL,                          -- formato "0001-00000123"
  empresa TEXT NOT NULL,                         -- "Aquiles" | "Conancap"
  punto_venta TEXT NOT NULL,
  numero_remito INTEGER NOT NULL,
  cai TEXT NOT NULL,
  cai_vencimiento DATE,
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  order_id UUID REFERENCES orders(id),
  client_id UUID REFERENCES clients(id),
  cliente_nombre TEXT,
  cliente_cuit TEXT,
  cliente_domicilio TEXT,
  pdf_url TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa, numero_remito)
);

CREATE INDEX IF NOT EXISTS idx_remitos_numero ON remitos(numero);
CREATE INDEX IF NOT EXISTS idx_remitos_empresa ON remitos(empresa);
CREATE INDEX IF NOT EXISTS idx_remitos_order ON remitos(order_id);

ALTER TABLE remitos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "remitos_auth_all" ON remitos
  FOR ALL USING (auth.role() = 'authenticated');

-- STORAGE bucket remitos (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('remitos', 'remitos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_read_remitos" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'remitos');

CREATE POLICY "auth_upload_remitos" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'remitos');
