import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useConsents } from '../lib/consents'
import { geoCheckIn, geoError } from '../lib/geo'
import { MarkResult } from './Scan'
import GeoConsent from '../components/GeoConsent'

// /mark?e=in | /mark?e=out — открывается из уведомления телефона «Прибытие» / «Уход» (или кнопкой в приложении)
export default function Mark() {
  const [params] = useSearchParams()
  const ev = ['in', 'out'].includes(params.get('e')) ? params.get('e') : null
  const { session } = useAuth()
  const c = useConsents(session?.user.id)
  const [state, setState] = useState({ status: 'loading' })
  const started = useRef(false)

  async function run() {
    setState({ status: 'loading' })
    try {
      const r = await geoCheckIn(ev)
      setState(r)
      if (navigator.vibrate) navigator.vibrate(r.status === 'ok' ? 120 : [60, 60, 60])
    } catch (e) {
      setState({ status: 'error', text: geoError(e), retry: true })
    }
  }

  const consented = !c.loading && c.has('geo')
  useEffect(() => {
    if (!consented || started.current) return
    started.current = true
    run()
  }, [consented]) // eslint-disable-line react-hooks/exhaustive-deps

  if (c.loading) return <div className="center muted">Загрузка…</div>
  if (!consented) return (
    <div className="center">
      <div className="card narrow">
        <h2>Отметка по геолокации</h2>
        <GeoConsent onDone={() => c.reload()} />
        <p className="muted small"><Link to="/me">Отметиться по QR</Link></p>
      </div>
    </div>
  )
  if (state.status === 'loading') return (
    <div className="center muted">
      <div>📍 Определяем местоположение…</div>
      <div className="small">{ev === 'in' ? 'Отмечаем приход' : ev === 'out' ? 'Отмечаем уход' : 'Отмечаем'}</div>
    </div>
  )
  if (state.status === 'error' && state.retry) return (
    <div className="scan-result bad">
      <div className="big-icon">!</div>
      <h1>Не удалось отметиться</h1>
      <p>{state.text}</p>
      <button className="btn" onClick={run}>Попробовать снова</button>
      <Link className="btn ghost-light" to="/me">Отметиться по QR</Link>
    </div>
  )
  return <MarkResult state={state} setState={setState} />
}
