import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { errText } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { revokeConsent, useConsents } from '../lib/consents'
import { MarkResult } from '../pages/Scan'
import { fmtTime } from '../lib/time'
import { geoCheckIn, geoError } from '../lib/geo'
import GeoConsent from './GeoConsent'

const GEO_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
const AUTO_EVERY = 90 * 1000 // пока приложение открыто — проверяем раз в 1,5 минуты

const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} км` : `${m} м`)

// Отметка только по геолокации: приход ставится сам, когда работник на объекте и приложение открыто
export default function MarkPanel({ onMarked }) {
  const { session } = useAuth()
  const consents = useConsents(session?.user.id)
  const geoReady = !consents.loading && consents.has('geo')
  const [st, setSt] = useState({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const running = useRef(false)
  const markedRef = useRef(onMarked)
  markedRef.current = onMarked

  const auto = useCallback(async () => {
    if (running.current || document.visibilityState !== 'visible') return
    running.current = true
    setSt((s) => ({ ...s, checking: true }))
    try {
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
    } finally { running.current = false }
  }, [])

  useEffect(() => {
    if (!geoReady) return
    auto()
    const t = setInterval(auto, AUTO_EVERY)
    const vis = () => document.visibilityState === 'visible' && auto()
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [geoReady, auto])

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
          <button className="linkbtn" onClick={auto} disabled={st.checking && running.current}>Проверить сейчас</button>
        </div>
        <p style={{ margin: '10px 0' }}>{line}</p>
        {(justIn || atWork) && (
          <button className="btn block" onClick={markOut} disabled={busy}>{busy ? 'Определяем место…' : 'Отметить уход'}</button>
        )}
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

function DisableGeo({ onDone }) {
  const [busy, setBusy] = useState(false)
  async function off() {
    if (!confirm('Отключить геолокацию? Согласие будет отозвано, автоотметка перестанет работать. Отмечаться можно будет только через отдел кадров.')) return
    setBusy(true)
    try { await revokeConsent('geo'); onDone() } catch (e) { alert(errText(e)) } finally { setBusy(false) }
  }
  return <button className="linkbtn red" onClick={off} disabled={busy}>Отключить</button>
}
