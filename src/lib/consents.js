import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DOCS, docHash } from '../legal/docs'

// активные согласия текущего пользователя
export function useConsents(uid) {
  const [list, setList] = useState(null)
  const reload = useCallback(async () => {
    if (!uid) return setList([])
    const { data } = await supabase.from('consents').select('*').eq('user_id', uid).is('revoked_at', null).order('accepted_at')
    setList(data || [])
  }, [uid])
  useEffect(() => { reload() }, [reload])
  const has = (kind) => Boolean(list?.some((c) => c.kind === kind && c.version === DOCS[kind].version))
  return { list, loading: list === null, has, reload }
}

export async function acceptConsent(kind) {
  const d = DOCS[kind]
  const { error } = await supabase.rpc('accept_consent', {
    p_kind: kind, p_version: d.version, p_hash: await docHash(d), p_ua: navigator.userAgent,
  })
  if (error) throw error
}

export async function revokeConsent(kind) {
  const { error } = await supabase.rpc('revoke_consent', { p_kind: kind })
  if (error) throw error
}
