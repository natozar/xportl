-- ============================================
-- XPORTL - Migration 011: Admin can read ALL capsules
-- Admins need to see every capsule regardless of visibility_layer
-- ============================================

-- Policy: active admins can read ALL capsules (overrides visibility filters)
CREATE POLICY "Admins can read all capsules"
    ON capsules FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.user_id = auth.uid()
            AND au.is_active = true
        )
    );
