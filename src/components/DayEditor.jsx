import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { CODES, MANUAL_CODES } from '../lib/timesheet'
import { fmtTime, fmtDate, toUtcISO } from '../lib/time'

// Корректировка дня: ручные отметки и коды отсутствия
export default function DayEditor({ emp, day, onClose, onChanged }) {
  const [events, setEvents] = useState([])
  const [absence, setAbsence] = useState(null)
  const [kind, setKind] = useState('in')
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')
  const [code, setCode] = useState('')
  const [rangeTo, setRangeTo] = useState(day)
  const [err, setErr] = useState(null)

  async function load() {
    const from = toUtcISO(day, '00:00')
    const to = new Date(new Date(from).getTime() + 86400e3).toISOString()
    const [ev, ab] = await Promise.all([
      supabase.from('attendance_events').select('*, kiosks(name)').eq('employee_id', emp.id).gte('ts', from).lt('ts', to).order('ts'),
      supabase.from('absences').select('*').eq('employee_id', emp.id).eq('day', day).maybeSingle(),
    ])
    setEvents(ev.data || []); setAbsence(ab.data); setCode(ab.data?.code || '')
  }
  useEffect(() => { load() }, [emp.id, day])

  const run = async (p) => { setErr(null); const { error } = await p; if (error) setErr(errText(error)); else { await load(); onChanged?.() } }

  const addEvent = (e) => {
    e.preventDefault()
    run(supabase.from('attendance_events').insert({ employee_id: emp.id, kind, ts: toUtcISO(day, time), source: 'manual', note: note || null }))
    setNote('')
  }
  const delEvent = (id) => confirm('Удалить отметку?') && run(supabase.from('attendance_events').delete().eq('id', id))

  const saveAbsence = async () => {
    const days = []
    for (let d = new Date(day + 'T00:00:00Z'); d <= new Date(rangeTo + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10))
    if (!code) return run(supabase.from('absences').delete().eq('employee_id', emp.id).in('day', days))
    run(supabase.from('absences').upsert(days.map((d) => ({ employee_id: emp.id, day: d, code }))))
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h3 style={{ margin: 0 }}>{emp.full_name}</h3>
            <div className="muted small">{fmtDate(day)} · график {emp.work_start.slice(0, 5)}–{emp.work_end.slice(0, 5)}</div>
          </div>
          <button className="btn sm ghost" onClick={onClose}>✕</button>
        </div>

        <h4>Отметки</h4>
        <table className="tbl">
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td><span className={`pill ${e.kind}`}>{e.kind === 'in' ? 'Приход' : 'Уход'}</span></td>
                <td><b>{fmtTime(e.ts)}</b></td>
                <td className="muted small">{e.source === 'manual' ? `вручную${e.note ? ': ' + e.note : ''}` : e.kiosks?.name || 'QR'}</td>
                <td className="r"><button className="linkbtn red" onClick={() => delEvent(e.id)}>удалить</button></td>
              </tr>
            ))}
            {!events.length && <tr><td className="muted">Нет отметок</td></tr>}
          </tbody>
        </table>

        <form className="row gap wrap" onSubmit={addEvent}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="in">Приход</option><option value="out">Уход</option>
          </select>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          <input placeholder="Основание (служебная записка…)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <button className="btn sm primary">Добавить</button>
        </form>

        <h4>Отсутствие</h4>
        <div className="row gap wrap">
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">— нет —</option>
            {MANUAL_CODES.map((c) => <option key={c} value={c}>{c} — {CODES[c].label}</option>)}
          </select>
          <label className="inline">по <input type="date" value={rangeTo} min={day} onChange={(e) => setRangeTo(e.target.value)} /></label>
          <button className="btn sm" onClick={saveAbsence}>Сохранить</button>
        </div>
        {absence && <p className="muted small">Сейчас: {absence.code} — {CODES[absence.code]?.label}</p>}
        {err && <div className="alert err">{err}</div>}
      </div>
    </div>
  )
}
