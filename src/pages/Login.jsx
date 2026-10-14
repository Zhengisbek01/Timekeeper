// ЗАМЕНИТЬ форму входа этой (или перенести из неё 3 вещи: атрибуты полей,
// onSubmit на <form>, и возврат на сохранённую страницу после входа).
// Атрибуты name/autoComplete нужны, чтобы iPhone/Android предложили «Сохранить пароль».
import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { RETURN_KEY } from '../components/RequireAuth'

function goBack(navigate) {
  const to = sessionStorage.getItem(RETURN_KEY) || '/'
  sessionStorage.removeItem(RETURN_KEY)
  navigate(to, { replace: true })
}

export default function Login() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Уже вошёл раньше — форму не показываем
  useEffect(() => {
    if (!loading && session) goBack(navigate)
  }, [loading, session, navigate])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) {
      setError('Неверный email или пароль')
      return
    }
    goBack(navigate)
  }

  if (loading) return null

  return (
    <div style={{ maxWidth: 380, margin: '10vh auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>Вход в Timekeeper</h1>

      <form onSubmit={handleLogin} method="post" autoComplete="on">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        {error && <p style={{ color: '#c0392b' }}>{error}</p>}

        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Нет аккаунта? <Link to="/register">Регистрация</Link>
      </p>
    </div>
  )
}

const inputStyle = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '12px 14px', margin: '6px 0 14px', fontSize: 16,
  border: '1px solid #ccd', borderRadius: 10,
}
const buttonStyle = {
  width: '100%', padding: 14, fontSize: 16, fontWeight: 600,
  color: '#fff', background: '#16705E', border: 0, borderRadius: 10,
}
