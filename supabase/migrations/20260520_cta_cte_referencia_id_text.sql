-- Sprint K1.1 — Fix sincronización FC nuevas con Cuenta Corriente
--
-- Causa raíz: cuenta_corriente_cliente.referencia_id se creó como UUID
-- (migración 20260328_iteracion_cliente.sql:80) asumiendo que todas las
-- referencias serían UUID. Pero `facturas.id` es BIGSERIAL (migración
-- 20260310_finanzas_facturacion.sql:8). El endpoint /api/facturar pasa
-- String(factura.id) (ej. "42") a la columna UUID → Postgres rechaza con
-- 22P02 "invalid input syntax for type uuid: 42". El catch silencioso del
-- endpoint comía el error y la factura quedaba sin movimiento en cta cte.
--
-- Fix: cambiar referencia_id a TEXT. La columna es polymorphic ref (apunta
-- a facturas.id BIGINT, retenciones.id UUID, recibos_cobranza.id UUID,
-- pagos_a_cuenta.id UUID) — TEXT es honesto sobre eso. No hay FK constraint
-- ni índice sobre referencia_id, así que el ALTER es no-locking.

ALTER TABLE cuenta_corriente_cliente
  ALTER COLUMN referencia_id TYPE TEXT USING referencia_id::TEXT;
