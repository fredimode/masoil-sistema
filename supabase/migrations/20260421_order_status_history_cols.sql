-- =============================================================================
-- Migration: asegurar columnas de order_status_history
-- Fecha: 2026-04-21
-- =============================================================================

-- changed_by puede no existir dependiendo de como se creo la tabla inicialmente.
-- Tambien nos aseguramos de que sea nullable.
ALTER TABLE order_status_history
  ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES vendedores(id) ON DELETE SET NULL;

ALTER TABLE order_status_history
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE order_status_history
  ADD COLUMN IF NOT EXISTS user_name TEXT;

ALTER TABLE order_status_history
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Permitir null en changed_by: si se inserta sin user valido, no debe fallar.
ALTER TABLE order_status_history
  ALTER COLUMN changed_by DROP NOT NULL;
