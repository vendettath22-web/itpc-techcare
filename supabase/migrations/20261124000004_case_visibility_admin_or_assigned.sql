drop policy if exists cases_read_authorized on public.itpc_takecare_cases;
create policy cases_read_authorized on public.itpc_takecare_cases
  for select to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and (
      public.app_is_admin()
      or public.app_is_case_caretaker(id, auth.uid())
    )
  );

drop policy if exists case_students_read_authorized on public.itpc_takecare_case_students;
create policy case_students_read_authorized on public.itpc_takecare_case_students
  for select to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and (
      public.app_is_admin()
      or public.app_is_case_caretaker(case_id, auth.uid())
    )
  );

drop policy if exists case_caretakers_read_authorized on public.itpc_takecare_case_caretakers;
create policy case_caretakers_read_authorized on public.itpc_takecare_case_caretakers
  for select to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and (
      public.app_is_admin()
      or public.app_is_case_caretaker(case_id, auth.uid())
    )
  );

drop policy if exists case_updates_read_authorized on public.itpc_takecare_case_updates;
create policy case_updates_read_authorized on public.itpc_takecare_case_updates
  for select to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and (
      public.app_is_admin()
      or public.app_is_case_caretaker(case_id, auth.uid())
    )
  );

drop policy if exists case_signatures_read_authorized on public.itpc_takecare_case_signatures;
create policy case_signatures_read_authorized on public.itpc_takecare_case_signatures
  for select to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and (
      public.app_is_admin()
      or public.app_is_case_caretaker(case_id, auth.uid())
    )
  );

drop policy if exists case_signatures_insert_authorized on public.itpc_takecare_case_signatures;
create policy case_signatures_insert_authorized on public.itpc_takecare_case_signatures
  for insert to authenticated
  with check (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and (
      public.app_is_admin()
      or public.app_is_case_caretaker(case_id, auth.uid())
    )
  );

notify pgrst, 'reload schema';
