-- ============================================================
-- Migración: Tablas de Finanzas y Facturación para Masoil
-- Fecha: 2026-03-10
-- ============================================================

-- 1. FACTURAS - Facturas emitidas a clientes
CREATE TABLE IF NOT EXISTS facturas (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  numero TEXT,                          -- Numero de factura (asignado por AFIP)
  tipo TEXT NOT NULL DEFAULT 'Factura B', -- Factura A, Factura B, Nota de Credito, etc.
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  cuit_cliente TEXT,
  razon_social TEXT NOT NULL,
  base_gravada NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_21 NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  cae TEXT,                             -- CAE de AFIP
  vencimiento_cae DATE,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_facturas_order_id ON facturas(order_id);
CREATE INDEX idx_facturas_fecha ON facturas(fecha);
CREATE INDEX idx_facturas_numero ON facturas(numero) WHERE numero IS NOT NULL;

-- 2. EGRESOS - Gastos del negocio por centro de costo
CREATE TABLE IF NOT EXISTS egresos (
  id BIGSERIAL PRIMARY KEY,
  centro_costo TEXT NOT NULL,           -- logistica, combustible, sueldos, alquiler, servicios, marketing, mantenimiento_vehiculos, sistemas, gastos_generales
  sub_categoria TEXT,                   -- Subcategoria opcional (ej: Internet, Electricidad para servicios)
  descripcion TEXT,
  monto NUMERIC(12,2) NOT NULL,
  fecha DATE NOT NULL,
  tiene_comprobante BOOLEAN DEFAULT FALSE,
  estado_pago TEXT NOT NULL DEFAULT 'Pendiente', -- Pendiente, Pagado
  fecha_pago DATE,
  forma_pago TEXT,                      -- Transferencia, Efectivo, etc.
  destino_pago TEXT,                    -- A quien se pago
  cuenta_id BIGINT REFERENCES cuentas(id),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_egresos_fecha ON egresos(fecha);
CREATE INDEX idx_egresos_centro_costo ON egresos(centro_costo);
CREATE INDEX idx_egresos_estado_pago ON egresos(estado_pago);

-- 3. INGRESOS - Cobros recibidos por pedidos
CREATE TABLE IF NOT EXISTS ingresos (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT REFERENCES orders(id),
  fecha DATE NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  medio_pago TEXT NOT NULL,             -- efectivo, transferencia, cheque, cuenta_corriente_30, cuenta_corriente_60, cuenta_corriente_90
  referencia TEXT,                      -- Nro cheque, nro transferencia, etc.
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingresos_fecha ON ingresos(fecha);
CREATE INDEX idx_ingresos_order_id ON ingresos(order_id);
CREATE INDEX idx_ingresos_medio_pago ON ingresos(medio_pago);

-- 4. COMISIONES_PAGOS - Registro de pagos de comisiones a vendedores
CREATE TABLE IF NOT EXISTS comisiones_pagos (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id TEXT NOT NULL REFERENCES vendedores(id),
  mes TEXT NOT NULL,                    -- Formato YYYY-MM
  monto NUMERIC(12,2) NOT NULL,
  fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comisiones_pagos_vendedor ON comisiones_pagos(vendedor_id);
CREATE INDEX idx_comisiones_pagos_mes ON comisiones_pagos(mes);

-- 5. CUENTAS - Cuentas bancarias y de pago
CREATE TABLE IF NOT EXISTS cuentas (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,                 -- Ej: "Cuenta Corriente Galicia", "Efectivo Caja"
  banco TEXT,                           -- Nombre del banco (null si es efectivo)
  tipo TEXT NOT NULL,                   -- bancaria, efectivo, digital
  saldo NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. MOVIMIENTOS - Movimientos de cuentas (debitos y creditos)
CREATE TABLE IF NOT EXISTS movimientos (
  id BIGSERIAL PRIMARY KEY,
  cuenta_id BIGINT NOT NULL REFERENCES cuentas(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL,                   -- ingreso, egreso
  monto NUMERIC(12,2) NOT NULL,
  concepto TEXT,
  referencia TEXT,                      -- ID del egreso/ingreso que origino el movimiento
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movimientos_cuenta ON movimientos(cuenta_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha);

-- ============================================================
-- RLS Policies (requiere que RLS este habilitado en cada tabla)
-- ============================================================

-- Habilitar RLS
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE egresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comisiones_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;

-- Politicas: solo usuarios autenticados pueden leer/escribir
-- (en produccion, restringir a role=admin)

CREATE POLICY "facturas_auth_all" ON facturas
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "egresos_auth_all" ON egresos
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "ingresos_auth_all" ON ingresos
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "comisiones_pagos_auth_all" ON comisiones_pagos
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "cuentas_auth_all" ON cuentas
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "movimientos_auth_all" ON movimientos
  FOR ALL USING (auth.role() = 'authenticated');
