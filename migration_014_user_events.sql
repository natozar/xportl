-- ═════════════════════════════════════════════════════════════════════
-- XPortl · Migration 014 · User events (activation funnel)
-- Purpose: lightweight product-analytics table for a pre-seed investor
--          pitch. Answers "how do we measure?" without pulling in a
--          third-party analytics vendor (and without tripping LGPD).
--
-- Apply manually via Supabase Dashboard > SQL Editor. Idempotent.
-- ═════════════════════════════════════════════════════════════════════

create table if not exists user_events (
  id            bigserial primary key,
  captured_at   timestamptz not null default now(),
  event_name    text not null,           -- app_open | capsule_created | capsule_opened | capsule_deleted | portal_shared | profile_viewed | my_capsules_opened
  user_id       uuid,                    -- nullable so we can track anon pre-login
  session_id    text,                    -- opaque per-tab id, set client-side
  page          text,                    -- window.location.pathname
  properties    jsonb default '{}'::jsonb,
  user_agent    text,
  build_id      text                     -- commit sha at capture-time
);

-- Funnel queries: "events by name per day", "per-user event counts"
create index if not exists idx_ue_name_time on user_events(event_name, captured_at desc);
create index if not exists idx_ue_user_time on user_events(user_id, captured_at desc) where user_id is not null;
create index if not exists idx_ue_time on user_events(captured_at desc);

-- RLS — same pattern as error_events / web_vitals_events:
--   anon can INSERT (fire-and-forget), no one SELECTs without service_role.
alter table user_events enable row level security;

drop policy if exists "anon can insert user_events" on user_events;
create policy "anon can insert user_events"
  on user_events for insert
  with check (true);

-- Godmode / admin read — relies on service_role (bypasses RLS by default)
-- so we deliberately don't add a SELECT policy here. Admins query via
-- service-key or SQL Editor, which already bypasses RLS.
