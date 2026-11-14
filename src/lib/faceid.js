// Отметка по Face ID / отпечатку (WebAuthn) + проверка, что работник у входа (геолокация)
import { supabase } from './supabase'
import { startRegistration, startAuthentication, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from '@simplewebauthn/browser'

const api = async (action, body = {}) => {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(`/api/webauthn?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}

// поддерживает ли телефон Face ID / отпечаток для сайтов
export async function faceSupported() {
  try {
    return browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable())
  } catch { return false }
}

export function deviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  const m = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\sBuild|\))/)
  if (m) return m[1].trim()
  if (/Android/.test(ua)) return 'Android'
  return /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Устройство'
}

// Safari требует, чтобы Face ID вызывался сразу по нажатию, поэтому одноразовый код готовим заранее
export const prepareRegister = () => api('register-options').then((r) => ({ ...r, at: Date.now() }))
export const prepareCheckin = () => api('checkin-options').then((r) => ({ ...r, at: Date.now() }))
export const fresh = (p) => p && Date.now() - p.at < 150000

export async function registerFace(prepared) {
  const { options, state } = fresh(prepared) ? prepared : await prepareRegister()
  const response = await startRegistration({ optionsJSON: options })
  return api('register-verify', { state, response, device: deviceName() })
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('NO_GEO'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'GEO_DENIED' : 'GEO_FAILED')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    )
  })
}

// сначала Face ID (сразу по нажатию — так требует Safari), затем геолокация
export async function faceCheckIn(prepared) {
  const { options, state } = fresh(prepared) ? prepared : await prepareCheckin()
  const response = await startAuthentication({ optionsJSON: options })
  const { lat, lng, acc } = await getPosition()
  const data = await api('checkin-verify', { state, response, lat, lng, acc })
  return { ...data, via: 'face' }
}

// понятные сообщения об ошибках
export function faceError(e) {
  const m = String(e?.message || e)
  const zone = m.match(/OUT_OF_ZONE (\d+)/)
  if (zone) return `Вы в ${zone[1]} м от входа. По Face ID можно отметиться только у входа — подойдите ближе или отсканируйте QR.`
  if (e?.name === 'NotAllowedError' || /NotAllowed|cancel|abort/i.test(m)) return 'Face ID отменён или не распознан. Попробуйте ещё раз.'
  if (e?.name === 'InvalidStateError') return 'Face ID уже подключён на этом телефоне.'
  const map = {
    GEO_DENIED: 'Нет доступа к геолокации. Разрешите её для Timekeeper в настройках телефона — она нужна, чтобы проверить, что вы у входа.',
    GEO_FAILED: 'Не удалось определить местоположение. Включите геолокацию (GPS) и попробуйте снова.',
    NO_GEO: 'Телефон не передаёт геолокацию. Отметьтесь по QR.',
    NO_LOCATION: 'Не удалось определить местоположение.',
    NO_GEOFENCE: 'Отдел кадров ещё не указал координаты входа. Пока отмечайтесь по QR.',
    NO_PASSKEY: 'На этом телефоне Face ID не подключён. Подключите его заново.',
    NO_BIO_CONSENT: 'Нужно согласие на биометрическую аутентификацию.',
    NOT_VERIFIED: 'Face ID не подтверждён. Попробуйте ещё раз.',
    SERVER_NOT_CONFIGURED: 'Face ID ещё не настроен на сервере (WEBAUTHN_SECRET). Сообщите администратору.',
    SIG_INVALID: 'Ошибка проверки на сервере. Сообщите администратору.',
    SIG_EXPIRED: 'Проверка заняла слишком долго. Попробуйте ещё раз.',
    STATE_EXPIRED: 'Время ожидания истекло. Попробуйте ещё раз.',
    REPLAY: 'Повторите отметку.',
    NOT_APPROVED: 'Ваша заявка ещё не подтверждена отделом кадров.',
    BLOCKED: 'Доступ закрыт. Обратитесь в отдел кадров.',
    NOT_AUTH: 'Войдите в систему заново.',
  }
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k]
  return m
}
