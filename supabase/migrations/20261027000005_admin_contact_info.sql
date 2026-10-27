create or replace function public.list_public_admin_contacts()
returns table (id uuid, name text, phone text, profile_image_path text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.phone, c.profile_image_path
  from public.caretakers c
  where c.role = 'admin'
    and c.deactivated_at is null
  order by c.name;
$$;

revoke all on function public.list_public_admin_contacts() from public;
grant execute on function public.list_public_admin_contacts() to anon, authenticated;

create or replace function public.app_is_public_admin_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.caretakers c
    where c.role = 'admin'
      and c.deactivated_at is null
      and c.profile_image_path = p_name
  );
$$;

revoke all on function public.app_is_public_admin_photo(text) from public;
grant execute on function public.app_is_public_admin_photo(text) to anon, authenticated;

grant select on storage.objects to anon;

drop policy if exists admin_contact_photos_read on storage.objects;
create policy admin_contact_photos_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'caretaker-photos'
    and public.app_is_public_admin_photo(name)
  );
