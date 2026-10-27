alter table public.caretakers
  add column if not exists phone text,
  add column if not exists age smallint,
  add column if not exists profile_image_path text;

alter table public.caretakers
  drop constraint if exists caretakers_age_check;
alter table public.caretakers
  add constraint caretakers_age_check check (age is null or age between 18 and 120);

grant select (id, name, role, created_at, deactivated_at, phone, age, profile_image_path)
  on public.caretakers to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caretaker-photos', 'caretaker-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists caretaker_photos_read_admin on storage.objects;
create policy caretaker_photos_read_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'caretaker-photos' and public.app_is_admin());

drop policy if exists caretaker_photos_insert_admin on storage.objects;
create policy caretaker_photos_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'caretaker-photos' and public.app_is_admin());

drop policy if exists caretaker_photos_update_admin on storage.objects;
create policy caretaker_photos_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'caretaker-photos' and public.app_is_admin())
  with check (bucket_id = 'caretaker-photos' and public.app_is_admin());

drop policy if exists caretaker_photos_delete_admin on storage.objects;
create policy caretaker_photos_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'caretaker-photos' and public.app_is_admin());

drop function if exists public.admin_create_caretaker(text, text, text);
create function public.admin_create_caretaker(
  p_id uuid,
  p_name text,
  p_pin text,
  p_role text,
  p_phone text,
  p_age integer,
  p_profile_image_path text
)
returns table (id uuid, name text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Caretaker name is required';
  end if;
  if p_role not in ('admin', 'caretaker') then
    raise exception 'Invalid role';
  end if;
  if p_pin !~ '^[0-9]{4,12}$' then
    raise exception 'PIN must contain 4 to 12 digits';
  end if;
  if p_age is not null and p_age not between 18 and 120 then
    raise exception 'Age must be between 18 and 120';
  end if;
  if p_phone is not null and p_phone !~ '^[0-9+() -]{8,20}$' then
    raise exception 'Invalid phone number';
  end if;
  if p_profile_image_path is not null
     and p_profile_image_path <> p_id::text || '/profile' then
    raise exception 'Invalid profile image path';
  end if;
  perform pg_advisory_xact_lock(hashtext('itpctakecare-active-pin'));
  if exists (
    select 1 from public.caretakers c
    where c.deactivated_at is null
      and c.pin_hash = extensions.crypt(p_pin, c.pin_hash)
  ) then
    raise exception 'PIN is already assigned to an active account';
  end if;

  return query
  insert into public.caretakers (id, name, pin_hash, role, phone, age, profile_image_path)
  values (
    p_id,
    trim(p_name),
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    p_role,
    nullif(trim(p_phone), ''),
    p_age,
    p_profile_image_path
  )
  returning caretakers.id, caretakers.name, caretakers.role;
end;
$$;

drop function if exists public.admin_update_caretaker(uuid, text, text, text);
create function public.admin_update_caretaker(
  p_id uuid,
  p_name text,
  p_role text,
  p_pin text,
  p_phone text,
  p_age integer,
  p_profile_image_path text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  perform pg_advisory_xact_lock(hashtext('itpctakecare-admin-role'));
  if nullif(trim(p_name), '') is null then
    raise exception 'Caretaker name is required';
  end if;
  if p_role not in ('admin', 'caretaker') then
    raise exception 'Invalid role';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,12}$' then
    raise exception 'PIN must contain 4 to 12 digits';
  end if;
  if p_age is not null and p_age not between 18 and 120 then
    raise exception 'Age must be between 18 and 120';
  end if;
  if p_phone is not null and p_phone !~ '^[0-9+() -]{8,20}$' then
    raise exception 'Invalid phone number';
  end if;
  if p_profile_image_path is not null
     and p_profile_image_path <> p_id::text || '/profile' then
    raise exception 'Invalid profile image path';
  end if;
  if p_pin is not null then
    perform pg_advisory_xact_lock(hashtext('itpctakecare-active-pin'));
  end if;
  if p_pin is not null and exists (
    select 1 from public.caretakers c
    where c.id <> p_id
      and c.deactivated_at is null
      and c.pin_hash = extensions.crypt(p_pin, c.pin_hash)
  ) then
    raise exception 'PIN is already assigned to an active account';
  end if;
  if p_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Cannot remove your own admin role';
  end if;
  if p_role <> 'admin'
     and exists (select 1 from public.caretakers c where c.id = p_id and c.role = 'admin' and c.deactivated_at is null)
     and (select count(*) from public.caretakers c where c.role = 'admin' and c.deactivated_at is null) <= 1 then
    raise exception 'Cannot remove the last active admin';
  end if;

  update public.caretakers c
  set name = trim(p_name),
      role = p_role,
      phone = nullif(trim(p_phone), ''),
      age = p_age,
      profile_image_path = p_profile_image_path,
      pin_hash = case when p_pin is null then c.pin_hash else extensions.crypt(p_pin, extensions.gen_salt('bf')) end
  where c.id = p_id;
  if not found then
    raise exception 'Caretaker not found';
  end if;
end;
$$;

revoke all on function public.admin_create_caretaker(uuid, text, text, text, text, integer, text) from public, anon;
revoke all on function public.admin_update_caretaker(uuid, text, text, text, text, integer, text) from public, anon;
grant execute on function public.admin_create_caretaker(uuid, text, text, text, text, integer, text) to authenticated;
grant execute on function public.admin_update_caretaker(uuid, text, text, text, text, integer, text) to authenticated;
