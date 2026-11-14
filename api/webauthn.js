// Timekeeper: проверка Face ID / отпечатка (WebAuthn) на сервере Vercel.
// Биометрия не покидает телефон: телефон подписывает одноразовый код своим ключом, здесь проверяется подпись.
// Проверенный результат подписывается секретом WEBAUTHN_SECRET и передаётся в базу (face_check_in / passkey_save).
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.WEBAUTHN_SECRET

const fail = (status, message) => Object.assign(new Error(message), { status })
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('hex')
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

// одноразовое «состояние» вместо хранения кода в базе: код + пользователь + срок, подписанные секретом
function signState(o) {
  const p = Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${p}.${hmac('state|' + p)}`
}
function readState(tok, uid, action) {
  const [p, s] = String(tok || '').split('.')
  if (!p || !s || !same(hmac('state|' + p), s)) throw fail(400, 'STATE_INVALID')
  const o = JSON.parse(Buffer.from(p, 'base64url').toString())
  if (o.u !== uid || o.a !== action) throw fail(400, 'STATE_INVALID')
  if (Date.now() > o.x) throw fail(400, 'STATE_EXPIRED')
  return o
}
const signed = (parts) => {
  const nonce = crypto.randomUUID(), ts = Math.floor(Date.now() / 1000)
  return { nonce, ts, sig: hmac([...parts, nonce, ts].join('|')) }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD' })
  try {
    if (!SB_URL || !SB_KEY || !SECRET) throw fail(500, 'SERVER_NOT_CONFIGURED')
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!jwt) throw fail(401, 'NOT_AUTH')
    const sb = createClient(SB_URL, SB_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user } = {}, error: authErr } = await sb.auth.getUser(jwt)
    if (authErr || !user) throw fail(401, 'NOT_AUTH')

    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].split(':')[0].trim()
    const rpID = process.env.WEBAUTHN_RP_ID || host
    const origin = process.env.WEBAUTHN_ORIGIN || `https://${host}`
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const action = req.query?.action || body.action

    // ---- подключение Face ID на этом телефоне ----
    if (action === 'register-options') {
      const [{ data: emp }, { data: keys }] = await Promise.all([
        sb.from('employees').select('full_name').eq('user_id', user.id).maybeSingle(),
        sb.from('passkeys').select('id,transports').eq('user_id', user.id),
      ])
      const options = await generateRegistrationOptions({
        rpName: 'Timekeeper', rpID,
        userID: new TextEncoder().encode(user.id),
        userName: user.email, userDisplayName: emp?.full_name || user.email,
        attestationType: 'none', timeout: 60000,
        excludeCredentials: (keys || []).map((k) => ({ id: k.id, transports: k.transports || undefined })),
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      })
      return res.json({ options, state: signState({ c: options.challenge, u: user.id, a: 'reg', x: Date.now() + 180000 }) })
    }

    if (action === 'register-verify') {
      const st = readState(body.state, user.id, 'reg')
      const v = await verifyRegistrationResponse({
        response: body.response, expectedChallenge: st.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      })
      if (!v.verified || !v.registrationInfo) throw fail(400, 'NOT_VERIFIED')
      const c = v.registrationInfo.credential
      const pk = isoBase64URL.fromBuffer(c.publicKey)
      const transports = (c.transports || body.response?.response?.transports || []).join(',')
      const counter = String(c.counter || 0)
      const s = signed(['save', user.id, c.id, pk, counter])
      const { error } = await sb.rpc('passkey_save', {
        p_id: c.id, p_public_key: pk, p_counter: counter, p_transports: transports,
        p_device: String(body.device || '').slice(0, 120), p_nonce: s.nonce, p_ts: s.ts, p_sig: s.sig,
      })
      if (error) throw fail(400, error.message)
      return res.json({ ok: true })
    }

    // ---- отметка по Face ID ----
    if (action === 'checkin-options') {
      const { data: keys } = await sb.from('passkeys').select('id,transports').eq('user_id', user.id)
      if (!keys?.length) throw fail(400, 'NO_PASSKEY')
      const options = await generateAuthenticationOptions({
        rpID, userVerification: 'required', timeout: 60000,
        allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports || undefined })),
      })
      return res.json({ options, state: signState({ c: options.challenge, u: user.id, a: 'auth', x: Date.now() + 180000 }) })
    }

    if (action === 'checkin-verify') {
      const st = readState(body.state, user.id, 'auth')
      const lat = Number(body.lat), lng = Number(body.lng), acc = Math.round(Number(body.acc) || 0)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw fail(400, 'NO_LOCATION')
      const { data: key } = await sb.from('passkeys').select('*').eq('id', body.response?.id).eq('user_id', user.id).maybeSingle()
      if (!key) throw fail(400, 'NO_PASSKEY')
      const v = await verifyAuthenticationResponse({
        response: body.response, expectedChallenge: st.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: key.id, publicKey: isoBase64URL.toBuffer(key.public_key), counter: Number(key.counter) || 0, transports: key.transports || undefined },
      })
      if (!v.verified) throw fail(400, 'NOT_VERIFIED')
      const counter = String(v.authenticationInfo.newCounter || 0)
      const P = { lat: String(lat), lng: String(lng), acc: String(acc) }
      const s = signed(['checkin', user.id, key.id, counter, P.lat, P.lng, P.acc])
      const { data, error } = await sb.rpc('face_check_in', {
        p_cred: key.id, p_counter: counter, p_lat: P.lat, p_lng: P.lng, p_acc: P.acc, p_nonce: s.nonce, p_ts: s.ts, p_sig: s.sig,
      })
      if (error) throw fail(400, error.message)
      return res.json(data)
    }

    throw fail(400, 'BAD_ACTION')
  } catch (e) {
    const msg = String(e?.message || e)
    return res.status(e?.status || 400).json({ error: msg })
  }
}
