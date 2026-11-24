create or replace function public.admin_create_caretaker(
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
    select 1
    from public.itpc_takecare_caretakers c
    where c.deactivated_at is null
      and c.pin_hash = extensions.crypt(p_pin, c.pin_hash)
  ) then
    raise exception 'PIN is already assigned to an active account';
  end if;

  return query
  insert into public.itpc_takecare_caretakers as caretaker (
    id,
    name,
    pin_hash,
    role,
    phone,
    age,
    profile_image_path
  )
  values (
    p_id,
    trim(p_name),
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    p_role,
    nullif(trim(p_phone), ''),
    p_age,
    p_profile_image_path
  )
  returning caretaker.id, caretaker.name, caretaker.role;
end;
$$;

notify pgrst, 'reload schema';
