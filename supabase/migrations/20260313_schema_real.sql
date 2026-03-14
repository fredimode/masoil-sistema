-- =============================================================================
-- Migration: Schema real para datos operativos de Masoil
-- Fecha: 2026-03-13 (actualizado 2026-03-14)
-- Descripción: Relaja constraints en clients, agrega columnas operativas,
--              crea tablas proveedores, compras, ordenes_compra,
--              pagos_proveedores, cobranzas_pendientes, gastos_vehiculos,
--              mantenimientos_vehiculos, reclamos_pagos_proveedores
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Relajar NOT NULL constraints en clients para datos reales
-- ---------------------------------------------------------------------------
ALTER TABLE clients ALTER COLUMN vendedor_id DROP NOT NULL;
ALTER TABLE clients ALTER COLUMN contact_name SET DEFAULT '';
ALTER TABLE clients ALTER COLUMN contact_name DROP NOT NULL;
ALTER TABLE clients ALTER COLUMN zona SET DEFAULT 'Capital';
ALTER TABLE clients ALTER COLUMN zona DROP NOT NULL;

-- Agregar columnas operativas
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cuit TEXT,
  ADD COLUMN IF NOT EXISTS razon_social TEXT,
  ADD COLUMN IF NOT EXISTS domicilio TEXT,
  ADD COLUMN IF NOT EXISTS localidad TEXT,
  ADD COLUMN IF NOT EXISTS condicion_pago TEXT,
  ADD COLUMN IF NOT EXISTS canal_facturacion TEXT,
  ADD COLUMN IF NOT EXISTS canal_observaciones TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS contactos_adicionales TEXT,
  ADD COLUMN IF NOT EXISTS anotaciones TEXT,
  ADD COLUMN IF NOT EXISTS cambio_razon_social TEXT;

-- Índices para clients
CREATE INDEX IF NOT EXISTS idx_clients_cuit ON clients (cuit);
CREATE INDEX IF NOT EXISTS idx_clients_razon_social ON clients (razon_social);

-- ---------------------------------------------------------------------------
-- B) Tabla proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  cuit TEXT,
  empresa TEXT,
  condicion_pago TEXT,
  cbu TEXT,
  contactos TEXT,
  observaciones TEXT,
  fecha_actualizacion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_cuit ON proveedores (cuit);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa ON proveedores (empresa);

-- ---------------------------------------------------------------------------
-- C) Tabla compras
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE,
  proveedor_id UUID REFERENCES proveedores(id),
  proveedor_nombre TEXT,
  articulo TEXT,
  medio_solicitud TEXT,
  solicitado_por TEXT,
  vendedor TEXT,
  nro_cotizacion TEXT,
  nro_nota_pedido TEXT,
  estado TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_proveedor_id ON compras (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_estado ON compras (estado);

-- ---------------------------------------------------------------------------
-- D) Tabla ordenes_compra
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ordenes_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE,
  proveedor_nombre TEXT,
  proveedor_id UUID REFERENCES proveedores(id),
  importe_total NUMERIC(14,2),
  estado TEXT,
  ubicacion_oc TEXT,
  nro_oc TEXT,
  razon_social TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_proveedor_id ON ordenes_compra (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_estado ON ordenes_compra (estado);

-- ---------------------------------------------------------------------------
-- E) Tabla pagos_proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_nombre TEXT,
  proveedor_id UUID REFERENCES proveedores(id),
  cuit TEXT,
  empresa TEXT,
  fecha_fc DATE,
  numero_fc TEXT,
  importe NUMERIC(14,2),
  forma_pago TEXT,
  cbu TEXT,
  observaciones TEXT,
  estado_pago TEXT,
  nro_cheque TEXT,
  banco TEXT,
  origen TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_proveedores_proveedor_id ON pagos_proveedores (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_pagos_proveedores_cuit ON pagos_proveedores (cuit);
CREATE INDEX IF NOT EXISTS idx_pagos_proveedores_estado_pago ON pagos_proveedores (estado_pago);

-- ---------------------------------------------------------------------------
-- F) Tabla cobranzas_pendientes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cobranzas_pendientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  cliente_nombre TEXT,
  comprobante TEXT,
  fecha_comprobante DATE,
  total NUMERIC(14,2),
  saldo NUMERIC(14,2),
  saldo_acumulado NUMERIC(14,2),
  razon_social TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobranzas_client_id ON cobranzas_pendientes (client_id);
CREATE INDEX IF NOT EXISTS idx_cobranzas_razon_social ON cobranzas_pendientes (razon_social);

-- ---------------------------------------------------------------------------
-- G) Tabla gastos_vehiculos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gastos_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo TEXT,
  patente TEXT,
  usuario TEXT,
  fecha DATE,
  km_inicio NUMERIC,
  km_final NUMERIC,
  concepto TEXT,
  monto NUMERIC(14,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_vehiculos_patente ON gastos_vehiculos (patente);
CREATE INDEX IF NOT EXISTS idx_gastos_vehiculos_usuario ON gastos_vehiculos (usuario);

-- ---------------------------------------------------------------------------
-- H) Tabla mantenimientos_vehiculos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mantenimientos_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo TEXT,
  patente TEXT,
  descripcion TEXT,
  fecha DATE,
  kilometraje TEXT,
  proveedor TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mantenimientos_patente ON mantenimientos_vehiculos (patente);

-- ---------------------------------------------------------------------------
-- I) Tabla reclamos_pagos_proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reclamos_pagos_proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_nombre TEXT,
  empresa TEXT,
  forma_pago TEXT,
  fecha_reclamo DATE,
  fecha_pago DATE,
  observaciones TEXT,
  estado TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reclamos_estado ON reclamos_pagos_proveedores (estado);

-- ---------------------------------------------------------------------------
-- RLS: habilitar en todas las tablas nuevas
-- ---------------------------------------------------------------------------
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranzas_pendientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantenimientos_vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclamos_pagos_proveedores ENABLE ROW LEVEL SECURITY;

-- Policies: usuarios autenticados tienen acceso completo
-- (refinar con roles admin/vendedor más adelante)

CREATE POLICY "auth_read_proveedores" ON proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_proveedores" ON proveedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_proveedores" ON proveedores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_read_compras" ON compras FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_compras" ON compras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_compras" ON compras FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_read_ordenes_compra" ON ordenes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_ordenes_compra" ON ordenes_compra FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_ordenes_compra" ON ordenes_compra FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_read_pagos_proveedores" ON pagos_proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_pagos_proveedores" ON pagos_proveedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_pagos_proveedores" ON pagos_proveedores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_read_cobranzas" ON cobranzas_pendientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_cobranzas" ON cobranzas_pendientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_cobranzas" ON cobranzas_pendientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_read_gastos_vehiculos" ON gastos_vehiculos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_gastos_vehiculos" ON gastos_vehiculos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_gastos_vehiculos" ON gastos_vehiculos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_read_mantenimientos" ON mantenimientos_vehiculos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_mantenimientos" ON mantenimientos_vehiculos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_mantenimientos" ON mantenimientos_vehiculos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_read_reclamos" ON reclamos_pagos_proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_reclamos" ON reclamos_pagos_proveedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_reclamos" ON reclamos_pagos_proveedores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
