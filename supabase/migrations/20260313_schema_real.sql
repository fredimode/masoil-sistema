-- =============================================================================
-- Migration: Schema real para datos operativos de Masoil
-- Fecha: 2026-03-13
-- Descripción: Adapta tabla clients + crea tablas proveedores, compras,
--              ordenes_compra, pagos_proveedores, cobranzas_pendientes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Modificar tabla clients: agregar columnas operativas
-- ---------------------------------------------------------------------------
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
  ADD COLUMN IF NOT EXISTS anotaciones TEXT;

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
  empresa TEXT,  -- 'Masoil', 'Aquiles', 'Conancap', o NULL si compartido
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
-- RLS: habilitar en todas las tablas nuevas
-- ---------------------------------------------------------------------------
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranzas_pendientes ENABLE ROW LEVEL SECURITY;

-- Policies básicas: usuarios autenticados tienen acceso completo
-- (refinar con roles admin/vendedor más adelante)

CREATE POLICY "Authenticated users can read proveedores"
  ON proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert proveedores"
  ON proveedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update proveedores"
  ON proveedores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read compras"
  ON compras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert compras"
  ON compras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update compras"
  ON compras FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read ordenes_compra"
  ON ordenes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ordenes_compra"
  ON ordenes_compra FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ordenes_compra"
  ON ordenes_compra FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pagos_proveedores"
  ON pagos_proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert pagos_proveedores"
  ON pagos_proveedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update pagos_proveedores"
  ON pagos_proveedores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read cobranzas_pendientes"
  ON cobranzas_pendientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert cobranzas_pendientes"
  ON cobranzas_pendientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update cobranzas_pendientes"
  ON cobranzas_pendientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
