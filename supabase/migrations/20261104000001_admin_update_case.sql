create or replace function public.admin_update_case_with_relations(
  p_case_id uuid,
  p_case_type text,
  p_other_text text,
  p_details text,
  p_scheduled_at timestamptz,
  p_student_ids uuid[],
  p_caretaker_ids uuid[]
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
  if p_case_type not in ('low_confidence', 'feel_not_smart', 'other') then
    raise exception 'Invalid case type';
  end if;
  if coalesce(cardinality(p_student_ids), 0) = 0 then
    raise exception 'At least one active student is required';
  end if;
  if coalesce(cardinality(p_caretaker_ids), 0) = 0 then
    raise exception 'At least one caretaker is required';
  end if;
  if exists (
    select 1
    from unnest(p_student_ids) ids(id)
    left join public.students s on s.id = ids.id
    where s.id is null or s.deactivated_at is not null
  ) then
    raise exception 'Student is inactive or does not exist';
  end if;
  if exists (
    select 1
    from unnest(p_caretaker_ids) ids(id)
    left join public.caretakers c on c.id = ids.id
    where c.id is null or c.deactivated_at is not null or c.role <> 'caretaker'
  ) then
    raise exception 'Assigned caretaker is inactive, invalid, or does not exist';
  end if;

  update public.cases
  set case_type = p_case_type,
      other_text = case when p_case_type = 'other' then p_other_text else null end,
      details = p_details,
      scheduled_at = p_scheduled_at,
      updated_at = now()
  where id = p_case_id;
  if not found then
    raise exception 'Case not found';
  end if;

  delete from public.case_students where case_id = p_case_id;
  insert into public.case_students (case_id, student_id)
  select p_case_id, ids.id from unnest(p_student_ids) ids(id);

  delete from public.case_caretakers where case_id = p_case_id;
  insert into public.case_caretakers (case_id, caretaker_id)
  select p_case_id, ids.id from unnest(p_caretaker_ids) ids(id);
end;
$$;

revoke all on function public.admin_update_case_with_relations(uuid, text, text, text, timestamptz, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_update_case_with_relations(uuid, text, text, text, timestamptz, uuid[], uuid[]) to authenticated;
