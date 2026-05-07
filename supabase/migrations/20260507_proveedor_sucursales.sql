-- ============================================================
-- Migration: tabla proveedor_sucursales + columna en reparto_items
-- Fecha: 2026-05-07
-- ============================================================

-- 1) Tabla proveedor_sucursales
CREATE TABLE IF NOT EXISTS proveedor_sucursales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  direccion TEXT,
  localidad TEXT,
  provincia TEXT,
  telefono TEXT,
  horario TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proveedor_sucursales_proveedor
  ON proveedor_sucursales(proveedor_id);

ALTER TABLE proveedor_sucursales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proveedor_sucursales_auth_all') THEN
    CREATE POLICY "proveedor_sucursales_auth_all" ON proveedor_sucursales
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 2) Columna en reparto_items para vincular destino manual a una sucursal
ALTER TABLE reparto_items
  ADD COLUMN IF NOT EXISTS proveedor_sucursal_id
    UUID REFERENCES proveedor_sucursales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reparto_items_prov_sucursal
  ON reparto_items(proveedor_sucursal_id);
