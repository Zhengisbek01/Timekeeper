-- =====================================================================
-- ТАБЕЛЬ: учёт прихода/ухода по QR + табель рабочего времени
-- Выполнить целиком в Supabase → SQL Editor (на новом проекте)
-- Часовой пояс учёта: UTC+5 (единое время РК с 01.03.2024)
--
-- Учётные записи:
--   • работник   — регистрируется сам: ФИО, email, телефон, должность, компания, пароль;
--                  входит по email и паролю;
--                  отмечаться может только после подтверждения HR;
--   • HR         — работник с ролью admin;
--   • киоск      — отдельная учётная запись планшета (логин + пароль),
--                  создаётся HR и активируется на планшете одноразовым кодом.
-- Учётная запись киоска использует служебный email kiosk.<логин>@<VITE_LOGIN_DOMAIN>,
-- поэтому в Supabase нужно отключить «Confirm email» (доступ и так открывает HR).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Таблицы ----------

create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  bin        text,
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null,
  email         text not null unique,                 -- логин, в нижнем регистре
  full_name     text not null,
  phone         text,                                 -- только цифры: 77011234567
  position      text,
  company_id    uuid references public.companies(id),
  department    text,
  tab_number    text,
  role          text not null default 'employee' check (role in ('employee','admin')),
  status        text not null default 'pending'  check (status in ('pending','approved','rejected')),
  approved_at   timestamptz,
  work_start    time not null default '09:00',
  work_end      time not null default '18:00',
  break_minutes int  not null default 60,
  work_days     int[] not null default '{1,2,3,4,5}',   -- ISO: 1=Пн … 7=Вс
  start_date    date not null default current_date,    -- дата начала учёта: раньше неё дни не считаются
  active        boolean not null default true,         -- false = уволен (история сохраняется)
  created_at    timestamptz not null default now()
);
create index if not exists employees_company_idx on public.employees (company_id);
-- для баз, созданных ранней версией схемы
alter table public.employees add column if not exists start_date date not null default current_date;

create table if not exists public.kiosks (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  login           text not null unique,                -- латиница/цифры, напр. kiosk-main
  activation_code text,                                -- одноразовый код активации планшета
  user_id         uuid unique references auth.users(id) on delete set null,
  secret          text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.attendance_events (
  id          bigint generated always as identity primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind        text not null check (kind in ('in','out')),
  ts          timestamptz not null default now(),
  kiosk_id    uuid references public.kiosks(id) on delete set null,
  source      text not null default 'qr' check (source in ('qr','manual')),
  note        text,
  reason      text,                 -- причина выхода в рабочее время (указывает работник)
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists attendance_emp_ts_idx on public.attendance_events (employee_id, ts);
create index if not exists attendance_ts_idx on public.attendance_events (ts);

-- Отсутствия: отпуск, БС, больничный, командировка… (заполняет HR)
create table if not exists public.absences (
  employee_id uuid not null references public.employees(id) on delete cascade,
  day         date not null,
  code        text not null,
  note        text,
  created_by  uuid default auth.uid(),
  primary key (employee_id, day)
);

-- Производственный календарь: праздники/переносы ('holiday') и рабочие выходные ('workday')
create table if not exists public.holidays (
  day  date primary key,
  name text not null,
  kind text not null default 'holiday' check (kind in ('holiday','workday'))
);

-- ---------- Вспомогательные функции ----------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees
                 where user_id = auth.uid() and role = 'admin' and status = 'approved' and active);
$$;

create or replace function public.my_kiosk()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.kiosks where user_id = auth.uid() and active;
$$;

-- Саморегистрация работника: данные приходят в metadata при signUp
-- {kind:'employee', full_name, phone, position, company_id}; логин = email
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  ph text;
begin
  if m->>'kind' is distinct from 'employee' then return new; end if;
  ph := regexp_replace(coalesce(m->>'phone',''), '\D', '', 'g');
  if length(ph) = 11 and left(ph,1) = '8' then ph := '7' || substr(ph, 2); end if;

  -- если HR заранее завёл карточку с этим email — привязываем к ней
  update public.employees set user_id = new.id, phone = coalesce(phone, nullif(ph, ''))
   where email = lower(new.email) and user_id is null;
  if found then return new; end if;

  insert into public.employees (user_id, email, full_name, phone, position, company_id, status)
  values (new.id,
          lower(new.email),
          trim(coalesce(m->>'full_name','')),
          nullif(ph, ''),
          nullif(trim(coalesce(m->>'position','')), ''),
          (select id from public.companies where id::text = m->>'company_id'),
          'pending');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_link on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.employees_norm()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists employees_norm on public.employees;
create trigger employees_norm before insert or update of email on public.employees
  for each row execute function public.employees_norm();

-- ---------- Учётная запись киоска ----------

-- HR создаёт киоск → получает код активации; на планшете: логин + код + новый пароль
create or replace function public.kiosk_create(p_name text, p_login text)
returns json language plpgsql security definer set search_path = public as $$
declare k public.kiosks; code text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_login !~ '^[a-z0-9-]{3,32}$' then raise exception 'BAD_LOGIN'; end if;
  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into public.kiosks (name, login, activation_code) values (trim(p_name), p_login, code)
  returning * into k;
  return json_build_object('id', k.id, 'login', k.login, 'code', code);
end $$;
grant execute on function public.kiosk_create(text, text) to authenticated;

-- Сброс учётной записи киоска (новый код, старый планшет отключается)
create or replace function public.kiosk_reset(p_kiosk uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  update public.kiosks set activation_code = code, user_id = null,
         secret = encode(extensions.gen_random_bytes(24), 'hex')
   where id = p_kiosk;
  return code;
end $$;
grant execute on function public.kiosk_reset(uuid) to authenticated;

-- Вызывается планшетом сразу после signUp учётной записи киоска
create or replace function public.kiosk_activate(p_login text, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare k public.kiosks;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if exists (select 1 from public.employees where user_id = auth.uid()) then raise exception 'NOT_KIOSK'; end if;
  select * into k from public.kiosks
   where login = lower(trim(p_login)) and activation_code = p_code and user_id is null and active;
  if not found then raise exception 'ACTIVATION_INVALID'; end if;
  update public.kiosks set user_id = auth.uid(), activation_code = null where id = k.id;
  return json_build_object('id', k.id, 'name', k.name);
end $$;
grant execute on function public.kiosk_activate(text, text) to authenticated;

-- ---------- Динамический QR ----------
-- Токен меняется каждые 30 секунд: HMAC(kiosk_id:окно, secret)

create or replace function public._kiosk_token(p_kiosk uuid, p_secret text, p_window bigint)
returns text language sql immutable as $$
  select substr(encode(extensions.hmac(p_kiosk::text || ':' || p_window::text, p_secret, 'sha256'), 'hex'), 1, 20);
$$;
revoke execute on function public._kiosk_token(uuid, text, bigint) from public, anon, authenticated;

-- Вызывает планшет, вошедший под учётной записью киоска
create or replace function public.kiosk_token()
returns json language plpgsql security definer set search_path = public as $$
declare
  k public.kiosks;
  w bigint;
  sec numeric := extract(epoch from now());
begin
  select * into k from public.kiosks where user_id = auth.uid() and active;
  if not found then raise exception 'NOT_KIOSK'; end if;
  w := floor(sec / 30);
  return json_build_object(
    'kiosk_id', k.id,
    'token', public._kiosk_token(k.id, k.secret, w),
    'name', k.name,
    'expires_in', 30 - (floor(sec)::bigint % 30),
    'server_time', now()
  );
end $$;
grant execute on function public.kiosk_token() to authenticated;

-- Лента последних отметок на экране планшета
create or replace function public.kiosk_recent()
returns table (full_name text, kind text, ts timestamptz, late boolean)
language plpgsql security definer set search_path = public as $$
declare kid uuid := public.my_kiosk();
begin
  if kid is null then raise exception 'NOT_KIOSK'; end if;
  return query
    select e.full_name, a.kind, a.ts,
           -- фиксированное UTC+5, не зависим от версии tzdata на сервере
           (a.kind = 'in' and ((a.ts at time zone 'UTC') + interval '5 hours')::time > e.work_start + interval '5 minutes')
      from public.attendance_events a
      join public.employees e on e.id = a.employee_id
     where a.kiosk_id = kid and a.ts > now() - interval '12 hours'
     order by a.ts desc
     limit 6;
end $$;
grant execute on function public.kiosk_recent() to authenticated;

-- Отметка работника: вызывается с телефона после сканирования QR
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

-- ---------- RLS ----------

alter table public.companies         enable row level security;
alter table public.employees         enable row level security;
alter table public.kiosks            enable row level security;
alter table public.attendance_events enable row level security;
alter table public.absences          enable row level security;
alter table public.holidays          enable row level security;

-- список компаний нужен на форме регистрации (до входа)
drop policy if exists comp_select on public.companies;
create policy comp_select on public.companies for select to anon, authenticated using (true);
drop policy if exists comp_admin on public.companies;
create policy comp_admin on public.companies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists emp_select on public.employees;
create policy emp_select on public.employees for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists emp_admin on public.employees;
create policy emp_admin on public.employees for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists kiosk_select_own on public.kiosks;
create policy kiosk_select_own on public.kiosks for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists kiosk_admin on public.kiosks;
create policy kiosk_admin on public.kiosks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists ev_select on public.attendance_events;
create policy ev_select on public.attendance_events for select to authenticated
  using (public.is_admin() or employee_id in (select id from public.employees where user_id = auth.uid()));
drop policy if exists ev_admin on public.attendance_events;
create policy ev_admin on public.attendance_events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists abs_select on public.absences;
create policy abs_select on public.absences for select to authenticated
  using (public.is_admin() or employee_id in (select id from public.employees where user_id = auth.uid()));
drop policy if exists abs_admin on public.absences;
create policy abs_admin on public.absences for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists hol_select on public.holidays;
create policy hol_select on public.holidays for select to authenticated using (true);
drop policy if exists hol_admin on public.holidays;
create policy hol_admin on public.holidays for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Справочники ----------

insert into public.companies (name) values
  ('KazMining'), ('MKA engineering'), ('KazAgroFeed')
on conflict (name) do nothing;

-- Производственный календарь РК 2026 (сверьте с постановлением Правительства РК)
insert into public.holidays (day, name, kind) values
  ('2026-01-01','Новый год','holiday'),
  ('2026-01-02','Новый год','holiday'),
  ('2026-01-07','Православное Рождество','holiday'),
  ('2026-03-08','Международный женский день','holiday'),
  ('2026-03-09','Перенос (8 марта)','holiday'),
  ('2026-03-21','Наурыз мейрамы','holiday'),
  ('2026-03-22','Наурыз мейрамы','holiday'),
  ('2026-03-23','Наурыз мейрамы','holiday'),
  ('2026-03-24','Перенос (Наурыз)','holiday'),
  ('2026-03-25','Перенос (Наурыз)','holiday'),
  ('2026-05-01','День единства народа Казахстана','holiday'),
  ('2026-05-07','День защитника Отечества','holiday'),
  ('2026-05-09','День Победы','holiday'),
  ('2026-05-11','Перенос (9 мая)','holiday'),
  ('2026-05-27','Курбан айт','holiday'),
  ('2026-07-06','День столицы','holiday'),
  ('2026-08-30','День Конституции (уточнить)','holiday'),
  ('2026-08-31','Перенос (30 августа, уточнить)','holiday'),
  ('2026-10-25','День Республики','holiday'),
  ('2026-10-26','Перенос (25 октября)','holiday'),
  ('2026-12-16','День Независимости','holiday')
on conflict (day) do nothing;

-- ---------- Причина выхода ----------
alter table public.attendance_events add column if not exists reason text;

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

-- ---------- Сброс пароля через HR ----------
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

-- ---------- Первый HR ----------
-- 1) Зарегистрируйтесь в приложении как работник (свой email).
-- 2) Выполните, подставив свой email:
-- update public.employees set role = 'admin', status = 'approved', approved_at = now()
--  where email = 'hr@company.kz';

-- ================= Геолокация (update-geo.sql) =================
-- Timekeeper: отметка по геолокации (гибрид: телефон замечает объект → работник подтверждает → сервер проверяет зону).
-- Выполнить один раз: SQL Editor (или psql на сервере) → Run. Повторный запуск безопасен.

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

