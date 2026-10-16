-- Timekeeper: сброс пароля силами HR (работнику и планшету-киоску).
-- Выполнить один раз: Supabase → SQL Editor → вставить → Run. Повторный запуск безопасен.

-- HR задаёт работнику временный пароль (если письмо не дошло или почты нет)
create or replace function public.admin_set_password(p_employee uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'WEAK_PASSWORD'; end if;
  select user_id into uid from public.employees where id = p_employee;
  if uid is null then raise exception 'NO_ACCOUNT'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = uid;
end $$;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

-- HR задаёт новый пароль киоска (планшет забыл пароль / вышли из учётной записи)
create or replace function public.kiosk_set_password(p_kiosk uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; lg text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'WEAK_PASSWORD'; end if;
  select user_id, login into uid, lg from public.kiosks where id = p_kiosk;
  if lg is null then raise exception 'KIOSK_INVALID'; end if;
  if uid is null then  -- после «Сбросить» связь снята, ищем служебную учётку по логину
    select id into uid from auth.users where email like 'kiosk.' || lg || '@%' limit 1;
  end if;
  if uid is null then raise exception 'KIOSK_NOT_ACTIVATED'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = uid;
end $$;
revoke all on function public.kiosk_set_password(uuid, text) from public, anon;
grant execute on function public.kiosk_set_password(uuid, text) to authenticated;
