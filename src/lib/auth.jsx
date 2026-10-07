import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)   // undefined = загрузка
  const [employee, setEmployee] = useState(null)
  const [kiosk, setKiosk] = useState(null)

  const loadProfile = useCallback(async (s) => {
    if (!s) { setEmployee(null); setKiosk(null); return }
    const [e, k] = await Promise.all([
      supabase.from('employees').select('*, companies(name)').eq('user_id', s.user.id).maybeSingle(),
      supabase.from('kiosks').select('id,name,active').eq('user_id', s.user.id).maybeSingle(),
    ])
    setEmployee(e.data); setKiosk(k.data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { await loadProfile(data.session); setSession(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // загрузка профиля вне колбэка, чтобы не блокировать клиент Supabase
      setTimeout(async () => { await loadProfile(s); setSession(s) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value = {
    session, employee, kiosk, loading: session === undefined,
    isAdmin: employee?.role === 'admin' && employee?.status === 'approved' && employee?.active,
    reload: () => loadProfile(session),
    signOut: () => supabase.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
