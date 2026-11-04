do $$
declare
  v_old_name text;
  v_new_name text;
  v_old_names text[] := array[
    'app_usage_logs',
    'caretaker_credentials',
    'caretakers',
    'case_caretakers',
    'case_signatures',
    'case_students',
    'case_updates',
    'cases',
    'students'
  ];
  v_new_names text[] := array[
    'itpc_takecare_app_usage_logs',
    'itpc_takecare_caretaker_credentials',
    'itpc_takecare_caretakers',
    'itpc_takecare_case_caretakers',
    'itpc_takecare_case_signatures',
    'itpc_takecare_case_students',
    'itpc_takecare_case_updates',
    'itpc_takecare_cases',
    'itpc_takecare_students'
  ];
  v_index integer;
begin
  for v_index in 1..array_length(v_old_names, 1) loop
    v_old_name := v_old_names[v_index];
    v_new_name := v_new_names[v_index];

    if to_regclass(format('public.%I', v_old_name)) is not null then
      if to_regclass(format('public.%I', v_new_name)) is not null then
        raise exception 'Both public.% and public.% exist; refusing to merge tables', v_old_name, v_new_name;
      end if;
      execute format('alter table public.%I rename to %I', v_old_name, v_new_name);
    end if;
  end loop;
end;
$$;

do $$
declare
  v_function_oid oid;
  v_definition text;
  v_old_names text[] := array[
    'app_usage_logs',
    'caretaker_credentials',
    'caretakers',
    'case_caretakers',
    'case_signatures',
    'case_students',
    'case_updates',
    'cases',
    'students'
  ];
  v_new_names text[] := array[
    'itpc_takecare_app_usage_logs',
    'itpc_takecare_caretaker_credentials',
    'itpc_takecare_caretakers',
    'itpc_takecare_case_caretakers',
    'itpc_takecare_case_signatures',
    'itpc_takecare_case_students',
    'itpc_takecare_case_updates',
    'itpc_takecare_cases',
    'itpc_takecare_students'
  ];
  v_index integer;
begin
  for v_function_oid in
    select p.oid
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and exists (
        select 1
        from generate_subscripts(v_old_names, 1) as names(index)
        where position(format('public.%I', v_old_names[names.index]) in pg_get_functiondef(p.oid)) > 0
      )
  loop
    v_definition := pg_get_functiondef(v_function_oid);
    for v_index in 1..array_length(v_old_names, 1) loop
      v_definition := replace(
        v_definition,
        format('public.%I', v_old_names[v_index]),
        format('public.%I', v_new_names[v_index])
      );
    end loop;
    v_definition := replace(v_definition, 'returning caretakers.', 'returning itpc_takecare_caretakers.');
    execute v_definition;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
