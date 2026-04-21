-- =============================================================================
-- Migration part 2: migrar datos PREPARADO -> EN_PREPARACION
-- Debe ejecutarse DESPUÉS de la migración que agrega el valor EN_PREPARACION
-- al enum order_status (en otra transacción distinta).
-- Fecha: 2026-04-21
-- =============================================================================

-- Mover todos los pedidos con status PREPARADO a EN_PREPARACION
UPDATE orders SET status = 'EN_PREPARACION' WHERE status = 'PREPARADO';

-- Mover histórico también
UPDATE order_status_history SET status = 'EN_PREPARACION' WHERE status = 'PREPARADO';

-- Nota: el valor 'PREPARADO' permanece en el enum pero ya no se usa.
-- Si se quiere eliminar definitivamente del enum, requiere recrear el tipo
-- (ver 20260324_reestructuracion.sql para el patrón).
