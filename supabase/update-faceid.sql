-- Timekeeper: отметка по Face ID / отпечатку, согласия (соглашение, ПД, биометрия), геозона входа.
-- Выполнить один раз: Supabase → SQL Editor → вставить → Run. Повторный запуск безопасен.
-- После запуска выполните внизу запрос «секрет для Vercel» и вставьте значение в Vercel → WEBAUTHN_SECRET.

create extension if not exists pgcrypto with schema extensions;

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
  if p_kind = 'biometric' then delete from public.passkeys where user_id = auth.uid(); end if;
end $$;

-- ---------- Ключи Face ID / отпечатка (WebAuthn) ----------
-- Биометрия остаётся в телефоне; здесь хранится только открытый криптографический ключ.
create table if not exists public.passkeys (
  id           text primary key,              -- credential id (base64url)
  user_id      uuid not null references auth.users(id) on delete cascade,
  public_key   text not null,                 -- открытый ключ (base64url)
  counter      bigint not null default 0,
  transports   text[],
  device       text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.passkeys enable row level security;
drop policy if exists passkeys_select on public.passkeys;
create policy passkeys_select on public.passkeys for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists passkeys_delete on public.passkeys;
create policy passkeys_delete on public.passkeys for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

revoke all on function public.revoke_consent(text) from public, anon;
grant execute on function public.revoke_consent(text) to authenticated;

-- секрет, которым серверная функция Vercel подписывает проверенный Face ID (никому не доступен)
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value)
values ('webauthn', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- одноразовые метки: один ответ Face ID нельзя использовать дважды
create table if not exists public.used_nonces (nonce text primary key, at timestamptz not null default now());
alter table public.used_nonces enable row level security;
revoke all on public.used_nonces from anon, authenticated;

create or replace function public._check_sig(p_payload text, p_ts bigint, p_sig text, p_nonce text)
returns void language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select value into s from public.app_secrets where name = 'webauthn';
  if s is null or encode(extensions.hmac(p_payload, s, 'sha256'), 'hex') <> coalesce(p_sig, '') then
    raise exception 'SIG_INVALID';
  end if;
  if abs(extract(epoch from now()) - p_ts) > 120 then raise exception 'SIG_EXPIRED'; end if;
  delete from public.used_nonces where at < now() - interval '1 day';
  begin
    insert into public.used_nonces (nonce) values (p_nonce);
  exception when unique_violation then raise exception 'REPLAY';
  end;
end $$;
revoke all on function public._check_sig(text, bigint, text, text) from public, anon, authenticated;

create or replace function public._bio_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.consents where user_id = auth.uid() and kind = 'biometric' and revoked_at is null);
$$;

-- сохранение нового ключа (после проверки на сервере Vercel)
create or replace function public.passkey_save(p_id text, p_public_key text, p_counter text, p_transports text,
                                               p_device text, p_nonce text, p_ts bigint, p_sig text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  perform public._check_sig(concat_ws('|', 'save', auth.uid(), p_id, p_public_key, p_counter, p_nonce, p_ts), p_ts, p_sig, p_nonce);
  if not public._bio_ok() then raise exception 'NO_BIO_CONSENT'; end if;
  if exists (select 1 from public.passkeys where id = p_id and user_id <> auth.uid()) then raise exception 'FORBIDDEN'; end if;
  insert into public.passkeys (id, user_id, public_key, counter, transports, device)
  values (p_id, auth.uid(), p_public_key, p_counter::bigint, string_to_array(nullif(p_transports, ''), ','), left(p_device, 120))
  on conflict (id) do update set public_key = excluded.public_key, counter = excluded.counter, device = excluded.device;
end $$;
revoke all on function public.passkey_save(text, text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.passkey_save(text, text, text, text, text, text, bigint, text) to authenticated;

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

-- ---------- Отметка по Face ID ----------
create or replace function public.face_check_in(p_cred text, p_counter text, p_lat text, p_lng text, p_acc text,
                                                p_nonce text, p_ts bigint, p_sig text)
returns json language plpgsql security definer set search_path = public as $$
declare
  e public.employees;
  pk public.passkeys;
  v_lat double precision := p_lat::double precision;
  v_lng double precision := p_lng::double precision;
  v_acc double precision := least(coalesce(nullif(p_acc, '')::double precision, 0), 50);
  near_id uuid; near_d double precision; near_r int;
  last_ev public.attendance_events;
  has_last boolean;
  new_kind text;
  rec public.attendance_events;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  perform public._check_sig(concat_ws('|', 'checkin', auth.uid(), p_cred, p_counter, p_lat, p_lng, p_acc, p_nonce, p_ts), p_ts, p_sig, p_nonce);

  select * into pk from public.passkeys where id = p_cred and user_id = auth.uid();
  if not found then raise exception 'NO_PASSKEY'; end if;
  if not public._bio_ok() then raise exception 'NO_BIO_CONSENT'; end if;

  select * into e from public.employees where user_id = auth.uid();
  if not found then raise exception 'NOT_EMPLOYEE'; end if;
  if e.status = 'pending' then raise exception 'NOT_APPROVED'; end if;
  if e.status = 'rejected' or not e.active then raise exception 'BLOCKED'; end if;

  -- ближайший вход с заданными координатами
  select k.id, public._dist_m(v_lat, v_lng, k.lat, k.lng), k.radius_m into near_id, near_d, near_r
    from public.kiosks k where k.active and k.lat is not null and k.lng is not null
   order by public._dist_m(v_lat, v_lng, k.lat, k.lng) limit 1;
  if near_id is null then raise exception 'NO_GEOFENCE'; end if;
  if near_d > near_r + v_acc then raise exception 'OUT_OF_ZONE %', round(near_d); end if;

  update public.passkeys set counter = greatest(counter, p_counter::bigint), last_used_at = now() where id = pk.id;

  select * into last_ev from public.attendance_events
   where employee_id = e.id and ts > now() - interval '16 hours'
   order by ts desc limit 1;
  has_last := found;
  if has_last and last_ev.ts > now() - interval '60 seconds' then
    return json_build_object('status','duplicate','id',last_ev.id,'kind',last_ev.kind,'ts',last_ev.ts,'name',e.full_name,
                             'reason',last_ev.reason,'work_start',e.work_start,'work_end',e.work_end);
  end if;
  new_kind := case when has_last and last_ev.kind = 'in' then 'out' else 'in' end;

  insert into public.attendance_events (employee_id, kind, kiosk_id, source, note)
  values (e.id, new_kind, near_id, 'face', format('Face ID · %s м от входа', round(near_d)))
  returning * into rec;

  return json_build_object('status','ok','id',rec.id,'kind',rec.kind,'ts',rec.ts,'name',e.full_name,
                           'work_start', e.work_start, 'work_end', e.work_end, 'distance', round(near_d));
end $$;
revoke all on function public.face_check_in(text, text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.face_check_in(text, text, text, text, text, text, bigint, text) to authenticated;

-- ---------- Секрет для Vercel ----------
-- Выполните отдельно и скопируйте value в Vercel → Settings → Environment Variables → WEBAUTHN_SECRET:
-- select value from public.app_secrets where name = 'webauthn';
