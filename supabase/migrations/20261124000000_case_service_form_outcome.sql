create or replace function public.save_case_service_form_with_outcome(
  p_case_id uuid,
  p_form_data jsonb,
  p_outcome text,
  p_next_appointment_at timestamptz default null
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
  if p_outcome is null or p_outcome not in ('draft', 'completed', 'next_appointment') then
    raise exception 'Invalid service form outcome';
  end if;
  if (p_outcome = 'next_appointment') <> (p_next_appointment_at is not null) then
    raise exception 'Next appointment date is required only for a next appointment';
  end if;
  if p_next_appointment_at is not null and p_next_appointment_at <= now() then
    raise exception 'Next appointment must be in the future';
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

  if p_outcome = 'completed' then
    update public.itpc_takecare_cases
    set status = 'done',
        appointment_status = 'attended',
        updated_at = now()
    where id = p_case_id;
  elsif p_outcome = 'next_appointment' then
    update public.itpc_takecare_cases
    set status = 'planned',
        appointment_status = 'rescheduled',
        scheduled_at = p_next_appointment_at,
        updated_at = now()
    where id = p_case_id;
  end if;
end;
$$;

revoke all on function public.save_case_service_form_with_outcome(uuid, jsonb, text, timestamptz) from public, anon;
grant execute on function public.save_case_service_form_with_outcome(uuid, jsonb, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
