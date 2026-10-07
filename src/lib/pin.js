// Код быстрого входа: 4 цифры, каждый задаёт сам, хранится только на этом устройстве (в виде хеша).
// Сессия Supabase остаётся на телефоне; код «открывает» приложение без ввода email и пароля.

const KEY = (uid) => `tk_pin_${uid}`
const UNLOCK = (uid) => `tk_unlocked_${uid}`
export const PIN_LEN = 4
export const MAX_ATTEMPTS = 5
export const LOCK_AFTER_MS = 5 * 60 * 1000   // после 5 минут без приложения — снова код

const enc = (s) => new TextEncoder().encode(s)
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

async function hash(pin, salt) {
  const key = await crypto.subtle.importKey('raw', enc(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc(salt), iterations: 120000, hash: 'SHA-256' }, key, 256)
  return hex(bits)
}

const read = (uid) => { try { return JSON.parse(localStorage.getItem(KEY(uid))) } catch { return null } }

export const hasPin = (uid) => Boolean(read(uid)?.hash)

export async function setPin(uid, pin) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  localStorage.setItem(KEY(uid), JSON.stringify({ salt, hash: await hash(pin, salt), fails: 0 }))
  markUnlocked(uid)
}

// → 'ok' | 'wrong' | 'blocked'
export async function checkPin(uid, pin) {
  const p = read(uid)
  if (!p) return 'blocked'
  if ((await hash(pin, p.salt)) === p.hash) {
    localStorage.setItem(KEY(uid), JSON.stringify({ ...p, fails: 0 }))
    markUnlocked(uid)
    return 'ok'
  }
  const fails = (p.fails || 0) + 1
  if (fails >= MAX_ATTEMPTS) { clearPin(uid); return 'blocked' }
  localStorage.setItem(KEY(uid), JSON.stringify({ ...p, fails }))
  return 'wrong'
}
export const attemptsLeft = (uid) => MAX_ATTEMPTS - (read(uid)?.fails || 0)

export function clearPin(uid) {
  try { localStorage.removeItem(KEY(uid)); sessionStorage.removeItem(UNLOCK(uid)) } catch {}
}

// «открыто» живёт только в этой вкладке и только 5 минут простоя
export function markUnlocked(uid) { try { sessionStorage.setItem(UNLOCK(uid), String(Date.now())) } catch {} }
export function isUnlocked(uid) {
  try { const t = +sessionStorage.getItem(UNLOCK(uid)); return t && Date.now() - t < LOCK_AFTER_MS } catch { return false }
}
export function lock(uid) { try { sessionStorage.removeItem(UNLOCK(uid)) } catch {} }
