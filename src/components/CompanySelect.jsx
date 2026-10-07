import { useEffect, useState } from 'react'
import { loadCompanies } from '../lib/data'

export default function CompanySelect({ value, onChange, all = 'Все компании', required }) {
  const [list, setList] = useState([])
  useEffect(() => { loadCompanies().then(setList) }, [])
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{all}</option>
      {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}
