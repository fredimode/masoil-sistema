-- ============================================
-- SEED DATA: Masoil Lubricantes
-- ============================================
-- IMPORTANTE: Antes de ejecutar este script, debés crear los usuarios
-- en Supabase Auth (Dashboard > Authentication > Users > Add User).
--
-- Usuarios a crear:
--   1. admin@masoil.com.ar / MasoilAdmin2025!
--   2. carlos@masoil.com.ar / MasoilVendedor2025!
--
-- Después de crearlos, copiá los UUIDs generados y reemplazá
-- los placeholders 'AUTH_USER_ID_ADMIN' y 'AUTH_USER_ID_CARLOS' abajo.
-- ============================================

-- Paso 1: Insertar vendedores (reemplazá los UUIDs)
INSERT INTO vendedores (id, auth_user_id, name, email, whatsapp, role, is_active) VALUES
  (gen_random_uuid(), 'AUTH_USER_ID_ADMIN', 'Admin Masoil', 'admin@masoil.com.ar', '+54 11 5234-8900', 'admin', true),
  (gen_random_uuid(), 'AUTH_USER_ID_CARLOS', 'Carlos Fernández', 'carlos@masoil.com.ar', '+54 11 5234-8901', 'vendedor', true);

-- Paso 2: Asignar zonas (ejecutar después de obtener los IDs de vendedores)
-- Para Admin: todas las zonas
INSERT INTO vendedor_zonas (vendedor_id, zona)
SELECT v.id, z.zona
FROM vendedores v
CROSS JOIN (VALUES ('Norte'::zona), ('Capital'::zona), ('Sur'::zona), ('Oeste'::zona), ('GBA'::zona)) AS z(zona)
WHERE v.email = 'admin@masoil.com.ar';

-- Para Carlos: Norte y GBA
INSERT INTO vendedor_zonas (vendedor_id, zona)
SELECT v.id, z.zona
FROM vendedores v
CROSS JOIN (VALUES ('Norte'::zona), ('GBA'::zona)) AS z(zona)
WHERE v.email = 'carlos@masoil.com.ar';

-- Paso 3: Insertar productos
INSERT INTO products (code, name, category, stock, price, is_customizable, custom_lead_time, low_stock_threshold, critical_stock_threshold) VALUES
  -- Limpiadores
  ('LMP-220', 'Limpia Contactos 220ml', 'Limpiadores', 47, 2850.00, false, 0, 25, 10),
  ('LMP-440', 'Limpia Contactos 440ml', 'Limpiadores', 8, 4200.00, false, 0, 25, 10),
  ('LMP-500', 'Desengrasante Industrial 500ml', 'Limpiadores', 125, 3650.00, false, 0, 25, 10),
  ('LMP-750', 'Limpia Frenos 750ml', 'Limpiadores', 0, 4890.00, false, 0, 25, 10),
  ('LMP-350', 'Limpiador Multiuso 350ml', 'Limpiadores', 89, 2990.00, false, 0, 25, 10),
  -- Lubricantes
  ('LUB-220', 'WD-40 220ml', 'Lubricantes', 156, 5250.00, false, 0, 25, 10),
  ('LUB-440', 'Aceite Lubricante Multiuso 440ml', 'Lubricantes', 23, 3850.00, false, 0, 25, 10),
  ('LUB-SIL', 'Silicona Lubricante 360ml', 'Lubricantes', 67, 4120.00, false, 0, 25, 10),
  ('LUB-GRAF', 'Grasa Grafitada 400g', 'Lubricantes', 34, 6890.00, false, 0, 25, 10),
  ('LUB-LIT', 'Grasa de Litio 500g', 'Lubricantes', 5, 7250.00, false, 0, 25, 10),
  -- Selladores
  ('SEL-280', 'Sellador de Juntas 280ml', 'Selladores', 78, 5890.00, false, 0, 25, 10),
  ('SEL-SIL', 'Silicona Selladora 300ml', 'Selladores', 91, 4650.00, false, 0, 25, 10),
  ('SEL-TERM', 'Sellador Térmico 85g', 'Selladores', 43, 3280.00, false, 0, 25, 10),
  ('SEL-POL', 'Sellador Poliuretano 310ml', 'Selladores', 12, 8950.00, true, 15, 25, 10),
  -- Belleza
  ('BLZ-500', 'Cera Líquida Premium 500ml', 'Belleza', 145, 8750.00, false, 0, 25, 10),
  ('BLZ-PAL', 'Polish Abrillantador 350ml', 'Belleza', 98, 6890.00, false, 0, 25, 10),
  ('BLZ-REN', 'Renovador de Plásticos 250ml', 'Belleza', 56, 5650.00, false, 0, 25, 10),
  ('BLZ-CER', 'Cera Carnauba 200g', 'Belleza', 0, 12890.00, true, 15, 25, 10),
  ('BLZ-VID', 'Limpiavidrios Concentrado 500ml', 'Belleza', 187, 3890.00, false, 0, 25, 10),
  -- Higiene
  ('HIG-AMB', 'Ambientador Citrus 360ml', 'Higiene', 234, 2650.00, false, 0, 25, 10),
  ('HIG-LAV', 'Ambientador Lavanda 360ml', 'Higiene', 156, 2650.00, false, 0, 25, 10),
  ('HIG-DES', 'Desinfectante Multiuso 500ml', 'Higiene', 89, 3450.00, false, 0, 25, 10),
  ('HIG-TAP', 'Limpiador de Tapizados 400ml', 'Higiene', 45, 5890.00, false, 0, 25, 10),
  ('HIG-ANT', 'Antibacterial en Spray 250ml', 'Higiene', 7, 4250.00, false, 0, 25, 10),
  ('HIG-CUST', 'Ambientador Personalizado 360ml', 'Higiene', 0, 4890.00, true, 15, 25, 10);

-- Paso 4: Insertar clientes de ejemplo (asociados a Carlos)
INSERT INTO clients (business_name, contact_name, whatsapp, email, zona, vendedor_id, address, payment_terms, credit_limit, notes, total_orders)
SELECT
  c.business_name, c.contact_name, c.whatsapp, c.email, c.zona::zona,
  v.id, c.address, c.payment_terms, c.credit_limit, c.notes, c.total_orders
FROM vendedores v
CROSS JOIN (VALUES
  ('Taller Mecánico Norte', 'Javier Pérez', '+54 11 4567-8901', 'contacto@tallernorte.com.ar', 'Norte', 'Av. San Martín 1234, Vicente López', '30 días', 150000, 'Cliente VIP - Pedidos frecuentes', 87),
  ('AutoService Express', 'Ricardo Molina', '+54 11 4567-8902', 'info@autoserviceexpress.com', 'Norte', 'Calle 45 N° 567, San Isidro', '15 días', 80000, '', 34),
  ('Lubricentro La Matanza', 'Héctor Vargas', '+54 11 4567-8913', 'contacto@lubrilamatanza.com', 'GBA', 'Av. Cristiania 3456, La Matanza', '30 días', 100000, '', 63),
  ('Taller Mecánico Tigre', 'Leonardo Benítez', '+54 11 4567-8914', 'info@tallertigre.com', 'GBA', 'Ruta 27 Km 5, Tigre', '45 días', 140000, 'Cliente desde 2010', 156)
) AS c(business_name, contact_name, whatsapp, email, zona, address, payment_terms, credit_limit, notes, total_orders)
WHERE v.email = 'carlos@masoil.com.ar';
