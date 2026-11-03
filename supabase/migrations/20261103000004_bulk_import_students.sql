create or replace function public.admin_import_students(
  p_academic_year text,
  p_students jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  if p_academic_year is null or p_academic_year !~ '^[0-9]{4}$' then
    raise exception 'Academic year must be four digits';
  end if;
  if jsonb_typeof(p_students) is distinct from 'array'
     or jsonb_array_length(p_students) < 1
     or jsonb_array_length(p_students) > 2000 then
    raise exception 'Student import must contain 1 to 2000 rows';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_students) as rows(item)
    where jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item -> 'student_id') is distinct from 'string'
       or nullif(trim(item ->> 'student_id'), '') is null
       or length(item ->> 'student_id') > 100
       or jsonb_typeof(item -> 'first_name_th') is distinct from 'string'
       or nullif(trim(item ->> 'first_name_th'), '') is null
       or length(item ->> 'first_name_th') > 200
       or jsonb_typeof(item -> 'last_name_th') is distinct from 'string'
       or nullif(trim(item ->> 'last_name_th'), '') is null
       or length(item ->> 'last_name_th') > 200
       or jsonb_typeof(item -> 'grade') is distinct from 'string'
       or nullif(trim(item ->> 'grade'), '') is null
       or length(item ->> 'grade') > 100
       or coalesce(item ->> 'room', '') !~ '^[0-9]{1,3}$'
       or case
            when coalesce(item ->> 'room', '') ~ '^[0-9]{1,3}$'
              then (item ->> 'room')::integer < 1
            else false
          end
       or (
         item ? 'nickname_th'
         and jsonb_typeof(item -> 'nickname_th') not in ('string', 'null')
       )
       or length(coalesce(item ->> 'nickname_th', '')) > 200
       or (
         item ? 'gender'
         and jsonb_typeof(item -> 'gender') not in ('string', 'null')
       )
       or length(coalesce(item ->> 'gender', '')) > 30
  ) then
    raise exception 'Student import contains invalid rows';
  end if;

  insert into public.students (
    id,
    student_id,
    first_name_th,
    last_name_th,
    nickname_th,
    grade,
    room,
    gender,
    academic_year
  )
  select
    extensions.gen_random_uuid(),
    trim(rows.student_id),
    trim(rows.first_name_th),
    trim(rows.last_name_th),
    nullif(trim(rows.nickname_th), ''),
    trim(rows.grade),
    rows.room::integer,
    nullif(trim(rows.gender), ''),
    p_academic_year
  from jsonb_to_recordset(p_students) as rows(
    student_id text,
    first_name_th text,
    last_name_th text,
    nickname_th text,
    grade text,
    room text,
    gender text
  )
  on conflict (student_id, academic_year) where student_id is not null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.admin_import_students(text, jsonb) from public, anon;
grant execute on function public.admin_import_students(text, jsonb) to authenticated;
