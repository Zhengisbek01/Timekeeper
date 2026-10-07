import { useEffect, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, errText, ORG_NAME, kioskEmail } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Logo, PRODUCT } from '../components/Logo'
import { fmtTime, fmtDate, todayKey } from '../lib/time'

// Планшет работает под отдельной учётной записью киоска
export default function Kiosk() {
  const { session, loading, kiosk, employee, reload, signOut } = useAuth()
  if (loading) return <div className="center muted">Загрузка…</div>
  if (!session) return <KioskAuth onDone={reload} />
  if (!kiosk) return (
    <div className="center">
      <div className="card narrow">
        <h2>Это не учётная запись киоска</h2>
        <p className="muted">{employee ? `Вы вошли как ${employee.full_name}. ` : ''}Экран QR открывается только под логином киоска, который создаёт HR.</p>
        <button className="btn primary" onClick={signOut}>Выйти и войти как киоск</button>
      </div>
    </div>
  )
  if (!kiosk.active) return <div className="center"><div className="card narrow"><h2>Киоск отключён</h2><p className="muted">Обратитесь в отдел кадров.</p><button className="btn" onClick={signOut}>Выйти</button></div></div>
  return <Screen onSignOut={signOut} />
}

function KioskAuth({ onDone }) {
  const [mode, setMode] = useState('in')
  const [f, setF] = useState({ login: '', password: '', password2: '', code: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault(); setErr(null)
    const login = f.login.trim().toLowerCase()
    const creds = { email: kioskEmail(login), password: f.password }
    setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword(creds)
        if (error) throw error
      } else {
        if (f.password !== f.password2) throw new Error('Пароли не совпадают')
        let { data, error } = await supabase.auth.signUp(creds)
        // после сброса киоска учётная запись уже существует — входим со старым паролем
        if (error?.message?.includes('already registered')) ({ data, error } = await supabase.auth.signInWithPassword(creds))
        if (error) throw error
        if (!data.session) throw new Error('В Supabase включено подтверждение email — отключите его (см. README)')
        const r = await supabase.rpc('kiosk_activate', { p_login: login, p_code: f.code.trim() })
        if (r.error) { await supabase.auth.signOut(); throw r.error }
      }
      await onDone()
    } catch (ex) { setErr(errText(ex)) } finally { setBusy(false) }
  }

  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 8 }}><Logo /> {PRODUCT}</div>
        <h2>Планшет-киоск</h2>
        <p className="muted small">Учётную запись киоска создаёт HR в разделе «Киоски». При первом запуске — «Активация» с кодом от HR.</p>
        <div className="seg">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Вход</button>
          <button type="button" className={mode === 'act' ? 'on' : ''} onClick={() => setMode('act')}>Активация</button>
        </div>
        <label>Логин киоска<input required autoCapitalize="none" placeholder="kiosk-main" value={f.login} onChange={set('login')} /></label>
        {mode === 'act' && <label>Код активации<input required inputMode="numeric" maxLength={6} value={f.code} onChange={set('code')} /></label>}
        <label>{mode === 'act' ? 'Придумайте пароль' : 'Пароль'}<input type="password" required minLength={6} value={f.password} onChange={set('password')} /></label>
        {mode === 'act' && <label>Повторите пароль<input type="password" required minLength={6} value={f.password2} onChange={set('password2')} /></label>}
        {err && <div className="alert err">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Войти' : 'Активировать'}</button>
      </form>
    </div>
  )
}

function Screen({ onSignOut }) {
  const [tok, setTok] = useState(null)
  const [err, setErr] = useState(null)
  const [now, setNow] = useState(new Date())
  const [left, setLeft] = useState(30)

  const fetchToken = useCallback(async () => {
    const { data, error } = await supabase.rpc('kiosk_token')
    if (error) { setErr(errText(error)); return 3 }
    setErr(null); setTok(data); setLeft(data.expires_in)
    return data.expires_in
  }, [])

  // ротация QR строго по окнам сервера
  useEffect(() => {
    let timer, alive = true
    const loop = async () => {
      const sec = await fetchToken()
      if (alive) timer = setTimeout(loop, (sec + 0.4) * 1000)
    }
    loop()
    return () => { alive = false; clearTimeout(timer) }
  }, [fetchToken])

  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); setLeft((l) => Math.max(0, l - 1)) }, 1000)
    return () => clearInterval(t)
  }, [])


  // экран не гаснет
  useEffect(() => {
    let lock
    const req = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch {} }
    req()
    const vis = () => document.visibilityState === 'visible' && req()
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release?.() }
  }, [])

  const url = tok ? `${window.location.origin}/scan?k=${tok.kiosk_id}&t=${tok.token}` : ''

  return (
    <div className="kiosk">
      <header>
        <div>
          <div className="k-org">{ORG_NAME}</div>
          <div className="k-name">{tok?.name || 'Киоск'}</div>
        </div>
        <div className="k-clock">
          <div>{fmtTime(now)}</div>
          <small>{fmtDate(todayKey())}</small>
        </div>
      </header>

      <main>
        <div className="k-qr">
          {err ? <div className="k-err">{err}</div>
            : tok ? <QRCodeSVG value={url} size={420} level="M" marginSize={2} /> : <div className="muted">Загрузка…</div>}
          <div className="k-bar"><span style={{ width: `${(left / 30) * 100}%` }} /></div>
        </div>
        <div className="k-side">
          <h2>Отсканируйте камерой телефона</h2>
          <p>При первом сканировании — приход, при следующем — уход. Код обновляется каждые 30 секунд.</p>
          <ol className="k-steps">
            <li>Откройте камеру телефона или кнопку «Сканировать QR» в Timekeeper</li>
            <li>Наведите на код слева</li>
            <li>Нажмите на появившуюся ссылку — на телефоне появится «Приход» или «Уход»</li>
          </ol>
        </div>
      </main>

      <footer>
        <button className="linkbtn" onClick={() => document.documentElement.requestFullscreen?.()}>Во весь экран</button>
        <span className="k-brand"><Logo size={18} /> {PRODUCT}</span>
        <button className="linkbtn" onDoubleClick={onSignOut} title="Двойной клик — выйти из учётной записи киоска">Выход</button>
      </footer>
    </div>
  )
}
