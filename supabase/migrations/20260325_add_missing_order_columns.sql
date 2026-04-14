-- ============================================================
-- Fix: Agregar columnas desnormalizadas faltantes en orders
-- El código referencia client_name y vendedor_name pero no existían
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendedor_name TEXT;
