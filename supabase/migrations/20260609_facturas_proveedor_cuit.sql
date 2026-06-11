-- ============================================================
-- Migración: columna facturas_proveedor.cuit faltante en prod
-- Fecha: 2026-06-09
-- ============================================================
-- La columna cuit se agregó a mano en producción como fix de schema
-- drift posterior a T.5. Esta migración la deja registrada en el
-- repositorio para mantener el schema versionado consistente.
--
-- Idempotente: re-ejecutarla es seguro.
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS cuit TEXT;
