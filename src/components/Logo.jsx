import { env } from '../lib/config'
export const PRODUCT = 'Timekeeper'

// Циферблат со стрелками 9:00 — фирменный знак
export function Logo({ size = 28 }) {
  return (
    <svg className="logo-svg" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M16 10.5V16h-4.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Логотип компании (файл public/org-logo.svg — вектор, чёткий на любом экране)
export const ORG_LOGO = env('VITE_ORG_LOGO') || '/org-logo.svg'
export function OrgLogo({ size = 40, className = '' }) {
  return <img className={`org-logo ${className}`} src={ORG_LOGO} width={size} height={size} alt="Логотип компании" decoding="async" />
}

export function Brand({ children, org = true }) {
  return (
    <div className="brand">
      {org && <><OrgLogo size={40} /><span className="brand-sep" aria-hidden="true" /></>}
      <Logo /> <span className="brand-name">{PRODUCT}</span>{children}
    </div>
  )
}
