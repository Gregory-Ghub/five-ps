// Bump CACHE when you want to force-refresh the precached files.
const CACHE = 'five-ps-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './favicon-32.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: serve from cache instantly, refresh in the background.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) return cached;
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    })
  );
});

// ---------- daily reminder (Periodic Background Sync, best effort) ----------
// The page mirrors settings + today's progress into IndexedDB because the worker can't read localStorage.
const PS_NAMES = { payday: '💰 Payday', play: '🎮 Play', pain: '🔥 Pain', partnership: '🤝 Partnership', physical: '💪 Physical', passion: '🎢 Passion' };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function reminderDue(rec, now) {
  if (!rec || !rec.on) return false;
  const today = ymd(now);
  if (rec.last === today) return false;
  const [h, m] = String(rec.time || '20:00').split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false;
  const done = rec.date === today ? rec.done : []; // a record from an earlier day means nothing is done today
  return done.length < Object.keys(PS_NAMES).length;
}
const parseDay = (str) => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); };
// the P that has been quiet longest (3+ days), from the last-done dates the page mirrored into IndexedDB
function neglectLine(rec, now) {
  const today = parseDay(ymd(now));
  let worst = null;
  for (const id of Object.keys(PS_NAMES)) {
    const last = rec.lastDone && rec.lastDone[id];
    if (!last) continue;
    const days = Math.round((today - parseDay(last)) / 864e5);
    if (days >= 3 && (!worst || days > worst.days)) worst = { id, days };
  }
  return worst ? ` ${PS_NAMES[worst.id]} has been quiet for ${worst.days} days. Give it a go today!` : '';
}
function reminderText(rec, now) {
  const done = rec.date === ymd(now) ? rec.done : [];
  const total = Object.keys(PS_NAMES).length;
  const left = Object.keys(PS_NAMES).filter(id => !done.includes(id)).map(id => PS_NAMES[id]);
  return {
    title: '🍊 Squeeze the juice',
    body: (done.length ? `${done.length} of ${total} P’s done. Still to go: ${left.join(', ')}.` : 'Nothing squeezed yet today. A few quick wins and the day is yours.') + neglectLine(rec, now),
  };
}

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('fivePs-sw', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet() {
  const db = await idbOpen();
  return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get('reminder'); q.onsuccess = () => { db.close(); res(q.result || null); }; q.onerror = () => rej(q.error); });
}
async function idbPut(val) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, 'reminder'); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); });
}

async function checkReminder() {
  const rec = await idbGet(), now = new Date();
  if (!reminderDue(rec, now)) return;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clients.some(c => c.visibilityState === 'visible')) return; // they're looking at the app
  await idbPut({ ...rec, last: ymd(now) });
  const t = reminderText(rec, now);
  await self.registration.showNotification(t.title, { body: t.body, tag: 'daily-reminder', icon: 'icon-192.png', badge: 'favicon-32.png' });
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'daily-reminder') e.waitUntil(checkReminder()); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((cs) => (cs.length ? cs[0].focus() : self.clients.openWindow('./index.html'))));
});

if (typeof module !== 'undefined') module.exports = { reminderDue, reminderText, neglectLine, ymd }; // for tests/sw.test.js
