alter table public.app_usage_logs
  add column if not exists details text;

alter table public.app_usage_logs
  drop constraint if exists app_usage_logs_details_length_check,
  add constraint app_usage_logs_details_length_check
    check (details is null or char_length(details) <= 500);
