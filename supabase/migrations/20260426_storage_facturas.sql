-- ============================================================
-- Migration: Storage bucket facturas (privado)
-- Fecha: 2026-04-26
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas', 'facturas', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_read_facturas" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'facturas');

CREATE POLICY "auth_upload_facturas" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'facturas');
