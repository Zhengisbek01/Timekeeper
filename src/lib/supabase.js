// ЗАМЕНИТЬ существующий файл клиента Supabase этим.
// Сессия хранится в localStorage и автоматически продлевается —
// сотрудник вводит логин/пароль только один раз на устройстве.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,          // помнить вход после закрытия браузера
    autoRefreshToken: true,        // продлевать токен без участия пользователя
    detectSessionInUrl: true,
    storage: window.localStorage,  // НЕ sessionStorage
    storageKey: 'timekeeper-auth',
  },
})
