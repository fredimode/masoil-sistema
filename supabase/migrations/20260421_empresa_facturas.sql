-- =============================================================================
-- Migration: agregar columna empresa a facturas_proveedor
-- Fecha: 2026-04-21
-- =============================================================================

ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS empresa TEXT;
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_empresa ON facturas_proveedor (empresa);
