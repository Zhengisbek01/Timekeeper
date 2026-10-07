import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { buildTimesheet, hoursStr, CODES } from '../../lib/timesheet'
import { todayKey, toUtcISO, fmtTime, fmtDate } from '../../lib/time'
import DayEditor from '../../components/DayEditor'
import CompanySelect from '../../components/CompanySelect'
import { EMP_SELECT } from '../../lib/data'

export default function Today() {
  const [day, setDay] = useState(todayKey())
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [company, setCompany] = useState('')
  const [edit, setEdit] = useState(null)

  const load = useCallback(async () => {
    const y = +day.slice(0, 4), m = +day.slice(5, 7)
    const from = new Date(new Date(toUtcISO(day, '00:00')).getTime() - 16 * 3600e3).toISOString()
    const to = new Date(new Date(toUtcISO(day, '00:00')).getTime() + 40 * 3600e3).toISOString()
    const [emp, ev, ab, ho] = await Promise.all([
      supabase.from('employees').select(EMP_SELECT).eq('active', true).eq('status', 'approved').order('full_name'),
      supabase.from('attendance_events').select('*').gte('ts', from).lt('ts', to),
      supabase.from('absences').select('*').eq('day', day),
      supabase.from('holidays').select('*'),
    ])
    const ts = buildTimesheet({ employees: emp.data || [], events: ev.data || [], absences: ab.data || [], holidays: ho.data || [], y, m })
    setRows(ts.map((r) => ({ emp: r.emp, c: r.cells.find((c) => c.key === day) })))
  }, [day])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (day !== todayKey()) return; const t = setInterval(load, 30000); return () => clearInterval(t) }, [day, load])

  const status = (c) => {
    if (c.absence) return 'abs'
    if (c.openSince) return 'here'
    if (c.events.length) return 'left'
    if (c.scheduled) return 'none'
    return 'off'
  }
  const cnt = { here: 0, left: 0, none: 0, abs: 0, late: 0 }
  rows.filter(({ emp }) => !company || emp.company_id === company).forEach(({ c }) => { cnt[status(c)] = (cnt[status(c)] || 0) + 1; if (c.lateMin) cnt.late++ })

  const list = rows.filter(({ emp, c }) =>
    (!company || emp.company_id === company) &&
    (!q || emp.full_name.toLowerCase().includes(q.toLowerCase()) || (emp.position || '').toLowerCase().includes(q.toLowerCase())) &&
    (filter === 'all' || (filter === 'late' ? c.lateMin : status(c) === filter)))

  const LABEL = { here: 'На месте', left: 'Ушёл', none: 'Не отмечался', abs: 'Отсутствует', off: 'Выходной' }

  return (
    <>
      <div className="stats five">
        {[['here', 'На месте'], ['left', 'Ушли'], ['late', 'Опоздали'], ['none', 'Не отмечались'], ['abs', 'Отсутствуют']].map(([k, l]) => (
          <button key={k} className={`stat clickable s-${k} ${filter === k ? 'on' : ''}`} onClick={() => setFilter(filter === k ? 'all' : k)}>
            <div className="muted small">{l}</div><div className="v">{cnt[k] || 0}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="row between wrap gap">
          <div className="row gap">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value || todayKey())} />
            <CompanySelect value={company} onChange={setCompany} />
            {day === todayKey() && <span className="muted small">обновляется каждые 30 с</span>}
          </div>
          <input placeholder="Поиск: ФИО или должность" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Работник</th><th>Компания</th><th>Статус</th><th>Приход</th><th>Уход</th><th className="r">Часы</th><th></th></tr></thead>
            <tbody>
              {list.map(({ emp, c }) => {
                const st = status(c)
                const ins = c.events.filter((e) => e.kind === 'in'), outs = c.events.filter((e) => e.kind === 'out')
                return (
                  <tr key={emp.id} className={c.lateMin ? 'row-late' : ''}>
                    <td><b>{emp.full_name}</b><div className="muted small">{[emp.position, emp.department].filter(Boolean).join(' · ')}</div></td>
                    <td className="small">{emp.companies?.name}</td>
                    <td><span className={`pill st-${st}`}>{st === 'abs' ? `${c.absence.code} · ${CODES[c.absence.code]?.label || ''}` : LABEL[st]}</span></td>
                    <td>{ins.map((e) => fmtTime(e.ts)).join(', ')}{c.lateMin ? <span className="tag red"> +{c.lateMin} мин</span> : ''}</td>
                    <td>{outs.map((e) => fmtTime(e.ts)).join(', ')}{c.early ? <span className="tag amber"> ранний уход</span> : ''}{c.issues.length ? <span className="tag amber"> {c.issues.join(', ')}</span> : ''}</td>
                    <td className="r">{hoursStr(c.worked)}</td>
                    <td className="r"><button className="linkbtn" onClick={() => setEdit(emp)}>изменить</button></td>
                  </tr>
                )
              })}
              {!list.length && <tr><td colSpan={7} className="muted">Нет данных на {fmtDate(day)}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {edit && <DayEditor emp={edit} day={day} onClose={() => setEdit(null)} onChanged={load} />}
    </>
  )
}
