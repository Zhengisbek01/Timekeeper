// Настройки берутся из /config.js (сервер в РК) или из переменных сборки (Vercel)
const R = (typeof window !== 'undefined' && window.__TK_CONFIG) || {}
export const env = (k) => (R[k] !== undefined && R[k] !== '' ? R[k] : import.meta.env[k])
