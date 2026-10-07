import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null
export const ORG_NAME = import.meta.env.VITE_ORG_NAME || 'Учёт рабочего времени'

// Киоск входит по логину: логин → служебный email (письма не отправляются,
// в Supabase должно быть отключено «Confirm email»)
const LOGIN_DOMAIN = import.meta.env.VITE_LOGIN_DOMAIN || 'timekeeper-staff.kz'

// '+7 (701) 123-45-67' / '87011234567' → '77011234567' (или null)
export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '')
  if (d.length === 10) d = '7' + d
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1)
  return /^7\d{10}$/.test(d) ? d : null
}
export const fmtPhone = (d) => (d && d.length === 11 ? `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}` : d || '')
export const kioskEmail = (login) => `kiosk.${login.trim().toLowerCase()}@${LOGIN_DOMAIN}`

const ERRORS = {
  NOT_AUTH: 'Войдите в систему',
  NOT_EMPLOYEE: 'Учётная запись не найдена среди работников. Обратитесь в отдел кадров.',
  NOT_APPROVED: 'Ваша заявка ещё не подтверждена отделом кадров.',
  BLOCKED: 'Доступ закрыт. Обратитесь в отдел кадров.',
  KIOSK_INVALID: 'Киоск не найден или отключён',
  NOT_KIOSK: 'Это не учётная запись киоска, или киоск отключён',
  ACTIVATION_INVALID: 'Неверный логин или код активации, либо киоск уже активирован',
  BAD_LOGIN: 'Логин: 3–32 символа, латиница в нижнем регистре, цифры и дефис',
  FORBIDDEN: 'Недостаточно прав',
  TOKEN_EXPIRED: 'QR-код устарел. Отсканируйте код на планшете ещё раз.',
  'Invalid login credentials': 'Неверный email или пароль',
  'User already registered': 'Этот email уже зарегистрирован. Войдите.',
  'Database error saving new user': 'Не удалось сохранить данные. Проверьте поля и попробуйте ещё раз.',
  'Email not confirmed': 'Email не подтверждён. Откройте письмо от системы.',
  'Password should be at least': 'Пароль должен быть не короче 6 символов',
  'kiosks_login_key': 'Киоск с таким логином уже есть',
  'Email address': 'Сервер отклонил email. Проверьте адрес (для киоска — переменную VITE_LOGIN_DOMAIN, см. README).',
}

export function errText(err) {
  const msg = err?.message || String(err)
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k]
  return msg
}
