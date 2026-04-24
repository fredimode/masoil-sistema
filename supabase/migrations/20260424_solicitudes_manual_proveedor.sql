-- Add proveedor_sugerido column to solicitudes_compra for manual requests
ALTER TABLE solicitudes_compra ADD COLUMN IF NOT EXISTS proveedor_sugerido TEXT;
