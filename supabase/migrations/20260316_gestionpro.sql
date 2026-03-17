-- =============================================================================
-- Migration: Datos de GestionPro
-- Fecha: 2026-03-16
-- Descripcion: Extiende products, clients, proveedores con campos GestionPro.
--              Crea tablas facturas_gestionpro, recibos, servicios_fijos,
--              movimientos_caja_chica.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Modificar tabla products
-- ---------------------------------------------------------------------------
-- Hacer category nullable (GestionPro tiene rubros que no mapean al enum)
ALTER TABLE products ALTER COLUMN category DROP NOT NULL;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS codigo_gestionpro TEXT,
  ADD COLUMN IF NOT EXISTS costo_neto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS bonif_costo TEXT,
  ADD COLUMN IF NOT EXISTS importe_bon_rec NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS costo_bonif_neto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS grupo_rubro TEXT,
  ADD COLUMN IF NOT EXISTS dolarizado TEXT,
  ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT '$',
  ADD COLUMN IF NOT EXISTS tasa_iva NUMERIC(5,2) DEFAULT 21,
  ADD COLUMN IF NOT EXISTS u_medida TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion TEXT,
  ADD COLUMN IF NOT EXISTS observaciones TEXT,
  ADD COLUMN IF NOT EXISTS lista_1_neto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS lista_1_final NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS lista_1_utilidad NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS lista_2_neto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS lista_2_final NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS lista_2_utilidad NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS lista_3_neto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS lista_3_final NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS lista_3_utilidad NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS lista_4_neto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS lista_4_final NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS lista_4_utilidad NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS stock_min INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_reponer INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_max INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_codigo_gestionpro ON products (codigo_gestionpro);

-- ---------------------------------------------------------------------------
-- B) Modificar tabla clients
-- ---------------------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS codigo_gestionpro TEXT,
  ADD COLUMN IF NOT EXISTS nombre_fantasia TEXT,
  -- domicilio ya existe (20260313)
  -- localidad ya existe (20260313)
  ADD COLUMN IF NOT EXISTS provincia TEXT,
  ADD COLUMN IF NOT EXISTS pais TEXT,
  ADD COLUMN IF NOT EXISTS codigo_postal TEXT,
  ADD COLUMN IF NOT EXISTS tipo_docum TEXT,
  ADD COLUMN IF NOT EXISTS numero_docum TEXT,
  ADD COLUMN IF NOT EXISTS condicion_iva TEXT,
  ADD COLUMN IF NOT EXISTS categoria TEXT,
  ADD COLUMN IF NOT EXISTS bonif_recargo TEXT,
  ADD COLUMN IF NOT EXISTS contacto TEXT,
  -- condicion_pago ya existe (20260313)
  ADD COLUMN IF NOT EXISTS fecha_alta DATE,
  ADD COLUMN IF NOT EXISTS fecha_ultima_compra DATE,
  ADD COLUMN IF NOT EXISTS lista_precios TEXT,
  ADD COLUMN IF NOT EXISTS lugar_entrega TEXT,
  ADD COLUMN IF NOT EXISTS codigo_proveedor TEXT,
  ADD COLUMN IF NOT EXISTS pagina_web TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_codigo_gestionpro ON clients (codigo_gestionpro);

-- ---------------------------------------------------------------------------
-- C) Modificar tabla proveedores
-- ---------------------------------------------------------------------------
ALTER TABLE proveedores
  ADD COLUMN IF NOT EXISTS codigo_gestionpro TEXT,
  ADD COLUMN IF NOT EXISTS nombre_fantasia TEXT,
  ADD COLUMN IF NOT EXISTS domicilio TEXT,
  ADD COLUMN IF NOT EXISTS localidad TEXT,
  ADD COLUMN IF NOT EXISTS provincia TEXT,
  ADD COLUMN IF NOT EXISTS pais TEXT,
  ADD COLUMN IF NOT EXISTS codigo_postal TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS tipo_docum TEXT,
  ADD COLUMN IF NOT EXISTS numero_docum TEXT,
  ADD COLUMN IF NOT EXISTS condicion_iva TEXT,
  ADD COLUMN IF NOT EXISTS categoria TEXT,
  -- condicion_pago ya existe
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS pagina_web TEXT,
  ADD COLUMN IF NOT EXISTS imp_contable_cod TEXT,
  ADD COLUMN IF NOT EXISTS imp_contable_descrip TEXT,
  ADD COLUMN IF NOT EXISTS saldo NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_proveedores_codigo_gestionpro ON proveedores (codigo_gestionpro);

-- ---------------------------------------------------------------------------
-- D) Crear tabla facturas_gestionpro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facturas_gestionpro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE,
  tipo_comprobante TEXT,
  sucursal TEXT,
  nro_comprobante TEXT,
  letra TEXT,
  cod_cliente TEXT,
  razon_social TEXT,
  documento TEXT,
  resp_iva TEXT,
  provincia TEXT,
  localidad TEXT,
  condicion_pago TEXT,
  vendedor TEXT,
  neto NUMERIC(14,2),
  impuestos NUMERIC(14,2),
  total NUMERIC(14,2),
  moneda TEXT,
  cotizacion NUMERIC(14,4),
  cae TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facturas_gp_fecha ON facturas_gestionpro (fecha);
CREATE INDEX IF NOT EXISTS idx_facturas_gp_cod_cliente ON facturas_gestionpro (cod_cliente);
CREATE INDEX IF NOT EXISTS idx_facturas_gp_vendedor ON facturas_gestionpro (vendedor);
CREATE INDEX IF NOT EXISTS idx_facturas_gp_tipo ON facturas_gestionpro (tipo_comprobante);

-- ---------------------------------------------------------------------------
-- E) Crear tabla recibos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recibos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE,
  sucursal TEXT,
  nro_comprobante TEXT,
  cod_cliente TEXT,
  razon_social TEXT,
  documento TEXT,
  vendedor TEXT,
  importe NUMERIC(14,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_fecha ON recibos (fecha);
CREATE INDEX IF NOT EXISTS idx_recibos_cod_cliente ON recibos (cod_cliente);
CREATE INDEX IF NOT EXISTS idx_recibos_vendedor ON recibos (vendedor);

-- ---------------------------------------------------------------------------
-- F) Crear tabla servicios_fijos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servicios_fijos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio TEXT,
  forma_pago TEXT,
  observaciones TEXT,
  vencimiento DATE,
  estado TEXT,
  importe NUMERIC(14,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- G) Crear tabla movimientos_caja_chica
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos_caja_chica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE,
  tipo TEXT,
  concepto TEXT,
  valor NUMERIC(14,2),
  saldo NUMERIC(14,2),
  periodo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_caja_fecha ON movimientos_caja_chica (fecha);

-- ---------------------------------------------------------------------------
-- RLS + Policies para tablas nuevas
-- ---------------------------------------------------------------------------
ALTER TABLE facturas_gestionpro ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios_fijos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja_chica ENABLE ROW LEVEL SECURITY;

-- facturas_gestionpro
CREATE POLICY "auth_select_facturas_gp" ON facturas_gestionpro FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_facturas_gp" ON facturas_gestionpro FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_facturas_gp" ON facturas_gestionpro FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_facturas_gp" ON facturas_gestionpro FOR DELETE TO authenticated USING (true);

-- recibos
CREATE POLICY "auth_select_recibos" ON recibos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_recibos" ON recibos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_recibos" ON recibos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_recibos" ON recibos FOR DELETE TO authenticated USING (true);

-- servicios_fijos
CREATE POLICY "auth_select_servicios_fijos" ON servicios_fijos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_servicios_fijos" ON servicios_fijos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_servicios_fijos" ON servicios_fijos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_servicios_fijos" ON servicios_fijos FOR DELETE TO authenticated USING (true);

-- movimientos_caja_chica
CREATE POLICY "auth_select_mov_caja" ON movimientos_caja_chica FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_mov_caja" ON movimientos_caja_chica FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_mov_caja" ON movimientos_caja_chica FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_mov_caja" ON movimientos_caja_chica FOR DELETE TO authenticated USING (true);

-- Delete policies para tablas existentes que no las tenian
CREATE POLICY "auth_delete_proveedores" ON proveedores FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete_compras" ON compras FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete_ordenes_compra" ON ordenes_compra FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete_pagos_proveedores" ON pagos_proveedores FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete_cobranzas" ON cobranzas_pendientes FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete_reclamos" ON reclamos_pagos_proveedores FOR DELETE TO authenticated USING (true);
