-- ============================================================================
-- Descuento general por cliente (porcentaje)
-- ----------------------------------------------------------------------------
-- Agrega un % de descuento general configurable por cliente, que se precarga
-- al armar cotizaciones/pedidos y se materializa como un renglón negativo
-- (tipo_linea="descuento") sobre el neto de PRODUCTOS, antes del IVA.
--
-- - clients.descuento_general_pct: fuente del % por cliente (editable en ficha).
-- - orders/cotizaciones_venta.descuento_general_pct: % efectivamente aplicado en
--   ese documento (auditoría; el vendedor pudo ajustarlo o ponerlo en 0).
--
-- Idempotente. Aplicar a mano en Supabase (no se ejecuta automáticamente).
-- Verificado contra prod (2026-06-29): ninguna de las 3 columnas existía.
-- ============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS descuento_general_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS descuento_general_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE cotizaciones_venta
  ADD COLUMN IF NOT EXISTS descuento_general_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Sanidad: el porcentaje vive en [0, 100]. Constraints idempotentes vía guard.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_descuento_general_pct') THEN
    ALTER TABLE clients
      ADD CONSTRAINT chk_clients_descuento_general_pct
      CHECK (descuento_general_pct >= 0 AND descuento_general_pct <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_descuento_general_pct') THEN
    ALTER TABLE orders
      ADD CONSTRAINT chk_orders_descuento_general_pct
      CHECK (descuento_general_pct >= 0 AND descuento_general_pct <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cotizaciones_venta_descuento_general_pct') THEN
    ALTER TABLE cotizaciones_venta
      ADD CONSTRAINT chk_cotizaciones_venta_descuento_general_pct
      CHECK (descuento_general_pct >= 0 AND descuento_general_pct <= 100);
  END IF;
END $$;
