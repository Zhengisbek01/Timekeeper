import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errText } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { isIOS } from '../lib/install'
import { faceSupported, prepareCheckin, prepareRegister, faceCheckIn, registerFace, faceError } from '../lib/faceid'
import { acceptConsent, revokeConsent, useConsents } from '../lib/consents'
import QrScan, { PhotoScanButton } from './QrScan'
import { MarkResult } from '../pages/Scan'
import { fmtDate, dateKey } from '../lib/time'
import { geoCheckIn, geoError } from '../lib/geo'
import GeoConsent from './GeoConsent'
import { env } from '../lib/config'
const FACE_ON = env('VITE_FACE_ID') === '1'

const QR_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" /></svg>
const FACE_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M9 9.5v1M15 9.5v1M12 9v4h-1M9.5 15.5a3.5 3.5 0 0 0 5 0" /></svg>
const GEO_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
const M_KEY = 'tk_method'

// Блок «Отметиться»: работник выбирает QR, Face ID или геолокацию
export default function MarkPanel({ onMarked }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [keys, setKeys] = useState(null)
  const [supported, setSupported] = useState(false)
  const [method, setMethodState] = useState(() => { try { return localStorage.getItem(M_KEY) || 'qr' } catch { return 'qr' } })
  const [prep, setPrep] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [setup, setSetup] = useState(false)
  const [scan, setScan] = useState(false)
  const [geoSetup, setGeoSetup] = useState(false)
  const consents = useConsents(uid)
  const geoReady = !consents.loading && consents.has('geo')

  const setMethod = (m) => { setMethodState(m); try { localStorage.setItem(M_KEY, m) } catch {} }
  const loadKeys = useCallback(() => {
    if (!uid) return
    supabase.from('passkeys').select('id,device,created_at,last_used_at').eq('user_id', uid).order('created_at')
      .then(({ data }) => setKeys(data || []))
  }, [uid])
  // Face ID включается переменной VITE_FACE_ID=1 (нужен сервис проверки WEBAUTHN_SECRET)
  useEffect(() => { if (!FACE_ON) return; loadKeys(); faceSupported().then(setSupported) }, [loadKeys])

  const faceReady = supported && keys?.length > 0
  const useFace = faceReady && method === 'face'
  const useGeo = geoReady && method === 'geo'

  // одноразовый код для Face ID готовим заранее (Safari требует вызывать Face ID сразу по нажатию)
  useEffect(() => {
    if (!useFace) return
    let alive = true
    const get = () => prepareCheckin().then((p) => alive && setPrep(p)).catch(() => {})
    get()
    const t = setInterval(get, 120000)
    return () => { alive = false; clearInterval(t) }
  }, [useFace])

  async function doFace() {
    setBusy(true)
    try {
      const r = await faceCheckIn(prep)
      setResult(r)
      if (navigator.vibrate) navigator.vibrate(r.status === 'ok' ? 120 : [60, 60, 60])
      onMarked?.()
    } catch (e) {
      setResult({ status: 'error', text: faceError(e) })
    } finally {
      setBusy(false); setPrep(null)
      prepareCheckin().then(setPrep).catch(() => {})
    }
  }

  async function doGeo() {
    setBusy(true)
    try {
      const r = await geoCheckIn(null)
      setResult(r)
      if (navigator.vibrate) navigator.vibrate(r.status === 'ok' ? 120 : [60, 60, 60])
      onMarked?.()
    } catch (e) {
      setResult({ status: 'error', text: geoError(e) })
    } finally { setBusy(false) }
  }

  const qrButtons = isIOS ? (
    <>
      <PhotoScanButton className="btn primary block scan-btn">{QR_ICON} Отметиться — сфотографировать QR</PhotoScanButton>
      <button className="linkbtn live-cam" onClick={() => setScan(true)}>или живая камера</button>
    </>
  ) : (
    <button className="btn primary block scan-btn" onClick={() => setScan(true)}>{QR_ICON} Отметиться — сканировать QR</button>
  )

  return (
    <>
      {useGeo ? (
        <>
          <button className="btn primary block scan-btn" onClick={doGeo} disabled={busy}>
            {GEO_ICON} {busy ? 'Определяем место…' : 'Отметиться по геолокации'}
          </button>
          <button className="linkbtn live-cam" onClick={() => setScan(true)}>или сканировать QR</button>
        </>
      ) : useFace ? (
        <>
          <button className="btn primary block scan-btn face" onClick={doFace} disabled={busy}>
            {FACE_ICON} {busy ? 'Проверяем…' : 'Отметиться по Face ID'}
          </button>
          <button className="linkbtn live-cam" onClick={() => setScan(true)}>или сканировать QR</button>
        </>
      ) : qrButtons}

      {(
        <div className="card method">
          <div className="row between wrap gap">
            <b>Способ отметки</b>
            <div className="seg inline-seg">
              <button className={!useFace && !useGeo ? 'on' : ''} onClick={() => setMethod('qr')}>QR-код</button>
              {supported && <button className={useFace ? 'on' : ''} onClick={() => (faceReady ? setMethod('face') : setSetup(true))}>Face ID</button>}
              <button className={useGeo ? 'on' : ''} onClick={() => (geoReady ? setMethod('geo') : setGeoSetup(true))}>Геолокация</button>
            </div>
          </div>
          {useGeo ? (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Отметка по местоположению на объекте.{' '}
              <Link to="/geo-setup">Настроить уведомления «Вы на объекте»</Link>{' · '}
              <DisableGeo onDone={() => { consents.reload(); setMethod('qr') }} />
            </p>
          ) : !supported ? (
            <p className="muted small" style={{ margin: '8px 0 0' }}>Геолокация: телефон сам напомнит отметиться, когда вы придёте на объект.</p>
          ) : faceReady ? (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Face ID подключён: {keys.map((k) => `${k.device || 'телефон'} (с ${fmtDate(dateKey(k.created_at))})`).join(', ')}.{' '}
              <button className="linkbtn" onClick={() => setSetup('add')}>Добавить телефон</button>{' · '}
              <DisableFace onDone={() => { loadKeys(); setMethod('qr') }} />
            </p>
          ) : (
            <p className="muted small" style={{ margin: '8px 0 0' }}>Отмечайтесь по лицу или отпечатку прямо у входа — без QR-кода.</p>
          )}
        </div>
      )}

      {scan && <QrScan onClose={() => setScan(false)} />}
      {geoSetup && (
        <div className="modal-bg" onClick={() => setGeoSetup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Отметка по геолокации</h3>
            <GeoConsent onCancel={() => setGeoSetup(false)} onDone={() => { setGeoSetup(false); consents.reload().then(() => setMethod('geo')) }} />
          </div>
        </div>
      )}
      {setup && <FaceSetup onClose={() => setSetup(false)} onDone={() => { setSetup(false); loadKeys(); setMethod('face') }} />}
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
    if (!confirm('Отключить отметку по геолокации? Согласие будет отозвано. Удалите также автоматизации «Прибытие» / «Уход» в приложении «Команды».')) return
    setBusy(true)
    try { await revokeConsent('geo'); onDone() } catch (e) { alert(errText(e)) } finally { setBusy(false) }
  }
  return <button className="linkbtn red" onClick={off} disabled={busy}>Отключить</button>
}

function DisableFace({ onDone }) {
  const [busy, setBusy] = useState(false)
  async function off() {
    if (!confirm('Отключить Face ID? Согласие на биометрическую аутентификацию будет отозвано, ключи удалены. Отмечаться можно будет по QR.')) return
    setBusy(true)
    try { await revokeConsent('biometric'); onDone() } catch (e) { alert(errText(e)) } finally { setBusy(false) }
  }
  return <button className="linkbtn red" onClick={off} disabled={busy}>Отключить Face ID</button>
}

// Подключение: 1) согласие на биометрическую аутентификацию 2) Face ID на телефоне
function FaceSetup({ onClose, onDone }) {
  const { session } = useAuth()
  const c = useConsents(session?.user.id)
  const [agree, setAgree] = useState(false)
  const [step, setStep] = useState('consent')
  const [prep, setPrep] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => { if (!c.loading && c.has('biometric')) setStep('register') }, [c.loading]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (step === 'register') prepareRegister().then(setPrep).catch((e) => setErr(faceError(e))) }, [step])

  async function consent(e) {
    e.preventDefault(); setErr(null); setBusy(true)
    try { await acceptConsent('biometric'); setStep('register') } catch (ex) { setErr(errText(ex)) } finally { setBusy(false) }
  }
  async function register() {
    setErr(null); setBusy(true)
    try { await registerFace(prep); onDone() } catch (e) { setErr(faceError(e)); prepareRegister().then(setPrep).catch(() => {}) } finally { setBusy(false) }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Подключить Face ID</h3>
        {step === 'consent' ? (
          <form onSubmit={consent}>
            <ul className="face-points">
              <li>🔒 Лицо или отпечаток проверяет <b>сам телефон</b>. Мы не получаем и не храним ваши фото и отпечатки.</li>
              <li>📍 При отметке проверяем, что вы <b>у входа</b> (геолокация). Координаты не сохраняются.</li>
              <li>↩️ Отключить Face ID и вернуться к QR можно в любой момент.</li>
            </ul>
            <label className="inline consent">
              <input type="checkbox" required checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>Даю <Link to="/biometric" target="_blank">согласие на использование биометрической аутентификации</Link> (Face ID / отпечаток пальца)</span>
            </label>
            {err && <div className="alert err">{err}</div>}
            <div className="row gap end">
              <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
              <button className="btn primary" disabled={busy || !agree}>{busy ? '…' : 'Продолжить'}</button>
            </div>
          </form>
        ) : (
          <>
            <p className="muted">Нажмите кнопку — телефон попросит Face ID или отпечаток. Это нужно сделать один раз на каждом телефоне.</p>
            {err && <div className="alert err">{err}</div>}
            <div className="row gap end">
              <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
              <button className="btn primary" onClick={register} disabled={busy || !prep}>{busy ? 'Подключаем…' : !prep ? 'Готовим…' : 'Подключить Face ID'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
