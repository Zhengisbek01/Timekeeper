// Единое время РК: UTC+5. Считаем фиксированным смещением, не завися от tzdata браузера.
export const TZ_OFFSET_MIN = 300

const shift = (d) => new Date(new Date(d).getTime() + TZ_OFFSET_MIN * 60000)

export const dateKey = (d) => shift(d).toISOString().slice(0, 10)       // 'YYYY-MM-DD' по времени РК
export const fmtTime = (d) => shift(d).toISOString().slice(11, 16)      // 'HH:MM'
export const fmtDateTime = (d) => `${fmtDate(dateKey(d))} ${fmtTime(d)}`
export const todayKey = () => dateKey(new Date())
export const minutesOfDay = (d) => { const s = shift(d); return s.getUTCHours() * 60 + s.getUTCMinutes() }

// локальные дата+время РК → ISO UTC
export const toUtcISO = (dayKey, hhmm) => new Date(`${dayKey}T${hhmm}:00+05:00`).toISOString()

export const fmtDate = (key) => { const [y, m, d] = key.split('-'); return `${d}.${m}.${y}` }
export const timeToMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
// 12 → «12 мин», 125 → «2 ч 05 мин»
export const durStr = (min) => { const m = Math.round(min); return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин` }
export const minToHM = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()          // m: 1..12
export const isoDow = (key) => { const d = new Date(key + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d }
export const monthKey = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Границы месяца по времени РК в UTC ISO (с запасом ±1 день для ночных смен)
export function monthRangeUtc(y, m, padDays = 0) {
  const start = new Date(Date.UTC(y, m - 1, 1 - padDays) - TZ_OFFSET_MIN * 60000)
  const end = new Date(Date.UTC(y, m, 1 + padDays) - TZ_OFFSET_MIN * 60000)
  return [start.toISOString(), end.toISOString()]
}

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
export const DOW_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
