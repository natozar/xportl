-- migration_004_godmode.sql
-- Godmode admin foundation: admin identity + passkeys, append-only audit log,
-- error ingest, runtime feature flags + kill switches.
--
-- Decisions baked in:
--   * WebAuthn passkeys instead of TOTP (no secret-at-rest)
--   * audit_log is truly append-only, enforced by triggers that block even
--     service_role from UPDATE/DELETE
--   * before/after state in audit_log follows a changed-fields-first policy:
--     callers pass `changed_fields text[]` by default and only embed raw
--     before/after values for explicitly whitelisted non-PII columns
--   * LLM budget in numeric USD (fractional cents matter for Haiku)
--   * First owner is seeded from the project owner's auth.users.id
--   * Feature flags default to "IA off" so this migration is inert until the
--     IA pipeline is actually built in later phases.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. admin_users — permission layer on top of auth.users
-- ─────────────────────────────────────────────────────────────────────────
create table admin_users (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  role           text not null check (role in ('owner','moderator','observer')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  last_login_ip_hash text,     -- sha256 of ipv4/ipv6, never the raw IP
  notes          text
);

alter table admin_users enable row level security;

-- Frontend never queries admin_users directly; Edge Functions use service_role.
-- Default-deny for authenticated users.
create policy admin_users_no_direct_read
  on admin_users for select to authenticated using (false);
create policy admin_users_no_direct_write
  on admin_users for all to authenticated using (false) with check (false);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. admin_credentials — WebAuthn passkeys for godmode login
-- ─────────────────────────────────────────────────────────────────────────
create table admin_credentials (
  id             bigserial primary key,
  user_id        uuid not null references admin_users(user_id) on delete cascade,
  credential_id  bytea not null unique,
  public_key     bytea not null,
  counter        bigint not null default 0,
  transports     text[],
  device_name    text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index idx_admin_credentials_user on admin_credentials(user_id);

alter table admin_credentials enable row level security;
create policy admin_credentials_no_direct
  on admin_credentials for all to authenticated using (false) with check (false);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. audit_log — append-only, immutable even to service_role
-- ─────────────────────────────────────────────────────────────────────────
create table audit_log (
  id             bigserial primary key,
  occurred_at    timestamptz not null default now(),
  actor_type     text not null check (actor_type in ('admin','ai-agent','system')),
  actor_id       text,                    -- admin user_id, or 'ai-agent-v1', etc
  action         text not null,
  target_type    text,                    -- 'user','capsule','deploy','flag', ...
  target_id      text,
  changed_fields text[],                  -- default: column names only, no values
  before_state   jsonb,                   -- only for whitelisted non-PII fields
  after_state    jsonb,                   -- idem
  reason         text,
  ip_hash        text,                    -- sha256(ip)
  metadata       jsonb
);

create index idx_audit_occurred on audit_log(occurred_at desc);
create index idx_audit_actor    on audit_log(actor_type, actor_id);
create index idx_audit_target   on audit_log(target_type, target_id);

alter table audit_log enable row level security;

-- INSERT allowed (Edge Functions write here); SELECT gated to Edge Functions.
create policy audit_log_insert
  on audit_log for insert to authenticated with check (true);
create policy audit_log_no_read
  on audit_log for select to authenticated using (false);

-- Hard immutability: triggers reject UPDATE/DELETE even if called by
-- service_role or the table owner. The only way to rewrite history is to
-- drop the triggers in a new migration, which leaves a migration trail.
create or replace function audit_log_reject_mutation() returns trigger as $$
begin
  raise exception 'audit_log is append-only; mutations are forbidden';
end;
$$ language plpgsql;

create trigger audit_log_block_update
  before update on audit_log
  for each row execute function audit_log_reject_mutation();

create trigger audit_log_block_delete
  before delete on audit_log
  for each row execute function audit_log_reject_mutation();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. error_events — client + server error ingest
-- ─────────────────────────────────────────────────────────────────────────
create table error_events (
  id               bigserial primary key,
  captured_at      timestamptz not null default now(),
  source           text not null check (source in ('client','server','edge-function')),
  user_id          uuid,                  -- nullable: anon errors still ingest
  session_id       text,
  url              text,
  user_agent       text,
  error_name       text,
  error_message    text,
  error_stack      text,
  fingerprint      text,                  -- sha256(error_name + top-3 stack frames)
  severity         text check (severity in ('critical','error','warning','info')),
  ai_classification jsonb,
  ai_analyzed_at   timestamptz,
  resolved_at      timestamptz,
  resolved_by      text,                  -- admin user_id or 'ai-agent'
  resolution_type  text check (resolution_type in ('manual-fix','auto-applied','ignored','duplicate'))
);

create index idx_errors_fingerprint on error_events(fingerprint);
create index idx_errors_unresolved  on error_events(captured_at desc) where resolved_at is null;
create index idx_errors_severity    on error_events(severity, captured_at desc);

alter table error_events enable row level security;

-- Anonymous + authenticated clients can INSERT (fire-and-forget ingest).
-- Nobody reads from the client — reads go through Edge Functions.
create policy error_events_public_insert
  on error_events for insert to anon, authenticated with check (true);
create policy error_events_no_direct_read
  on error_events for select to authenticated using (false);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. feature_flags — runtime kill switches + config
-- ─────────────────────────────────────────────────────────────────────────
create table feature_flags (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id)
);

alter table feature_flags enable row level security;

-- Public SELECT: user app needs to read maintenance_mode, signup_enabled, etc.
-- Writes go through Edge Functions with admin check.
create policy feature_flags_public_read
  on feature_flags for select to anon, authenticated using (true);
create policy feature_flags_no_direct_write
  on feature_flags for all to authenticated using (false) with check (false);

insert into feature_flags(key, value, description) values
  ('ai_autonomy_tier',      '0'::jsonb,
   '0=observer, 1=advisor, 2=patch-author, 3=safe-auto-apply. Default 0 until IA pipeline ships.'),
  ('ai_kill_switch',        'true'::jsonb,
   'If true, IA stops analyzing and applying. Starts ON until Phase 6 is live.'),
  ('maintenance_mode',      'false'::jsonb,
   'If true, non-admin users see a maintenance screen instead of the app.'),
  ('signup_enabled',        'true'::jsonb,
   'If false, AuthGate blocks new sign-ups.'),
  ('llm_monthly_budget_usd','50.0'::jsonb,
   'Monthly LLM budget in USD. Auto-downgrade to Tier 0 at 80%.'),
  ('llm_monthly_spent_usd', '0.0'::jsonb,
   'Current monthly LLM spend in USD. Reset to 0 on the 1st of each month by cron.');

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Seed first owner from the project owner's auth.users.id
-- ─────────────────────────────────────────────────────────────────────────
insert into admin_users (user_id, role, is_active, notes)
values (
  'f4a146b3-dd43-4326-ac9d-bd4d9de81c07',
  'owner',
  true,
  'Seeded by migration_004. First owner; cannot be demoted except via explicit migration.'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Realtime: publish feature_flags so the user app can react to
--    maintenance_mode / signup_enabled without a reload.
-- ─────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table feature_flags;

commit;
