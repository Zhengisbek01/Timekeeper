import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Пришли по ссылке «восстановить пароль» из письма (запоминаем до того, как клиент очистит адрес)
export const recoveryLink = typeof window !== 'undefined' &&
  /type=recovery/.test(window.location.hash + window.location.search)

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
  NO_ACCOUNT: 'Работник ещё не зарегистрировался — пароля пока нет',
  KIOSK_NOT_ACTIVATED: 'Киоск ещё не активирован — используйте код активации',
  WEAK_PASSWORD: 'Пароль должен быть не короче 6 символов',
  'rate limit': 'Слишком много запросов. Подождите и попробуйте позже или обратитесь в отдел кадров.',
  'For security purposes': 'Повторный запрос можно отправить через минуту',
  'New password should be different': 'Новый пароль должен отличаться от старого',
  'Auth session missing': 'Ссылка недействительна или устарела. Запросите новую.',
  'same_password': 'Новый пароль должен отличаться от старого',
  'Password should contain': 'Пароль слишком простой: добавьте буквы и цифры',
  'weak_password': 'Пароль слишком простой: добавьте буквы и цифры',
  'Error sending': 'Не удалось отправить письмо. Попробуйте позже или обратитесь в отдел кадров.',
  'Email address': 'Сервер отклонил email. Проверьте адрес (для киоска — переменную VITE_LOGIN_DOMAIN, см. README).',
}

export function errText(err) {
  const msg = err?.message || String(err)
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k]
  return msg
}

// Временный пароль, который HR сообщает работнику (без похожих символов 0/O, 1/l/I)
export function tempPassword(len = 8) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => abc[b % abc.length]).join('')
}
