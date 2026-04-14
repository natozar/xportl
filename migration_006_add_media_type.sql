-- migration_006_add_media_type.sql
-- Add the missing media_type column to capsules. The frontend has been
-- inserting this field since audio support landed, which silently errored
-- with "column media_type does not exist" — meaning every audio capsule
-- ever created failed to persist. Nobody noticed because handleLeaveTrace
-- was swallowing the error.
--
-- We also backfill old image-only rows based on media_url presence, so the
-- distinction between "no media", "image", and "audio" is queryable.

begin;

alter table capsules
  add column if not exists media_type text;

alter table capsules
  add constraint capsules_media_type_check
  check (media_type is null or media_type in ('image', 'audio'));

-- Best-effort backfill: rows with a media_url but no type are almost
-- certainly images (audio was broken before this migration shipped).
update capsules
set media_type = 'image'
where media_url is not null
  and media_type is null;

commit;
