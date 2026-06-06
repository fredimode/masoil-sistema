-- =============================================================================
-- Sprint R — R.5: Error al guardar pedido con Línea Libre (y Descuento)
-- Fecha: 2026-06-06
-- =============================================================================
-- Síntoma reportado: "al crear un pedido que contiene una Línea Libre me sale Error".
--
-- Causa raíz (reproducida contra la DB): las líneas "libre" y "descuento" no
-- tienen producto de catálogo, por lo que se insertan con product_id = NULL.
-- La columna order_items.product_id estaba como NOT NULL, de modo que
-- createOrder() y addItemsToOrder() fallaban con:
--   23502: null value in column "product_id" of relation "order_items"
--          violates not-null constraint
-- para CUALQUIER línea sin product_id (libre o descuento). De hecho, ninguna
-- línea libre/descuento se había llegado a persistir nunca (todas las filas
-- existentes tenían tipo_linea = 'producto').
--
-- Fix: permitir NULL en product_id. La FK contra products(id) se mantiene
-- (NULL no dispara la verificación de FK). El código ya envía NULL para
-- libre/descuento y denormaliza nombre/código en producto_nombre/producto_codigo.
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;

-- Columnas de denormalización + tipo de línea. queries.ts ya las usa
-- (createOrder / addItemsToOrder / mapOrderItem), pero no estaban declaradas en
-- ninguna migración: se agregan IF NOT EXISTS para que una DB reconstruida desde
-- las migraciones quede consistente. En producción ya existen (no-op).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tipo_linea TEXT NOT NULL DEFAULT 'producto';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS producto_nombre TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS producto_codigo TEXT;
