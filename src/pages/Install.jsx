import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Brand } from '../components/Logo'
import { ShareIcon } from '../components/InstallBanner'
import { isIOS, isAndroid, isInstalled, useInstall, useApkAvailable, APK_URL } from '../lib/install'

// Страница установки: mkatk.kz/install — эту ссылку HR раздаёт работникам
export default function Install() {
  const { canPrompt, prompt } = useInstall()
  const apk = useApkAvailable()
  const link = `${window.location.origin}/install`
  const desktop = !isIOS && !isAndroid

  if (isInstalled()) return (
    <div className="center"><div className="card narrow">
      <Brand /><h2>Приложение уже установлено ✓</h2>
      <Link className="btn primary block" to="/">Открыть</Link>
    </div></div>
  )

  return (
    <div className="page install">
      <div className="topbar"><Brand /><Link className="btn sm ghost" to="/">На сайт</Link></div>
      <h2>Установите Timekeeper на телефон</h2>
      <p className="muted">Приложение открывается с иконки на экране, без браузера. Войти нужно один раз — дальше телефон помнит вас.</p>

      {desktop && (
        <div className="card install-qr">
          <QRCodeSVG value={link} size={180} marginSize={2} />
          <div><b>Наведите камеру телефона на код</b><p className="muted">или откройте на телефоне <code>{link.replace(/^https?:\/\//, '')}</code></p></div>
        </div>
      )}

      {(isAndroid || desktop) && (
        <div className="card">
          <h3>🤖 Android</h3>
          {apk ? (
            <>
              <a className="btn primary block" href={APK_URL} download>Скачать приложение (APK)</a>
              <ol className="steps">
                <li>Откройте скачанный файл <b>timekeeper.apk</b> (шторка уведомлений или «Загрузки»).</li>
                <li>Если телефон спросит — <b>«Настройки» → разрешить установку из этого источника</b>, затем вернитесь назад.</li>
                <li>Нажмите <b>«Установить»</b>, затем <b>«Открыть»</b>.</li>
                <li>Войдите по email и паролю — один раз.</li>
              </ol>
            </>
          ) : canPrompt ? (
            <>
              <button className="btn primary block" onClick={prompt}>Установить приложение</button>
              <p className="muted small">Иконка Timekeeper появится на экране телефона.</p>
            </>
          ) : (
            <ol className="steps">
              <li>Откройте эту страницу в <b>Chrome</b>.</li>
              <li>Нажмите <b>⋮</b> (справа вверху) → <b>«Установить приложение»</b> или «Добавить на главный экран».</li>
              <li>Откройте Timekeeper с иконки и войдите один раз.</li>
            </ol>
          )}
        </div>
      )}

      {(isIOS || desktop) && (
        <div className="card">
          <h3>📱 iPhone</h3>
          <ol className="steps">
            <li>Откройте эту страницу в <b>Safari</b>.</li>
            <li>Нажмите <b>«Поделиться»</b> <ShareIcon /> внизу экрана.</li>
            <li>Прокрутите и выберите <b>«На экран „Домой“»</b> → <b>«Добавить»</b>.</li>
            <li>Откройте Timekeeper с иконки и войдите один раз.</li>
          </ol>
          <p className="muted small">Отмечайтесь кнопкой <b>«Сканировать QR»</b> внутри приложения.</p>
        </div>
      )}
    </div>
  )
}
