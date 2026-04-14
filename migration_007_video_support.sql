-- migration_007_video_support.sql
-- Extend capsules.media_type to allow 'video' alongside 'image' and 'audio'.
-- No schema changes beyond relaxing the check constraint.

begin;

alter table capsules drop constraint if exists capsules_media_type_check;

alter table capsules
  add constraint capsules_media_type_check
  check (media_type is null or media_type in ('image', 'audio', 'video'));

commit;
