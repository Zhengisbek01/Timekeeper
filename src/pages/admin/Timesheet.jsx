import { useEffect, useState, useCallback } from 'react'
import { hoursStr, CODES } from '../../lib/timesheet'
import { loadMonth } from '../../lib/data'
import { todayKey, DOW_SHORT, isoDow, minToHM } from '../../lib/time'
import MonthPicker from '../../components/MonthPicker'
import CompanySelect from '../../components/CompanySelect'
import DayEditor from '../../components/DayEditor'

export default function Timesheet() {
  const t = todayKey()
  const [ym, setYm] = useState({ y: +t.slice(0, 4), m: +t.slice(5, 7) })
  const [company, setCompany] = useState('')
  const [rows, setRows] = useState(null)
  const [onlyLate, setOnlyLate] = useState(false)
  const [edit, setEdit] = useState(null)

  const load = useCallback(async () => {
    const { rows } = await loadMonth(ym.y, ym.m, company)
    setRows(rows)
  }, [ym, company])

  useEffect(() => { setRows(null); load() }, [load])

  const shown = (rows || []).filter((r) => !onlyLate || r.tot.late)
  const header = rows?.[0]?.cells || []
  let lastCompany = null

  return (
    <div className="card">
      <div className="row between wrap gap">
        <div className="row gap wrap">
          <MonthPicker value={ym} onChange={setYm} />
          <CompanySelect value={company} onChange={setCompany} />
          <label className="inline"><input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} /> только с опозданиями</label>
        </div>
        <button className="btn primary" disabled={!shown.length}
          onClick={() => import('../../lib/export').then((x) => x.exportTimesheet(shown, ym.y, ym.m))}>Скачать табель (Excel)</button>
      </div>
      <p className="muted small">Дни с отметками заполняются автоматически. Отпуск, БС, больничный и другие отсутствия — нажмите на ячейку.</p>

      {!rows ? <p className="muted">Загрузка…</p> : (
        <div className="scroll-x ts-wrap">
          <table className="ts">
            <thead>
              <tr>
                <th className="sticky name">Работник</th>
                {header.map((c) => (
                  <th key={c.key} className={!c.scheduled ? 'off' : ''} title={c.holiday?.name}>
                    {c.d}<br /><small>{DOW_SHORT[isoDow(c.key)]}</small>
                  </th>
                ))}
                <th>Дни</th><th>Часы</th><th>Норма</th><th>Опозд.</th><th>⚠</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const cname = r.emp.companies?.name || 'Без компании'
                const sep = !company && cname !== lastCompany
                lastCompany = cname
                return [
                  sep && <tr key={'h' + cname} className="group"><td className="sticky name" colSpan={1}>{cname}</td><td colSpan={header.length + 5} /></tr>,
                  <tr key={r.emp.id} className={r.tot.late ? 'has-late' : ''}>
                    <td className="sticky name">
                      <b>{r.emp.full_name}</b>
                      <div className="muted small">{[r.emp.tab_number && `№ ${r.emp.tab_number}`, r.emp.position].filter(Boolean).join(' · ')}</div>
                    </td>
                    {r.cells.map((c) => (
                      <td key={c.key}
                        className={`cell c-${c.code} ${!c.scheduled ? 'off' : ''} ${c.issues.length ? 'issue' : ''} ${c.lateMin ? 'late' : ''}`}
                        title={[CODES[c.code]?.label, c.lateMin && `Опоздание ${c.lateMin} мин`, ...c.issues].filter(Boolean).join('\n')}
                        onClick={() => setEdit({ emp: r.emp, day: c.key })}>
                        <div className="cc">{c.code}</div>
                        <div className="ch">{['Я', 'РВ'].includes(c.code) ? hoursStr(c.worked) : ''}</div>
                      </td>
                    ))}
                    <td className="tot">{r.tot.days}</td>
                    <td className="tot">{hoursStr(r.tot.minutes) || 0}</td>
                    <td className="tot muted">{hoursStr(r.tot.normMin)}</td>
                    <td className={`tot ${r.tot.late ? 'late-tot' : ''}`}>{r.tot.late ? <span title={`Всего ${minToHM(r.tot.lateMin)}`}>{r.tot.late}</span> : ''}</td>
                    <td className="tot">{r.tot.issues ? <span className="tag amber">{r.tot.issues}</span> : ''}</td>
                  </tr>,
                ]
              })}
              {!shown.length && <tr><td className="muted" colSpan={40}>Нет работников</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="legend">
        <span><span className="code late-dot">Я</span> опоздание</span>
        {Object.entries(CODES).map(([c, v]) => <span key={c}><span className={`code c-${c}`}>{c}</span> {v.label}</span>)}
        <span><span className="code issue-dot">!</span> ошибка отметок — нажмите на ячейку</span>
      </div>

      {edit && <DayEditor emp={edit.emp} day={edit.day} onClose={() => setEdit(null)} onChanged={load} />}
    </div>
  )
}
