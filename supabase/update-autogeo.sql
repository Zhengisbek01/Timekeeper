-- Timekeeper: автоматическая отметка по геолокации (без QR).
--  • приложение открыто на объекте → приход ставится сам (p_event = 'auto');
--  • iPhone «Команды»: «Прибытие» / «Уход» → запрос с личным ключом (geo_token_mark) — без открытия приложения.
-- Выполнять ПОСЛЕ update-consents-geo.sql. Supabase → SQL Editor → Run. Повторный запуск безопасен.

-- ---------- Общая логика отметки ----------
-- p_event: 'in' | 'out' | 'auto' | null (null — чередование)
-- 'auto': ставит приход, только если работник ещё не на работе, сейчас рабочее окно
--         (за 2 часа до начала смены и до её конца) и он не ушёл домой / не ушёл только что.
create or replace function public._geo_mark(p_uid uuid, p_lat double precision, p_lng double precision,
                                            p_acc double precision, p_event text, p_via text)
returns json language plpgsql security definer set search_path = public as $$
declare
  e public.employees;
  v_acc double precision := coalesce(p_acc, 0);
  near_id uuid; near_name text; near_d double precision; near_r int;
  last_ev public.attendance_events;
  has_last boolean;
  new_kind text;
  rec public.attendance_events;
  v_local time := ((now() at time zone 'UTC') + interval '5 hours')::time;
begin
  if p_uid is null then raise exception 'NOT_AUTH'; end if;
  if p_event is not null and p_event not in ('in','out','auto') then raise exception 'BAD_EVENT'; end if;

  select * into e from public.employees where user_id = p_uid;
  if not found then raise exception 'NOT_EMPLOYEE'; end if;
  if e.status = 'pending' then raise exception 'NOT_APPROVED'; end if;
  if e.status = 'rejected' or not e.active then raise exception 'BLOCKED'; end if;
  if not exists (select 1 from public.consents where user_id = p_uid and kind = 'geo' and revoked_at is null) then
    raise exception 'NO_GEO_CONSENT';
  end if;

  if p_lat is null or p_lng is null then raise exception 'NO_LOCATION'; end if;
  if v_acc > 300 then raise exception 'WEAK_GPS %', round(v_acc); end if;

  select k.id, k.name, public._dist_m(p_lat, p_lng, k.lat, k.lng), k.radius_m
    into near_id, near_name, near_d, near_r
    from public.kiosks k where k.active and k.lat is not null and k.lng is not null
   order by public._dist_m(p_lat, p_lng, k.lat, k.lng) limit 1;
  if near_id is null then raise exception 'NO_GEOFENCE'; end if;
  -- погрешность GPS засчитываем, но не больше 50 м
  if near_d > near_r + least(v_acc, 50) then raise exception 'OUT_OF_ZONE %', round(near_d); end if;

  select * into last_ev from public.attendance_events
   where employee_id = e.id and ts > now() - interval '16 hours'
   order by ts desc limit 1;
  has_last := found;

  if has_last and last_ev.ts > now() - interval '60 seconds' then
    return json_build_object('status','duplicate','id',last_ev.id,'kind',last_ev.kind,'ts',last_ev.ts,'name',e.full_name,
                             'reason',last_ev.reason,'work_start',e.work_start,'work_end',e.work_end,'site',near_name);
  end if;

  -- «Прибытие», а приход уже есть; «Уход» без прихода; автоприход, когда работник уже на работе
  if ((p_event in ('in','auto')) and has_last and last_ev.kind = 'in')
     or (p_event = 'out' and (not has_last or last_ev.kind = 'out')) then
    return json_build_object('status','already','id',case when has_last then last_ev.id end,
                             'kind',case when p_event = 'auto' then 'in' else p_event end,
                             'ts',case when has_last then last_ev.ts end,'name',e.full_name,
                             'reason',case when has_last then last_ev.reason end,
                             'work_start',e.work_start,'work_end',e.work_end,'site',near_name);
  end if;

  if p_event = 'auto' then
    -- ушёл домой или вышел меньше 15 минут назад — сам не отмечаем
    if has_last and last_ev.kind = 'out' and (last_ev.reason = 'Ухожу домой' or last_ev.ts > now() - interval '15 minutes') then
      return json_build_object('status','skip','why','left','kind','out','ts',last_ev.ts,'name',e.full_name,
                               'reason',last_ev.reason,'site',near_name,'work_start',e.work_start,'work_end',e.work_end);
    end if;
    -- вне рабочего окна (за 2 часа до начала смены — до конца смены) сам не отмечаем
    if e.work_end > e.work_start
       and (extract(epoch from v_local) < extract(epoch from e.work_start) - 7200
            or v_local > e.work_end) then
      return json_build_object('status','skip','why','off_hours','name',e.full_name,'site',near_name,
                               'work_start',e.work_start,'work_end',e.work_end);
    end if;
  end if;

  new_kind := case when p_event = 'auto' then 'in'
                   else coalesce(p_event, case when has_last and last_ev.kind = 'in' then 'out' else 'in' end) end;

  insert into public.attendance_events (employee_id, kind, kiosk_id, source, note)
  values (e.id, new_kind, near_id, 'geo',
          format('%s · %s · %s м', case when p_via = 'token' then 'Автоотметка' else 'Геолокация' end, near_name, round(near_d)))
  returning * into rec;

  return json_build_object('status','ok','id',rec.id,'kind',rec.kind,'ts',rec.ts,'name',e.full_name,
                           'work_start', e.work_start, 'work_end', e.work_end,
                           'distance', round(near_d), 'site', near_name);
end $$;
revoke all on function public._geo_mark(uuid, double precision, double precision, double precision, text, text) from public, anon, authenticated;

-- из приложения (вход по логину)
create or replace function public.geo_check_in(p_lat double precision, p_lng double precision, p_acc double precision,
                                               p_event text default null)
returns json language sql security definer set search_path = public as $$
  select public._geo_mark(auth.uid(), p_lat, p_lng, p_acc, p_event, 'app');
$$;
revoke all on function public.geo_check_in(double precision, double precision, double precision, text) from public, anon;
grant execute on function public.geo_check_in(double precision, double precision, double precision, text) to authenticated;

-- ---------- Личный ключ для автоотметки (iPhone «Команды») ----------
-- В базе хранится только хеш ключа. Новый ключ заменяет старый.
create table if not exists public.geo_tokens (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.geo_tokens enable row level security;
drop policy if exists geo_tokens_own on public.geo_tokens;
create policy geo_tokens_own on public.geo_tokens for select to authenticated using (user_id = auth.uid());

create or replace function public.geo_token_create()
returns text language plpgsql security definer set search_path = public as $$
declare t text := 'tk_' || encode(extensions.gen_random_bytes(18), 'hex');
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if not exists (select 1 from public.consents where user_id = auth.uid() and kind = 'geo' and revoked_at is null) then
    raise exception 'NO_GEO_CONSENT';
  end if;
  insert into public.geo_tokens (user_id, token_hash) values (auth.uid(), encode(extensions.digest(t, 'sha256'), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return t;
end $$;
revoke all on function public.geo_token_create() from public, anon;
grant execute on function public.geo_token_create() to authenticated;

create or replace function public.geo_token_revoke()
returns void language sql security definer set search_path = public as $$
  delete from public.geo_tokens where user_id = auth.uid();
$$;
revoke all on function public.geo_token_revoke() from public, anon;
grant execute on function public.geo_token_revoke() to authenticated;

-- вызывается из «Команд» без входа в систему: ключ + координаты телефона
create or replace function public.geo_token_mark(p_token text, p_lat double precision, p_lng double precision,
                                                 p_event text default 'in')
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from public.geo_tokens
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if uid is null then raise exception 'BAD_TOKEN'; end if;
  update public.geo_tokens set last_used_at = now() where user_id = uid;
  return public._geo_mark(uid, p_lat, p_lng, 0, coalesce(p_event, 'in'), 'token');
end $$;
revoke all on function public.geo_token_mark(text, double precision, double precision, text) from public;
grant execute on function public.geo_token_mark(text, double precision, double precision, text) to anon, authenticated;

-- отзыв согласия на геолокацию удаляет и ключ автоотметки
create or replace function public.revoke_consent(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  update public.consents set revoked_at = now()
   where user_id = auth.uid() and kind = p_kind and revoked_at is null;
  if p_kind = 'biometric' and to_regclass('public.passkeys') is not null then
    execute 'delete from public.passkeys where user_id = $1' using auth.uid();
  end if;
  if p_kind = 'geo' then delete from public.geo_tokens where user_id = auth.uid(); end if;
end $$;
revoke all on function public.revoke_consent(text) from public, anon;
grant execute on function public.revoke_consent(text) to authenticated;

notify pgrst, 'reload schema';
