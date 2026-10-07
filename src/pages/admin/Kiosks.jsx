import { useEffect, useState } from 'react'
import { supabase, errText } from '../../lib/supabase'

// Киоск = отдельная учётная запись планшета (логин + пароль), активируется кодом
export default function Kiosks() {
  const [list, setList] = useState([])
  const [f, setF] = useState({ name: '', login: '' })
  const [shown, setShown] = useState(null)   // {name, login, code} — показать HR один раз
  const [err, setErr] = useState(null)

  const load = () => supabase.from('kiosks').select('id,name,login,user_id,active,activation_code,created_at').order('created_at').then(({ data }) => setList(data || []))
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
        <button className="btn primary">+ Киоск</button>
      </form>
      <p className="muted small">На планшете откройте <code>{window.location.origin}/kiosk</code> → «Активация» → логин, код и новый пароль. Дальше планшет остаётся в системе; при выходе — «Вход» с логином и паролем.</p>
      {err && <div className="alert err">{err}</div>}
      <table className="tbl">
        <thead><tr><th>Киоск</th><th>Логин</th><th>Учётная запись</th><th></th></tr></thead>
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
              <td className="r nowrap">
                <button className="btn sm ghost" onClick={() => reset(k)}>Сбросить</button>{' '}
                <button className="btn sm ghost" onClick={() => toggle(k)}>{k.active ? 'Отключить' : 'Включить'}</button>
              </td>
            </tr>
          ))}
          {!list.length && <tr><td className="muted" colSpan={4}>Добавьте первый киоск</td></tr>}
        </tbody>
      </table>

      {shown && (
        <div className="modal-bg" onClick={() => setShown(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Активация киоска «{shown.name}»</h3>
            <p className="muted">На планшете: <code>{window.location.origin}/kiosk</code> → «Активация».</p>
            <dl className="kv big">
              <dt>Логин</dt><dd className="mono">{shown.login}</dd>
              <dt>Код</dt><dd className="mono">{shown.code}</dd>
            </dl>
            <p className="muted small">Код одноразовый. Пароль придумывается на планшете при активации.</p>
            <div className="row end"><button className="btn primary" onClick={() => setShown(null)}>Готово</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
