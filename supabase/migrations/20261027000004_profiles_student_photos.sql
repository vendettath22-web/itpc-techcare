alter table public.students
  add column if not exists profile_image_path text;

grant update (name, phone, age, profile_image_path) on public.caretakers to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists caretaker_photos_read_admin on storage.objects;
drop policy if exists caretaker_photos_insert_admin on storage.objects;
drop policy if exists caretaker_photos_update_admin on storage.objects;
drop policy if exists caretaker_photos_delete_admin on storage.objects;
drop policy if exists caretaker_photos_read_authorized on storage.objects;
drop policy if exists caretaker_photos_insert_authorized on storage.objects;
drop policy if exists caretaker_photos_update_authorized on storage.objects;
drop policy if exists caretaker_photos_delete_authorized on storage.objects;

create policy caretaker_photos_read_authorized on storage.objects
  for select to authenticated
  using (
    bucket_id = 'caretaker-photos'
    and (public.app_is_admin() or name = auth.uid()::text || '/profile')
  );
create policy caretaker_photos_insert_authorized on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'caretaker-photos'
    and (public.app_is_admin() or name = auth.uid()::text || '/profile')
  );
create policy caretaker_photos_update_authorized on storage.objects
  for update to authenticated
  using (
    bucket_id = 'caretaker-photos'
    and (public.app_is_admin() or name = auth.uid()::text || '/profile')
  )
  with check (
    bucket_id = 'caretaker-photos'
    and (public.app_is_admin() or name = auth.uid()::text || '/profile')
  );
create policy caretaker_photos_delete_authorized on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'caretaker-photos'
    and (public.app_is_admin() or name = auth.uid()::text || '/profile')
  );

drop policy if exists student_photos_read_authorized on storage.objects;
create policy student_photos_read_authorized on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos' and public.app_caretaker_role() in ('admin', 'caretaker'));
drop policy if exists student_photos_insert_admin on storage.objects;
create policy student_photos_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-photos' and public.app_is_admin());
drop policy if exists student_photos_update_admin on storage.objects;
create policy student_photos_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'student-photos' and public.app_is_admin())
  with check (bucket_id = 'student-photos' and public.app_is_admin());
drop policy if exists student_photos_delete_admin on storage.objects;
create policy student_photos_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-photos' and public.app_is_admin());

drop function if exists public.admin_create_student(text, text, text, text, text, integer, text, text);
create function public.admin_create_student(
  p_id uuid,
  p_student_id text,
  p_first_name_th text,
  p_last_name_th text,
  p_nickname_th text,
  p_grade text,
  p_room integer,
  p_gender text,
  p_academic_year text,
  p_profile_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  if p_profile_image_path is not null
     and p_profile_image_path <> p_id::text || '/profile' then
    raise exception 'Invalid student image path';
  end if;

  insert into public.students (
    id, student_id, first_name_th, last_name_th, nickname_th, grade, room, gender,
    academic_year, profile_image_path
  )
  values (
    p_id,
    nullif(trim(p_student_id), ''),
    nullif(trim(p_first_name_th), ''),
    nullif(trim(p_last_name_th), ''),
    nullif(trim(p_nickname_th), ''),
    nullif(trim(p_grade), ''),
    p_room,
    nullif(trim(p_gender), ''),
    p_academic_year,
    p_profile_image_path
  );
  return p_id;
end;
$$;

revoke all on function public.admin_create_student(uuid, text, text, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.admin_create_student(uuid, text, text, text, text, text, integer, text, text, text) to authenticated;
