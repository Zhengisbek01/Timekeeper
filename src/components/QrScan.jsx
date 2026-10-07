import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Сканер QR внутри приложения — для телефонов, где камера не распознаёт QR сама
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
        try {
          const u = new URL(res.data)
          const k = u.searchParams.get('k'), t = u.searchParams.get('t')
          if (u.pathname.endsWith('/scan') && k && t) {
            done = true
            scanner.stop()
            nav(`/scan?k=${encodeURIComponent(k)}&t=${encodeURIComponent(t)}`)
            return
          }
        } catch {}
        setErr('Это не QR-код Timekeeper. Наведите камеру на код на планшете у входа.')
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
