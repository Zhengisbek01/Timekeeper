import { useState } from 'react'
import { Link } from 'react-router-dom'
import { acceptConsent } from '../lib/consents'
import { errText } from '../lib/supabase'

// Согласие на геолокацию (один раз)
export default function GeoConsent({ onDone, onCancel }) {
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null); setBusy(true)
    try { await acceptConsent('geo'); onDone() } catch (ex) { setErr(errText(ex)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit}>
      <ul className="face-points">
        <li>📍 Местоположение определяется <b>только в момент отметки</b> — чтобы проверить, что вы на объекте.</li>
        <li>🚫 Мы <b>не отслеживаем</b> перемещения и не храним координаты: в отметке остаются объект и расстояние до него.</li>
        <li>↩️ Отключить геолокацию и вернуться к QR можно в любой момент.</li>
      </ul>
      <label className="inline consent">
        <input type="checkbox" required checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>Даю <Link to="/geolocation" target="_blank">согласие на использование геолокации</Link> для отметки прихода и ухода</span>
      </label>
      {err && <div className="alert err">{err}</div>}
      <div className="row gap end">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Отмена</button>}
        <button className="btn primary" disabled={busy || !agree}>{busy ? '…' : 'Продолжить'}</button>
      </div>
    </form>
  )
}
