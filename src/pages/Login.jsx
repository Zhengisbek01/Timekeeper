import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, errText, ORG_NAME, normPhone } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Brand } from '../components/Logo'
import { markUnlocked } from '../lib/pin'

export default function Login() {
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const nav = useNavigate()
  const { session } = useAuth()
  const [mode, setMode] = useState(params.get('mode') === 'up' ? 'up' : 'in')
  const [companies, setCompanies] = useState([])
  const [f, setF] = useState({ email: '', phone: '', password: '', password2: '', full_name: '', position: '', company_id: '', consent: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { if (session) nav(next, { replace: true }) }, [session, next, nav])
  useEffect(() => {
    supabase.from('companies').select('id,name').order('name').then(({ data }) => setCompanies(data || []))
  }, [])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function submit(e) {
    e.preventDefault()
    setMsg(null)
    const email = f.email.trim().toLowerCase()
    const phone = normPhone(f.phone)
    if (mode === 'up') {
      if (!phone) return setMsg({ err: true, text: 'Введите телефон в формате +7 701 123 45 67' })
      if (f.full_name.trim().split(/\s+/).length < 2) return setMsg({ err: true, text: 'Укажите фамилию и имя полностью' })
      if (!f.company_id) return setMsg({ err: true, text: 'Выберите компанию' })
      if (f.password !== f.password2) return setMsg({ err: true, text: 'Пароли не совпадают' })
    }
    setBusy(true)
    const creds = { email, password: f.password }
    const { data, error } = mode === 'in'
      ? await supabase.auth.signInWithPassword(creds)
      : await supabase.auth.signUp({
          ...creds,
          options: { data: { kind: 'employee', full_name: f.full_name.trim().replace(/\s+/g, ' '), phone, position: f.position.trim(), company_id: f.company_id } },
        })
    setBusy(false)
    if (error) return setMsg({ err: true, text: errText(error) })
    // только что ввёл пароль — код быстрого входа сразу не спрашиваем
    if (data?.session) markUnlocked(data.session.user.id)
    if (mode === 'up' && !data.session) setMsg({ text: 'Заявка отправлена. Подтвердите email по ссылке из письма, затем войдите.' })
  }

  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <Brand />
        <p className="muted small">{ORG_NAME}</p>
        <div className="seg">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => { setMode('in'); setMsg(null) }}>Вход</button>
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => { setMode('up'); setMsg(null) }}>Регистрация</button>
        </div>

        {mode === 'up' && (
          <>
            <label>ФИО полностью
              <input required autoComplete="name" placeholder="Сейтов Ерлан Маратович" value={f.full_name} onChange={set('full_name')} />
            </label>
            <label>Компания
              <select required value={f.company_id} onChange={set('company_id')}>
                <option value="">— выберите —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Должность
              <input required placeholder="Инженер-механик" value={f.position} onChange={set('position')} />
            </label>
            <label>Номер телефона
              <input type="tel" required inputMode="tel" autoComplete="tel" placeholder="+7 701 123 45 67" value={f.phone} onChange={set('phone')} />
            </label>
          </>
        )}

        <label>Электронная почта
          <input type="email" required autoComplete="email" autoCapitalize="none" placeholder="name@company.kz" value={f.email} onChange={set('email')} />
        </label>
        <label>Пароль
          <input type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={f.password} onChange={set('password')} />
        </label>
        {mode === 'up' && (
          <>
            <label>Повторите пароль
              <input type="password" required minLength={6} autoComplete="new-password" value={f.password2} onChange={set('password2')} />
            </label>
            <label className="inline consent">
              <input type="checkbox" required checked={f.consent} onChange={set('consent')} />
              <span>Даю согласие на сбор и обработку моих персональных данных (ФИО, email, телефон, должность, время прихода и ухода) для учёта рабочего времени</span>
            </label>
            <p className="muted small">После регистрации заявку проверит отдел кадров. Отмечаться можно будет после подтверждения.</p>
          </>
        )}

        {msg && <div className={msg.err ? 'alert err' : 'alert'}>{msg.text}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Войти' : 'Отправить заявку'}</button>
      </form>
    </div>
  )
}
