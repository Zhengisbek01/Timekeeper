import { useEffect, useRef, useState, useCallback } from 'react'
import NoSleep from 'nosleep.js'

// Экран планшета не гаснет, пока открыта страница с QR.
// 1) Screen Wake Lock API (Chrome/Android, Safari iOS 16.4+) — без касания, перезапрашивается
//    при каждом «отпускании» (смена вкладки, экономия батареи) и раз в 20 с на всякий случай.
// 2) Запасной путь для старых браузеров — NoSleep (невидимое зацикленное видео);
//    ему нужно одно касание экрана, поэтому показываем подсказку «Коснитесь экрана».
// Блокировку системы браузер отключить не может: если экран не гаснет — планшет и не блокируется.
export function useKeepAwake() {
  const [state, setState] = useState('pending')   // 'on' | 'need-tap' | 'pending'
  const lock = useRef(null)
  const noSleep = useRef(null)

  const requestNative = useCallback(async () => {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return false
    if (lock.current && !lock.current.released) return true
    try {
      lock.current = await navigator.wakeLock.request('screen')
      lock.current.addEventListener('release', () => {
        // отпустили не по нашей воле — сразу просим снова
        if (document.visibilityState === 'visible') setTimeout(requestNative, 1000)
      })
      setState('on')
      return true
    } catch {
      return false
    }
  }, [])

  // включается касанием: и Wake Lock, и запасное видео
  const enableByTap = useCallback(async () => {
    const ok = await requestNative()
    try {
      noSleep.current ||= new NoSleep()
      if (!noSleep.current.isEnabled) await noSleep.current.enable()
      setState('on')
    } catch {
      if (!ok) setState('need-tap')
    }
  }, [requestNative])

  useEffect(() => {
    requestNative().then((ok) => { if (!ok) setState('need-tap') })

    const onVisible = () => { if (document.visibilityState === 'visible') requestNative() }
    const onTap = () => enableByTap()
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('pointerdown', onTap, { once: true })
    const t = setInterval(() => { requestNative() }, 20000)

    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('pointerdown', onTap)
      lock.current?.release?.().catch(() => {})
      noSleep.current?.disable?.()
    }
  }, [requestNative, enableByTap])

  return { awake: state === 'on', needTap: state === 'need-tap', enableByTap }
}

// Раз в сутки ночью перезагружаем страницу киоска — на случай утечек памяти браузера
export function useNightlyReload(hour = 3) {
  useEffect(() => {
    const started = Date.now()
    const t = setInterval(() => {
      const h = new Date(Date.now() + 5 * 3600e3).getUTCHours()   // время РК
      if (h === hour && Date.now() - started > 2 * 3600e3) window.location.reload()
    }, 5 * 60e3)
    return () => clearInterval(t)
  }, [hour])
}
