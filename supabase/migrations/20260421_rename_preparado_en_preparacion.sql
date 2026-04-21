-- =============================================================================
-- Migration: renombrar estado PREPARADO -> EN_PREPARACION
-- Fecha: 2026-04-21
-- =============================================================================

-- 1. Agregar nuevo value al enum (no se puede renombrar dentro de transacción)
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'EN_PREPARACION';
