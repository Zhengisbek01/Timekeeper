import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Brand } from '../components/Logo'
import { isIOS, isAndroid } from '../lib/install'

// Инструкция: телефон сам напоминает отметиться при прибытии на объект и уходе
export default function GeoSetupGuide() {
  const [sites, setSites] = useState(null)
  const [copied, setCopied] = useState(null)
  useEffect(() => { supabase.rpc('geo_sites').then(({ data }) => setSites(data || [])) }, [])

  const base = window.location.origin
  const links = { in: `${base}/mark?e=in`, out: `${base}/mark?e=out` }
  const copy = async (k) => {
    try { await navigator.clipboard.writeText(links[k]); setCopied(k); setTimeout(() => setCopied(null), 2000) }
    catch { prompt('Скопируйте ссылку', links[k]) }
  }
  const LinkBox = ({ k, label }) => (
    <div className="copy-link">
      <code>{links[k]}</code>
      <button type="button" className="btn sm" onClick={() => copy(k)}>{copied === k ? '✓ Скопировано' : `Копировать (${label})`}</button>
    </div>
  )

  return (
    <div className="page install geo-guide">
      <div className="topbar"><Brand /><Link className="btn sm ghost" to="/me">Мои отметки</Link></div>
      <h2>Уведомления «Вы на объекте»</h2>
      <p className="muted">Телефон сам заметит, что вы пришли на объект или ушли с него, и предложит отметиться. Вы нажимаете уведомление — отметка готова. Мы не отслеживаем перемещения: место проверяется только в момент отметки.</p>

      <div className="card">
        <h3>📍 Объекты</h3>
        {sites === null ? <p className="muted">Загрузка…</p> : !sites.length ? (
          <p className="muted">Отдел кадров ещё не указал координаты объектов.</p>
        ) : (
          <ul className="sites">
            {sites.map((s) => (
              <li key={s.id}>
                <b>{s.name}</b>{s.address && <div className="muted small">{s.address}</div>}
                <div className="small">
                  <a href={`https://maps.apple.com/?ll=${s.lat},${s.lng}&q=${encodeURIComponent(s.name)}`} target="_blank" rel="noreferrer">Apple Карты</a>{' · '}
                  <a href={`https://2gis.kz/?m=${s.lng},${s.lat}/17`} target="_blank" rel="noreferrer">2ГИС</a>{' · '}
                  <span className="muted">радиус {s.radius_m} м</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(isIOS || !isAndroid) && (
        <div className="card">
          <h3>📱 iPhone — приложение «Команды» (один раз, 3 минуты)</h3>
          <ol className="steps">
            <li><b>Войдите в Timekeeper в Safari</b>: откройте <code>{base.replace(/^https?:\/\//, '')}</code> в Safari и войдите (один раз). Ссылки из «Команд» открываются в Safari.</li>
            <li>Разрешите геолокацию: <b>Настройки → Приложения → Safari → Геопозиция → «Разрешить»</b> (или «Спросить» и затем «Разрешить» на сайте).</li>
            <li>Откройте приложение <b>«Команды»</b> → вкладка <b>«Автоматизация»</b> → <b>«+»</b> (или «Новая автоматизация»).</li>
            <li>Выберите <b>«Прибытие»</b> → «Геопозиция: Выбрать» → найдите адрес объекта (выше), радиус ~150 м → «Готово».</li>
            <li>Время: <b>«Диапазон времени»</b>, например 07:00–11:00 — чтобы напоминание приходило только утром.</li>
            <li>Выберите <b>«Запускать после подтверждения»</b> — iPhone пришлёт уведомление, отметка будет только после вашего нажатия. → «Далее».</li>
            <li>«Новая пустая автоматизация» → «Добавить действие» → найдите <b>«Открыть URL»</b> → вставьте ссылку <b>прихода</b>:
              <LinkBox k="in" label="приход" />
            </li>
            <li>Повторите для <b>«Уход»</b>: тот же адрес, время например 12:00–21:00, действие «Открыть URL» со ссылкой <b>ухода</b>:
              <LinkBox k="out" label="уход" />
            </li>
          </ol>
          <p className="muted small">Если объектов несколько — создайте автоматизации для каждого. В выходные уведомление можно просто смахнуть: без нажатия ничего не отмечается.</p>
        </div>
      )}

      {(isAndroid || !isIOS) && (
        <div className="card">
          <h3>🤖 Android</h3>
          <p>Готовим приложение, которое будет само присылать уведомление при прибытии на объект. Пока отмечайтесь кнопкой <b>«Отметиться по геолокации»</b> в приложении — это одно нажатие.</p>
        </div>
      )}

      <div className="card">
        <h3>Проверка</h3>
        <p className="muted small">Находясь на объекте, откройте ссылку прихода — должен появиться экран «Приход». Если вы уже отмечены, будет «Приход уже отмечен» — повторной отметки не будет.</p>
        <Link className="btn primary block" to="/me">Готово</Link>
      </div>
    </div>
  )
}
