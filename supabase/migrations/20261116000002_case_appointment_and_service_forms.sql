alter table public.itpc_takecare_cases
  add column appointment_status text not null default 'scheduled';

update public.itpc_takecare_cases
set appointment_status = 'attended'
where status = 'done';

alter table public.itpc_takecare_cases
  add constraint itpc_takecare_cases_appointment_status_check
  check (appointment_status in ('scheduled', 'attended', 'no_show', 'rescheduled'));

grant update (appointment_status, scheduled_at, updated_at)
  on public.itpc_takecare_cases to authenticated;

create table public.itpc_takecare_case_service_forms (
  case_id uuid primary key references public.itpc_takecare_cases(id) on delete cascade,
  service_type text not null check (
    service_type in (
      'parent_consultation',
      'student_consultation',
      'behavior_observation',
      'ot_assessment',
      'psychological_assessment',
      'ot_skill_activity',
      'psychology_skill_activity'
    )
  ),
  form_data jsonb not null default '{}'::jsonb check (jsonb_typeof(form_data) = 'object'),
  recorded_by uuid not null references public.itpc_takecare_caretakers(id),
  updated_at timestamptz not null default now()
);

alter table public.itpc_takecare_case_service_forms enable row level security;
revoke all on public.itpc_takecare_case_service_forms from public, anon, authenticated;
grant select on public.itpc_takecare_case_service_forms to authenticated;

create policy case_service_forms_read_assigned on public.itpc_takecare_case_service_forms
  for select to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and (
      public.app_is_admin()
      or public.app_is_case_caretaker(case_id, auth.uid())
    )
  );

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
  if v_case.appointment_status <> 'attended' then
    raise exception 'Service form can only be saved after attendance';
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

revoke all on function public.save_case_service_form(uuid, jsonb) from public, anon;
grant execute on function public.save_case_service_form(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
