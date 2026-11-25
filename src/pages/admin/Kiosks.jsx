import { useEffect, useState } from 'react'
import { supabase, errText, tempPassword } from '../../lib/supabase'

// Киоск = отдельная учётная запись планшета (логин + пароль), активируется кодом
export default function Kiosks() {
  const [list, setList] = useState([])
  const [f, setF] = useState({ name: '', login: '' })
  const [shown, setShown] = useState(null)   // {name, login, code} — показать HR один раз
  const [err, setErr] = useState(null)
  const [geo, setGeo] = useState(null)   // редактирование координат входа для Face ID

  const load = () => supabase.from('kiosks').select('id,name,login,user_id,active,activation_code,created_at,lat,lng,radius_m,address').order('created_at').then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault(); setErr(null)
    const login = f.login.trim().toLowerCase()
    const { data, error } = await supabase.rpc('kiosk_create', { p_name: f.name, p_login: login })
    if (error) return setErr(errText(error))
    setShown({ name: f.name, login: data.login, code: data.code }); setF({ name: '', login: '' }); load()
  }
  const reset = async (k) => {
    if (!confirm(`Сбросить учётную запись киоска «${k.name}»? Планшет выйдет, нужно будет активировать заново.`)) return
    const { data, error } = await supabase.rpc('kiosk_reset', { p_kiosk: k.id })
    if (error) return setErr(errText(error))
    setShown({ name: k.name, login: k.login, code: data }); load()
  }
  const setPassword = async (k) => {
    if (!confirm(`Задать новый пароль для киоска «${k.name}»?`)) return
    const password = tempPassword()
    const { error } = await supabase.rpc('kiosk_set_password', { p_kiosk: k.id, p_password: password })
    if (error) return setErr(errText(error))
    setShown({ name: k.name, login: k.login, password, activated: Boolean(k.user_id), code: k.user_id ? null : k.activation_code })
  }
  const toggle = async (k) => {
    const { error } = await supabase.from('kiosks').update({ active: !k.active }).eq('id', k.id)
    if (error) setErr(errText(error)); load()
  }

  return (
    <div className="card">
      <form className="row gap wrap" onSubmit={create}>
        <input required placeholder="Название, напр. «Главный вход»" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
        <input required placeholder="Логин: kiosk-main" pattern="[a-z0-9\-]{3,32}" title="латиница в нижнем регистре, цифры, дефис"
          value={f.login} onChange={(e) => setF({ ...f, login: e.target.value.toLowerCase() })} style={{ width: 180 }} />
        <button className="btn primary">+ Объект</button>
      </form>
      <p className="muted small">Объект — офис или площадка, где работники отмечаются по геолокации. Создайте запись (название и любой логин), затем у неё нажмите «задать» и укажите адрес, точку и радиус. Активировать запись не нужно.</p>
      {err && <div className="alert err">{err}</div>}
      <table className="tbl">
        <thead><tr><th>Объект</th><th>Логин</th><th>Учётная запись</th><th>Геозона</th><th></th></tr></thead>
        <tbody>
          {list.map((k) => (
            <tr key={k.id} className={k.active ? '' : 'dim'}>
              <td><b>{k.name}</b></td>
              <td className="mono">{k.login}</td>
              <td>
                {!k.active ? <span className="pill st-none">отключён</span>
                  : k.user_id ? <span className="pill st-here">активирован</span>
                  : <span className="pill st-abs">ждёт активации · код {k.activation_code}</span>}
              </td>
              <td className="small">
                {k.address && <div>{k.address}</div>}{k.lat != null ? <>📍 радиус {k.radius_m} м <a href={`https://www.google.com/maps?q=${k.lat},${k.lng}`} target="_blank" rel="noreferrer">на карте</a></> : <span className="muted">не задан</span>}{' '}
                <button className="linkbtn" onClick={() => setGeo({ id: k.id, name: k.name, address: k.address || '', lat: k.lat ?? '', lng: k.lng ?? '', radius_m: k.radius_m || 150 })}>{k.lat != null ? 'изменить' : 'задать'}</button>
              </td>
              <td className="r nowrap">
                <button className="btn sm ghost" onClick={() => setPassword(k)}>Пароль</button>{' '}
                <button className="btn sm ghost" onClick={() => reset(k)}>Сбросить</button>{' '}
                <button className="btn sm ghost" onClick={() => toggle(k)}>{k.active ? 'Отключить' : 'Включить'}</button>
              </td>
            </tr>
          ))}
          {!list.length && <tr><td className="muted" colSpan={5}>Добавьте первый киоск</td></tr>}
        </tbody>
      </table>

      {geo && <GeoEditor geo={geo} onClose={() => setGeo(null)} onSaved={() => { setGeo(null); load() }} />}

      {shown && (
        <div className="modal-bg" onClick={() => setShown(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{shown.password ? `Новый пароль киоска «${shown.name}»` : `Активация киоска «${shown.name}»`}</h3>
            <p className="muted">На планшете: <code>{window.location.origin}/kiosk</code> → {shown.password && shown.activated ? '«Вход»' : '«Активация»'}.</p>
            <dl className="kv big">
              <dt>Логин</dt><dd className="mono">{shown.login}</dd>
              {shown.code && <><dt>Код</dt><dd className="mono">{shown.code}</dd></>}
              {shown.password && <><dt>Пароль</dt><dd className="mono">{shown.password}</dd></>}
            </dl>
            <p className="muted small">{shown.password
              ? (shown.activated ? 'Введите логин и этот пароль. Пароль показан один раз.' : 'Введите логин, код и этот пароль (в оба поля пароля).')
              : 'Код одноразовый. Пароль придумывается на планшете при активации. Если планшет уже активировали раньше — после кода введите прежний пароль киоска или задайте новый кнопкой «Пароль».'}</p>
            <div className="row end"><button className="btn primary" onClick={() => setShown(null)}>Готово</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

// Координаты входа/объекта: отметки по Face ID и геолокации принимаются только в этом радиусе
function GeoEditor({ geo, onClose, onSaved }) {
  const [f, setF] = useState(geo)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  // можно вставить «51.128207, 71.430411» целиком (из 2ГИС / Google Карт) в поле широты
  const set = (k) => (e) => {
    const v = e.target.value
    const m = k === 'lat' && v.match(/^\s*(-?\d+[.,]\d+)\s*[,; ]\s*(-?\d+[.,]\d+)\s*$/)
    if (m) return setF({ ...f, lat: m[1].replace(',', '.'), lng: m[2].replace(',', '.') })
    setF({ ...f, [k]: v })
  }

  function here() {
    setErr(null); setBusy(true)
    navigator.geolocation?.getCurrentPosition(
      (p) => { setF({ ...f, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }); setBusy(false) },
      () => { setErr('Не удалось определить координаты. Разрешите геолокацию или введите вручную.'); setBusy(false) },
      { enableHighAccuracy: true, timeout: 15000 })
  }
  async function save(e) {
    e.preventDefault(); setErr(null)
    const lat = f.lat === '' ? null : Number(String(f.lat).replace(',', '.'))
    const lng = f.lng === '' ? null : Number(String(f.lng).replace(',', '.'))
    if ((lat == null) !== (lng == null) || (lat != null && (!Number.isFinite(lat) || !Number.isFinite(lng)))) return setErr('Укажите обе координаты числами, например 51.128207 и 71.430411')
    const { error } = await supabase.from('kiosks').update({ lat, lng, address: (f.address || '').trim() || null, radius_m: Math.max(30, Math.min(2000, +f.radius_m || 150)) }).eq('id', geo.id)
    if (error) return setErr(errText(error))
    onSaved()
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h3>«{geo.name}» — геозона</h3>
        <p className="muted small">Отметки по геолокации принимаются только в этом радиусе. Проще всего: встаньте у входа с телефоном и нажмите «Мои координаты сейчас».</p>
        <button type="button" className="btn block" onClick={here} disabled={busy}>{busy ? 'Определяем…' : '📍 Мои координаты сейчас'}</button>
        <div className="grid2" style={{ marginTop: 10 }}>
          <label className="span2">Адрес (работники увидят его в инструкции)<input placeholder="г. Астана, ул. …" value={f.address} onChange={set('address')} /></label>
          <label>Широта<input inputMode="decimal" placeholder="51.128207" value={f.lat} onChange={set('lat')} /></label>
          <label>Долгота<input inputMode="decimal" placeholder="71.430411" value={f.lng} onChange={set('lng')} /></label>
          <label className="span2">Радиус, м (рекомендуем 100–200: GPS в здании неточен)<input type="number" min="30" max="2000" value={f.radius_m} onChange={set('radius_m')} /></label>
        </div>
        {f.lat !== '' && f.lng !== '' && <p className="small"><a href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer">Проверить точку на карте</a></p>}
        {err && <div className="alert err">{err}</div>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
          <button className="btn primary">Сохранить</button>
        </div>
      </form>
    </div>
  )
}
