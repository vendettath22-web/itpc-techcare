create or replace function public.admin_update_student(
  p_id uuid,
  p_student_id text,
  p_first_name_th text,
  p_last_name_th text,
  p_nickname_th text,
  p_grade text,
  p_room integer,
  p_gender text,
  p_academic_year text,
  p_profile_image_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  if p_academic_year !~ '^[0-9]{4}$' then
    raise exception 'Academic year must be four digits';
  end if;
  if p_room is not null and p_room < 1 then
    raise exception 'Room must be a positive number';
  end if;
  if p_profile_image_path is not null
     and p_profile_image_path <> p_id::text || '/profile' then
    raise exception 'Invalid student image path';
  end if;

  update public.students
  set student_id = nullif(trim(p_student_id), ''),
      first_name_th = nullif(trim(p_first_name_th), ''),
      last_name_th = nullif(trim(p_last_name_th), ''),
      nickname_th = nullif(trim(p_nickname_th), ''),
      grade = nullif(trim(p_grade), ''),
      room = p_room,
      gender = nullif(trim(p_gender), ''),
      academic_year = p_academic_year,
      profile_image_path = p_profile_image_path
  where id = p_id
    and deactivated_at is null;

  if not found then
    raise exception 'Active student not found';
  end if;
end;
$$;

revoke all on function public.admin_update_student(uuid, text, text, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.admin_update_student(uuid, text, text, text, text, text, integer, text, text, text) to authenticated;
