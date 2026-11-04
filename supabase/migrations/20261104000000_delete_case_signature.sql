drop policy if exists case_signatures_delete_authorized on public.case_signatures;
create policy case_signatures_delete_authorized on public.case_signatures
  for delete to authenticated
  using (
    public.app_caretaker_role() in ('admin', 'caretaker')
    and (
      public.app_is_admin()
      or public.app_is_case_caretaker(case_id, auth.uid())
    )
  );

grant delete on public.case_signatures to authenticated;
