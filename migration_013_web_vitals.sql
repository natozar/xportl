-- ═════════════════════════════════════════════════════════════════════
-- XPortl · Migration 006 · Web Vitals field metrics
-- Purpose: ingest real user LCP/CLS/INP/FCP/TTFB from every device,
--          so we can see p75 performance in production (not just lab).
--          Fire-and-forget insert from the PWA client.
-- ═════════════════════════════════════════════════════════════════════

create table if not exists web_vitals_events (
  id            bigserial primary key,
  captured_at   timestamptz not null default now(),
  metric_name   text not null check (metric_name in ('LCP','CLS','INP','FCP','TTFB','FID')),
  value         double precision not null,
  rating        text not null check (rating in ('good','needs-improvement','poor')),
  page_url      text,
  user_agent    text,
  effective_type text,          -- navigator.connection.effectiveType (4g/3g/slow-2g)
  viewport_w    integer,
  viewport_h    integer,
  device_memory real,           -- navigator.deviceMemory (approx GB)
  hardware_concurrency smallint,
  session_id    text,           -- opaque per-tab id, groups metrics from same session
  build_id      text,           -- optional: commit sha or release tag
  metadata      jsonb default '{}'::jsonb
);

-- Indexes tuned for dashboards: "last 24h by metric", "p75 by page"
create index if not exists idx_wv_metric_time on web_vitals_events(metric_name, captured_at desc);
create index if not exists idx_wv_time        on web_vitals_events(captured_at desc);
create index if not exists idx_wv_rating      on web_vitals_events(rating, captured_at desc) where rating <> 'good';

alter table web_vitals_events enable row level security;

-- Same pattern as error_events: anon + authed can INSERT; no public SELECT.
create policy web_vitals_public_insert
  on web_vitals_events for insert to anon, authenticated with check (true);

create policy web_vitals_no_direct_read
  on web_vitals_events for select to authenticated using (false);

comment on table web_vitals_events is
  'Real-user web-vitals samples (LCP/CLS/INP/FCP/TTFB/FID). Inserted fire-and-forget from the PWA. Read via godmode edge functions only.';
