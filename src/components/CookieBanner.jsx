import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const KEY = 'tk_cookie_ok'

// Уведомление о cookie: используются только технически необходимые (вход в систему)
export default function CookieBanner() {
  const loc = useLocation()
  const [ok, setOk] = useState(() => { try { return Boolean(localStorage.getItem(KEY)) } catch { return true } })
  if (ok || loc.pathname.startsWith('/kiosk') || loc.pathname.startsWith('/scan')) return null
  const accept = () => { try { localStorage.setItem(KEY, new Date().toISOString()) } catch {} setOk(true) }
  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie">
      <span>🍪 Timekeeper использует только необходимые cookie и локальное хранилище — чтобы вы оставались в системе. Рекламных и аналитических cookie нет. <Link to="/privacy">Подробнее</Link></span>
      <button className="btn sm primary" onClick={accept}>Понятно</button>
    </div>
  )
}
