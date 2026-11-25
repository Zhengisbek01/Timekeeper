import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { revokeConsent, useConsents } from '../lib/consents'
import { MarkResult } from '../pages/Scan'
import { fmtTime } from '../lib/time'
import { geoCheckIn, geoError, geoPermission } from '../lib/geo'
import { isIOS } from '../lib/install'
import GeoConsent from './GeoConsent'

const GEO_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
const AUTO_EVERY = 90 * 1000 // пока приложение открыто — проверяем раз в 1,5 минуты

const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} км` : `${m} м`)

// Отметка только по геолокации: приход ставится сам, когда работник на объекте и приложение открыто
export default function MarkPanel({ onMarked }) {
  const { session, employee } = useAuth()
  const consents = useConsents(session?.user.id)
  const geoReady = !consents.loading && consents.has('geo')
  const [st, setSt] = useState({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const running = useRef(false)
  const markedRef = useRef(onMarked)
  markedRef.current = onMarked

  const auto = useCallback(async (force = false) => {
    if (running.current || document.visibilityState !== 'visible') return
    running.current = true
    setSt((s) => ({ ...s, checking: true }))
    try {
      // Сначала смотрим последнюю отметку на сервере — геопозицию спрашиваем, только если приход ещё не отмечен.
      // Так телефон не запрашивает доступ к геопозиции при каждом открытии.
      if (!force && employee?.id) {
        const { data: last } = await supabase.from('attendance_events')
          .select('id,kind,ts,reason,note').eq('employee_id', employee.id)
          .gt('ts', new Date(Date.now() - 16 * 3600e3).toISOString())
          .order('ts', { ascending: false }).limit(1).maybeSingle()
        if (last?.kind === 'in') {
          setSt({ state: 'already', r: { kind: 'in', ts: last.ts, site: (last.note || '').split(' · ')[1] } })
          return
        }
        if (last?.kind === 'out' && (last.reason === 'Ухожу домой' || Date.now() - new Date(last.ts) < 15 * 60e3)) {
          setSt({ state: 'skip', r: { why: 'left', ts: last.ts, reason: last.reason } })
          return
        }
      }
      const r = await geoCheckIn('auto')
      setSt({ state: r.status, r })
      if (r.status === 'ok') {
        setResult(r)
        if (navigator.vibrate) navigator.vibrate(120)
        markedRef.current?.()
      }
    } catch (e) {
      const m = String(e?.message || e)
      const zone = m.match(/OUT_OF_ZONE (\d+)/)
      setSt(zone ? { state: 'away', dist: +zone[1] } : { state: 'error', text: geoError(e) })
    } finally { running.current = false; setSt((s) => ({ ...s, checking: false })) }
  }, [employee?.id])

  useEffect(() => {
    if (!geoReady || !employee?.id) return
    auto()
    const t = setInterval(() => auto(), AUTO_EVERY)
    const vis = () => document.visibilityState === 'visible' && auto()
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [geoReady, auto, employee?.id])

  async function markOut() {
    setBusy(true)
    try {
      const r = await geoCheckIn('out')
      setResult(r)
      if (navigator.vibrate) navigator.vibrate(r.status === 'ok' ? 120 : [60, 60, 60])
      onMarked?.()
      auto()
    } catch (e) {
      setResult({ status: 'error', text: geoError(e) })
    } finally { setBusy(false) }
  }

  if (consents.loading) return <div className="card"><p className="muted">Загрузка…</p></div>
  if (!geoReady) return (
    <div className="card">
      <h3>Отметка по геолокации</h3>
      <p className="muted">Приход отмечается автоматически, когда вы на объекте. Для этого нужно согласие на геолокацию.</p>
      <GeoConsent onDone={() => consents.reload()} />
    </div>
  )

  const r = st.r
  const atWork = (st.state === 'already' || st.state === 'duplicate') && r?.kind === 'in'
  const justIn = st.state === 'ok' && r?.kind === 'in'
  let line
  if (st.state === 'idle') line = <>📍 Определяем местоположение…</>
  else if (justIn || atWork) line = <>✅ Вы на работе{r.ts ? ` с ${fmtTime(r.ts)}` : ''}{r.site ? ` · ${r.site}` : ''}</>
  else if (st.state === 'skip' && r?.why === 'left') line = <>👋 Уход отмечен{r.ts ? ` в ${fmtTime(r.ts)}` : ''}{r.reason ? ` · ${r.reason}` : ''}</>
  else if (st.state === 'skip') line = <>🕘 Вне рабочего времени — приход не отмечается</>
  else if (st.state === 'away') line = <>📍 Вы не на объекте ({km(st.dist)}). Приход отметится сам, когда вы придёте и откроете приложение.</>
  else if (st.state === 'error') line = <span className="red">{st.text}</span>
  else line = <>📍 На объекте</>

  return (
    <>
      <div className={`card auto-mark ${justIn || atWork ? 'on' : ''}`}>
        <div className="row between wrap gap">
          <b>{GEO_ICON} Автоотметка</b>
          <button className="linkbtn" onClick={() => auto(true)} disabled={!!st.checking}>Проверить сейчас</button>
        </div>
        <p style={{ margin: '10px 0' }}>{line}</p>
        {(justIn || atWork) && (
          <button className="btn block" onClick={markOut} disabled={busy}>{busy ? 'Определяем место…' : 'Отметить уход'}</button>
        )}
        {isIOS && <GeoAskTip />}
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          <Link to="/geo-setup">Отмечаться, не открывая приложение (iPhone)</Link>{' · '}
          <DisableGeo onDone={() => consents.reload()} />
        </p>
      </div>
      {result && (
        <div className="mark-overlay">
          <MarkResult state={result} setState={setResult} onClose={() => setResult(null)} />
        </div>
      )}
    </>
  )
}

// iPhone спрашивает доступ к геопозиции на каждом сайте заново, пока в настройках стоит «Спросить».
// Один раз выставить «Разрешить» — и вопрос больше не появится.
function GeoAskTip() {
  const [state, setState] = useState(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('tk_geo_tip') === '1' } catch { return false } })
  useEffect(() => { geoPermission().then(setState) }, [])
  if (hidden || state === 'granted') return null
  const close = () => { try { localStorage.setItem('tk_geo_tip', '1') } catch { /* */ } setHidden(true) }
  return (
    <div className="alert info small" style={{ marginTop: 10 }}>
      <b>Чтобы iPhone не спрашивал про геопозицию каждый раз:</b>
      <ol style={{ margin: '6px 0 6px 18px', padding: 0 }}>
        <li>Настройки → Приложения → <b>Safari</b> → <b>Геопозиция</b> → <b>«Разрешить»</b>.</li>
        <li>Настройки → Конфиденциальность → <b>Службы геолокации</b> → <b>Сайты Safari</b> → «При использовании», <b>«Точная геопозиция» — вкл</b>.</li>
      </ol>
      <button className="linkbtn" onClick={close}>Понятно, скрыть</button>
    </div>
  )
}

function DisableGeo({ onDone }) {
  const [busy, setBusy] = useState(false)
  async function off() {
    if (!confirm('Отключить геолокацию? Согласие будет отозвано, автоотметка перестанет работать. Отмечаться можно будет только через отдел кадров.')) return
    setBusy(true)
    try { await revokeConsent('geo'); onDone() } catch (e) { alert(errText(e)) } finally { setBusy(false) }
  }
  return <button className="linkbtn red" onClick={off} disabled={busy}>Отключить</button>
}
