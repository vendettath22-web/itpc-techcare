delete from public.case_caretakers cc
using public.caretakers c
where cc.caretaker_id = c.id
  and c.role = 'admin';

create or replace function public.create_case_with_relations(
  p_case_type text,
  p_other_text text,
  p_details text,
  p_scheduled_at timestamptz,
  p_created_by uuid,
  p_student_ids uuid[],
  p_caretaker_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id uuid;
  v_role text;
begin
  v_role := public.app_caretaker_role();
  if coalesce(v_role not in ('admin', 'caretaker'), true)
     or auth.uid() is distinct from p_created_by then
    raise exception 'Authenticated caretaker required';
  end if;
  if p_case_type not in ('low_confidence', 'feel_not_smart', 'other') then
    raise exception 'Invalid case type';
  end if;
  if coalesce(cardinality(p_student_ids), 0) = 0 then
    raise exception 'At least one active student is required';
  end if;
  if coalesce(cardinality(p_caretaker_ids), 0) = 0 then
    raise exception 'At least one caretaker is required';
  end if;
  if v_role = 'caretaker'
     and not coalesce(auth.uid() = any(p_caretaker_ids), false) then
    raise exception 'Case creator must be an assigned caretaker';
  end if;
  if exists (
    select 1 from unnest(p_student_ids) ids(id)
    left join public.students s on s.id = ids.id
    where s.id is null or s.deactivated_at is not null
  ) then
    raise exception 'Student is inactive or does not exist';
  end if;
  if exists (
    select 1 from unnest(p_caretaker_ids) ids(id)
    left join public.caretakers c on c.id = ids.id
    where c.id is null or c.deactivated_at is not null or c.role <> 'caretaker'
  ) then
    raise exception 'Assigned caretaker is inactive, invalid, or does not exist';
  end if;

  insert into public.cases (case_type, other_text, details, scheduled_at, created_by)
  values (p_case_type, p_other_text, p_details, p_scheduled_at, auth.uid())
  returning id into v_case_id;

  insert into public.case_students (case_id, student_id)
  select v_case_id, ids.id from unnest(p_student_ids) ids(id);
  insert into public.case_caretakers (case_id, caretaker_id)
  select v_case_id, ids.id from unnest(p_caretaker_ids) ids(id);
  return v_case_id;
end;
$$;
