-- Add email_comercial field to proveedores for sending purchase orders
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS email_comercial TEXT;

-- Add email_comercial to compras and ordenes_compra for per-record override
ALTER TABLE compras ADD COLUMN IF NOT EXISTS email_comercial TEXT;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS email_comercial TEXT;
