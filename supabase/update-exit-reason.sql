-- Timekeeper: причина выхода в рабочее время.
-- Выполнить один раз: Supabase → SQL Editor → вставить → Run. Повторный запуск безопасен.

alter table public.attendance_events add column if not exists reason text;

-- отметка по QR: теперь возвращает id события (чтобы работник указал причину выхода)
create or replace function public.check_in(p_kiosk uuid, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare
  e public.employees;
  k public.kiosks;
  last_ev public.attendance_events;
  has_last boolean;
  w bigint;
  ok boolean := false;
  i int;
  new_kind text;
  rec public.attendance_events;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;

  select * into e from public.employees where user_id = auth.uid();
  if not found then raise exception 'NOT_EMPLOYEE'; end if;
  if e.status = 'pending' then raise exception 'NOT_APPROVED'; end if;
  if e.status = 'rejected' or not e.active then raise exception 'BLOCKED'; end if;

  select * into k from public.kiosks where id = p_kiosk and active;
  if not found then raise exception 'KIOSK_INVALID'; end if;

  -- текущее и 3 предыдущих окна (до ~2 минут на вход в аккаунт)
  w := floor(extract(epoch from now()) / 30);
  for i in 0..3 loop
    if public._kiosk_token(k.id, k.secret, w - i) = p_token then ok := true; end if;
  end loop;
  if not ok then raise exception 'TOKEN_EXPIRED'; end if;

  -- последнее событие за 16 часов (поддержка ночных смен)
  select * into last_ev from public.attendance_events
   where employee_id = e.id and ts > now() - interval '16 hours'
   order by ts desc limit 1;
  has_last := found;

  if has_last and last_ev.ts > now() - interval '60 seconds' then
    return json_build_object('status','duplicate','id',last_ev.id,'kind',last_ev.kind,'ts',last_ev.ts,'name',e.full_name,
                             'reason',last_ev.reason,'work_start',e.work_start,'work_end',e.work_end);
  end if;

  new_kind := case when has_last and last_ev.kind = 'in' then 'out' else 'in' end;

  insert into public.attendance_events (employee_id, kind, kiosk_id, source)
  values (e.id, new_kind, k.id, 'qr')
  returning * into rec;

  return json_build_object('status','ok','id',rec.id,'kind',rec.kind,'ts',rec.ts,'name',e.full_name,
                           'work_start', e.work_start, 'work_end', e.work_end);
end $$;
revoke execute on function public.check_in(uuid, text) from public, anon;
grant execute on function public.check_in(uuid, text) to authenticated;

-- работник указывает причину своего выхода (в течение 3 часов после отметки)
create or replace function public.set_exit_reason(p_event bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  select id into eid from public.employees where user_id = auth.uid();
  if eid is null then raise exception 'NOT_EMPLOYEE'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'REASON_EMPTY'; end if;
  update public.attendance_events set reason = left(trim(p_reason), 200)
   where id = p_event and employee_id = eid and kind = 'out' and ts > now() - interval '3 hours';
  if not found then raise exception 'REASON_LATE'; end if;
end $$;
revoke execute on function public.set_exit_reason(bigint, text) from public, anon;
grant execute on function public.set_exit_reason(bigint, text) to authenticated;
