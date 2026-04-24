-- Agrega campo tipo para distinguir pagos a cuenta (anticipos) de pagos contra facturas
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'FACTURAS';

-- tipo:
--  'FACTURAS'       -> pago contra facturas_ids (default)
--  'PAGO_A_CUENTA'  -> anticipo sin facturas asociadas
