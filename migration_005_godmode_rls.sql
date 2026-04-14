-- migration_005_godmode_rls.sql
-- Unlock direct access from the /godmode panel to the tables created in
-- migration_004, gated on membership in admin_users. This lets the admin
-- frontend talk to Supabase with the user's own anon-key session — no
-- service_role, no Edge Function required for the MVP.
--
-- The is_active_admin() helper is SECURITY DEFINER so the policy that
-- guards admin_users itself can call it without recursing into RLS.

begin;

create or replace function is_active_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from admin_users
    where user_id = uid and is_active = true
  );
$$;

-- admin_users: admins can read the admin roster (to show "who else is admin"
-- and to verify their own role on login). Non-admins still see nothing.
create policy admin_users_admin_read
  on admin_users for select to authenticated
  using (is_active_admin(auth.uid()));

-- feature_flags: admins can UPDATE any flag. INSERT/DELETE stays locked —
-- new flags ship via migration, stale flags get tombstoned not deleted.
create policy feature_flags_admin_update
  on feature_flags for update to authenticated
  using (is_active_admin(auth.uid()))
  with check (is_active_admin(auth.uid()));

-- audit_log: admins can read history. INSERT policy already allows any
-- authenticated (the Edge Functions / panel writes entries themselves).
create policy audit_log_admin_read
  on audit_log for select to authenticated
  using (is_active_admin(auth.uid()));

-- error_events: admins can read the incident feed. INSERT stays public
-- (fire-and-forget from the user app's window.onerror).
create policy error_events_admin_read
  on error_events for select to authenticated
  using (is_active_admin(auth.uid()));

-- admin_credentials: admins can read their own credentials metadata.
-- Writes stay locked (passkey enrollment is a Phase 2.5 Edge Function flow).
create policy admin_credentials_self_read
  on admin_credentials for select to authenticated
  using (user_id = auth.uid() and is_active_admin(auth.uid()));

commit;
