import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useConsents, acceptConsent } from '../lib/consents'
import { DOCS } from '../legal/docs'
import { OrgLogo, Logo, PRODUCT } from './Logo'
import { errText } from '../lib/supabase'

// Пока работник не принял текущие редакции соглашения и согласия на ПД — дальше не пускаем
export default function ConsentGate({ children }) {
  const { session, signOut } = useAuth()
  const c = useConsents(session?.user.id)
  const [f, setF] = useState({ terms: false, pd: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const need = c.loading ? [] : ['terms', 'pd'].filter((k) => !c.has(k))
  // сразу после регистрации согласия записываются параллельно — перепроверим через пару секунд
  const [rechecked, setRechecked] = useState(false)
  useEffect(() => {
    if (c.loading || !need.length || rechecked) return
    const t = setTimeout(() => { setRechecked(true); c.reload() }, 1500)
    return () => clearTimeout(t)
  }, [c.loading, need.length, rechecked]) // eslint-disable-line react-hooks/exhaustive-deps

  if (c.loading) return <div className="center muted">Загрузка…</div>
  if (!need.length) return children

  async function submit(e) {
    e.preventDefault(); setErr(null); setBusy(true)
    try { for (const k of need) await acceptConsent(k); await c.reload() }
    catch (ex) { setErr(errText(ex)) } finally { setBusy(false) }
  }
  const updated = c.list.some((x) => need.includes(x.kind))

  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <div className="login-logo"><OrgLogo size={88} /></div>
        <div className="brand"><Logo /> {PRODUCT}</div>
        <h2 style={{ marginTop: 12 }}>{updated ? 'Документы обновились' : 'Перед началом работы'}</h2>
        <p className="muted small">Ознакомьтесь с документами и подтвердите согласие. Без этого пользоваться Timekeeper нельзя.</p>
        {need.map((k) => (
          <label key={k} className="inline consent">
            <input type="checkbox" required checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
            <span>{k === 'terms'
              ? <>Принимаю <Link to={DOCS.terms.path} target="_blank">Пользовательское соглашение</Link></>
              : <>Даю согласие на сбор и обработку персональных данных согласно <Link to={DOCS.pd.path} target="_blank">Политике конфиденциальности</Link></>}
            </span>
          </label>
        ))}
        {err && <div className="alert err">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? '…' : 'Принимаю и продолжаю'}</button>
        <div className="row center-x"><button type="button" className="linkbtn" onClick={signOut}>Выйти</button></div>
      </form>
    </div>
  )
}
