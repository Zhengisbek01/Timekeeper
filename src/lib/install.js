import { useEffect, useState } from 'react'

// Ссылка на APK для Android (файл кладётся в public/, см. README)
export const APK_URL = import.meta.env.VITE_APK_URL || '/timekeeper.apk'

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
export const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
export const isAndroid = /Android/i.test(ua)
// уже открыто как приложение (иконка на экране / APK)
export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true ||
  document.referrer.startsWith('android-app://')

// Chrome на Android сам предлагает установку — ловим это событие
let deferred = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()) })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()) })
}

export function useInstall() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => listeners.delete(f) }, [])
  return {
    canPrompt: Boolean(deferred),
    prompt: async () => { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome === 'accepted' },
  }
}

// APK уже выложен? (до сборки по ссылке отдаётся сайт, а не файл)
let apkCache = null
export function useApkAvailable() {
  const [ok, setOk] = useState(apkCache)
  useEffect(() => {
    if (apkCache !== null) return
    fetch(APK_URL, { method: 'HEAD' })
      .then((r) => { apkCache = r.ok && !(r.headers.get('content-type') || '').includes('text/html'); setOk(apkCache) })
      .catch(() => { apkCache = false; setOk(false) })
  }, [])
  return ok
}
