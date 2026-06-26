-- ============================================================
-- Plan B — FASE 2: RPC atómica de ajuste de stock
-- Fecha: 2026-06-26
-- APLICAR A MANO EN SUPABASE (antes de deployar el código de Fase 2).
--
-- Ajusta las 3 columnas de products de forma ATÓMICA y deja el rastro en
-- movimientos_stock en la misma transacción. `FOR UPDATE` bloquea la fila del
-- producto para evitar races (reserva/entrega concurrentes — el patrón sin
-- transacciones del cliente no alcanzaba; ver CLAUDE.md).
--
-- Invariante garantizado en cada llamada:
--   stock (disponible) = stock_fisico − stock_reservado
--
-- Deltas por evento:
--   Reserva (crear pedido / agregar ítem):  fisico  0  | reservado +q  → disp −q
--   LiberaReserva (cancelar / quitar ítem):  fisico  0  | reservado −q  → disp +q
--   Venta (facturar):                        fisico −q  | reservado −q  → disp  =
--   Compra (recepción Seguimiento):          fisico +q  | reservado  0  → disp +q
--   AjustePositivo / DevolucionCliente:      fisico +q  | reservado  0  → disp +q
--   AjusteNegativo / DevolucionProveedor:    fisico −q  | reservado  0  → disp −q
-- ============================================================

CREATE OR REPLACE FUNCTION ajustar_stock(
  p_product_id      UUID,
  p_delta_fisico    NUMERIC,
  p_delta_reservado NUMERIC,
  p_tipo            TEXT,
  p_cantidad        NUMERIC,
  p_usuario_id      UUID    DEFAULT NULL,
  p_usuario_nombre  TEXT    DEFAULT NULL,
  p_observacion     TEXT    DEFAULT NULL,
  p_referencia_tipo TEXT    DEFAULT NULL,
  p_referencia_id   TEXT    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fisico_antes    NUMERIC;
  v_reservado_antes NUMERIC;
  v_disp_antes      NUMERIC;
  v_fisico_despues    NUMERIC;
  v_reservado_despues NUMERIC;
  v_disp_despues      NUMERIC;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN; -- ítems sin producto de catálogo (línea libre / descuento) no mueven stock
  END IF;

  -- Bloquea la fila del producto hasta el fin de la transacción.
  SELECT COALESCE(stock_fisico, 0), COALESCE(stock_reservado, 0), COALESCE(stock, 0)
    INTO v_fisico_antes, v_reservado_antes, v_disp_antes
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ajustar_stock: producto % no existe', p_product_id;
  END IF;

  v_fisico_despues    := v_fisico_antes    + COALESCE(p_delta_fisico, 0);
  v_reservado_despues := v_reservado_antes + COALESCE(p_delta_reservado, 0);
  v_disp_despues      := v_fisico_despues  - v_reservado_despues;

  UPDATE products
    SET stock_fisico    = v_fisico_despues,
        stock_reservado = v_reservado_despues,
        stock           = v_disp_despues,
        updated_at      = now()
  WHERE id = p_product_id;

  INSERT INTO movimientos_stock (
    product_id, tipo, cantidad,
    stock_fisico_antes, stock_fisico_despues,
    stock_disponible_antes, stock_disponible_despues,
    usuario_id, usuario_nombre, observacion, referencia_tipo, referencia_id
  ) VALUES (
    p_product_id, p_tipo, p_cantidad,
    v_fisico_antes, v_fisico_despues,
    v_disp_antes, v_disp_despues,
    p_usuario_id, p_usuario_nombre, p_observacion, p_referencia_tipo, p_referencia_id
  );
END;
$$;
