import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isIOS, isAndroid, isInstalled, useInstall, useApkAvailable, APK_URL } from '../lib/install'

const HIDE = 'tk_install_hide'

// Плашка «Установите приложение» — только в мобильном браузере
export default function InstallBanner() {
  const [hidden, setHidden] = useState(() => { try { return Boolean(localStorage.getItem(HIDE)) } catch { return false } })
  const { canPrompt, prompt } = useInstall()
  const apk = useApkAvailable()
  if (hidden || isInstalled() || !(isIOS || isAndroid)) return null
  const hide = () => { try { localStorage.setItem(HIDE, '1') } catch {} setHidden(true) }

  return (
    <div className="install-banner">
      <img src="/icon-192.png" alt="" width="40" height="40" />
      <div className="ib-text">
        <b>Приложение Timekeeper</b>
        {isIOS
          ? <span>Нажмите <ShareIcon /> «Поделиться» → «На экран „Домой“»</span>
          : <span>Отмечайтесь одним нажатием, без браузера</span>}
      </div>
      {isAndroid && (apk
        ? <a className="btn sm primary" href={APK_URL} download>Скачать</a>
        : canPrompt ? <button className="btn sm primary" onClick={prompt}>Установить</button>
        : <Link className="btn sm primary" to="/install">Как?</Link>)}
      {isIOS && <Link className="btn sm" to="/install">Как?</Link>}
      <button className="ib-close" onClick={hide} aria-label="Скрыть">×</button>
    </div>
  )
}

export function ShareIcon() {
  return (
    <svg className="share-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Поделиться">
      <path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}
