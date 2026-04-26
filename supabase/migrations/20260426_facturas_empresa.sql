-- ============================================================
-- Migration: agregar columna empresa a facturas
-- Fecha: 2026-04-26
-- ============================================================
-- Permite distinguir qué empresa (Aquiles | Conancap) emitió la factura

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS empresa TEXT;
CREATE INDEX IF NOT EXISTS idx_facturas_empresa ON facturas(empresa);
