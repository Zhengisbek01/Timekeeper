import { Link } from 'react-router-dom'
import { DOCS, OPERATOR } from '../legal/docs'
import { Brand } from '../components/Logo'

// Публичные страницы документов: /terms, /privacy, /biometric, /geolocation
export default function Legal({ kind }) {
  const d = DOCS[kind]
  return (
    <div className="page legal">
      <div className="topbar no-print">
        <Brand />
        <div className="row gap">
          <button className="btn sm ghost" onClick={() => window.print()}>Печать / PDF</button>
          <Link className="btn sm" to="/">На сайт</Link>
        </div>
      </div>
      <article className="card">
        <h1>{d.title}</h1>
        <p className="muted small">Редакция {d.version} от {d.date} · {OPERATOR.name}</p>
        {d.sections.map((s) => (
          <section key={s.h}>
            <h3>{s.h}</h3>
            {s.p.map((t, i) => <p key={i}>{t}</p>)}
          </section>
        ))}
      </article>
      <p className="muted small no-print">
        Другие документы: {Object.values(DOCS).filter((x) => x.kind !== kind).map((x, i) => (
          <span key={x.kind}>{i ? ' · ' : ''}<Link to={x.path}>{x.title}</Link></span>
        ))}
      </p>
    </div>
  )
}
