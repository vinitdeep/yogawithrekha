-- =============================================================================
-- Storage buckets
--   site-images   : PUBLIC read (portrait, logo, course images). Only admins can write.
--   lesson-videos : PRIVATE. Only admins can upload/replace/delete. Nobody can read directly —
--                   students get a short-lived signed URL from the `lesson-playback` Edge
--                   Function, which checks their enrollment at that moment (service role).
-- Run after 0001_schema.sql. Requires Supabase's `storage` schema.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('site-images', 'site-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('lesson-videos', 'lesson-videos', false, null, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- site-images: anyone can read (bucket is public); only admins write.
create policy "site images: admins insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images' and public.is_admin());
create policy "site images: admins update" on storage.objects for update to authenticated
  using (bucket_id = 'site-images' and public.is_admin());
create policy "site images: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-images' and public.is_admin());

-- lesson-videos: admins manage files; there is deliberately NO select policy for students.
create policy "lesson videos: admins insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-videos' and public.is_admin());
create policy "lesson videos: admins read" on storage.objects for select to authenticated
  using (bucket_id = 'lesson-videos' and public.is_admin());
create policy "lesson videos: admins update" on storage.objects for update to authenticated
  using (bucket_id = 'lesson-videos' and public.is_admin());
create policy "lesson videos: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-videos' and public.is_admin());
