import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { buildTimesheet, hoursStr, CODES } from '../../lib/timesheet'
import { todayKey, toUtcISO, fmtTime, fmtDate, dateKey, minutesOfDay, timeToMin, durStr } from '../../lib/time'
import DayEditor from '../../components/DayEditor'
import CompanySelect from '../../components/CompanySelect'
import { EMP_SELECT } from '../../lib/data'

const LABEL = { here: 'На месте', left: 'Ушёл', none: 'Не отмечался', abs: 'Отсутствует', off: 'Выходной' }
const status = (c) => {
  if (c.absence) return 'abs'
  if (c.openSince) return 'here'
  if (c.events.length) return 'left'
  if (c.scheduled) return 'none'
  return 'off'
}
const source = (e) => (e.source === 'manual' ? `вручную${e.note ? ': ' + e.note : ''}` : e.kiosks?.name || 'QR')

export default function Today() {
  const [day, setDay] = useState(todayKey())
  const [rows, setRows] = useState([])
  const [view, setView] = useState('people')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [company, setCompany] = useState('')
  const [edit, setEdit] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [updated, setUpdated] = useState(null)

  const load = useCallback(async () => {
    const y = +day.slice(0, 4), m = +day.slice(5, 7)
    const from = new Date(new Date(toUtcISO(day, '00:00')).getTime() - 16 * 3600e3).toISOString()
    const to = new Date(new Date(toUtcISO(day, '00:00')).getTime() + 40 * 3600e3).toISOString()
    const [emp, ev, ab, ho] = await Promise.all([
      supabase.from('employees').select(EMP_SELECT).eq('active', true).eq('status', 'approved').order('full_name'),
      supabase.from('attendance_events').select('*, kiosks(name)').gte('ts', from).lt('ts', to).order('ts'),
      supabase.from('absences').select('*').eq('day', day),
      supabase.from('holidays').select('*'),
    ])
    const ts = buildTimesheet({ employees: emp.data || [], events: ev.data || [], absences: ab.data || [], holidays: ho.data || [], y, m })
    setRows(ts.map((r) => ({ emp: r.emp, c: r.cells.find((c) => c.key === day) })))
    setUpdated(new Date())
  }, [day])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (day !== todayKey()) return
    const t = setInterval(load, 30000), c = setInterval(() => setNow(Date.now()), 60000)
    return () => { clearInterval(t); clearInterval(c) }
  }, [day, load])

  // отработано с учётом незакрытой сессии (человек сейчас на месте)
  const workedNow = (c) => c.worked + (c.openSince ? Math.max(0, Math.round((now - new Date(c.openSince)) / 60000)) : 0)

  const scoped = rows.filter(({ emp }) => !company || emp.company_id === company)
  const cnt = { here: 0, left: 0, none: 0, abs: 0, late: 0, early: 0 }
  scoped.forEach(({ c }) => { cnt[status(c)]++; if (c.lateMin) cnt.late++; if (c.early) cnt.early++ })

  const match = (emp) => !q || [emp.full_name, emp.position, emp.department].join(' ').toLowerCase().includes(q.toLowerCase())
  const list = scoped.filter(({ emp, c }) => match(emp) &&
    (filter === 'all' || (filter === 'late' ? c.lateMin : filter === 'early' ? c.early : status(c) === filter)))

  // журнал: все отметки за день по времени
  const journal = scoped.filter(({ emp }) => match(emp))
    .flatMap(({ emp, c }) => c.events.map((e, i) => ({ e, emp, c, late: e.kind === 'in' && c.lateMin && c.events.findIndex((x) => x.kind === 'in') === i })))
    .filter(({ e }) => dateKey(e.ts) === day)
    .sort((a, b) => new Date(b.e.ts) - new Date(a.e.ts))

  const exportDay = () => import('../../lib/export').then((x) => x.exportDay(list, journal, day))

  return (
    <>
      <div className="stats six">
        {[['here', 'На месте'], ['left', 'Ушли'], ['late', 'Опоздали'], ['early', 'Ранний уход'], ['none', 'Не отмечались'], ['abs', 'Отсутствуют']].map(([k, l]) => (
          <button key={k} className={`stat clickable s-${k} ${filter === k ? 'on' : ''}`} onClick={() => { setFilter(filter === k ? 'all' : k); setView('people') }}>
            <div className="muted small">{l}</div><div className="v">{cnt[k] || 0}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="row between wrap gap">
          <div className="row gap wrap">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value || todayKey())} />
            <CompanySelect value={company} onChange={setCompany} />
            <div className="seg inline-seg">
              <button className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>По работникам</button>
              <button className={view === 'log' ? 'on' : ''} onClick={() => setView('log')}>Журнал отметок ({journal.length})</button>
            </div>
          </div>
          <div className="row gap wrap">
            <input placeholder="Поиск: ФИО, должность" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
            <button className="btn" onClick={exportDay}>Excel за день</button>
          </div>
        </div>
        {day === todayKey() && updated && <p className="muted small" style={{ margin: '8px 0 0' }}>Обновлено в {fmtTime(updated)}, автоматически каждые 30 с</p>}

        {view === 'people' ? (
          <div className="scroll-x">
            <table className="tbl today">
              <thead><tr>
                <th>Работник</th><th>Компания</th><th>График</th><th>Статус</th>
                <th>Приход</th><th>Уход</th><th>Все отметки за день</th><th className="r">Отработано</th><th></th>
              </tr></thead>
              <tbody>
                {list.map(({ emp, c }) => {
                  const st = status(c)
                  const firstIn = c.events.find((e) => e.kind === 'in')
                  const lastOut = [...c.events].reverse().find((e) => e.kind === 'out')
                  const earlyMin = c.early && lastOut ? timeToMin(emp.work_end) - minutesOfDay(lastOut.ts) : 0
                  const w = workedNow(c)
                  return (
                    <tr key={emp.id} className={c.lateMin ? 'row-late' : ''}>
                      <td><b>{emp.full_name}</b><div className="muted small">{[emp.position, emp.department].filter(Boolean).join(' · ')}</div></td>
                      <td className="small">{emp.companies?.name}</td>
                      <td className="small nowrap">{emp.work_start.slice(0, 5)}–{emp.work_end.slice(0, 5)}</td>
                      <td><span className={`pill st-${st}`}>{st === 'abs' ? `${c.absence.code} · ${CODES[c.absence.code]?.label || ''}` : LABEL[st]}</span></td>
                      <td className="nowrap">
                        {firstIn ? <b className={c.lateMin ? 'late-time' : ''}>{fmtTime(firstIn.ts)}</b> : <span className="muted">—</span>}
                        {c.lateMin ? <div className="tag red">опоздание {durStr(c.lateMin)}</div> : null}
                      </td>
                      <td className="nowrap">
                        {lastOut && !c.openSince ? <b>{fmtTime(lastOut.ts)}</b> : <span className="muted">{c.openSince ? 'ещё на месте' : '—'}</span>}
                        {earlyMin > 0 ? <div className="tag amber">раньше на {durStr(earlyMin)}</div> : null}
                      </td>
                      <td>
                        <div className="marks">
                          {c.events.map((e) => (
                            <span key={e.id} className={`mark ${e.kind} ${e.source === 'manual' ? 'manual' : ''}`} title={`${e.kind === 'in' ? 'Приход' : 'Уход'} · ${source(e)}`}>
                              {e.kind === 'in' ? '→' : '←'} {fmtTime(e.ts)}{e.source === 'manual' ? ' ✎' : ''}
                            </span>
                          ))}
                          {c.issues.map((s) => <span key={s} className="tag amber">{s}</span>)}
                          {!c.events.length && <span className="muted small">—</span>}
                        </div>
                      </td>
                      <td className="r nowrap">{w ? <b>{durStr(w)}</b> : <span className="muted">—</span>}{c.openSince ? <div className="muted small">идёт</div> : null}</td>
                      <td className="r"><button className="linkbtn" onClick={() => setEdit(emp)}>изменить</button></td>
                    </tr>
                  )
                })}
                {!list.length && <tr><td colSpan={9} className="muted">Нет данных на {fmtDate(day)}</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Время</th><th>Работник</th><th>Компания</th><th>Отметка</th><th>Источник</th><th></th></tr></thead>
              <tbody>
                {journal.map(({ e, emp, late, c }) => (
                  <tr key={e.id} className={late ? 'row-late' : ''}>
                    <td className="nowrap"><b>{fmtTime(e.ts)}</b></td>
                    <td><b>{emp.full_name}</b><div className="muted small">{emp.position}</div></td>
                    <td className="small">{emp.companies?.name}</td>
                    <td className="nowrap">
                      <span className={`pill ${e.kind}`}>{e.kind === 'in' ? 'Приход' : 'Уход'}</span>
                      {late ? <span className="tag red"> опоздание {durStr(c.lateMin)}</span> : null}
                    </td>
                    <td className="small">{e.source === 'manual' ? <span className="tag amber">✎ {source(e)}</span> : source(e)}</td>
                    <td className="r"><button className="linkbtn" onClick={() => setEdit(emp)}>изменить</button></td>
                  </tr>
                ))}
                {!journal.length && <tr><td colSpan={6} className="muted">Отметок за {fmtDate(day)} нет</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>→ приход · ← уход · ✎ отметка поставлена HR вручную (наведите, чтобы увидеть основание)</p>
      </div>
      {edit && <DayEditor emp={edit} day={day} onClose={() => setEdit(null)} onChanged={load} />}
    </>
  )
}
