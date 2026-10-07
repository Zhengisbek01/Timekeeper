import { dateKey, minutesOfDay, timeToMin, daysInMonth, isoDow, monthKey, todayKey } from './time'

// Условные обозначения табеля (редактируйте под учётную политику организации)
export const CODES = {
  'Я':  { label: 'Явка', auto: true },
  'РВ': { label: 'Работа в выходной/праздничный день', auto: true },
  'В':  { label: 'Выходной / праздничный день', auto: true },
  'НН': { label: 'Неявка по невыясненным причинам', auto: true },
  'ОТ': { label: 'Ежегодный оплачиваемый трудовой отпуск' },
  'БС': { label: 'Отпуск без сохранения заработной платы' },
  'У':  { label: 'Учебный отпуск' },
  'ОЖ': { label: 'Отпуск по беременности и родам / уходу за ребёнком' },
  'Б':  { label: 'Временная нетрудоспособность (больничный)' },
  'К':  { label: 'Командировка' },
  'Г':  { label: 'Выполнение государственных обязанностей' },
  'ПК': { label: 'Обучение / повышение квалификации с отрывом' },
  'ПР': { label: 'Прогул' },
}
export const MANUAL_CODES = Object.keys(CODES).filter((c) => !CODES[c].auto)

const GRACE_MIN = 5            // допуск на опоздание, мин
const AUTO_BREAK_FROM = 300    // вычитать обед, если одна непрерывная сессия дольше 5 ч
const OPEN_SESSION_H = 16      // незакрытый приход старше 16 ч — аномалия

// Длительность смены с учётом ночных графиков (22:00–06:00)
const shiftLen = (emp) => { const d = timeToMin(emp.work_end) - timeToMin(emp.work_start); return d > 0 ? d : d + 1440 }
export const dailyNormMin = (emp) => Math.max(0, shiftLen(emp) - (emp.break_minutes || 0))

// Разбор событий сотрудника в интервалы работы по дням прихода
export function buildDays(events) {
  const sorted = [...events].sort((a, b) => new Date(a.ts) - new Date(b.ts))
  const days = {}
  const day = (k) => (days[k] ||= { intervals: [], events: [], issues: [] })
  let open = null
  for (const ev of sorted) {
    day(dateKey(ev.ts)).events.push(ev)
    if (ev.kind === 'in') {
      if (open) day(dateKey(open.ts)).issues.push('Приход без ухода')
      open = ev
    } else if (open) {
      day(dateKey(open.ts)).intervals.push([open.ts, ev.ts])
      open = null
    } else {
      day(dateKey(ev.ts)).issues.push('Уход без прихода')
    }
  }
  if (open && Date.now() - new Date(open.ts) > OPEN_SESSION_H * 3600e3) {
    day(dateKey(open.ts)).issues.push('Нет отметки ухода')
  } else if (open) {
    day(dateKey(open.ts)).openSince = open.ts
  }
  return days
}

// Табель по одному сотруднику за месяц
export function buildRow(emp, events, absences, holidaysMap, y, m) {
  const days = buildDays(events)
  const absMap = Object.fromEntries(absences.map((a) => [a.day, a]))
  const today = todayKey()
  const norm = dailyNormMin(emp)
  const startMin = timeToMin(emp.work_start)
  const schedEnd = startMin + shiftLen(emp)          // конец смены в минутах от начала дня прихода
  const workDays = emp.work_days || [1, 2, 3, 4, 5]

  const cells = []
  const tot = { days: 0, minutes: 0, normDays: 0, normMin: 0, late: 0, lateMin: 0, early: 0, issues: 0, codes: {} }

  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = monthKey(y, m, d)
    const hol = holidaysMap[key]
    const scheduled = hol ? hol.kind === 'workday' : workDays.includes(isoDow(key))
    const info = days[key] || { intervals: [], events: [], issues: [] }

    let worked = info.intervals.reduce((s, [a, b]) => s + (new Date(b) - new Date(a)) / 60000, 0)
    if (info.intervals.length === 1 && worked > AUTO_BREAK_FROM) worked -= emp.break_minutes || 0
    worked = Math.max(0, Math.round(worked))

    const firstIn = info.intervals[0]?.[0] || info.openSince
    const lateMin = scheduled && firstIn ? Math.max(0, minutesOfDay(firstIn) - startMin) : 0
    const isLate = lateMin > GRACE_MIN
    const lastEnd = info.intervals[info.intervals.length - 1]?.[1]
    const lastEndMin = lastEnd ? minutesOfDay(lastEnd) + (dateKey(lastEnd) > key ? 1440 : 0) : null
    const isEarly = scheduled && lastEnd && !info.openSince && lastEndMin < schedEnd - GRACE_MIN
    const active = info.intervals.length || info.openSince || info.issues.length

    let code
    const abs = absMap[key]
    if (abs) code = abs.code
    else if (active) code = scheduled ? 'Я' : 'РВ'
    else if (!scheduled) code = 'В'
    else if (key < today) code = 'НН'
    else code = ''                                  // сегодня/будущее без отметок

    if (scheduled) { tot.normDays++; tot.normMin += norm }
    if (code === 'Я' || code === 'РВ') { tot.days++; tot.minutes += worked }
    if (code && !['Я', 'В'].includes(code)) tot.codes[code] = (tot.codes[code] || 0) + 1
    if (isLate && !abs) { tot.late++; tot.lateMin += lateMin }
    if (isEarly && !abs) tot.early++
    if (info.issues.length) tot.issues += info.issues.length

    cells.push({
      key, d, code, worked, scheduled, holiday: hol, absence: abs,
      events: info.events, intervals: info.intervals, issues: info.issues, openSince: info.openSince,
      lateMin: isLate && !abs ? lateMin : 0, early: !!isEarly && !abs,
    })
  }
  return { emp, cells, tot }
}

export function buildTimesheet({ employees, events, absences, holidays, y, m }) {
  const holidaysMap = Object.fromEntries(holidays.map((h) => [h.day, h]))
  const evBy = {}, absBy = {}
  for (const e of events) (evBy[e.employee_id] ||= []).push(e)
  for (const a of absences) (absBy[a.employee_id] ||= []).push(a)
  return employees.map((emp) => buildRow(emp, evBy[emp.id] || [], absBy[emp.id] || [], holidaysMap, y, m))
}

export const hoursStr = (min) => (min ? (Math.round(min / 6) / 10).toString().replace('.', ',') : '')
