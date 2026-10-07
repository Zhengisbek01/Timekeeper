import { supabase } from './supabase'
import { buildTimesheet } from './timesheet'
import { monthRangeUtc, daysInMonth } from './time'

export const EMP_SELECT = '*, companies(id,name)'

export async function loadCompanies() {
  const { data } = await supabase.from('companies').select('id,name').order('name')
  return data || []
}

// постраничная выборка (лимит Supabase — 1000 строк за запрос)
async function fetchAll(build) {
  const out = []
  for (let p = 0; ; p++) {
    const { data, error } = await build().range(p * 1000, p * 1000 + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

// Всё для табеля и отчётов за месяц. companyId = '' → все компании
export async function loadMonth(y, m, companyId = '') {
  const [from, to] = monthRangeUtc(y, m, 1)
  const mm = String(m).padStart(2, '0')
  const [events, absences, empRes, hoRes] = await Promise.all([
    fetchAll(() => supabase.from('attendance_events').select('id,employee_id,kind,ts,source,note').gte('ts', from).lt('ts', to).order('ts')),
    fetchAll(() => supabase.from('absences').select('*').gte('day', `${y}-${mm}-01`).lte('day', `${y}-${mm}-${daysInMonth(y, m)}`)),
    supabase.from('employees').select(EMP_SELECT).eq('status', 'approved').order('full_name'),
    supabase.from('holidays').select('*'),
  ])
  const withData = new Set([...events.map((e) => e.employee_id), ...absences.map((a) => a.employee_id)])
  // уволенные попадают в табель, если у них были отметки или отсутствия в месяце
  const employees = (empRes.data || [])
    .filter((e) => e.active || withData.has(e.id))
    .filter((e) => !companyId || e.company_id === companyId)
    .sort((a, b) => (a.companies?.name || '').localeCompare(b.companies?.name || '') || a.full_name.localeCompare(b.full_name, 'ru'))
  const rows = buildTimesheet({ employees, events, absences, holidays: hoRes.data || [], y, m })
  return { rows, employees, events, absences, holidays: hoRes.data || [] }
}
