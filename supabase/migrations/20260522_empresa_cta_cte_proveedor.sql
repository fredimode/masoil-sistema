-- L.4: persistir empresa (Masoil/Aquiles/Conancap) en cuenta_corriente_proveedor
-- Sprint L: el K2A.3 (commit e0d0510) mencionó esta migración pero nunca se
-- commiteó al repo. Re-creamos idempotentemente + ampliamos backfill desde FC.

ALTER TABLE cuenta_corriente_proveedor ADD COLUMN IF NOT EXISTS empresa TEXT;
CREATE INDEX IF NOT EXISTS idx_cc_prov_empresa ON cuenta_corriente_proveedor(empresa);

-- Backfill desde pagos_proveedores cuando referencia_id apunta a un pago
UPDATE cuenta_corriente_proveedor cc
SET empresa = pp.empresa
FROM pagos_proveedores pp
WHERE cc.referencia_id = pp.id
  AND cc.empresa IS NULL
  AND pp.empresa IS NOT NULL;

-- Backfill desde facturas_proveedor cuando referencia_id apunta a una FC
UPDATE cuenta_corriente_proveedor cc
SET empresa = fp.empresa
FROM facturas_proveedor fp
WHERE cc.referencia_id = fp.id
  AND cc.empresa IS NULL
  AND fp.empresa IS NOT NULL;
