// Отметка по геолокации: телефон определяет место → сервер проверяет, что работник на объекте
import { supabase, errText } from './supabase'
import { getPosition } from './faceid'

// точнее, чем одно измерение: ждём до ~12 с, пока GPS уточнится
export function getGoodPosition(maxWait = 12000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('NO_GEO'))
    let best = null, id = null
    const finish = () => { if (id != null) navigator.geolocation.clearWatch(id); clearTimeout(t); best ? resolve(best) : getPosition().then(resolve, reject) }
    const t = setTimeout(finish, maxWait)
    id = navigator.geolocation.watchPosition(
      (p) => {
        const cur = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }
        if (!best || cur.acc < best.acc) best = cur
        if (cur.acc <= 30) finish()
      },
      (e) => { if (e.code === 1) { clearTimeout(t); navigator.geolocation.clearWatch(id); reject(new Error('GEO_DENIED')) } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWait },
    )
  })
}

// event: 'in' | 'out' | null (null — чередование: приход, уход, приход…)
export async function geoCheckIn(event = null) {
  const { lat, lng, acc } = await getGoodPosition()
  const { data, error } = await supabase.rpc('geo_check_in', { p_lat: lat, p_lng: lng, p_acc: acc, p_event: event })
  if (error) throw error
  return { ...data, via: 'geo' }
}

export function geoError(e) {
  const m = String(e?.message || e)
  const zone = m.match(/OUT_OF_ZONE (\d+)/)
  if (zone) return `Вы в ${zone[1]} м от объекта. Отметиться по геолокации можно только на объекте.`
  const weak = m.match(/WEAK_GPS (\d+)/)
  if (weak) return `Телефон определил место слишком неточно (±${weak[1]} м). Выйдите ближе к окну или на улицу и попробуйте снова, либо отсканируйте QR.`
  const map = {
    GEO_DENIED: 'Нет доступа к геолокации. Разрешите её для этого сайта (iPhone: Настройки → Конфиденциальность → Службы геолокации → Safari → «При использовании») и попробуйте снова.',
    GEO_FAILED: 'Не удалось определить местоположение. Включите геолокацию (GPS) и попробуйте снова.',
    NO_GEO: 'Телефон не передаёт геолокацию. Отметьтесь по QR.',
    NO_LOCATION: 'Не удалось определить местоположение.',
    NO_GEOFENCE: 'Отдел кадров ещё не указал координаты объектов. Пока отмечайтесь по QR.',
    NO_GEO_CONSENT: 'Нужно согласие на использование геолокации.',
  }
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k]
  return errText(e)
}
