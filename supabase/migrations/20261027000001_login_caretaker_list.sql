create or replace function public.list_login_caretakers()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name
  from public.caretakers c
  where c.deactivated_at is null
  order by c.name;
$$;

revoke all on function public.list_login_caretakers() from public;
grant execute on function public.list_login_caretakers() to anon, authenticated;
