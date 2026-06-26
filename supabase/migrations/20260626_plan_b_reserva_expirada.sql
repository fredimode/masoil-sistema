-- ============================================================
-- Plan B — FASE 4: flag de reserva expirada
-- Fecha: 2026-06-26
-- APLICAR A MANO EN SUPABASE (antes de deployar el código de Fase 4).
-- Aditivo. El cron y la UI lo usan para marcar pedidos cuya reserva venció
-- (el pedido sigue activo; solo se liberó su stock reservado).
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reserva_expirada BOOLEAN NOT NULL DEFAULT false;
