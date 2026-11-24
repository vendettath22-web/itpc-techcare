alter table public.itpc_takecare_students
  add column if not exists student_record_data jsonb;

alter table public.itpc_takecare_students
  drop constraint if exists itpc_takecare_students_student_record_data_object;
alter table public.itpc_takecare_students
  add constraint itpc_takecare_students_student_record_data_object
  check (student_record_data is null or jsonb_typeof(student_record_data) = 'object');

comment on column public.itpc_takecare_students.student_record_data is
  'Complete 00 student record form data. The existing itpc_takecare_student_intake_forms form_data remains the authoritative compatibility store.';

drop function if exists public.admin_create_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text);
create or replace function public.admin_create_student_with_intake_form(
  p_id uuid,
  p_student_id text,
  p_first_name_th text,
  p_last_name_th text,
  p_nickname_th text,
  p_grade text,
  p_room integer,
  p_gender text,
  p_academic_year text,
  p_profile_image_path text,
  p_form_data jsonb,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
begin
  if not public.app_is_admin() then raise exception 'Admin role required'; end if;
  if p_form_data is null or jsonb_typeof(p_form_data) is distinct from 'object'
     or octet_length(p_form_data::text) > 50000 then
    raise exception 'Student record form data is invalid or too large';
  end if;

  v_student_id := public.admin_create_student(
    p_id, p_student_id, p_first_name_th, p_last_name_th, p_nickname_th,
    p_grade, p_room, p_gender, p_academic_year, p_profile_image_path
  );

  update public.itpc_takecare_students
  set phone = nullif(trim(p_phone), ''),
      student_record_data = p_form_data
  where id = v_student_id;

  insert into public.itpc_takecare_student_intake_forms (student_id, form_data)
  values (v_student_id, p_form_data);
  return v_student_id;
end;
$$;

drop function if exists public.admin_update_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text);
create or replace function public.admin_update_student_with_intake_form(
  p_id uuid,
  p_student_id text,
  p_first_name_th text,
  p_last_name_th text,
  p_nickname_th text,
  p_grade text,
  p_room integer,
  p_gender text,
  p_academic_year text,
  p_profile_image_path text,
  p_form_data jsonb,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin() then raise exception 'Admin role required'; end if;
  if p_form_data is null or jsonb_typeof(p_form_data) is distinct from 'object'
     or octet_length(p_form_data::text) > 50000 then
    raise exception 'Student record form data is invalid or too large';
  end if;

  perform public.admin_update_student(
    p_id, p_student_id, p_first_name_th, p_last_name_th, p_nickname_th,
    p_grade, p_room, p_gender, p_academic_year, p_profile_image_path
  );

  update public.itpc_takecare_students
  set phone = nullif(trim(p_phone), ''),
      student_record_data = p_form_data
  where id = p_id;

  insert into public.itpc_takecare_student_intake_forms (student_id, form_data, updated_at)
  values (p_id, p_form_data, now())
  on conflict (student_id) do update
  set form_data = excluded.form_data,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.admin_create_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) from public, anon;
grant execute on function public.admin_create_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) to authenticated;

revoke all on function public.admin_update_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) from public, anon;
grant execute on function public.admin_update_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
