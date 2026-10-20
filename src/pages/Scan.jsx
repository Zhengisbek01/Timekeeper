import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtTime, minutesOfDay, timeToMin } from '../lib/time'
import { EXIT_REASONS, GRACE_MIN } from '../lib/timesheet'

// уход раньше конца смены (в рабочее время) — нужно указать причину
function duringShift(ts, start, end) {
  if (!start || !end) return false
  const now = minutesOfDay(ts), s = timeToMin(start), e = timeToMin(end)
  return e > s ? now >= s && now < e - GRACE_MIN : now >= s || now < e - GRACE_MIN
}

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
  const askReason = !isIn && !state.reason && state.id && duringShift(state.ts, state.work_start, state.work_end)
  if (askReason) return <ReasonForm state={state} onSaved={(reason) => setState({ ...state, reason })} />
  return (
    <div className={`scan-result ${state.status === 'duplicate' ? 'warn' : isIn ? 'in' : 'out'}`}>
      <div className="big-icon">{state.status === 'duplicate' ? '⏱' : isIn ? '→' : '←'}</div>
      <p className="name">{state.name}</p>
      <h1>{state.status === 'duplicate' ? 'Уже отмечено' : isIn ? 'Приход' : 'Уход'}</h1>
      <div className="time">{fmtTime(state.ts)}</div>
      {state.status === 'duplicate' && <p>Повторное сканирование в течение минуты не учитывается.</p>}
      {state.status === 'ok' && isIn && late > 5 && <p>Опоздание: {late} мин</p>}
      {state.reason && <p>Причина: <b>{state.reason}</b></p>}
      {state.reason && !/^Ухожу домой/.test(state.reason)
        ? <p>При возвращении снова отсканируйте QR-код на входе.</p>
        : state.status === 'ok' && <p>{isIn ? 'Хорошего рабочего дня!' : 'До свидания!'}</p>}
      <Link className="btn ghost-light" to="/me">Мои отметки</Link>
    </div>
  )
}

// Выход в рабочее время: работник выбирает причину
function ReasonForm({ state, onSaved }) {
  const [pick, setPick] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const needText = pick === 'other'

  async function save() {
    const r = EXIT_REASONS.find((x) => x.id === pick)
    if (!r) return setErr('Выберите причину')
    if (needText && !text.trim()) return setErr('Напишите, куда и зачем выходите')
    const reason = text.trim() ? (needText ? text.trim() : `${r.label}: ${text.trim()}`) : r.label
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('set_exit_reason', { p_event: state.id, p_reason: reason })
    setBusy(false)
    if (error) return setErr(errText(error))
    onSaved(reason)
  }

  return (
    <div className="scan-result out reason">
      <div className="big-icon">←</div>
      <p className="name">{state.name}</p>
      <h1>Уход в {fmtTime(state.ts)}</h1>
      <p>Сейчас рабочее время. Укажите причину выхода:</p>
      <div className="reasons">
        {EXIT_REASONS.map((r) => (
          <button key={r.id} type="button" className={pick === r.id ? 'on' : ''} onClick={() => { setPick(r.id); setErr(null) }}>
            <b>{r.label}</b>{r.hint && <small>{r.hint}</small>}
          </button>
        ))}
      </div>
      {pick && (
        <textarea rows={2} maxLength={150} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={needText ? 'Куда и зачем выходите (обязательно)' : 'Комментарий (необязательно): куда, к кому'} />
      )}
      {err && <div className="reason-err">{err}</div>}
      <button className="btn reason-save" disabled={busy || !pick} onClick={save}>{busy ? '…' : 'Сохранить'}</button>
    </div>
  )
}
