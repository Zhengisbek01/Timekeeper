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

export function Brand({ children }) {
  return <div className="brand"><Logo /> {PRODUCT}{children}</div>
}
