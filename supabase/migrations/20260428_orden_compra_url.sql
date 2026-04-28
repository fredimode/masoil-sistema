-- ============================================================
-- Migration: orders.orden_compra_url + storage bucket ordenes-compra
-- Fecha: 2026-04-28
-- ============================================================

-- Columna en orders para guardar la URL del PDF de la OC del cliente
ALTER TABLE orders ADD COLUMN IF NOT EXISTS orden_compra_url TEXT;

-- Storage bucket privado para los PDFs de OC
INSERT INTO storage.buckets (id, name, public)
VALUES ('ordenes-compra', 'ordenes-compra', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_read_ordenes_compra" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'ordenes-compra');

CREATE POLICY "auth_upload_ordenes_compra" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ordenes-compra');

CREATE POLICY "auth_update_ordenes_compra" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'ordenes-compra');
