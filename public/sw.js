// Timekeeper service worker: нужен, чтобы сайт устанавливался как приложение.
// Ничего не кэширует — всегда свежая версия; без интернета показывает понятное сообщение.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f4f6f5;color:#16201e;text-align:center">' +
    '<div><h2>Нет интернета</h2><p>Подключитесь к сети и откройте Timekeeper снова.</p>' +
    '<button onclick="location.reload()" style="padding:12px 20px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-size:16px">Обновить</button></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
})
