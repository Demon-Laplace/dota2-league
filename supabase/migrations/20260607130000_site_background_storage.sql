begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'site-backgrounds',
  'site-backgrounds',
  true,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id)
do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_backgrounds_public_select on storage.objects;
create policy site_backgrounds_public_select
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'site-backgrounds');

drop policy if exists site_backgrounds_admin_insert on storage.objects;
create policy site_backgrounds_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'site-backgrounds'
    and public.is_admin()
    and name ~ '^bg_[A-Za-z0-9_:-]+__[A-Za-z0-9][A-Za-z0-9._ -]*\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists site_backgrounds_admin_update on storage.objects;
create policy site_backgrounds_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'site-backgrounds'
    and public.is_admin()
  )
  with check (
    bucket_id = 'site-backgrounds'
    and public.is_admin()
    and name ~ '^bg_[A-Za-z0-9_:-]+__[A-Za-z0-9][A-Za-z0-9._ -]*\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists site_backgrounds_admin_delete on storage.objects;
create policy site_backgrounds_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'site-backgrounds'
    and public.is_admin()
  );

commit;
