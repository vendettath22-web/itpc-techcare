create table if not exists public.app_usage_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  caretaker_id uuid references public.caretakers(id) on delete set null,
  caretaker_name text not null,
  used_at timestamptz not null default now()
);

create index if not exists app_usage_logs_used_at_idx
  on public.app_usage_logs (used_at desc);
create index if not exists app_usage_logs_caretaker_id_idx
  on public.app_usage_logs (caretaker_id);

alter table public.app_usage_logs enable row level security;

revoke all on public.app_usage_logs from public, anon;
grant insert, select on public.app_usage_logs to authenticated;

drop policy if exists app_usage_logs_insert_own on public.app_usage_logs;
create policy app_usage_logs_insert_own on public.app_usage_logs
  for insert to authenticated
  with check (
    caretaker_id = auth.uid()
    and public.app_is_active_caretaker(caretaker_id)
  );

drop policy if exists app_usage_logs_select_admin on public.app_usage_logs;
create policy app_usage_logs_select_admin on public.app_usage_logs
  for select to authenticated
  using (public.app_is_admin());
