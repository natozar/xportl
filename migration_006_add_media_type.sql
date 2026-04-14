-- migration_006_add_media_type.sql
-- Close the schema gap that silently broke every capsule with media or with
-- a ghost view counter since those features shipped on the frontend.
--
-- Three columns were missing from `capsules`:
--   * media_url   — storage URL of the uploaded photo/audio blob
--   * media_type  — 'image' | 'audio' discriminator for render
--   * views_left  — remaining views for ghost capsules (null = perpetual)
--
-- The RPC get_nearby_capsules also needs to be widened so the client sees
-- the new fields. While we're in there we tighten it up: drop anything
-- moderated out, and drop ghost capsules whose view budget is exhausted.
-- Filter logic for distance / layer / unlock_date is unchanged.

begin;

alter table capsules add column if not exists media_url   text;
alter table capsules add column if not exists media_type  text;
alter table capsules add column if not exists views_left  integer;

-- Idempotent check constraint (can't use add constraint if not exists)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'capsules_media_type_check'
  ) then
    alter table capsules
      add constraint capsules_media_type_check
      check (media_type is null or media_type in ('image', 'audio'));
  end if;
end $$;

-- CREATE OR REPLACE can't widen RETURNS TABLE, so drop first. Inside the
-- transaction so a failure in the new definition rolls the drop back too.
drop function if exists public.get_nearby_capsules(
  double precision, double precision, integer, visibility_layer
);

create function public.get_nearby_capsules(
  user_lat double precision,
  user_lng double precision,
  radius_meters integer default 50,
  layer visibility_layer default 'public'::visibility_layer
)
returns table(
  id uuid,
  lat double precision,
  lng double precision,
  altitude double precision,
  content jsonb,
  visibility_layer visibility_layer,
  unlock_date timestamp with time zone,
  views_count integer,
  views_left integer,
  media_url text,
  media_type text,
  moderation_status text,
  distance_meters double precision,
  created_at timestamp with time zone
)
language plpgsql
stable
as $function$
begin
  return query
  select
    c.id,
    c.lat,
    c.lng,
    c.altitude,
    c.content,
    c.visibility_layer,
    c.unlock_date,
    c.views_count,
    c.views_left,
    c.media_url,
    c.media_type,
    c.moderation_status,
    st_distance(
      c.location,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
    ) as distance_meters,
    c.created_at
  from capsules c
  where
    st_dwithin(
      c.location,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
      radius_meters
    )
    and (c.visibility_layer = layer or c.visibility_layer = 'public')
    and (c.unlock_date is null or c.unlock_date <= now())
    and (c.views_left is null or c.views_left > 0)
    and c.moderation_status = 'active'
  order by distance_meters asc;
end;
$function$;

commit;
