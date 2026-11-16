alter table public.itpc_takecare_cases
  add column service_type text;

alter table public.itpc_takecare_cases
  add constraint itpc_takecare_cases_service_type_check
  check (
    service_type is null
    or service_type in (
      'parent_consultation',
      'student_consultation',
      'behavior_observation',
      'ot_assessment',
      'psychological_assessment',
      'ot_skill_activity',
      'psychology_skill_activity'
    )
  );

create or replace function public.create_case_with_service(
  p_case_type text,
  p_other_text text,
  p_details text,
  p_scheduled_at timestamptz,
  p_created_by uuid,
  p_student_ids uuid[],
  p_caretaker_ids uuid[],
  p_service_type text
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
  set service_type = p_service_type
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
  p_service_type text
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
  set service_type = p_service_type
  where id = p_case_id;
end;
$$;

revoke all on function public.create_case_with_service(text, text, text, timestamptz, uuid, uuid[], uuid[], text) from public, anon;
grant execute on function public.create_case_with_service(text, text, text, timestamptz, uuid, uuid[], uuid[], text) to authenticated;

revoke all on function public.admin_update_case_with_service(uuid, text, text, text, timestamptz, uuid[], uuid[], text) from public, anon;
grant execute on function public.admin_update_case_with_service(uuid, text, text, text, timestamptz, uuid[], uuid[], text) to authenticated;

notify pgrst, 'reload schema';
