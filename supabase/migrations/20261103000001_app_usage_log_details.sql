alter table public.app_usage_logs
  add column if not exists caretaker_role text,
  add column if not exists action text;

update public.app_usage_logs as usage_log
set caretaker_role = case
      when caretaker.role in ('admin', 'caretaker') then caretaker.role
      else 'caretaker'
    end
from public.caretakers as caretaker
where usage_log.caretaker_id = caretaker.id
  and usage_log.caretaker_role is null;

update public.app_usage_logs
set caretaker_role = coalesce(caretaker_role, 'caretaker'),
    action = coalesce(nullif(action, ''), 'login');

alter table public.app_usage_logs
  alter column caretaker_role set not null,
  alter column action set default 'login',
  alter column action set not null;

alter table public.app_usage_logs
  drop constraint if exists app_usage_logs_caretaker_role_check,
  add constraint app_usage_logs_caretaker_role_check
    check (caretaker_role in ('admin', 'caretaker')),
  drop constraint if exists app_usage_logs_action_check,
  add constraint app_usage_logs_action_check
    check (char_length(action) between 1 and 64);

drop policy if exists app_usage_logs_insert_own on public.app_usage_logs;
create policy app_usage_logs_insert_own on public.app_usage_logs
  for insert to authenticated
  with check (
    caretaker_id = auth.uid()
    and caretaker_role = public.app_caretaker_role()
    and public.app_is_active_caretaker(caretaker_id)
  );
