import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// QR Timekeeper → путь отметки /scan?k=…&t=… (или null)
function scanPath(text) {
  try {
    const u = new URL(text)
    const k = u.searchParams.get('k'), t = u.searchParams.get('t')
    if (u.pathname.endsWith('/scan') && k && t) return `/scan?k=${encodeURIComponent(k)}&t=${encodeURIComponent(t)}`
  } catch {}
  return null
}
const NOT_OURS = 'Это не QR-код Timekeeper. Наведите камеру на код на планшете у входа.'

// Живой сканер — на Android браузер запоминает разрешение камеры навсегда
export default function QrScan({ onClose }) {
  const video = useRef(null)
  const nav = useNavigate()
  const [err, setErr] = useState(null)

  useEffect(() => {
    let scanner, done = false
    import('qr-scanner').then(({ default: QrScanner }) => {
      if (!video.current) return
      scanner = new QrScanner(video.current, (res) => {
        if (done) return
        const path = scanPath(res.data)
        if (path) { done = true; scanner.stop(); nav(path); return }
        setErr(NOT_OURS)
      }, { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true, maxScansPerSecond: 8 })
      scanner.start().catch(() => setErr('Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера и попробуйте снова.'))
    })
    return () => { done = true; scanner?.stop(); scanner?.destroy() }
  }, [nav])

  return (
    <div className="scanner">
      <div className="scanner-top">
        <b>Наведите камеру на QR-код на планшете</b>
        <button className="btn sm ghost-light" onClick={onClose}>Закрыть</button>
      </div>
      <video ref={video} playsInline muted />
      {err && <div className="scanner-err">{err}</div>}
    </div>
  )
}

// iPhone: открывает обычную камеру телефона (снимок QR) — без запроса разрешения на камеру.
// Safari/иконка на экране спрашивают разрешение для «живой» камеры при каждом запуске, снимок — нет.
export function PhotoScanButton({ className, children }) {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr(null)
    try {
      const { default: QrScanner } = await import('qr-scanner')
      const res = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      const path = scanPath(res.data)
      if (path) nav(path)
      else setErr(NOT_OURS)
    } catch {
      setErr('QR-код не распознан. Сфотографируйте ещё раз — ближе и без бликов.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <label className={className}>
        <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
        {busy ? 'Распознаём…' : children}
      </label>
      {err && <div className="alert err">{err}</div>}
    </>
  )
}
