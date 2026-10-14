// НОВЫЙ файл. Обёртка для страниц, где нужен вход (скан QR, «Мои отметки», панель HR).
// Если сессия сохранена — сразу пускает дальше.
// Если нет — запоминает, куда человек шёл (вместе с токеном QR), и ведёт на /login.
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export const RETURN_KEY = 'tk-return-to'

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui' }}>
        Загрузка…
      </div>
    )
  }

  if (!session) {
    sessionStorage.setItem(RETURN_KEY, location.pathname + location.search)
    return <Navigate to="/login" replace />
  }

  return children
}
