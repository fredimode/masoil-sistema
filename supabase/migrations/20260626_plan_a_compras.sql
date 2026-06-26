-- ============================================================
-- Plan A — Circuito de Compras (Solicitud → OC → Seguimiento → Stock)
-- Fecha: 2026-06-26
-- APLICAR A MANO EN SUPABASE. Idempotente y ADITIVO (seguro de correr
-- antes del deploy: las columnas nuevas no rompen el código actual).
-- ============================================================

-- 1) orden_compra_items: recepción por ítem (Seguimiento tilda/edita cantidad)
ALTER TABLE orden_compra_items ADD COLUMN IF NOT EXISTS cantidad_recibida NUMERIC;
ALTER TABLE orden_compra_items ADD COLUMN IF NOT EXISTS recibido BOOLEAN NOT NULL DEFAULT false;

-- 2) compras (Seguimiento): vínculo real a la OC + observaciones de recepción.
--    A partir de ahora el Seguimiento se crea automáticamente al crear una OC
--    y referencia su orden_compra_id (las filas legacy quedan con NULL y se
--    muestran con su `articulo` de texto libre como hasta ahora).
ALTER TABLE compras ADD COLUMN IF NOT EXISTS orden_compra_id UUID REFERENCES ordenes_compra(id);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS observaciones_recepcion TEXT;
CREATE INDEX IF NOT EXISTS idx_compras_orden_compra ON compras(orden_compra_id);

-- 3) ordenes_compra: nuevo modelo de estado → Pendiente | Facturado | Eliminado.
--    El estado es TEXT libre; backfill de los valores legacy.
--    (La recepción "Recibido Completo/Incompleto" ahora vive en el Seguimiento,
--    no en la OC; por eso los "Recibido*" legacy caen a 'Pendiente'.)
UPDATE ordenes_compra SET estado = 'Eliminado' WHERE estado = 'Cancelado';
UPDATE ordenes_compra SET estado = 'Facturado' WHERE estado IN ('Factura Cargada', 'Facturado');
UPDATE ordenes_compra
  SET estado = 'Pendiente'
  WHERE estado IS NULL
     OR estado NOT IN ('Pendiente', 'Facturado', 'Eliminado');

-- Verificación posterior (read-only):
--   SELECT estado, COUNT(*) FROM ordenes_compra GROUP BY estado;   -- solo Pendiente/Facturado/Eliminado
--   SELECT COUNT(*) FROM compras WHERE orden_compra_id IS NULL;    -- legacy sin OC vinculada
