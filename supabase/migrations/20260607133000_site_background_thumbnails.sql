begin;

drop policy if exists site_backgrounds_admin_insert on storage.objects;
create policy site_backgrounds_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'site-backgrounds'
    and public.is_admin()
    and (
      name ~ '^bg_[A-Za-z0-9_:-]+__[A-Za-z0-9][A-Za-z0-9._ -]*\.(jpg|jpeg|png|webp)$'
      or name ~ '^thumbnails/bg_[A-Za-z0-9_:-]+__[A-Za-z0-9][A-Za-z0-9._ -]*\.(jpg|jpeg|png|webp)\.jpg$'
    )
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
    and (
      name ~ '^bg_[A-Za-z0-9_:-]+__[A-Za-z0-9][A-Za-z0-9._ -]*\.(jpg|jpeg|png|webp)$'
      or name ~ '^thumbnails/bg_[A-Za-z0-9_:-]+__[A-Za-z0-9][A-Za-z0-9._ -]*\.(jpg|jpeg|png|webp)\.jpg$'
    )
  );

commit;
