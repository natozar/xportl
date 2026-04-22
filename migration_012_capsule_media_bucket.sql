-- migration_012_capsule_media_bucket.sql
-- Create (or repair) the capsule-media storage bucket + policies.
-- Addresses the "Bucket not found" client-side errors reported in godmode.
--
-- Apply manually via Supabase Dashboard > SQL Editor.
-- Idempotent: safe to run multiple times.

begin;

-- 1) Bucket: public, 10MB per file, MIME allowlist covering the formats
--    the client actually uploads (uploadMedia + ProfilePage avatar).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capsule-media',
  'capsule-media',
  true,
  10485760, -- 10MB
  array[
    -- images
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    -- audio
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
    -- video
    'video/webm', 'video/mp4', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Policies: replace if they exist so we end up in a known-good state.
drop policy if exists "Anyone can upload capsule media" on storage.objects;
drop policy if exists "Anyone can read capsule media"   on storage.objects;
drop policy if exists "Anyone can delete capsule media" on storage.objects;

create policy "Anyone can upload capsule media"
  on storage.objects for insert
  with check (bucket_id = 'capsule-media');

create policy "Anyone can read capsule media"
  on storage.objects for select
  using (bucket_id = 'capsule-media');

create policy "Anyone can delete capsule media"
  on storage.objects for delete
  using (bucket_id = 'capsule-media');

commit;
