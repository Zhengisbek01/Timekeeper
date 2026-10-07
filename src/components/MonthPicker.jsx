import { MONTHS } from '../lib/time'

export default function MonthPicker({ value, onChange }) {
  const shift = (d) => {
    let m = value.m + d, y = value.y
    if (m < 1) { m = 12; y-- } else if (m > 12) { m = 1; y++ }
    onChange({ y, m })
  }
  return (
    <div className="mp">
      <button className="btn sm ghost" onClick={() => shift(-1)} aria-label="Предыдущий месяц">‹</button>
      <span>{MONTHS[value.m - 1]} {value.y}</span>
      <button className="btn sm ghost" onClick={() => shift(1)} aria-label="Следующий месяц">›</button>
    </div>
  )
}
