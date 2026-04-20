-- ============================================================
-- MIGRACIÓN 20/04 - Iteración abril parte 3
-- Sucursal entrega cliente, estado BORRADOR pedidos,
-- pagos en proceso, servicios administración, reclamos por proveedor_id
-- ============================================================

-- 1. CLIENTE: Sucursal de entrega como campo separado --------------------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sucursal_entrega TEXT;

-- 2. PEDIDOS: estado BORRADOR ---------------------------------------------
-- Requiere ejecutarse fuera de transacción en Supabase; se hace como bloque separado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BORRADOR' AND enumtypid = 'order_status'::regtype) THEN
    ALTER TYPE order_status ADD VALUE 'BORRADOR' BEFORE 'INGRESADO';
  END IF;
END
$$;

-- 3. PAGOS EN PROCESO ------------------------------------------------------
-- Un pago está "en proceso" cuando está confirmado pero aún no completado.
-- Usamos las columnas existentes de pagos_proveedores; agregamos flag y fecha.
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS fecha_pago DATE;
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS observaciones_proceso TEXT;

-- 4. RECLAMOS: enlazar por proveedor_id además de nombre ------------------
ALTER TABLE reclamos_pagos_proveedores
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reclamos_proveedor_id ON reclamos_pagos_proveedores(proveedor_id);

-- 5. SERVICIOS ADMINISTRACIÓN: columnas para mostrar --------------------
ALTER TABLE servicios_fijos ADD COLUMN IF NOT EXISTS nro_fc_pendiente TEXT;
ALTER TABLE servicios_fijos ADD COLUMN IF NOT EXISTS bonificaciones TEXT;
ALTER TABLE servicios_fijos ADD COLUMN IF NOT EXISTS importe NUMERIC(14,2);
ALTER TABLE servicios_fijos ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;
ALTER TABLE servicios_fijos ADD COLUMN IF NOT EXISTS forma_pago TEXT;
ALTER TABLE servicios_fijos ADD COLUMN IF NOT EXISTS observaciones TEXT;
