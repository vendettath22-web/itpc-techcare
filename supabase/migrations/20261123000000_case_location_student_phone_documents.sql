alter table public.itpc_takecare_cases
  add column if not exists location text;

alter table public.itpc_takecare_students
  add column if not exists phone text;

drop function if exists public.create_case_with_service(text, text, text, timestamptz, uuid, uuid[], uuid[], text);
drop function if exists public.admin_update_case_with_service(uuid, text, text, text, timestamptz, uuid[], uuid[], text);
drop function if exists public.admin_create_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb);
drop function if exists public.admin_update_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb);

create or replace function public.create_case_with_service(
  p_case_type text,
  p_other_text text,
  p_details text,
  p_scheduled_at timestamptz,
  p_created_by uuid,
  p_student_ids uuid[],
  p_caretaker_ids uuid[],
  p_service_type text,
  p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id uuid;
begin
  if p_service_type is null or p_service_type not in (
    'parent_consultation',
    'student_consultation',
    'behavior_observation',
    'ot_assessment',
    'psychological_assessment',
    'ot_skill_activity',
    'psychology_skill_activity'
  ) then
    raise exception 'Invalid service type';
  end if;

  v_case_id := public.create_case_with_relations(
    p_case_type,
    p_other_text,
    p_details,
    p_scheduled_at,
    p_created_by,
    p_student_ids,
    p_caretaker_ids
  );
  update public.itpc_takecare_cases
  set service_type = p_service_type,
      location = nullif(trim(p_location), '')
  where id = v_case_id;
  return v_case_id;
end;
$$;

create or replace function public.admin_update_case_with_service(
  p_case_id uuid,
  p_case_type text,
  p_other_text text,
  p_details text,
  p_scheduled_at timestamptz,
  p_student_ids uuid[],
  p_caretaker_ids uuid[],
  p_service_type text,
  p_location text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_service_type is null or p_service_type not in (
    'parent_consultation',
    'student_consultation',
    'behavior_observation',
    'ot_assessment',
    'psychological_assessment',
    'ot_skill_activity',
    'psychology_skill_activity'
  ) then
    raise exception 'Invalid service type';
  end if;

  perform public.admin_update_case_with_relations(
    p_case_id,
    p_case_type,
    p_other_text,
    p_details,
    p_scheduled_at,
    p_student_ids,
    p_caretaker_ids
  );
  update public.itpc_takecare_cases
  set service_type = p_service_type,
      location = nullif(trim(p_location), '')
  where id = p_case_id;
end;
$$;

create or replace function public.save_case_service_form(
  p_case_id uuid,
  p_form_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.itpc_takecare_cases%rowtype;
begin
  if public.app_caretaker_role() not in ('admin', 'caretaker')
     or (
       not public.app_is_admin()
       and not public.app_is_case_caretaker(p_case_id, auth.uid())
     ) then
    raise exception 'Assigned caretaker or admin required';
  end if;
  if p_form_data is null
     or jsonb_typeof(p_form_data) is distinct from 'object'
     or octet_length(p_form_data::text) > 50000 then
    raise exception 'Service form data is invalid or too large';
  end if;

  select * into v_case
  from public.itpc_takecare_cases
  where id = p_case_id
  for update;
  if not found then
    raise exception 'Case not found';
  end if;
  if v_case.service_type is null then
    raise exception 'Case service type is missing';
  end if;

  insert into public.itpc_takecare_case_service_forms (
    case_id,
    service_type,
    form_data,
    recorded_by,
    updated_at
  )
  values (
    p_case_id,
    v_case.service_type,
    p_form_data,
    auth.uid(),
    now()
  )
  on conflict (case_id) do update
  set service_type = excluded.service_type,
      form_data = excluded.form_data,
      recorded_by = excluded.recorded_by,
      updated_at = excluded.updated_at;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-documents',
  'student-documents',
  false,
  2097152,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_documents_read_admin on storage.objects;
create policy student_documents_read_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'student-documents' and public.app_is_admin());

drop policy if exists student_documents_insert_admin on storage.objects;
create policy student_documents_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-documents' and public.app_is_admin());

drop policy if exists student_documents_update_admin on storage.objects;
create policy student_documents_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'student-documents' and public.app_is_admin())
  with check (bucket_id = 'student-documents' and public.app_is_admin());

drop policy if exists student_documents_delete_admin on storage.objects;
create policy student_documents_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-documents' and public.app_is_admin());

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

  update public.itpc_takecare_students
  set phone = nullif(trim(p_phone), '')
  where id = v_student_id;

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
  p_form_data jsonb,
  p_phone text default null
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

  update public.itpc_takecare_students
  set phone = nullif(trim(p_phone), '')
  where id = p_id;

  insert into public.itpc_takecare_student_intake_forms (student_id, form_data, updated_at)
  values (p_id, p_form_data, now())
  on conflict (student_id) do update
  set form_data = excluded.form_data,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.create_case_with_service(text, text, text, timestamptz, uuid, uuid[], uuid[], text, text) from public, anon;
grant execute on function public.create_case_with_service(text, text, text, timestamptz, uuid, uuid[], uuid[], text, text) to authenticated;

revoke all on function public.admin_update_case_with_service(uuid, text, text, text, timestamptz, uuid[], uuid[], text, text) from public, anon;
grant execute on function public.admin_update_case_with_service(uuid, text, text, text, timestamptz, uuid[], uuid[], text, text) to authenticated;

revoke all on function public.admin_create_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) from public, anon;
grant execute on function public.admin_create_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) to authenticated;

revoke all on function public.admin_update_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) from public, anon;
grant execute on function public.admin_update_student_with_intake_form(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
