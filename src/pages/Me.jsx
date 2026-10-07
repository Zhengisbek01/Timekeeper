import { useEffect, useState } from 'react'
import { supabase, fmtPhone } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Brand } from '../components/Logo'
import { buildRow, hoursStr, CODES } from '../lib/timesheet'
import { monthRangeUtc, fmtTime, fmtDate, todayKey, DOW_SHORT, isoDow, minToHM } from '../lib/time'
import MonthPicker from '../components/MonthPicker'

export default function Me() {
  const { employee, isAdmin, signOut, reload } = useAuth()
  const t = todayKey()
  const [ym, setYm] = useState({ y: +t.slice(0, 4), m: +t.slice(5, 7) })
  const [row, setRow] = useState(null)

  useEffect(() => {
    if (!employee || employee.status !== 'approved') return
    const [from, to] = monthRangeUtc(ym.y, ym.m, 1)
    Promise.all([
      supabase.from('attendance_events').select('*').eq('employee_id', employee.id).gte('ts', from).lt('ts', to).order('ts'),
      supabase.from('absences').select('*').eq('employee_id', employee.id),
      supabase.from('holidays').select('*'),
    ]).then(([ev, ab, ho]) => setRow(buildRow(employee, ev.data || [], ab.data || [], Object.fromEntries((ho.data || []).map((h) => [h.day, h])), ym.y, ym.m)))
  }, [employee, ym])

  if (!employee) return (
    <div className="center">
      <div className="card narrow">
        <h2>Учётная запись не найдена</h2>
        <p className="muted">Данные работника не найдены. Обратитесь в отдел кадров.</p>
        <button className="btn" onClick={signOut}>Выйти</button>
      </div>
    </div>
  )

  if (employee.status !== 'approved' || !employee.active) return (
    <div className="center">
      <div className="card narrow">
        <div className={`status-icon ${employee.status === 'pending' ? 'wait' : 'bad'}`}>{employee.status === 'pending' ? '⏳' : '✕'}</div>
        <h2>{employee.status === 'pending' ? 'Заявка на рассмотрении' : 'Доступ закрыт'}</h2>
        <p className="muted">{employee.status === 'pending'
          ? 'Отдел кадров проверяет ваши данные. После подтверждения вы сможете отмечаться по QR-коду на входе.'
          : 'Обратитесь в отдел кадров.'}</p>
        <dl className="kv">
          <dt>ФИО</dt><dd>{employee.full_name}</dd>
          <dt>Компания</dt><dd>{employee.companies?.name || '—'}</dd>
          <dt>Должность</dt><dd>{employee.position || '—'}</dd>
          <dt>Email</dt><dd>{employee.email}</dd>
          <dt>Телефон</dt><dd>{fmtPhone(employee.phone)}</dd>
        </dl>
        <div className="row gap">
          {employee.status === 'pending' && <button className="btn primary" onClick={reload}>Проверить статус</button>}
          <button className="btn ghost" onClick={signOut}>Выйти</button>
        </div>
      </div>
    </div>
  )

  const today = row?.cells.find((c) => c.key === t)
  const days = row?.cells.filter((c) => c.events.length || c.absence || c.code === 'НН').reverse() || []

  return (
    <div className="page">
      <div className="topbar">
        <Brand />
        <div className="row gap">
          {isAdmin && <a className="btn sm" href="/admin">Админ-панель</a>}
          <button className="btn sm ghost" onClick={signOut}>Выйти</button>
        </div>
      </div>

      <div className="card">
        <div className="muted small">{[employee.companies?.name, employee.position, employee.department].filter(Boolean).join(' · ')}</div>
        <h2 style={{ margin: '4px 0 12px' }}>{employee.full_name}</h2>
        <div className="stats">
          <Stat label="Сегодня" value={today?.openSince ? `На работе с ${fmtTime(today.openSince)}` : today?.events.length ? `${hoursStr(today.worked) || 0} ч` : '—'} />
          <Stat label="Дней явок" value={row?.tot.days ?? '…'} sub={`из ${row?.tot.normDays ?? '…'}`} />
          <Stat label="Отработано" value={row ? `${hoursStr(row.tot.minutes) || 0} ч` : '…'} sub={`норма ${row ? hoursStr(row.tot.normMin) : '…'} ч`} />
          <Stat label="Опозданий" value={row?.tot.late ?? '…'} sub={row?.tot.lateMin ? minToHM(row.tot.lateMin) : ''} />
        </div>
        <p className="muted small">График: {employee.work_start.slice(0, 5)}–{employee.work_end.slice(0, 5)}, перерыв {employee.break_minutes} мин</p>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Мои отметки</h3>
          <MonthPicker value={ym} onChange={setYm} />
        </div>
        <table className="tbl">
          <thead><tr><th>Дата</th><th>Код</th><th>Приход</th><th>Уход</th><th className="r">Часы</th></tr></thead>
          <tbody>
            {days.map((c) => (
              <tr key={c.key} className={c.lateMin ? 'late' : ''}>
                <td>{fmtDate(c.key).slice(0, 5)} <span className="muted">{DOW_SHORT[isoDow(c.key)]}</span></td>
                <td><span className={`code c-${c.code}`} title={CODES[c.code]?.label}>{c.code}</span></td>
                <td>{c.events.filter((e) => e.kind === 'in').map((e) => fmtTime(e.ts)).join(', ')}{c.lateMin ? <span className="tag red"> +{c.lateMin} мин</span> : ''}</td>
                <td>{c.events.filter((e) => e.kind === 'out').map((e) => fmtTime(e.ts)).join(', ')}{c.issues.length ? <span className="tag amber"> {c.issues[0]}</span> : ''}</td>
                <td className="r">{hoursStr(c.worked)}</td>
              </tr>
            ))}
            {!days.length && <tr><td colSpan={5} className="muted">Нет отметок за месяц</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const Stat = ({ label, value, sub }) => (
  <div className="stat"><div className="muted small">{label}</div><div className="v">{value}</div>{sub && <div className="muted small">{sub}</div>}</div>
)
