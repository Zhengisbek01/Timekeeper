import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { configured, recoveryLink } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Scan from './pages/Scan'
import Kiosk from './pages/Kiosk'
import Me from './pages/Me'
import Reset from './pages/Reset'
import PinGate from './components/PinGate'
const Admin = lazy(() => import('./pages/admin/Admin'))

function Guard({ children, admin }) {
  const { session, loading, isAdmin, kiosk } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="center muted">Загрузка…</div>
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (kiosk) return <Navigate to="/kiosk" replace />
  if (admin && !isAdmin) return <Navigate to="/me" replace />
  return <PinGate>{children}</PinGate>
}

// Отметка по QR: без входа — на страницу входа (её обрабатывает Scan), со входом — сначала код
function ScanRoute() {
  const { session, loading, kiosk } = useAuth()
  if (loading) return <div className="center muted">Загрузка…</div>
  if (!session || kiosk) return <Scan />
  return <PinGate><Scan /></PinGate>
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
        <Route path="/" element={recoveryLink ? <Navigate to={'/reset' + window.location.search + window.location.hash} replace /> : <Home />} />
        <Route path="/login" element={<Login />} />
        {/* привычные адреса регистрации и входа */}
        {['/register', '/registration', '/signup', '/sign-up', '/reg'].map((p) => <Route key={p} path={p} element={<Navigate to="/login?mode=up" replace />} />)}
        {['/signin', '/sign-in', '/auth'].map((p) => <Route key={p} path={p} element={<Navigate to="/login" replace />} />)}
        <Route path="/reset" element={<Reset />} />
        <Route path="/forgot" element={<Navigate to="/login?mode=forgot" replace />} />
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/scan" element={<ScanRoute />} />
        <Route path="/me" element={<Guard><Me /></Guard>} />
        <Route path="/admin/*" element={<Guard admin><Suspense fallback={<div className="center muted">Загрузка…</div>}><Admin /></Suspense></Guard>} />
        {/* неизвестный адрес — сразу на нужный экран (вход / мои отметки / админка) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
