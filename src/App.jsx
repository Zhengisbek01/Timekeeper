import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { configured } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Scan from './pages/Scan'
import Kiosk from './pages/Kiosk'
import Me from './pages/Me'
const Admin = lazy(() => import('./pages/admin/Admin'))

function Guard({ children, admin }) {
  const { session, loading, isAdmin, kiosk } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="center muted">Загрузка…</div>
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (kiosk) return <Navigate to="/kiosk" replace />
  if (admin && !isAdmin) return <Navigate to="/me" replace />
  return children
}

function Home() {
  const { session, loading, isAdmin, kiosk } = useAuth()
  if (loading) return <div className="center muted">Загрузка…</div>
  if (!session) return <Navigate to="/login" replace />
  if (kiosk) return <Navigate to="/kiosk" replace />
  return <Navigate to={isAdmin ? '/admin' : '/me'} replace />
}

function NotConfigured() {
  return (
    <div className="center">
      <div className="card narrow">
        <h2>Не настроено подключение</h2>
        <p className="muted">Создайте файл <code>.env</code> по образцу <code>.env.example</code> и укажите
          <code> VITE_SUPABASE_URL</code> и <code>VITE_SUPABASE_ANON_KEY</code>. На Vercel — в Settings → Environment Variables.</p>
      </div>
    </div>
  )
}

export default function App() {
  if (!configured) return <NotConfigured />
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/me" element={<Guard><Me /></Guard>} />
        <Route path="/admin/*" element={<Guard admin><Suspense fallback={<div className="center muted">Загрузка…</div>}><Admin /></Suspense></Guard>} />
        <Route path="*" element={<div className="center"><Link to="/">На главную</Link></div>} />
      </Routes>
    </AuthProvider>
  )
}
