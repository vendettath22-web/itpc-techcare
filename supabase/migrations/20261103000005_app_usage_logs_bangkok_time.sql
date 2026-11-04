alter table public.app_usage_logs
  alter column used_at type timestamp without time zone
    using used_at at time zone 'Asia/Bangkok',
  alter column used_at set default timezone('Asia/Bangkok', now());
