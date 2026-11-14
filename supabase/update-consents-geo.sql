-- Timekeeper: согласия + отметка по геолокации (БЕЗ Face ID).
-- Supabase → SQL Editor → вставить всё → Run. Повторный запуск безопасен.

-- ---------- Согласия ----------
create table if not exists public.consents (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  kind        text not null check (kind in ('terms','pd','biometric')),
  version     text not null,
  doc_hash    text,                         -- SHA-256 текста документа, с которым согласился
  accepted_at timestamptz not null default now(),
  revoked_at  timestamptz,
  ip          text,
  user_agent  text
);
create index if not exists consents_user_idx on public.consents (user_id, kind);
alter table public.consents enable row level security;
drop policy if exists consents_select on public.consents;
create policy consents_select on public.consents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public._client_ip()
returns text language plpgsql stable as $$
declare h json;
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  return split_part(coalesce(h->>'x-forwarded-for', h->>'x-real-ip', ''), ',', 1);
exception when others then return null;
end $$;

create or replace function public.accept_consent(p_kind text, p_version text, p_hash text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if p_kind not in ('terms','pd','biometric') then raise exception 'BAD_KIND'; end if;
  if exists (select 1 from public.consents where user_id = auth.uid() and kind = p_kind
               and version = p_version and revoked_at is null) then return; end if;
  select id into eid from public.employees where user_id = auth.uid();
  insert into public.consents (user_id, employee_id, kind, version, doc_hash, ip, user_agent)
  values (auth.uid(), eid, p_kind, p_version, p_hash, public._client_ip(), left(p_ua, 300));
end $$;
revoke all on function public.accept_consent(text, text, text, text) from public, anon;
grant execute on function public.accept_consent(text, text, text, text) to authenticated;

-- отзыв согласия на биометрию удаляет и ключи Face ID
create or replace function public.revoke_consent(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  update public.consents set revoked_at = now()
   where user_id = auth.uid() and kind = p_kind and revoked_at is null;
  if p_kind = 'biometric' and to_regclass('public.passkeys') is not null then
    execute 'delete from public.passkeys where user_id = $1' using auth.uid();
  end if;
end $$;

revoke all on function public.revoke_consent(text) from public, anon;
grant execute on function public.revoke_consent(text) to authenticated;

-- ---------- Геозона входа ----------
alter table public.kiosks add column if not exists lat double precision;
alter table public.kiosks add column if not exists lng double precision;
alter table public.kiosks add column if not exists radius_m int not null default 150;

-- источник отметки: qr / manual / face
do $$ begin
  alter table public.attendance_events drop constraint if exists attendance_events_source_check;
  alter table public.attendance_events add constraint attendance_events_source_check check (source in ('qr','manual','face','geo'));
end $$;

create or replace function public._dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- адрес объекта (для инструкции работникам; точка и радиус уже есть: lat, lng, radius_m)
alter table public.kiosks add column if not exists address text;

-- новый вид согласия: геолокация
do $$ begin
  alter table public.consents drop constraint if exists consents_kind_check;
  alter table public.consents add constraint consents_kind_check check (kind in ('terms','pd','biometric','geo'));
end $$;

create or replace function public.accept_consent(p_kind text, p_version text, p_hash text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if p_kind not in ('terms','pd','biometric','geo') then raise exception 'BAD_KIND'; end if;
  if exists (select 1 from public.consents where user_id = auth.uid() and kind = p_kind
               and version = p_version and revoked_at is null) then return; end if;
  select id into eid from public.employees where user_id = auth.uid();
  insert into public.consents (user_id, employee_id, kind, version, doc_hash, ip, user_agent)
  values (auth.uid(), eid, p_kind, p_version, p_hash, public._client_ip(), left(p_ua, 300));
end $$;

-- источник отметки: qr / manual / face / geo
do $$ begin
  alter table public.attendance_events drop constraint if exists attendance_events_source_check;
  alter table public.attendance_events add constraint attendance_events_source_check check (source in ('qr','manual','face','geo'));
end $$;

-- объекты с координатами — работнику для настройки телефона (без секретов киоска)
create or replace function public.geo_sites()
returns table (id uuid, name text, address text, lat double precision, lng double precision, radius_m int)
language sql stable security definer set search_path = public as $$
  select k.id, k.name, k.address, k.lat, k.lng, k.radius_m from public.kiosks k
   where k.active and k.lat is not null and k.lng is not null
     and exists (select 1 from public.employees e where e.user_id = auth.uid() and e.status = 'approved' and e.active)
   order by k.name;
$$;
revoke all on function public.geo_sites() from public, anon;
grant execute on function public.geo_sites() to authenticated;

-- ---------- Отметка по геолокации ----------
-- p_event: 'in' / 'out' — из уведомления «Прибытие» / «Уход»; null — кнопка в приложении (чередование)
-- Координаты используются только для проверки и не сохраняются; в отметку пишется объект и расстояние.
create or replace function public.geo_check_in(p_lat double precision, p_lng double precision, p_acc double precision,
                                               p_event text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  e public.employees;
  v_acc double precision := coalesce(p_acc, 0);
  near_id uuid; near_name text; near_d double precision; near_r int;
  last_ev public.attendance_events;
  has_last boolean;
  new_kind text;
  rec public.attendance_events;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if p_event is not null and p_event not in ('in','out') then raise exception 'BAD_EVENT'; end if;

  select * into e from public.employees where user_id = auth.uid();
  if not found then raise exception 'NOT_EMPLOYEE'; end if;
  if e.status = 'pending' then raise exception 'NOT_APPROVED'; end if;
  if e.status = 'rejected' or not e.active then raise exception 'BLOCKED'; end if;
  if not exists (select 1 from public.consents where user_id = auth.uid() and kind = 'geo' and revoked_at is null) then
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
                             'reason',last_ev.reason,'work_start',e.work_start,'work_end',e.work_end);
  end if;

  -- уведомление «Прибытие», а приход уже отмечен (или «Уход» без прихода) — ничего не меняем
  if (p_event = 'in' and has_last and last_ev.kind = 'in')
     or (p_event = 'out' and (not has_last or last_ev.kind = 'out')) then
    return json_build_object('status','already','id',case when has_last then last_ev.id end,
                             'kind',p_event,'ts',case when has_last then last_ev.ts end,'name',e.full_name,
                             'reason',case when has_last then last_ev.reason end,
                             'work_start',e.work_start,'work_end',e.work_end,'site',near_name);
  end if;

  new_kind := coalesce(p_event, case when has_last and last_ev.kind = 'in' then 'out' else 'in' end);

  insert into public.attendance_events (employee_id, kind, kiosk_id, source, note)
  values (e.id, new_kind, near_id, 'geo', format('Геолокация · %s · %s м', near_name, round(near_d)))
  returning * into rec;

  return json_build_object('status','ok','id',rec.id,'kind',rec.kind,'ts',rec.ts,'name',e.full_name,
                           'work_start', e.work_start, 'work_end', e.work_end,
                           'distance', round(near_d), 'site', near_name);
end $$;
revoke all on function public.geo_check_in(double precision, double precision, double precision, text) from public, anon;
grant execute on function public.geo_check_in(double precision, double precision, double precision, text) to authenticated;

notify pgrst, 'reload schema';
