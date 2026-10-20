import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Brand } from '../components/Logo'

// Сюда ведёт ссылка из письма «Восстановление пароля»
export default function Reset() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const [linkErr] = useState(() => {
    const p = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
    return p.get('error_description') || p.get('error') || null
  })
  const [wait, setWait] = useState(true)
  const [f, setF] = useState({ p1: '', p2: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // клиенту Supabase нужно 1–2 с, чтобы принять токен из ссылки
  useEffect(() => { const t = setTimeout(() => setWait(false), 2500); return () => clearTimeout(t) }, [])

  async function submit(e) {
    e.preventDefault(); setMsg(null)
    if (f.p1 !== f.p2) return setMsg({ err: true, text: 'Пароли не совпадают' })
    setBusy(true)
    const { data, error } = await supabase.auth.updateUser({ password: f.p1 })
    setBusy(false)
    if (error) return setMsg({ err: true, text: errText(error) })
    setMsg({ text: 'Пароль изменён. Входим…' })
    setTimeout(() => nav('/', { replace: true }), 1200)
  }

  if (loading || (!session && wait && !linkErr)) return <div className="center muted">Проверяем ссылку…</div>

  if (!session) return (
    <div className="center">
      <div className="card narrow">
        <Brand />
        <h2>Ссылка не сработала</h2>
        <p className="muted">Ссылка из письма одноразовая и действует ограниченное время. Запросите новую — или попросите отдел кадров задать временный пароль.</p>
        <Link className="btn primary block" to="/login?mode=forgot">Запросить новую ссылку</Link>
      </div>
    </div>
  )

  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit} method="post" action="/reset">
        <Brand />
        <h2>Новый пароль</h2>
        {/* поле логина нужно, чтобы iPhone/Chrome сохранили новый пароль в связку ключей */}
        <label>Электронная почта
          <input type="email" name="username" autoComplete="username" value={session.user.email || ''} readOnly />
        </label>
        <label>Новый пароль
          <input type="password" name="new-password" required minLength={6} autoComplete="new-password" value={f.p1} onChange={(e) => setF({ ...f, p1: e.target.value })} />
        </label>
        <label>Повторите пароль
          <input type="password" required minLength={6} autoComplete="new-password" value={f.p2} onChange={(e) => setF({ ...f, p2: e.target.value })} />
        </label>
        {msg && <div className={msg.err ? 'alert err' : 'alert'}>{msg.text}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? '…' : 'Сохранить пароль'}</button>
      </form>
    </div>
  )
}
