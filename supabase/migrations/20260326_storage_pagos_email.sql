-- ============================================================
-- Migration: Storage bucket, pagos fields, email tracking
-- Fecha: 2026-03-26
-- ============================================================

-- STORAGE: bucket comprobantes
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_upload_comprobantes" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comprobantes');

CREATE POLICY "auth_read_comprobantes" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'comprobantes');

-- PAGOS: campos nuevos
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS comprobante_url TEXT;
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS email_enviado BOOLEAN DEFAULT false;
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS email_enviado_at TIMESTAMPTZ;
