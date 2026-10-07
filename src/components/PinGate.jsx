import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { hasPin, setPin, checkPin, isUnlocked, markUnlocked, lock, clearPin, attemptsLeft, PIN_LEN } from '../lib/pin'
import { Logo, PRODUCT } from './Logo'

// Закрывает приложение кодом быстрого входа. Первый вход — придумать код, дальше — ввести код.
export default function PinGate({ children }) {
  const { session, employee, signOut } = useAuth()
  const uid = session?.user.id
  const [mode, setMode] = useState(() => (!hasPin(uid) ? 'set' : isUnlocked(uid) ? 'open' : 'enter'))

  // ушёл из приложения больше чем на 5 минут — снова код
  useEffect(() => {
    if (mode !== 'open') return
    const tick = () => markUnlocked(uid)
    let hiddenAt = 0
    const vis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && !isUnlocked(uid)) setMode('enter')
      else tick()
    }
    const act = setInterval(tick, 30000)
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(act); document.removeEventListener('visibilitychange', vis) }
  }, [mode, uid])

  const forgot = useCallback(async () => { clearPin(uid); await signOut() }, [uid, signOut])

  if (mode === 'open') return children
  return mode === 'set'
    ? <SetPin name={employee?.full_name} onDone={async (pin) => { await setPin(uid, pin); setMode('open') }} />
    : <EnterPin name={employee?.full_name} uid={uid} onOk={() => setMode('open')} onForgot={forgot} />
}

function Keypad({ value, onChange, disabled }) {
  const press = (d) => !disabled && value.length < PIN_LEN && onChange(value + d)
  const back = () => !disabled && onChange(value.slice(0, -1))
  useEffect(() => {
    const k = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') back() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  return (
    <>
      <div className="pin-dots">{Array.from({ length: PIN_LEN }, (_, i) => <span key={i} className={i < value.length ? 'on' : ''} />)}</div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
        <span />
        <button type="button" onClick={() => press('0')}>0</button>
        <button type="button" className="kp-back" onClick={back} aria-label="Стереть">⌫</button>
      </div>
    </>
  )
}

function Shell({ title, sub, children }) {
  return (
    <div className="pin-screen">
      <div className="pin-card">
        <div className="brand pin-brand"><Logo /> {PRODUCT}</div>
        <h2>{title}</h2>
        {sub && <p className="muted small">{sub}</p>}
        {children}
      </div>
    </div>
  )
}

function SetPin({ name, onDone }) {
  const [first, setFirst] = useState(null)
  const [v, setV] = useState('')
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (v.length < PIN_LEN) return
    if (!first) {
      if (/^(\d)\1+$/.test(v) || '0123456789'.includes(v) || '9876543210'.includes(v)) { setErr('Слишком простой код. Придумайте другой.'); setTimeout(() => setV(''), 300); return }
      setErr(null); setFirst(v); setTimeout(() => setV(''), 200)
    } else if (v === first) onDone(v)
    else { setErr('Коды не совпали. Придумайте заново.'); setFirst(null); setTimeout(() => setV(''), 300) }
  }, [v])
  return (
    <Shell title={first ? 'Повторите код' : 'Придумайте код быстрого входа'}
      sub={first ? 'Введите те же 4 цифры ещё раз' : `${name ? name + ', в' : 'В'}ы будете вводить его вместо email и пароля. Код хранится только на этом телефоне.`}>
      <Keypad value={v} onChange={setV} />
      {err && <div className="pin-err">{err}</div>}
    </Shell>
  )
}

function EnterPin({ name, uid, onOk, onForgot }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (v.length < PIN_LEN) return
    setBusy(true)
    checkPin(uid, v).then((r) => {
      setBusy(false)
      if (r === 'ok') return onOk()
      if (r === 'blocked') { alert('Код введён неверно 5 раз. Войдите по email и паролю и задайте новый код.'); return onForgot() }
      setErr(`Неверный код. Осталось попыток: ${attemptsLeft(uid)}`); navigator.vibrate?.([60, 60, 60]); setTimeout(() => setV(''), 250)
    })
  }, [v])
  return (
    <Shell title="Введите код" sub={name}>
      <Keypad value={v} onChange={setV} disabled={busy} />
      {err && <div className="pin-err">{err}</div>}
      <button className="linkbtn pin-forgot" onClick={() => confirm('Выйти и войти по email и паролю? Потом вы зададите новый код.') && onForgot()}>Забыли код? Войти по паролю</button>
    </Shell>
  )
}

export { lock }
