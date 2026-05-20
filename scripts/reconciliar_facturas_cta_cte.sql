-- Sprint K1.1 — Reconciliación one-time de facturas huérfanas
--
-- Aplicar DESPUÉS de la migración 20260520_cta_cte_referencia_id_text.sql.
-- Inserta el movimiento faltante en cuenta_corriente_cliente para cada
-- factura emitida que no tiene movimiento asociado (causa: bug K1.1 antes
-- del fix de tipo TEXT).
--
-- Pre-check ya corrido: 0 overlap con cobranzas_pendientes legacy, así que
-- no hay riesgo de doble conteo en fetchCobranzasPendientes.
--
-- Convenciones (heredadas del endpoint /api/facturar paso 11b):
--   FC → debe = total, haber = 0
--   NC → debe = 0,     haber = total   (resta deuda)
--   ND → debe = total, haber = 0
--
-- numero en facturas viene como "PPPPP-NNNNNNNN" (ej "00007-00000043").
-- Lo descomponemos a punto_venta / numero_comprobante.

INSERT INTO cuenta_corriente_cliente
  (client_id, fecha, tipo_comprobante, punto_venta, numero_comprobante,
   debe, haber, saldo, referencia_id, empresa, observaciones)
SELECT
  f.client_id,
  f.fecha,
  CASE
    WHEN UPPER(f.tipo) LIKE 'NOTA DE CREDITO%' THEN 'NC'
    WHEN UPPER(f.tipo) LIKE 'NOTA DE DEBITO%'  THEN 'ND'
    ELSE 'FC'
  END AS tipo_comprobante,
  COALESCE(NULLIF(SPLIT_PART(f.numero, '-', 1), ''), '') AS punto_venta,
  COALESCE(NULLIF(SPLIT_PART(f.numero, '-', 2), ''), f.numero) AS numero_comprobante,
  CASE WHEN UPPER(f.tipo) LIKE 'NOTA DE CREDITO%' THEN 0 ELSE f.total END AS debe,
  CASE WHEN UPPER(f.tipo) LIKE 'NOTA DE CREDITO%' THEN f.total ELSE 0 END AS haber,
  CASE WHEN UPPER(f.tipo) LIKE 'NOTA DE CREDITO%' THEN -f.total ELSE f.total END AS saldo,
  f.id::text AS referencia_id,
  f.empresa,
  f.tipo || ' generada desde el sistema (reconciliada por K1.1)'
FROM facturas f
LEFT JOIN cuenta_corriente_cliente cc
  ON cc.referencia_id = f.id::text
WHERE cc.id IS NULL
  AND f.client_id IS NOT NULL;

-- Verificación post-reconciliación: debe devolver 0 filas.
-- SELECT f.id, f.numero, f.fecha
-- FROM facturas f
-- LEFT JOIN cuenta_corriente_cliente cc ON cc.referencia_id = f.id::text
-- WHERE cc.id IS NULL AND f.client_id IS NOT NULL;
