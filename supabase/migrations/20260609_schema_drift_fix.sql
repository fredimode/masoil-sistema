-- ============================================================
-- Sprint U — Fix de schema drift (migraciones vs producción)
-- Fecha: 2026-06-09
-- ============================================================
-- Generado por auditoría del schema real de prod (PostgREST OpenAPI) contra
-- las migraciones de supabase/migrations/. Todo es idempotente.
--
-- REVISAR ANTES DE APLICAR. Ver notas/WARNINGS al pie.
--
-- NO incluye:
--   * clients.sucursal  → ya aplicada (existe en prod desde Sprint T).
--   * Deuda sección (a) (columnas en prod que no están en ninguna migración):
--     es solo documentación, no se modifica nada.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- (b) Columnas que están en migraciones pero faltan en PROD
-- ────────────────────────────────────────────────────────────

-- orders.orden_compra_url — definida en 20260428_orden_compra_url.sql, nunca
-- aplicada en prod (la usa el flujo de adjuntar PDF de OC del cliente).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS orden_compra_url TEXT;


-- ────────────────────────────────────────────────────────────
-- (c) Tablas que están en migraciones pero NO existen en PROD
--     Origen: 20260310_finanzas_facturacion.sql
--     Las consumen rutas /api/admin/{cuentas,egresos,ingresos,
--     movimientos,comisiones-pagos}: hoy esos endpoints fallan.
--
--     ⚠️ ADAPTACIÓN DE TIPOS (ver WARNING 1 al pie): el DDL original definía
--        ingresos.order_id y comisiones_pagos.vendedor_id como TEXT con FK a
--        orders(id)/vendedores(id). En prod esos PKs hoy son UUID, así que el
--        DDL original NO se puede aplicar tal cual (la FK fallaría por tipo).
--        Acá se usan UUID para que las FKs sean válidas. Confirmar que es lo
--        deseado antes de aplicar.
-- ────────────────────────────────────────────────────────────

-- cuentas (sin FK externas) — crear primero (egresos/movimientos la referencian)
CREATE TABLE IF NOT EXISTS cuentas (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  banco TEXT,
  tipo TEXT NOT NULL,
  saldo NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS egresos (
  id BIGSERIAL PRIMARY KEY,
  centro_costo TEXT NOT NULL,
  sub_categoria TEXT,
  descripcion TEXT,
  monto NUMERIC(12,2) NOT NULL,
  fecha DATE NOT NULL,
  tiene_comprobante BOOLEAN DEFAULT FALSE,
  estado_pago TEXT NOT NULL DEFAULT 'Pendiente',
  fecha_pago DATE,
  forma_pago TEXT,
  destino_pago TEXT,
  cuenta_id BIGINT REFERENCES cuentas(id),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_egresos_fecha ON egresos(fecha);
CREATE INDEX IF NOT EXISTS idx_egresos_centro_costo ON egresos(centro_costo);
CREATE INDEX IF NOT EXISTS idx_egresos_estado_pago ON egresos(estado_pago);

CREATE TABLE IF NOT EXISTS ingresos (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID REFERENCES orders(id),   -- ⚠️ original era TEXT (ver WARNING 1)
  fecha DATE NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  medio_pago TEXT NOT NULL,
  referencia TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos(fecha);
CREATE INDEX IF NOT EXISTS idx_ingresos_order_id ON ingresos(order_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_medio_pago ON ingresos(medio_pago);

CREATE TABLE IF NOT EXISTS comisiones_pagos (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id UUID REFERENCES vendedores(id),   -- ⚠️ original era TEXT (ver WARNING 1)
  mes TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comisiones_pagos_vendedor ON comisiones_pagos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_pagos_mes ON comisiones_pagos(mes);

CREATE TABLE IF NOT EXISTS movimientos (
  id BIGSERIAL PRIMARY KEY,
  cuenta_id BIGINT NOT NULL REFERENCES cuentas(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  concepto TEXT,
  referencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movimientos_cuenta ON movimientos(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha);

-- RLS (idempotente)
ALTER TABLE cuentas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE egresos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingresos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comisiones_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cuentas_auth_all') THEN
    CREATE POLICY "cuentas_auth_all" ON cuentas FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'egresos_auth_all') THEN
    CREATE POLICY "egresos_auth_all" ON egresos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ingresos_auth_all') THEN
    CREATE POLICY "ingresos_auth_all" ON ingresos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comisiones_pagos_auth_all') THEN
    CREATE POLICY "comisiones_pagos_auth_all" ON comisiones_pagos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'movimientos_auth_all') THEN
    CREATE POLICY "movimientos_auth_all" ON movimientos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;


-- ============================================================
-- WARNINGS (NO se tocan — solo informativos)
-- ============================================================
-- 1) FK TEXT→UUID: ingresos.order_id y comisiones_pagos.vendedor_id se
--    crearon arriba como UUID (no TEXT) para poder referenciar orders.id /
--    vendedores.id, que en prod son UUID. Confirmar antes de aplicar.
--
-- 2) Mismatches de tipo detectados en columnas EXISTENTES en prod, TODOS
--    benignos (prod refleja una migración posterior que el parser no sigue):
--      - clients.cobranzas_mail / cobranzas_telefono: migración inicial TEXT,
--        luego 20260409 las pasó a JSONB. Prod = jsonb (correcto).
--      - cuenta_corriente_cliente.referencia_id: 20260520 la pasó a TEXT.
--        Prod = text (correcto).
--      - facturas.id / remitos.id: BIGSERIAL crea una columna bigint. Prod =
--        bigint (correcto, no es mismatch real).
--    No requieren acción.
--
-- 3) Deuda (a): columnas presentes en prod sin migración (proveedores +15,
--    reparto_items +4, facturas +2, producto_proveedor.descuento_porcentaje,
--    cuenta_corriente_cliente.empresa, cotizacion_venta_items.tipo_linea) y el
--    esquema base completo de orders/clients/vendedores/products/order_items/
--    order_status_history (creado en el dashboard). Documentar, no se toca.
