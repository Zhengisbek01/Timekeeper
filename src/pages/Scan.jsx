import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtTime, minutesOfDay, timeToMin } from '../lib/time'

export default function Scan() {
  const [params] = useSearchParams()
  const k = params.get('k'), t = params.get('t')
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const [state, setState] = useState({ status: 'loading' })
  const done = useRef(false)

  useEffect(() => {
    if (loading || done.current) return
    if (!k || !t) return setState({ status: 'error', text: 'Некорректный QR-код' })
    if (!session) { nav(`/login?next=${encodeURIComponent(`/scan?k=${k}&t=${t}`)}`, { replace: true }); return }
    done.current = true
    supabase.rpc('check_in', { p_kiosk: k, p_token: t }).then(({ data, error }) => {
      if (error) return setState({ status: 'error', text: errText(error) })
      setState(data)
      if (navigator.vibrate) navigator.vibrate(data.status === 'ok' ? 120 : [60, 60, 60])
    })
  }, [k, t, session, loading, nav])

  if (state.status === 'loading') return <div className="center muted">Отмечаем…</div>

  if (state.status === 'error') return (
    <div className="scan-result bad">
      <div className="big-icon">!</div>
      <h1>Не удалось отметиться</h1>
      <p>{state.text}</p>
      <Link className="btn" to="/me">Мои отметки</Link>
    </div>
  )

  const isIn = state.kind === 'in'
  const late = isIn && state.work_start && minutesOfDay(state.ts) - timeToMin(state.work_start)
  return (
    <div className={`scan-result ${state.status === 'duplicate' ? 'warn' : isIn ? 'in' : 'out'}`}>
      <div className="big-icon">{state.status === 'duplicate' ? '⏱' : isIn ? '→' : '←'}</div>
      <p className="name">{state.name}</p>
      <h1>{state.status === 'duplicate' ? 'Уже отмечено' : isIn ? 'Приход' : 'Уход'}</h1>
      <div className="time">{fmtTime(state.ts)}</div>
      {state.status === 'duplicate' && <p>Повторное сканирование в течение минуты не учитывается.</p>}
      {state.status === 'ok' && isIn && late > 5 && <p>Опоздание: {late} мин</p>}
      {state.status === 'ok' && <p>{isIn ? 'Хорошего рабочего дня!' : 'До свидания!'}</p>}
      <Link className="btn ghost-light" to="/me">Мои отметки</Link>
    </div>
  )
}
