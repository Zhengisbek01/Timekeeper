import XLSX from 'xlsx-js-style'
import { CODES, hoursStr } from './timesheet'
import { MONTHS, DOW_SHORT, isoDow, fmtTime, fmtDate, todayKey } from './time'
import { ORG_NAME, fmtPhone } from './supabase'

// ---------- стили ----------
const border = { top: { style: 'thin', color: { rgb: 'BFC7C4' } }, bottom: { style: 'thin', color: { rgb: 'BFC7C4' } },
  left: { style: 'thin', color: { rgb: 'BFC7C4' } }, right: { style: 'thin', color: { rgb: 'BFC7C4' } } }
const fill = (rgb) => ({ patternType: 'solid', fgColor: { rgb } })
const S = {
  title: { font: { bold: true, sz: 14 } },
  sub: { font: { sz: 10, color: { rgb: '66736F' } } },
  head: { font: { bold: true, sz: 10 }, fill: fill('E6F4F2'), border, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
  cell: { font: { sz: 10 }, border, alignment: { vertical: 'center' } },
  center: { font: { sz: 10 }, border, alignment: { horizontal: 'center', vertical: 'center' } },
  bold: { font: { sz: 10, bold: true }, border, alignment: { vertical: 'center' } },
  group: { font: { bold: true, sz: 11, color: { rgb: '115E59' } }, fill: fill('F1F5F4'), border },
  off: { fill: fill('EEF0EF') },
  late: { fill: fill('FFC7CE'), font: { sz: 10, bold: true, color: { rgb: '9C0006' } } },
  bad: { fill: fill('FDECE4'), font: { sz: 10, bold: true, color: { rgb: 'C2410C' } } },
  leave: { fill: fill('F0EAFE'), font: { sz: 10, bold: true, color: { rgb: '6D28D9' } } },
  sick: { fill: fill('FDF5DC'), font: { sz: 10, bold: true, color: { rgb: 'A16207' } } },
  trip: { fill: fill('E7EEFE'), font: { sz: 10, bold: true, color: { rgb: '1D4ED8' } } },
}
const merge = (...st) => st.reduce((a, b) => ({ ...a, ...b, font: { ...a.font, ...b.font }, alignment: { ...a.alignment, ...b.alignment } }), {})
const codeStyle = (code) => ({ 'НН': S.bad, 'ПР': S.bad, 'Б': S.sick, 'ОТ': S.leave, 'БС': S.leave, 'У': S.leave, 'ОЖ': S.leave, 'ПК': S.leave, 'К': S.trip, 'Г': S.trip }[code] || {})

// Лист из массива строк: ячейка = значение или { v, s }
function sheet(aoa, { cols, merges, freeze } = {}) {
  const plain = aoa.map((r) => r.map((c) => (c && typeof c === 'object' && 'v' in c ? c.v : c)))
  const ws = XLSX.utils.aoa_to_sheet(plain)
  aoa.forEach((r, R) => r.forEach((c, C) => {
    if (c && typeof c === 'object' && 's' in c) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C })
      ws[ref] ||= { t: 's', v: '' }
      ws[ref].s = c.s
    }
  }))
  if (cols) ws['!cols'] = cols.map((wch) => ({ wch }))
  if (merges) ws['!merges'] = merges
  if (freeze) ws['!freeze'] = freeze
  ws['!pageSetup'] = { orientation: 'landscape', paperSize: 9, fitToWidth: 1 }
  return ws
}
const H = (v) => ({ v, s: S.head })
const C = (v, s = S.cell) => ({ v: v ?? '', s })
const companyOf = (r) => r.emp.companies?.name || 'Без компании'
const period = (y, m) => `${MONTHS[m - 1].toLowerCase()} ${y} г.`
const titleRows = (title, y, m, company) => [
  [{ v: ORG_NAME, s: S.sub }],
  [{ v: title, s: S.title }],
  [{ v: `Период: ${period(y, m)}${company ? ` · Компания: ${company}` : ''} · Сформирован ${fmtDate(todayKey())} в Timekeeper`, s: S.sub }],
  [],
]
const companyLabel = (rows) => { const s = new Set(rows.map(companyOf)); return s.size === 1 ? [...s][0] : '' }

// ---------- 1. Табель учёта рабочего времени ----------
export function timesheetSheet(rows, y, m) {
  const n = rows[0]?.cells.length || 0
  const extra = ['Дней явок', 'Отработано, ч', 'Норма, дн', 'Норма, ч', 'Опозданий', 'Опоздания, мин', 'Неявки (коды)']
  const aoa = titleRows('ТАБЕЛЬ УЧЁТА РАБОЧЕГО ВРЕМЕНИ', y, m, companyLabel(rows))
  const hr = aoa.length
  aoa.push([H('№'), H('ФИО'), H('Таб. №'), H('Компания'), H('Должность'),
    ...rows[0].cells.map((c) => ({ v: c.d, s: merge(S.head, c.scheduled ? {} : S.off) })), ...extra.map(H)])
  aoa.push(['', '', '', '', '', ...rows[0].cells.map((c) => ({ v: DOW_SHORT[isoDow(c.key)], s: merge(S.head, c.scheduled ? {} : S.off) })), ...extra.map(() => H(''))].map((x) => (x === '' ? H('') : x)))
  const merges = [0, 1, 2, 3, 4].map((c) => ({ s: { r: hr, c }, e: { r: hr + 1, c } }))
  extra.forEach((_, i) => merges.push({ s: { r: hr, c: 5 + n + i }, e: { r: hr + 1, c: 5 + n + i } }))

  rows.forEach((r, i) => {
    const R = aoa.length
    const codes = Object.entries(r.tot.codes).filter(([c]) => c !== 'РВ').map(([c, k]) => `${c}-${k}`).join(', ')
    const dayStyle = (c) => merge(S.center, c.scheduled ? {} : S.off, codeStyle(c.code), c.lateMin ? S.late : {})
    aoa.push([C(i + 1, S.center), C(r.emp.full_name, S.bold), C(r.emp.tab_number, S.center), C(companyOf(r)), C(r.emp.position),
      ...r.cells.map((c) => ({ v: c.code, s: dayStyle(c) })),
      C(r.tot.days, S.center), C(Number((r.tot.minutes / 60).toFixed(1)), S.center), C(r.tot.normDays, S.center),
      C(Number((r.tot.normMin / 60).toFixed(1)), S.center),
      C(r.tot.late || '', r.tot.late ? merge(S.center, S.late) : S.center), C(r.tot.lateMin || '', r.tot.lateMin ? merge(S.center, S.late) : S.center), C(codes)])
    aoa.push([C(''), C(''), C(''), C(''), C(''),
      ...r.cells.map((c) => ({ v: ['Я', 'РВ'].includes(c.code) ? hoursStr(c.worked) : '', s: merge(S.center, { font: { sz: 9, color: { rgb: '66736F' } } }, c.scheduled ? {} : S.off, c.lateMin ? S.late : {}) })),
      ...extra.map(() => C(''))])
    for (let c = 0; c < 5; c++) merges.push({ s: { r: R, c }, e: { r: R + 1, c } })
    extra.forEach((_, k) => merges.push({ s: { r: R, c: 5 + n + k }, e: { r: R + 1, c: 5 + n + k } }))
  })
  aoa.push([])
  aoa.push([{ v: 'Условные обозначения:', s: { font: { bold: true } } }])
  aoa.push([{ v: '', s: S.late }, 'Опоздание (красным)'])
  Object.entries(CODES).forEach(([c, v]) => aoa.push([{ v: c, s: merge(S.center, codeStyle(c)) }, v.label]))
  aoa.push([])
  aoa.push(['', 'Ответственное лицо (HR) ______________________', '', '', '', '', '', '', '', '', '', '', 'Руководитель ______________________'])
  return sheet(aoa, { merges, cols: [4, 30, 8, 16, 18, ...Array(n).fill(4.3), 8, 10, 8, 8, 9, 10, 18] })
}

// ---------- 2. Опоздания ----------
export function lateSheet(rows, y, m) {
  const aoa = titleRows('ОТЧЁТ ПО ОПОЗДАНИЯМ', y, m, companyLabel(rows))
  aoa.push(['ФИО', 'Компания', 'Должность', 'Дата', 'День', 'Начало смены', 'Приход', 'Опоздание, мин'].map(H))
  let total = 0
  rows.forEach((r) => r.cells.filter((c) => c.lateMin).forEach((c) => {
    total++
    const firstIn = c.events.find((e) => e.kind === 'in')
    aoa.push([C(r.emp.full_name, S.bold), C(companyOf(r)), C(r.emp.position), C(fmtDate(c.key), S.center), C(DOW_SHORT[isoDow(c.key)], S.center),
      C(r.emp.work_start.slice(0, 5), S.center), C(firstIn ? fmtTime(firstIn.ts) : '', merge(S.center, S.late)), C(c.lateMin, merge(S.center, S.late))])
  }))
  if (!total) aoa.push([C('Опозданий за период нет')])
  aoa.push([])
  aoa.push([{ v: 'Итого по работникам', s: { font: { bold: true } } }])
  aoa.push(['ФИО', 'Компания', 'Опозданий', 'Всего минут', 'Рабочих дней', 'Доля дней с опозданием'].map(H))
  rows.filter((r) => r.tot.late).sort((a, b) => b.tot.lateMin - a.tot.lateMin).forEach((r) => {
    aoa.push([C(r.emp.full_name, S.bold), C(companyOf(r)), C(r.tot.late, merge(S.center, S.late)), C(r.tot.lateMin, S.center),
      C(r.tot.days, S.center), C(r.tot.days ? `${Math.round((r.tot.late / r.tot.days) * 100)}%` : '', S.center)])
  })
  return sheet(aoa, { cols: [32, 18, 22, 12, 7, 13, 10, 14] })
}

// ---------- 3. Отсутствия (отпуска, БС, больничные…) ----------
export function absencesSheet(rows, y, m) {
  const aoa = titleRows('ОТЧЁТ ПО ОТСУТСТВИЯМ', y, m, companyLabel(rows))
  aoa.push(['ФИО', 'Компания', 'Должность', 'Код', 'Вид отсутствия', 'С', 'По', 'Дней'].map(H))
  let any = false
  rows.forEach((r) => {
    // объединяем подряд идущие дни с одинаковым кодом в периоды
    const spans = []
    r.cells.forEach((c) => {
      const code = c.absence ? c.absence.code : c.code === 'НН' ? 'НН' : null
      const last = spans[spans.length - 1]
      if (code && last && last.code === code && last.toD === c.d - 1) { last.to = c.key; last.toD = c.d; last.n++ }
      else if (code) spans.push({ code, from: c.key, to: c.key, toD: c.d, n: 1 })
    })
    spans.forEach((s) => {
      any = true
      aoa.push([C(r.emp.full_name, S.bold), C(companyOf(r)), C(r.emp.position), C(s.code, merge(S.center, codeStyle(s.code))),
        C(CODES[s.code]?.label), C(fmtDate(s.from), S.center), C(fmtDate(s.to), S.center), C(s.n, S.center)])
    })
  })
  if (!any) aoa.push([C('Отсутствий за период нет')])
  return sheet(aoa, { cols: [32, 18, 22, 7, 44, 12, 12, 7] })
}

// ---------- 4. Сводка по компаниям ----------
export function summarySheet(rows, y, m) {
  const aoa = titleRows('СВОДКА ПО КОМПАНИЯМ', y, m, '')
  const cols = ['Компания', 'Работников', 'Явок, чел.-дн', 'Отработано, ч', 'Норма, ч', 'Выполнение нормы', 'Опозданий', 'Опоздания, мин', 'НН', 'Больничный (Б)', 'Отпуск (ОТ)', 'БС', 'Прочие отсутствия']
  aoa.push(cols.map(H))
  const by = {}
  rows.forEach((r) => {
    const k = companyOf(r)
    const t = (by[k] ||= { n: 0, days: 0, min: 0, norm: 0, late: 0, lateMin: 0, nn: 0, b: 0, ot: 0, bs: 0, other: 0 })
    t.n++; t.days += r.tot.days; t.min += r.tot.minutes; t.norm += r.tot.normMin; t.late += r.tot.late; t.lateMin += r.tot.lateMin
    Object.entries(r.tot.codes).forEach(([c, k2]) => {
      if (c === 'НН') t.nn += k2; else if (c === 'Б') t.b += k2; else if (c === 'ОТ') t.ot += k2; else if (c === 'БС') t.bs += k2; else if (c !== 'РВ') t.other += k2
    })
  })
  const all = { n: 0, days: 0, min: 0, norm: 0, late: 0, lateMin: 0, nn: 0, b: 0, ot: 0, bs: 0, other: 0 }
  const line = (name, t, st) => [C(name, st || S.bold), C(t.n, S.center), C(t.days, S.center), C(Number((t.min / 60).toFixed(1)), S.center),
    C(Number((t.norm / 60).toFixed(1)), S.center), C(t.norm ? `${Math.round((t.min / t.norm) * 100)}%` : '', S.center),
    C(t.late, t.late ? merge(S.center, S.late) : S.center), C(t.lateMin, S.center), C(t.nn, t.nn ? merge(S.center, S.bad) : S.center),
    C(t.b, S.center), C(t.ot, S.center), C(t.bs, S.center), C(t.other, S.center)]
  Object.entries(by).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, t]) => {
    aoa.push(line(k, t)); Object.keys(all).forEach((f) => (all[f] += t[f]))
  })
  aoa.push(line('ИТОГО', all, merge(S.bold, { fill: fill('E6F4F2') })))
  return sheet(aoa, { cols: [22, 11, 13, 13, 10, 12, 11, 13, 7, 12, 11, 7, 14] })
}

// ---------- 5. Отметки (детализация) ----------
export function marksSheet(rows, y, m) {
  const aoa = titleRows('ЖУРНАЛ ОТМЕТОК', y, m, companyLabel(rows))
  aoa.push(['ФИО', 'Компания', 'Таб. №', 'Дата', 'Приход', 'Уход', 'Отработано, ч', 'Опоздание, мин', 'Ручные отметки', 'Замечания'].map(H))
  rows.forEach((r) => r.cells.forEach((c) => {
    if (!c.events.length && !c.absence) return
    const ins = c.events.filter((e) => e.kind === 'in').map((e) => fmtTime(e.ts)).join(', ')
    const outs = c.events.filter((e) => e.kind === 'out').map((e) => fmtTime(e.ts)).join(', ')
    const manual = c.events.filter((e) => e.source === 'manual').map((e) => `${fmtTime(e.ts)}${e.note ? ` (${e.note})` : ''}`).join('; ')
    aoa.push([C(r.emp.full_name, S.bold), C(companyOf(r)), C(r.emp.tab_number, S.center), C(fmtDate(c.key), S.center),
      C(ins, c.lateMin ? merge(S.center, S.late) : S.center), C(outs, S.center), C(c.worked ? Number((c.worked / 60).toFixed(2)) : '', S.center),
      C(c.lateMin || '', c.lateMin ? merge(S.center, S.late) : S.center), C(manual),
      C([c.absence ? `${c.absence.code}: ${CODES[c.absence.code]?.label || ''}` : '', ...c.issues, c.early ? 'Ранний уход' : ''].filter(Boolean).join('; '))])
  }))
  return sheet(aoa, { cols: [32, 18, 8, 11, 14, 14, 12, 13, 26, 40] })
}

// ---------- 6. Список работников ----------
export function employeesSheet(list, companyName = '') {
  const aoa = [[{ v: ORG_NAME, s: S.sub }], [{ v: 'СПИСОК РАБОТНИКОВ', s: S.title }],
    [{ v: `${companyName ? `Компания: ${companyName} · ` : ''}На ${fmtDate(todayKey())}`, s: S.sub }], []]
  aoa.push(['№', 'ФИО', 'Компания', 'Должность', 'Подразделение', 'Таб. №', 'Email', 'Телефон', 'График', 'Статус'].map(H))
  list.forEach((e, i) => aoa.push([C(i + 1, S.center), C(e.full_name, S.bold), C(e.companies?.name), C(e.position), C(e.department),
    C(e.tab_number, S.center), C(e.email), C(fmtPhone(e.phone)), C(`${e.work_start.slice(0, 5)}–${e.work_end.slice(0, 5)}`, S.center),
    C(e.active ? 'Работает' : 'Уволен')]))
  return sheet(aoa, { cols: [4, 32, 18, 24, 18, 8, 26, 17, 12, 10] })
}

// ---------- выгрузка ----------
const fileTag = (y, m, rows) => { const c = companyLabel(rows); return `${String(m).padStart(2, '0')}_${y}${c ? '_' + c.replace(/\s+/g, '_') : ''}` }
function save(sheets, name) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(([title, ws]) => XLSX.utils.book_append_sheet(wb, ws, title))
  XLSX.writeFile(wb, name)
}

export const REPORTS = {
  timesheet: { title: 'Табель учёта рабочего времени', hint: 'Коды по дням и часы, итоги, норма. Опоздания — красным.',
    run: (rows, y, m) => save([['Табель', timesheetSheet(rows, y, m)], ['Отметки', marksSheet(rows, y, m)]], `Табель_${fileTag(y, m, rows)}.xlsx`) },
  late: { title: 'Опоздания', hint: 'Каждое опоздание с временем прихода и итоги по работникам.',
    run: (rows, y, m) => save([['Опоздания', lateSheet(rows, y, m)]], `Опоздания_${fileTag(y, m, rows)}.xlsx`) },
  absences: { title: 'Отсутствия', hint: 'Отпуска, БС, больничные, командировки, неявки — периодами.',
    run: (rows, y, m) => save([['Отсутствия', absencesSheet(rows, y, m)]], `Отсутствия_${fileTag(y, m, rows)}.xlsx`) },
  summary: { title: 'Сводка по компаниям', hint: 'KazMining, MKA engineering, KazAgroFeed: явки, часы, опоздания, отсутствия.',
    run: (rows, y, m) => save([['Сводка', summarySheet(rows, y, m)]], `Сводка_${fileTag(y, m, rows)}.xlsx`) },
  marks: { title: 'Журнал отметок', hint: 'Все приходы и уходы по дням, ручные корректировки с основанием.',
    run: (rows, y, m) => save([['Отметки', marksSheet(rows, y, m)]], `Отметки_${fileTag(y, m, rows)}.xlsx`) },
  all: { title: 'Полный пакет', hint: 'Все отчёты одним файлом, каждый на своём листе.',
    run: (rows, y, m) => save([['Сводка', summarySheet(rows, y, m)], ['Табель', timesheetSheet(rows, y, m)], ['Опоздания', lateSheet(rows, y, m)],
      ['Отсутствия', absencesSheet(rows, y, m)], ['Отметки', marksSheet(rows, y, m)]], `Отчёт_${fileTag(y, m, rows)}.xlsx`) },
}

export const exportTimesheet = (rows, y, m) => REPORTS.timesheet.run(rows, y, m)
export const exportEmployees = (list, companyName) =>
  save([['Работники', employeesSheet(list, companyName)]], `Работники_${todayKey()}.xlsx`)
