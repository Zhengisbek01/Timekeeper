import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errText } from '../lib/supabase'
import { Brand } from '../components/Logo'
import { isIOS, isAndroid } from '../lib/install'
import { env } from '../lib/config'

// Автоотметка без открытия приложения: iPhone «Команды» → «Прибытие» / «Уход» → запрос с личным ключом
export default function GeoSetupGuide() {
  const [sites, setSites] = useState(null)
  const [hasKey, setHasKey] = useState(null)
  const [key, setKey] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    supabase.rpc('geo_sites').then(({ data }) => setSites(data || []))
    supabase.from('geo_tokens').select('created_at,last_used_at').maybeSingle().then(({ data }) => setHasKey(data || false))
  }, [])

  const api = env('VITE_GEO_API') || `${window.location.origin}/api/geo`
  const shortcutIn = env('VITE_SHORTCUT_IN')
  const shortcutOut = env('VITE_SHORTCUT_OUT')
  const urlFor = (e) => `${api}?t=${key || 'ВАШ_КЛЮЧ'}&e=${e}&lat=`

  async function newKey() {
    if (hasKey && !confirm('Старый ключ перестанет работать. В командах «Приход» и «Уход» нужно будет вставить новый. Продолжить?')) return
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.rpc('geo_token_create')
      if (error) throw error
      setKey(data); setHasKey({ created_at: new Date().toISOString() })
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const copy = async (id, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000) }
    catch { prompt('Скопируйте', text) }
  }
  const Copy = ({ id, text, label }) => (
    <div className="copy-link">
      <code>{text}</code>
      <button type="button" className="btn sm" onClick={() => copy(id, text)}>{copied === id ? '✓ Скопировано' : label}</button>
    </div>
  )

  return (
    <div className="page install geo-guide">
      <div className="topbar"><Brand /><Link className="btn sm ghost" to="/me">Мои отметки</Link></div>
      <h2>Автоотметка без открытия приложения</h2>
      <p className="muted">Пришли на объект — iPhone сам отправит приход, ушли — уход. Ничего нажимать не нужно. Место проверяется только в момент отметки, перемещения не отслеживаются.</p>

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

      <div className="card">
        <h3>🔑 Ваш личный ключ</h3>
        <p className="muted small">Ключ отмечает приход и уход только за вас. Никому его не передавайте. Новый ключ отменяет старый.</p>
        {key ? (
          <Copy id="key" text={key} label="Копировать ключ" />
        ) : hasKey ? (
          <p className="small">Ключ уже создан{hasKey.last_used_at ? ', последняя автоотметка ' + new Date(hasKey.last_used_at).toLocaleString('ru-RU') : ''}. Если команды уже настроены — ничего делать не нужно.</p>
        ) : null}
        {err && <div className="alert err">{err}</div>}
        {!key && <button className="btn primary" onClick={newKey} disabled={busy}>{busy ? '…' : hasKey ? 'Создать новый ключ' : 'Получить ключ'}</button>}
      </div>

      {(isIOS || !isAndroid) && (
        <div className="card">
          <h3>📱 iPhone — один раз, 5 минут</h3>
          <p className="small"><b>Шаг 1. Команды «Приход» и «Уход»</b></p>
          {shortcutIn && shortcutOut ? (
            <ol className="steps">
              <li>Нажмите <a href={shortcutIn} target="_blank" rel="noreferrer"><b>Добавить команду «TK Приход»</b></a> → «Добавить команду» → вставьте ваш ключ.</li>
              <li>Нажмите <a href={shortcutOut} target="_blank" rel="noreferrer"><b>Добавить команду «TK Уход»</b></a> → вставьте тот же ключ.</li>
            </ol>
          ) : (
            <ol className="steps">
              <li>Приложение <b>«Команды»</b> → вкладка «Команды» → <b>«+»</b>. Назовите команду <b>TK Приход</b>.</li>
              <li>Добавьте действие <b>«Получить текущую геопозицию»</b>.</li>
              <li>Добавьте действие <b>«Получить содержимое URL»</b>. В поле URL вставьте:
                <Copy id="in" text={urlFor('in')} label="Копировать" />
                затем нажмите на конец строки → «Выбрать переменную» → <b>Текущая геопозиция</b> → нажмите на неё → <b>Широта</b>. Допишите <code>&amp;lng=</code> и так же вставьте <b>Долготу</b>.
              </li>
              <li>Добавьте действие <b>«Показать уведомление»</b> → в текст поставьте переменную <b>«Содержимое URL»</b>. Так вы увидите «✅ Приход 08:57».</li>
              <li>Создайте вторую команду <b>TK Уход</b> точно так же, но со ссылкой:
                <Copy id="out" text={urlFor('out')} label="Копировать" />
              </li>
            </ol>
          )}
          {!key && <p className="muted small">Сначала нажмите «Получить ключ» выше — он подставится в ссылки.</p>}
          <p className="small"><b>Шаг 2. Автоматизации</b></p>
          <ol className="steps">
            <li>«Команды» → вкладка <b>«Автоматизация»</b> → <b>«+»</b> → <b>«Прибытие»</b>.</li>
            <li>«Геопозиция» → найдите адрес объекта (выше), радиус ~150 м → «Готово». Время — «В любое время».</li>
            <li>Выберите <b>«Запускать сразу»</b> (не «после подтверждения») → «Далее» → выберите команду <b>TK Приход</b>.</li>
            <li>Повторите: <b>«Уход»</b> с того же адреса → «Запускать сразу» → команда <b>TK Уход</b>.</li>
          </ol>
          <p className="muted small">Готово: приход и уход будут отмечаться сами. Вне рабочего времени отметки тоже ставятся — если пришли в выходной, это будет видно в табеле.</p>
        </div>
      )}

      {(isAndroid || !isIOS) && (
        <div className="card">
          <h3>🤖 Android</h3>
          <p>Откройте Timekeeper на объекте — приход отметится сам, нажимать ничего не нужно. Приложение, которое будет отмечать и в закрытом виде, готовим.</p>
        </div>
      )}

      <Link className="btn primary block" to="/me">Готово</Link>
    </div>
  )
}
