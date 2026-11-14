import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMP_SELECT } from '../../lib/data'
import { DOCS } from '../../legal/docs'
import { fmtDate, fmtTime, dateKey } from '../../lib/time'
import CompanySelect from '../../components/CompanySelect'

const KINDS = [['terms', 'Соглашение'], ['pd', 'Персональные данные'], ['biometric', 'Face ID (биометрия)'], ['geo', 'Геолокация']]
const when = (ts) => `${fmtDate(dateKey(ts))} ${fmtTime(ts)}`

// Журнал согласий: кто, когда, с какого IP и какую редакцию документа принял
export default function Consents() {
  const [emps, setEmps] = useState([])
  const [cons, setCons] = useState([])
  const [keys, setKeys] = useState([])
  const [company, setCompany] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('employees').select(EMP_SELECT).neq('status', 'rejected').order('full_name'),
      supabase.from('consents').select('*').order('accepted_at'),
      supabase.from('passkeys').select('id,user_id,device,created_at,last_used_at'),
    ]).then(([e, c, k]) => { setEmps(e.data || []); setCons(c.data || []); setKeys(k.data || []) })
  }, [])

  const byUser = useMemo(() => Object.fromEntries(emps.filter((e) => e.user_id).map((e) => [e.user_id, e])), [emps])
  const active = (uid, kind) => cons.filter((c) => c.user_id === uid && c.kind === kind && !c.revoked_at).pop()
  const revoked = (uid, kind) => cons.filter((c) => c.user_id === uid && c.kind === kind && c.revoked_at).pop()

  const rows = emps.filter((e) => e.user_id && (!company || e.company_id === company))
    .filter((e) => !onlyMissing || !active(e.user_id, 'terms') || !active(e.user_id, 'pd'))
  const total = emps.filter((e) => e.user_id).length
  const done = emps.filter((e) => e.user_id && active(e.user_id, 'terms') && active(e.user_id, 'pd')).length
  const faceCnt = new Set(keys.map((k) => k.user_id)).size

  const exportXls = () => import('../../lib/export').then((x) => x.exportConsents(cons, byUser))

  return (
    <div className="card">
      <div className="stats">
        <div className="stat"><div className="muted small">Приняли соглашение и ПД</div><div className="v">{done} <small className="muted">из {total}</small></div></div>
        <div className="stat"><div className="muted small">Подключили Face ID</div><div className="v">{faceCnt}</div></div>
        <div className="stat"><div className="muted small">Записей в журнале</div><div className="v">{cons.length}</div></div>
      </div>
      <div className="row between wrap gap">
        <div className="row gap wrap">
          <CompanySelect value={company} onChange={setCompany} />
          <label className="inline"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> только без согласий</label>
        </div>
        <button className="btn" onClick={exportXls}>Excel: журнал согласий</button>
      </div>
      <p className="muted small">
        Согласия хранятся в базе Timekeeper (таблица <code>consents</code>): дата и время, IP-адрес, устройство, редакция и хеш текста документа.
        Удалить запись нельзя — работник может только отозвать согласие, отзыв тоже фиксируется.
        Документы: {Object.values(DOCS).map((d, i) => <span key={d.kind}>{i ? ' · ' : ''}<Link to={d.path} target="_blank">{d.title}</Link> (ред. {d.version})</span>)}
      </p>
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th>Работник</th><th>Компания</th>{KINDS.map(([k, l]) => <th key={k}>{l}</th>)}<th>Face ID на телефонах</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td><b>{e.full_name}</b><div className="muted small">{e.position}</div></td>
                <td className="small">{e.companies?.name}</td>
                {KINDS.map(([k]) => {
                  const a = active(e.user_id, k), r = revoked(e.user_id, k)
                  return (
                    <td key={k} className="small nowrap">
                      {a ? <><span className="pill st-here">✓ ред. {a.version}</span><div className="muted">{when(a.accepted_at)}{a.ip ? ` · ${a.ip}` : ''}</div></>
                        : r ? <><span className="pill st-abs">отозвано</span><div className="muted">{when(r.revoked_at)}</div></>
                        : <span className={`pill ${(k === 'biometric' || k === 'geo') ? 'st-off' : 'st-none'}`}>{(k === 'biometric' || k === 'geo') ? 'не подключал' : 'нет'}</span>}
                    </td>
                  )
                })}
                <td className="small">{keys.filter((k) => k.user_id === e.user_id).map((k) => `${k.device || 'телефон'}${k.last_used_at ? ` (посл. ${fmtDate(dateKey(k.last_used_at))})` : ''}`).join(', ') || '—'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={KINDS.length + 3} className="muted">Нет данных</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
