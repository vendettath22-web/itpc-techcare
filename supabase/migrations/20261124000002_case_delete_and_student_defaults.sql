update public.itpc_takecare_students s
set student_record_data = f.form_data
from public.itpc_takecare_student_intake_forms f
where f.student_id = s.id
  and s.student_record_data is null;

create or replace function public.case_student_service_defaults(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.app_caretaker_role() not in ('admin', 'caretaker')
     or (
       not public.app_is_admin()
       and not public.app_is_case_caretaker(p_case_id, auth.uid())
     ) then
    raise exception 'Assigned caretaker or admin required';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'studentAge', nullif(trim(s.student_record_data ->> 'ageYears'), ''),
          'dateOfBirth', nullif(trim(s.student_record_data ->> 'dateOfBirth'), ''),
          'homeroomTeacher', nullif(trim(s.student_record_data ->> 'homeroomTeacher'), '')
        )
        order by s.first_name_th, s.last_name_th
      )
      from public.itpc_takecare_case_students cs
      join public.itpc_takecare_students s on s.id = cs.student_id
      where cs.case_id = p_case_id
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.admin_delete_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;

  if not exists (
    select 1 from public.itpc_takecare_cases where id = p_case_id
  ) then
    raise exception 'Case not found';
  end if;

  delete from public.itpc_takecare_case_service_forms where case_id = p_case_id;
  delete from public.itpc_takecare_case_signatures where case_id = p_case_id;
  delete from public.itpc_takecare_case_updates where case_id = p_case_id;
  delete from public.itpc_takecare_case_students where case_id = p_case_id;
  delete from public.itpc_takecare_case_caretakers where case_id = p_case_id;
  delete from public.itpc_takecare_cases where id = p_case_id;
end;
$$;

revoke all on function public.case_student_service_defaults(uuid) from public, anon;
grant execute on function public.case_student_service_defaults(uuid) to authenticated;

revoke all on function public.admin_delete_case(uuid) from public, anon;
grant execute on function public.admin_delete_case(uuid) to authenticated;

notify pgrst, 'reload schema';
