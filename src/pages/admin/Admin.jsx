import { useEffect, useState } from 'react'
import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Brand } from '../../components/Logo'
import { supabase, ORG_NAME } from '../../lib/supabase'
import Today from './Today'
import Timesheet from './Timesheet'
import Requests from './Requests'
import Employees from './Employees'
import Reports from './Reports'
import Kiosks from './Kiosks'
import Calendar from './Calendar'

export default function Admin() {
  const { employee, signOut } = useAuth()
  const [pending, setPending] = useState(0)

  // счётчик новых заявок на вкладке
  useEffect(() => {
    const pull = () => supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setPending(count || 0))
    pull()
    const t = setInterval(pull, 60000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="page wide">
      <div className="topbar">
        <Brand><span className="muted small">· {ORG_NAME}</span></Brand>
        <div className="row gap">
          <span className="muted small hide-sm">{employee?.full_name} · HR</span>
          <a className="btn sm ghost" href="/me">Мои отметки</a>
          <button className="btn sm ghost" onClick={signOut}>Выйти</button>
        </div>
      </div>
      <nav className="tabs">
        <NavLink to="/admin/today">Сегодня</NavLink>
        <NavLink to="/admin/timesheet">Табель</NavLink>
        <NavLink to="/admin/requests">Заявки{pending > 0 && <span className="badge">{pending}</span>}</NavLink>
        <NavLink to="/admin/employees">Работники</NavLink>
        <NavLink to="/admin/reports">Отчёты</NavLink>
        <NavLink to="/admin/kiosks">Киоски</NavLink>
        <NavLink to="/admin/calendar">Календарь</NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to={pending ? 'requests' : 'today'} replace />} />
        <Route path="today" element={<Today />} />
        <Route path="timesheet" element={<Timesheet />} />
        <Route path="requests" element={<Requests onCount={setPending} />} />
        <Route path="employees" element={<Employees />} />
        <Route path="reports" element={<Reports />} />
        <Route path="kiosks" element={<Kiosks />} />
        <Route path="calendar" element={<Calendar />} />
      </Routes>
    </div>
  )
}
