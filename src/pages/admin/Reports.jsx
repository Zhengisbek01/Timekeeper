import { useEffect, useState } from 'react'
import { supabase, errText } from '../../lib/supabase'
import { loadMonth, loadCompanies, EMP_SELECT } from '../../lib/data'
import { hoursStr } from '../../lib/timesheet'
import { todayKey } from '../../lib/time'
import MonthPicker from '../../components/MonthPicker'
import CompanySelect from '../../components/CompanySelect'

const ORDER = ['all', 'timesheet', 'late', 'absences', 'summary', 'marks']

export default function Reports() {
  const t = todayKey()
  const [ym, setYm] = useState({ y: +t.slice(0, 4), m: +t.slice(5, 7) })
  const [company, setCompany] = useState('')
  const [rows, setRows] = useState(null)
  const [reports, setReports] = useState(null)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => { import('../../lib/export').then((x) => setReports(x)) }, [])
  useEffect(() => {
    setRows(null); setErr(null)
    loadMonth(ym.y, ym.m, company).then((d) => setRows(d.rows)).catch((e) => setErr(errText(e)))
  }, [ym, company])

  const run = async (key) => {
    setBusy(key)
    try { reports.REPORTS[key].run(rows, ym.y, ym.m) } catch (e) { setErr(errText(e)) }
    setBusy(null)
  }
  const exportStaff = async () => {
    setBusy('staff')
    let q = supabase.from('employees').select(EMP_SELECT).eq('status', 'approved').order('full_name')
    if (company) q = q.eq('company_id', company)
    const { data, error } = await q
    if (error) setErr(errText(error))
    else {
      const name = company ? (await loadCompanies()).find((c) => c.id === company)?.name : ''
      reports.exportEmployees(data || [], name)
    }
    setBusy(null)
  }

  const tot = (rows || []).reduce((a, r) => ({ n: a.n + 1, min: a.min + r.tot.minutes, late: a.late + r.tot.late,
    nn: a.nn + (r.tot.codes['НН'] || 0), abs: a.abs + Object.entries(r.tot.codes).filter(([c]) => !['НН', 'РВ'].includes(c)).reduce((s, [, k]) => s + k, 0) }),
  { n: 0, min: 0, late: 0, nn: 0, abs: 0 })

  return (
    <>
      <div className="card">
        <div className="row gap wrap">
          <MonthPicker value={ym} onChange={setYm} />
          <CompanySelect value={company} onChange={setCompany} />
        </div>
        <div className="stats five" style={{ marginTop: 12 }}>
          <div className="stat"><div className="muted small">Работников</div><div className="v">{rows ? tot.n : '…'}</div></div>
          <div className="stat"><div className="muted small">Отработано, ч</div><div className="v">{rows ? hoursStr(tot.min) || 0 : '…'}</div></div>
          <div className="stat s-late"><div className="muted small">Опозданий</div><div className="v">{rows ? tot.late : '…'}</div></div>
          <div className="stat s-none"><div className="muted small">Неявок (НН)</div><div className="v">{rows ? tot.nn : '…'}</div></div>
          <div className="stat s-abs"><div className="muted small">Дней отсутствий</div><div className="v">{rows ? tot.abs : '…'}</div></div>
        </div>
        {err && <div className="alert err">{err}</div>}
      </div>

      <div className="reports">
        {reports && ORDER.map((k) => (
          <div key={k} className={`card report ${k === 'all' ? 'main' : ''}`}>
            <h3>{reports.REPORTS[k].title}</h3>
            <p className="muted small">{reports.REPORTS[k].hint}</p>
            <button className={`btn ${k === 'all' ? 'primary' : ''}`} disabled={!rows || !rows.length || busy} onClick={() => run(k)}>
              {busy === k ? 'Формирую…' : 'Скачать Excel'}
            </button>
          </div>
        ))}
        {reports && (
          <div className="card report">
            <h3>Список работников</h3>
            <p className="muted small">ФИО, компания, должность, контакты, график — на текущую дату.</p>
            <button className="btn" disabled={busy} onClick={exportStaff}>{busy === 'staff' ? 'Формирую…' : 'Скачать Excel'}</button>
          </div>
        )}
      </div>
      {rows && !rows.length && <p className="muted">За выбранный период нет данных.</p>}
    </>
  )
}
