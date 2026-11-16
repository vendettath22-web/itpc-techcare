create table public.itpc_takecare_student_intake_forms (
  student_id uuid primary key references public.itpc_takecare_students(id) on delete cascade,
  form_data jsonb not null default '{}'::jsonb check (jsonb_typeof(form_data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.itpc_takecare_student_intake_forms enable row level security;
revoke all on public.itpc_takecare_student_intake_forms from public, anon, authenticated;
create policy student_intake_forms_admin_access on public.itpc_takecare_student_intake_forms
  for all to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

drop index if exists public.students_student_id_academic_year_key;
create unique index if not exists itpc_takecare_students_student_id_academic_year_active_key
  on public.itpc_takecare_students (student_id, academic_year)
  where student_id is not null and deactivated_at is null;

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
  p_form_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  if p_form_data is null
     or jsonb_typeof(p_form_data) is distinct from 'object'
     or octet_length(p_form_data::text) > 50000 then
    raise exception 'Student intake form data is invalid or too large';
  end if;

  v_student_id := public.admin_create_student(
    p_id,
    p_student_id,
    p_first_name_th,
    p_last_name_th,
    p_nickname_th,
    p_grade,
    p_room,
    p_gender,
    p_academic_year,
    p_profile_image_path
  );

  insert into public.itpc_takecare_student_intake_forms (student_id, form_data)
  values (v_student_id, p_form_data);

  return v_student_id;
end;
$$;

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
  p_form_data jsonb
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
  if p_form_data is null
     or jsonb_typeof(p_form_data) is distinct from 'object'
     or octet_length(p_form_data::text) > 50000 then
    raise exception 'Student intake form data is invalid or too large';
  end if;

  perform public.admin_update_student(
    p_id,
    p_student_id,
    p_first_name_th,
    p_last_name_th,
    p_nickname_th,
    p_grade,
    p_room,
    p_gender,
    p_academic_year,
    p_profile_image_path
  );

  insert into public.itpc_takecare_student_intake_forms (student_id, form_data, updated_at)
  values (p_id, p_form_data, now())
  on conflict (student_id) do update
  set form_data = excluded.form_data,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.admin_get_student_intake_form(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;

  return coalesce(
    (select form_data
     from public.itpc_takecare_student_intake_forms
     where student_id = p_student_id),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.admin_archive_all_students()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archived integer;
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;

  update public.itpc_takecare_students
  set deactivated_at = now()
  where deactivated_at is null;

  get diagnostics v_archived = row_count;
  return v_archived;
end;
$$;

revoke all on function public.admin_create_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb) from public, anon;
revoke all on function public.admin_update_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb) from public, anon;
revoke all on function public.admin_get_student_intake_form(uuid) from public, anon;
revoke all on function public.admin_archive_all_students() from public, anon;
grant execute on function public.admin_create_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_update_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_get_student_intake_form(uuid) to authenticated;
grant execute on function public.admin_archive_all_students() to authenticated;
