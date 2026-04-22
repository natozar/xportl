-- ═════════════════════════════════════════════════════════════════════
-- XPortl · Migration 015 · Friendships
-- Purpose: first-class social graph. Users who see each other in
--          "Meus Portais > Quem interagiu" can now send friend requests.
--
-- Design: directional rows. The requester is always `from_id`, the
--         target is `to_id`. Status goes pending → accepted (one-way
--         write from target). Either party can DELETE to undo.
--
-- Apply manually via Supabase Dashboard > SQL Editor. Idempotent.
-- ═════════════════════════════════════════════════════════════════════

create table if not exists friendships (
  from_id      uuid not null references auth.users(id) on delete cascade,
  to_id        uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (from_id, to_id),
  -- Prevent self-friending at the DB level so a malicious client can't try.
  constraint friendships_no_self check (from_id <> to_id)
);

-- "My friends" and "incoming requests" are the hot paths.
create index if not exists idx_friendships_to_status   on friendships(to_id,   status);
create index if not exists idx_friendships_from_status on friendships(from_id, status);

-- ── RLS ────────────────────────────────────────────────────────────
alter table friendships enable row level security;

-- Both parties can always SELECT their own rows.
drop policy if exists "fr: participants can select" on friendships;
create policy "fr: participants can select"
  on friendships for select
  using (auth.uid() = from_id or auth.uid() = to_id);

-- Only the requester can INSERT, and only with status=pending. This
-- blocks a malicious client from pre-marking a friendship as accepted.
drop policy if exists "fr: requester inserts pending" on friendships;
create policy "fr: requester inserts pending"
  on friendships for insert
  with check (auth.uid() = from_id and status = 'pending');

-- Only the recipient can UPDATE, and only to move pending → accepted.
-- Attempting to flip accepted → pending or to write to a row you're
-- not the recipient of is rejected.
drop policy if exists "fr: recipient accepts" on friendships;
create policy "fr: recipient accepts"
  on friendships for update
  using (auth.uid() = to_id)
  with check (auth.uid() = to_id and status = 'accepted');

-- Either party can DELETE — that's "reject a pending request" for the
-- recipient, or "cancel my request / unfriend" for the requester.
drop policy if exists "fr: participants can delete" on friendships;
create policy "fr: participants can delete"
  on friendships for delete
  using (auth.uid() = from_id or auth.uid() = to_id);

-- Keep updated_at fresh on transitions without trusting the client.
create or replace function set_friendships_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_friendships_updated_at on friendships;
create trigger trg_friendships_updated_at
  before update on friendships
  for each row execute function set_friendships_updated_at();

-- Convenience helper — bidirectional "are A and B friends?" check.
create or replace function are_friends(a uuid, b uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((from_id = a and to_id = b) or (from_id = b and to_id = a))
  );
$$;
