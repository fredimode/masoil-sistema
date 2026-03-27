-- ============================================================
-- Fix RLS policies for new 'usuario' role
-- The old policies only allowed 'admin' or vendedor_id match.
-- Now 'usuario' needs full access to clients and orders
-- (same as admin, minus finanzas which is handled at app level).
-- ============================================================

-- 1. Drop and recreate get_current_user_role() returning TEXT (cannot change return type in-place)
DROP FUNCTION IF EXISTS get_current_user_role();

CREATE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM vendedores WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Clients: allow all authenticated users (admin + usuario) full access
DROP POLICY IF EXISTS "admin_full_access_clients" ON clients;
DROP POLICY IF EXISTS "vendedor_read_own_clients" ON clients;

CREATE POLICY "auth_full_access_clients" ON clients
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Orders: allow all authenticated users full access
DROP POLICY IF EXISTS "admin_full_access_orders" ON orders;
DROP POLICY IF EXISTS "vendedor_read_own_orders" ON orders;
DROP POLICY IF EXISTS "vendedor_insert_orders" ON orders;
DROP POLICY IF EXISTS "auth_update_orders" ON orders;

CREATE POLICY "auth_full_access_orders" ON orders
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Vendedores: allow all authenticated users to read, admin to write
DROP POLICY IF EXISTS "admin_full_access_vendedores" ON vendedores;
-- auth_read_vendedores already exists (FOR SELECT, true)
-- Add write policy for admin
CREATE POLICY "admin_write_vendedores" ON vendedores
  FOR ALL USING (get_current_user_role() = 'admin');

-- 5. Products: admin write policy already uses get_current_user_role() = 'admin'
-- auth_read_products already allows all authenticated to read
-- No changes needed

-- 6. Delete policy for clients (was missing)
CREATE POLICY "auth_delete_clients" ON clients
  FOR DELETE TO authenticated
  USING (true);

-- 7. Delete policy for orders (was missing)
CREATE POLICY "auth_delete_orders" ON orders
  FOR DELETE TO authenticated
  USING (true);
