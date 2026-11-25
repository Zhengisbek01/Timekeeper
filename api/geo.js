// Timekeeper: автоотметка из iPhone «Команды» (Прибытие / Уход) — без открытия приложения.
// GET или POST: t = личный ключ работника, e = in | out, lat, lng = координаты телефона.
// Ответ — короткий текст: «Команды» показывают его уведомлением.
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const num = (v) => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const hm = (ts) => {
  const d = new Date(new Date(ts).getTime() + 5 * 3600e3)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function message(r) {
  const site = r.site ? ` · ${r.site}` : ''
  if (r.status === 'ok') return `${r.kind === 'in' ? '✅ Приход' : '👋 Уход'} ${hm(r.ts)}${site}`
  if (r.status === 'duplicate') return `Уже отмечено в ${hm(r.ts)}`
  if (r.status === 'already') {
    if (r.kind === 'in') return `Приход уже отмечен${r.ts ? ' в ' + hm(r.ts) : ''}`
    return r.ts ? `Уход уже отмечен в ${hm(r.ts)}` : 'Сегодня прихода не было — уход не нужен'
  }
  return 'Готово'
}

function errorText(m) {
  const zone = m.match(/OUT_OF_ZONE (\d+)/)
  if (zone) return `Не отмечено: вы в ${zone[1]} м от объекта`
  const map = {
    BAD_TOKEN: 'Ключ не найден. Получите новый ключ в Timekeeper → «Автоотметка».',
    NO_GEO_CONSENT: 'Нет согласия на геолокацию — откройте Timekeeper.',
    NO_GEOFENCE: 'Отдел кадров не указал координаты объекта.',
    NO_LOCATION: 'Телефон не передал координаты.',
    NOT_APPROVED: 'Учётная запись ещё не подтверждена.',
    BLOCKED: 'Доступ закрыт. Обратитесь в отдел кадров.',
    BAD_EVENT: 'Неверная ссылка: e должен быть in или out.',
  }
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k]
  return 'Не удалось отметиться. Откройте Timekeeper.'
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).send('Метод не поддерживается'); return }
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const p = { ...(req.query || {}), ...(body && typeof body === 'object' ? body : {}) }
  const t = String(p.t || p.token || '').trim()
  const e = String(p.e || p.event || 'in').trim().toLowerCase()
  const lat = num(p.lat), lng = num(p.lng)
  if (!t) { res.status(400).send('Нет ключа (t). Получите ключ в Timekeeper → «Автоотметка».'); return }
  if (lat === null || lng === null) { res.status(400).send(errorText('NO_LOCATION')); return }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/geo_token_mark`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: t, p_lat: lat, p_lng: lng, p_event: e }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) { res.status(200).send(errorText(String(data.message || data.error || ''))); return }
    res.status(200).send(message(data))
  } catch {
    res.status(200).send('Нет связи с сервером. Попробуйте позже.')
  }
}
