import { useEffect, useState } from 'react'
import { supabase, errText } from '../../lib/supabase'
import { fmtDate, DOW_SHORT, isoDow, todayKey } from '../../lib/time'

export default function Calendar() {
  const [year, setYear] = useState(+todayKey().slice(0, 4))
  const [list, setList] = useState([])
  const [f, setF] = useState({ day: '', name: '', kind: 'holiday' })
  const [err, setErr] = useState(null)

  const load = () => supabase.from('holidays').select('*').gte('day', `${year}-01-01`).lte('day', `${year}-12-31`).order('day')
    .then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [year])
  const run = async (p) => { setErr(null); const { error } = await p; if (error) setErr(errText(error)); load() }

  return (
    <div className="card">
      <div className="row between wrap gap">
        <div className="mp">
          <button className="btn sm ghost" onClick={() => setYear(year - 1)}>‹</button><span>{year}</span>
          <button className="btn sm ghost" onClick={() => setYear(year + 1)}>›</button>
        </div>
        <form className="row gap wrap" onSubmit={(e) => { e.preventDefault(); run(supabase.from('holidays').upsert(f)); setF({ ...f, day: '', name: '' }) }}>
          <input type="date" required value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
          <input required placeholder="Название / основание" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="holiday">Выходной / праздник</option>
            <option value="workday">Рабочий день (перенос)</option>
          </select>
          <button className="btn primary">Добавить</button>
        </form>
      </div>
      <p className="muted small">Праздничные дни и переносы по постановлению Правительства РК. Дни с типом «выходной» не входят в норму; «рабочий день» — выходной, перенесённый в рабочий.</p>
      {err && <div className="alert err">{err}</div>}
      <table className="tbl">
        <tbody>
          {list.map((h) => (
            <tr key={h.day}>
              <td style={{ width: 140 }}>{fmtDate(h.day)} <span className="muted">{DOW_SHORT[isoDow(h.day)]}</span></td>
              <td>{h.name}</td>
              <td>{h.kind === 'holiday' ? <span className="pill st-abs">выходной</span> : <span className="pill st-here">рабочий</span>}</td>
              <td className="r"><button className="linkbtn red" onClick={() => run(supabase.from('holidays').delete().eq('day', h.day))}>удалить</button></td>
            </tr>
          ))}
          {!list.length && <tr><td className="muted">Нет данных за {year} год</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
