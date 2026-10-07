import { useEffect, useState } from 'react'
import { supabase, errText, fmtPhone, normPhone } from '../../lib/supabase'
import { EMP_SELECT } from '../../lib/data'
import { fmtDateTime, todayKey } from '../../lib/time'
import CompanySelect from '../../components/CompanySelect'

// Заявки на регистрацию: HR проверяет данные и подтверждает или отклоняет
export default function Requests({ onCount }) {
  const [list, setList] = useState(null)
  const [tab, setTab] = useState('pending')
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('employees').select(EMP_SELECT).in('status', ['pending', 'rejected']).order('created_at', { ascending: false })
    setList(data || [])
    onCount?.((data || []).filter((e) => e.status === 'pending').length)
  }
  useEffect(() => { load() }, [])

  const setStatus = async (emp, status, extra = {}) => {
    setErr(null)
    const { error } = await supabase.from('employees')
      .update({ status, approved_at: status === 'approved' ? new Date().toISOString() : null, ...extra }).eq('id', emp.id)
    if (error) return setErr(errText(error))
    setEdit(null); load()
  }

  const shown = (list || []).filter((e) => e.status === tab)

  return (
    <div className="card">
      <div className="row between wrap gap">
        <div className="seg inline-seg">
          <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>Новые ({(list || []).filter((e) => e.status === 'pending').length})</button>
          <button className={tab === 'rejected' ? 'on' : ''} onClick={() => setTab('rejected')}>Отклонённые</button>
        </div>
        <span className="muted small">Ссылка для регистрации работников: <code>{window.location.origin}/login?mode=up</code></span>
      </div>
      {err && <div className="alert err">{err}</div>}
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th>ФИО</th><th>Email / телефон</th><th>Компания</th><th>Должность</th><th>Подана</th><th></th></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td><b>{e.full_name}</b></td>
                <td className="nowrap">{e.email}<div className="muted small">{fmtPhone(e.phone)}</div></td>
                <td>{e.companies?.name || <span className="tag amber">не указана</span>}</td>
                <td>{e.position}</td>
                <td className="muted small nowrap">{fmtDateTime(e.created_at)}</td>
                <td className="r nowrap">
                  {tab === 'pending' ? (
                    <>
                      <button className="btn sm primary" onClick={() => setEdit({ ...e, start_date: e.start_date || todayKey(), work_start: e.work_start.slice(0, 5), work_end: e.work_end.slice(0, 5) })}>Проверить</button>{' '}
                      <button className="btn sm ghost" onClick={() => confirm(`Отклонить заявку ${e.full_name}?`) && setStatus(e, 'rejected')}>Отклонить</button>
                    </>
                  ) : (
                    <button className="btn sm" onClick={() => setStatus(e, 'pending')}>Вернуть в новые</button>
                  )}
                </td>
              </tr>
            ))}
            {list && !shown.length && <tr><td colSpan={6} className="muted">{tab === 'pending' ? 'Новых заявок нет' : 'Пусто'}</td></tr>}
            {!list && <tr><td colSpan={6} className="muted">Загрузка…</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="modal-bg" onClick={() => setEdit(null)}>
          <form className="modal" onClick={(ev) => ev.stopPropagation()} onSubmit={(ev) => {
            ev.preventDefault()
            setStatus(edit, 'approved', {
              full_name: edit.full_name.trim(), phone: normPhone(edit.phone) || edit.phone || null, position: edit.position, company_id: edit.company_id || null,
              department: edit.department || null, tab_number: edit.tab_number || null,
              work_start: edit.work_start, work_end: edit.work_end, break_minutes: +edit.break_minutes || 0, start_date: edit.start_date,
            })
          }}>
            <h3>Подтверждение работника</h3>
            <p className="muted small">Проверьте данные, при необходимости исправьте и укажите график.</p>
            <div className="grid2">
              <label className="span2">ФИО<input required value={edit.full_name} onChange={(ev) => setEdit({ ...edit, full_name: ev.target.value })} /></label>
              <label>Компания<CompanySelect required all="— выберите —" value={edit.company_id || ''} onChange={(v) => setEdit({ ...edit, company_id: v })} /></label>
              <label>Должность<input value={edit.position || ''} onChange={(ev) => setEdit({ ...edit, position: ev.target.value })} /></label>
              <label>Подразделение<input value={edit.department || ''} onChange={(ev) => setEdit({ ...edit, department: ev.target.value })} /></label>
              <label>Табельный №<input value={edit.tab_number || ''} onChange={(ev) => setEdit({ ...edit, tab_number: ev.target.value })} /></label>
              <label>Начало смены<input type="time" required value={edit.work_start} onChange={(ev) => setEdit({ ...edit, work_start: ev.target.value })} /></label>
              <label>Окончание<input type="time" required value={edit.work_end} onChange={(ev) => setEdit({ ...edit, work_end: ev.target.value })} /></label>
              <label>Перерыв, мин<input type="number" min="0" value={edit.break_minutes} onChange={(ev) => setEdit({ ...edit, break_minutes: ev.target.value })} /></label>
              <label>Начало учёта<input type="date" required value={edit.start_date || ''} onChange={(ev) => setEdit({ ...edit, start_date: ev.target.value })} /></label>
              <label>Email (логин)<input disabled value={edit.email} /></label>
              <label>Телефон<input value={edit.phone || ''} onChange={(ev) => setEdit({ ...edit, phone: ev.target.value })} /></label>
            </div>
            <div className="row gap end">
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Отмена</button>
              <button className="btn primary">Подтвердить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
