-- ============================================================
-- Migration: Mejoras OC, Pagos, Pedidos
-- Fecha: 2026-03-26
-- ============================================================

-- COMPRAS / OC: fecha estimada de ingreso
ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_estimada_ingreso DATE;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS fecha_estimada_ingreso DATE;

-- COMPRAS / OC: referencia a cotización adjunta
ALTER TABLE compras ADD COLUMN IF NOT EXISTS cotizacion_ref TEXT;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS cotizacion_ref TEXT;

-- PEDIDOS: número serial correlativo
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number_serial TEXT;

-- PRODUCTOS: categoría "Otro"
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'Otro';

-- PRODUCTOS: código y precio opcionales
ALTER TABLE products ALTER COLUMN code DROP NOT NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_code_key;
ALTER TABLE products ALTER COLUMN price DROP NOT NULL;
