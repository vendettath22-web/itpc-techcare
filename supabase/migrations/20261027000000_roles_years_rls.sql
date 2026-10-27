create extension if not exists pgcrypto with schema extensions;

alter table public.caretakers
  add column if not exists role text not null default 'caretaker',
  add column if not exists deactivated_at timestamptz;

alter table public.students
  add column if not exists academic_year text not null default '2569',
  add column if not exists deactivated_at timestamptz;

update public.caretakers
set role = 'caretaker'
where role is null or role not in ('admin', 'caretaker');

update public.caretakers
set pin_hash = extensions.crypt(pin_hash, extensions.gen_salt('bf'))
where pin_hash !~ '^\$2[aby]\$';

alter table public.caretakers
  drop constraint if exists caretakers_role_check;
alter table public.caretakers
  add constraint caretakers_role_check check (role in ('admin', 'caretaker'));

alter table public.students
  alter column academic_year set not null,
  alter column academic_year set default '2569';

create unique index if not exists students_student_id_academic_year_key
  on public.students (student_id, academic_year)
  where student_id is not null;

create or replace function public.app_caretaker_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.role
  from public.caretakers c
  where c.id = auth.uid()
    and c.deactivated_at is null
  limit 1;
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_caretaker_role() = 'admin', false);
$$;

create or replace function public.app_is_case_caretaker(p_case_id uuid, p_caretaker_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.case_caretakers cc
    where cc.case_id = p_case_id
      and cc.caretaker_id = p_caretaker_id
  );
$$;

create or replace function public.app_is_active_caretaker(p_caretaker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.caretakers c
    where c.id = p_caretaker_id and c.deactivated_at is null
  );
$$;

create or replace function public.app_is_active_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and s.deactivated_at is null
  );
$$;

revoke all on function public.app_caretaker_role() from public;
revoke all on function public.app_is_admin() from public;
revoke all on function public.app_is_case_caretaker(uuid, uuid) from public;
revoke all on function public.app_is_active_caretaker(uuid) from public;
revoke all on function public.app_is_active_student(uuid) from public;
grant execute on function public.app_caretaker_role() to authenticated;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.app_is_case_caretaker(uuid, uuid) to authenticated;
grant execute on function public.app_is_active_caretaker(uuid) to authenticated;
grant execute on function public.app_is_active_student(uuid) to authenticated;

alter table public.caretakers enable row level security;
alter table public.students enable row level security;
alter table public.cases enable row level security;
alter table public.case_students enable row level security;
alter table public.case_caretakers enable row level security;
alter table public.case_updates enable row level security;
alter table public.case_signatures enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'caretakers', 'students', 'cases', 'case_students',
        'case_caretakers', 'case_updates', 'case_signatures'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end;
$$;

drop policy if exists caretakers_read_authorized on public.caretakers;
create policy caretakers_read_authorized on public.caretakers
  for select to authenticated
  using (public.app_caretaker_role() in ('admin', 'caretaker')
    and (public.app_is_admin() or deactivated_at is null));

drop policy if exists caretakers_update_own_name on public.caretakers;
create policy caretakers_update_own_name on public.caretakers
  for update to authenticated
  using (id = auth.uid() and deactivated_at is null)
  with check (id = auth.uid() and deactivated_at is null);

drop policy if exists students_read_active on public.students;
create policy students_read_active on public.students
  for select to authenticated
  using (deactivated_at is null and public.app_caretaker_role() in ('admin', 'caretaker'));

drop policy if exists cases_read_authorized on public.cases;
create policy cases_read_authorized on public.cases
  for select to authenticated
  using (public.app_caretaker_role() in ('admin', 'caretaker'));

drop policy if exists cases_update_assigned on public.cases;
create policy cases_update_assigned on public.cases
  for update to authenticated
  using (
    public.app_is_admin()
    or public.app_is_case_caretaker(id, auth.uid())
  )
  with check (
    public.app_is_admin()
    or public.app_is_case_caretaker(id, auth.uid())
  );

drop policy if exists case_students_read_authorized on public.case_students;
create policy case_students_read_authorized on public.case_students
  for select to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and public.app_is_active_student(student_id)
  );

drop policy if exists case_caretakers_read_authorized on public.case_caretakers;
create policy case_caretakers_read_authorized on public.case_caretakers
  for select to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and public.app_is_active_caretaker(caretaker_id)
  );

drop policy if exists case_updates_read_authorized on public.case_updates;
create policy case_updates_read_authorized on public.case_updates
  for select to authenticated
  using (public.app_caretaker_role() in ('admin', 'caretaker'));

drop policy if exists case_updates_insert_assigned on public.case_updates;
create policy case_updates_insert_assigned on public.case_updates
  for insert to authenticated
  with check (
    caretaker_id = auth.uid()
    and public.app_is_case_caretaker(case_id, auth.uid())
  );

drop policy if exists case_signatures_read_authorized on public.case_signatures;
create policy case_signatures_read_authorized on public.case_signatures
  for select to authenticated
  using (public.app_caretaker_role() in ('admin', 'caretaker'));

drop policy if exists case_signatures_insert_authorized on public.case_signatures;
create policy case_signatures_insert_authorized on public.case_signatures
  for insert to authenticated
  with check (public.app_caretaker_role() in ('admin', 'caretaker'));

revoke all on public.caretakers from anon, authenticated;
grant select (id, name, role, created_at, deactivated_at) on public.caretakers to authenticated;
grant update (name) on public.caretakers to authenticated;

revoke all on public.students from anon, authenticated;
grant select on public.students to authenticated;

revoke all on public.cases from anon, authenticated;
grant select, update (status, updated_at) on public.cases to authenticated;

revoke all on public.case_students from anon, authenticated;
grant select on public.case_students to authenticated;

revoke all on public.case_caretakers from anon, authenticated;
grant select on public.case_caretakers to authenticated;

revoke all on public.case_updates from anon, authenticated;
grant select, insert on public.case_updates to authenticated;

revoke all on public.case_signatures from anon, authenticated;
grant select, insert on public.case_signatures to authenticated;

create or replace function public.verify_caretaker_pin(p_pin text)
returns table (id uuid, name text, role text)
language sql
security definer
set search_path = public, extensions
as $$
  select c.id, c.name, c.role
  from public.caretakers c
  where c.deactivated_at is null
    and c.pin_hash = extensions.crypt(p_pin, c.pin_hash);
$$;

revoke all on function public.verify_caretaker_pin(text) from public;
grant execute on function public.verify_caretaker_pin(text) to anon, authenticated;

create or replace function public.admin_create_caretaker(p_name text, p_pin text, p_role text)
returns table (id uuid, name text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Caretaker name is required';
  end if;
  if p_role not in ('admin', 'caretaker') then
    raise exception 'Invalid role';
  end if;
  if p_pin !~ '^[0-9]{4,12}$' then
    raise exception 'PIN must contain 4 to 12 digits';
  end if;
  perform pg_advisory_xact_lock(hashtext('itpctakecare-active-pin'));
  if exists (
    select 1 from public.caretakers c
    where c.deactivated_at is null
      and c.pin_hash = extensions.crypt(p_pin, c.pin_hash)
  ) then
    raise exception 'PIN is already assigned to an active account';
  end if;

  return query
  insert into public.caretakers (name, pin_hash, role)
  values (trim(p_name), extensions.crypt(p_pin, extensions.gen_salt('bf')), p_role)
  returning caretakers.id, caretakers.name, caretakers.role;
end;
$$;

create or replace function public.admin_update_caretaker(p_id uuid, p_name text, p_role text, p_pin text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  perform pg_advisory_xact_lock(hashtext('itpctakecare-admin-role'));
  if nullif(trim(p_name), '') is null then
    raise exception 'Caretaker name is required';
  end if;
  if p_role not in ('admin', 'caretaker') then
    raise exception 'Invalid role';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,12}$' then
    raise exception 'PIN must contain 4 to 12 digits';
  end if;
  if p_pin is not null then
    perform pg_advisory_xact_lock(hashtext('itpctakecare-active-pin'));
  end if;
  if p_pin is not null and exists (
    select 1 from public.caretakers c
    where c.id <> p_id
      and c.deactivated_at is null
      and c.pin_hash = extensions.crypt(p_pin, c.pin_hash)
  ) then
    raise exception 'PIN is already assigned to an active account';
  end if;
  if p_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Cannot remove your own admin role';
  end if;
  if p_role <> 'admin'
     and exists (select 1 from public.caretakers c where c.id = p_id and c.role = 'admin' and c.deactivated_at is null)
     and (select count(*) from public.caretakers c where c.role = 'admin' and c.deactivated_at is null) <= 1 then
    raise exception 'Cannot remove the last active admin';
  end if;

  update public.caretakers c
  set name = trim(p_name),
      role = p_role,
      pin_hash = case when p_pin is null then c.pin_hash else extensions.crypt(p_pin, extensions.gen_salt('bf')) end
  where c.id = p_id;
  if not found then
    raise exception 'Caretaker not found';
  end if;
end;
$$;

create or replace function public.admin_deactivate_caretaker(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  perform pg_advisory_xact_lock(hashtext('itpctakecare-admin-role'));
  if p_id = auth.uid() then
    raise exception 'Cannot deactivate your own account';
  end if;
  if exists (select 1 from public.caretakers c where c.id = p_id and c.role = 'admin' and c.deactivated_at is null)
     and (select count(*) from public.caretakers c where c.role = 'admin' and c.deactivated_at is null) <= 1 then
    raise exception 'Cannot deactivate the last active admin';
  end if;
  update public.caretakers set deactivated_at = now()
  where id = p_id and deactivated_at is null;
end;
$$;

create or replace function public.admin_create_student(
  p_student_id text,
  p_first_name_th text,
  p_last_name_th text,
  p_nickname_th text,
  p_grade text,
  p_room integer,
  p_gender text,
  p_academic_year text
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
  if p_academic_year !~ '^[0-9]{4}$' then
    raise exception 'Academic year must be four digits';
  end if;
  if p_room is not null and p_room < 1 then
    raise exception 'Room must be a positive number';
  end if;

  insert into public.students (
    student_id, first_name_th, last_name_th, nickname_th, grade, room, gender, academic_year
  )
  values (
    nullif(trim(p_student_id), ''),
    nullif(trim(p_first_name_th), ''),
    nullif(trim(p_last_name_th), ''),
    nullif(trim(p_nickname_th), ''),
    nullif(trim(p_grade), ''),
    p_room,
    nullif(trim(p_gender), ''),
    p_academic_year
  )
  returning id into v_student_id;
  return v_student_id;
end;
$$;

create or replace function public.admin_deactivate_student(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin role required';
  end if;
  update public.students set deactivated_at = now()
  where id = p_id and deactivated_at is null;
end;
$$;

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
begin
  if public.app_caretaker_role() not in ('admin', 'caretaker')
     or auth.uid() is distinct from p_created_by then
    raise exception 'Authenticated caretaker required';
  end if;
  if p_case_type not in ('low_confidence', 'feel_not_smart', 'other') then
    raise exception 'Invalid case type';
  end if;
  if coalesce(cardinality(p_student_ids), 0) = 0 then
    raise exception 'At least one active student is required';
  end if;
  if coalesce(cardinality(p_caretaker_ids), 0) = 0
     or not coalesce(auth.uid() = any(p_caretaker_ids), false) then
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
    where c.id is null or c.deactivated_at is not null
  ) then
    raise exception 'Caretaker is inactive or does not exist';
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

revoke all on function public.admin_create_caretaker(text, text, text) from public, anon;
revoke all on function public.admin_update_caretaker(uuid, text, text, text) from public, anon;
revoke all on function public.admin_deactivate_caretaker(uuid) from public, anon;
revoke all on function public.admin_create_student(text, text, text, text, text, integer, text, text) from public, anon;
revoke all on function public.admin_deactivate_student(uuid) from public, anon;
revoke all on function public.create_case_with_relations(text, text, text, timestamptz, uuid, uuid[], uuid[]) from public, anon;

grant execute on function public.admin_create_caretaker(text, text, text) to authenticated;
grant execute on function public.admin_update_caretaker(uuid, text, text, text) to authenticated;
grant execute on function public.admin_deactivate_caretaker(uuid) to authenticated;
grant execute on function public.admin_create_student(text, text, text, text, text, integer, text, text) to authenticated;
grant execute on function public.admin_deactivate_student(uuid) to authenticated;
grant execute on function public.create_case_with_relations(text, text, text, timestamptz, uuid, uuid[], uuid[]) to authenticated;
