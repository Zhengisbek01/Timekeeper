import { useEffect, useState } from 'react'
import { supabase, errText, normPhone, fmtPhone } from '../../lib/supabase'
import { EMP_SELECT } from '../../lib/data'
import { DOW_SHORT, todayKey } from '../../lib/time'
import CompanySelect from '../../components/CompanySelect'

const EMPTY = { email: '', phone: '', full_name: '', tab_number: '', position: '', department: '', company_id: '', role: 'employee',
  work_start: '09:00', work_end: '18:00', break_minutes: 60, work_days: [1, 2, 3, 4, 5], active: true, start_date: todayKey() }

export default function Employees() {
  const [list, setList] = useState([])
  const [form, setForm] = useState(null)
  const [q, setQ] = useState('')
  const [company, setCompany] = useState('')
  const [err, setErr] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const load = () => supabase.from('employees').select(EMP_SELECT).eq('status', 'approved').order('full_name').then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault(); setErr(null)
    const phone = form.phone ? normPhone(form.phone) : null
    if (form.phone && !phone) return setErr('Телефон в формате +7 701 123 45 67')
    const { id, created_at, user_id, companies, approved_at, status, ...rest } = form
    const payload = { ...rest, email: rest.email.trim().toLowerCase(), phone, break_minutes: +rest.break_minutes || 0, tab_number: rest.tab_number || null, company_id: rest.company_id || null }
    // карточку, созданную HR, работник «подхватит» при регистрации с этим же email
    const { error } = id
      ? await supabase.from('employees').update(payload).eq('id', id)
      : await supabase.from('employees').insert({ ...payload, status: 'approved', approved_at: new Date().toISOString() })
    if (error) return setErr(errText(error).includes('duplicate') ? 'Работник с таким email уже есть' : errText(error))
    setForm(null); load()
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const toggleDay = (d) => setForm({ ...form, work_days: form.work_days.includes(d) ? form.work_days.filter((x) => x !== d) : [...form.work_days, d].sort() })

  const shown = list.filter((e) => (showInactive || e.active) && (!company || e.company_id === company) &&
    (!q || [e.full_name, e.email, e.phone, e.position, e.department, e.tab_number].join(' ').toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="card">
      <div className="row between wrap gap">
        <div className="row gap wrap">
          <input placeholder="Поиск: ФИО, email, должность" value={q} onChange={(e) => setQ(e.target.value)} />
          <CompanySelect value={company} onChange={setCompany} />
          <label className="inline"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> уволенные</label>
        </div>
        <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>+ Работник</button>
      </div>
      <p className="muted small">Обычно работники регистрируются сами, а HR подтверждает заявку. Если завести карточку здесь, работник при регистрации с тем же email привяжется к ней автоматически.</p>
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th>ФИО</th><th>Компания</th><th>Должность</th><th>Контакты</th><th>График</th><th>Вход</th><th></th></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className={e.active ? '' : 'dim'}>
                <td><b>{e.full_name}</b>{e.role === 'admin' && <span className="tag"> HR</span>}<div className="muted small">{[e.tab_number && `№ ${e.tab_number}`, e.department].filter(Boolean).join(' · ')}</div></td>
                <td>{e.companies?.name}</td>
                <td>{e.position}</td>
                <td className="nowrap">{e.email}<div className="muted small">{fmtPhone(e.phone)}</div></td>
                <td className="nowrap">{e.work_start.slice(0, 5)}–{e.work_end.slice(0, 5)}<div className="muted small">{e.work_days.map((d) => DOW_SHORT[d]).join(' ')}</div></td>
                <td>{e.user_id ? <span className="pill st-here">есть</span> : <span className="pill st-none">не зарегистр.</span>}</td>
                <td className="r"><button className="linkbtn" onClick={() => setForm({ ...e, company_id: e.company_id || '', phone: fmtPhone(e.phone), work_start: e.work_start.slice(0, 5), work_end: e.work_end.slice(0, 5) })}>изменить</button></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="muted">Нет работников</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-bg" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{form.id ? 'Карточка работника' : 'Новый работник'}</h3>
            <div className="grid2">
              <label className="span2">ФИО<input required value={form.full_name} onChange={set('full_name')} /></label>
              <label>Компания<CompanySelect required all="— выберите —" value={form.company_id} onChange={(v) => setForm({ ...form, company_id: v })} /></label>
              <label>Email (логин)<input type="email" required value={form.email} onChange={set('email')} /></label>
              <label>Телефон<input type="tel" value={form.phone || ''} onChange={set('phone')} /></label>
              <label>Должность<input value={form.position || ''} onChange={set('position')} /></label>
              <label>Подразделение<input value={form.department || ''} onChange={set('department')} /></label>
              <label>Табельный №<input value={form.tab_number || ''} onChange={set('tab_number')} /></label>
              <label>Роль
                <select value={form.role} onChange={set('role')}><option value="employee">Работник</option><option value="admin">HR (администратор)</option></select>
              </label>
              <label>Начало смены<input type="time" required value={form.work_start} onChange={set('work_start')} /></label>
              <label>Окончание<input type="time" required value={form.work_end} onChange={set('work_end')} /></label>
              <label>Перерыв, мин<input type="number" min="0" value={form.break_minutes} onChange={set('break_minutes')} /></label>
              <label>Начало учёта<input type="date" required value={form.start_date || ''} onChange={set('start_date')} /></label>
              <div className="span2">
                <div className="small muted">Рабочие дни</div>
                <div className="days">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <button type="button" key={d} className={form.work_days.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>{DOW_SHORT[d]}</button>
                  ))}
                </div>
              </div>
              <label className="inline span2"><input type="checkbox" checked={form.active} onChange={set('active')} /> Работает (снимите при увольнении — история сохранится)</label>
            </div>
            {err && <div className="alert err">{err}</div>}
            <div className="row gap end">
              <button type="button" className="btn ghost" onClick={() => setForm(null)}>Отмена</button>
              <button className="btn primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
