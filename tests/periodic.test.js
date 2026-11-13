// Integration: dispatch a real periodicsync event to the real service worker and check it posts a notification.
const { BASE, launch, makeChecker } = require('./helpers');
const { check, done } = makeChecker();

(async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ permissions: ['notifications'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const regs = new Map();
  cdp.on('ServiceWorker.workerRegistrationUpdated', ev => ev.registrations.forEach(r => regs.set(r.registrationId, r)));
  await cdp.send('ServiceWorker.enable');

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // reminder due "now" (00:00 is always in the past) and nothing done today
  await page.evaluate(async () => { remind.on = true; remind.time = '00:00'; remind.last = ''; await saveRemind(); });
  const rec = await page.evaluate(() => idbGet());
  check('settings reached IndexedDB', rec && rec.on && rec.time === '00:00', JSON.stringify(rec));

  const dispatch = async () => {
    const reg = [...regs.values()].find(r => r.scopeURL.startsWith(BASE));
    if (!reg) throw new Error('no service worker registration seen');
    await cdp.send('ServiceWorker.dispatchPeriodicSyncEvent', { origin: BASE, registrationId: reg.registrationId, tag: 'daily-reminder' });
    await page.waitForTimeout(800);
  };
  const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'daily-reminder' })).map(n => n.body));
  const clearShown = () => page.evaluate(async () => { for (const n of await (await navigator.serviceWorker.ready).getNotifications()) n.close(); });

  // page is in the foreground: the worker must stay quiet
  await dispatch();
  check('app in the foreground: worker stays quiet', (await shown()).length === 0, JSON.stringify(await shown()));

  // move the tab away from the app so there is no visible client
  await page.goto('about:blank');
  await dispatch();
  await page.goto(BASE + '/index.html');
  const first = await shown();
  check('app closed: worker posts the reminder', first.length === 1 && /Nothing squeezed|of 6/.test(first[0]), JSON.stringify(first));
  const after = await page.evaluate(() => idbGet());
  check('worker records that it sent today\'s reminder', after && after.last && after.last.length === 10, JSON.stringify(after));

  await clearShown();
  await page.goto('about:blank');
  await dispatch();
  await page.goto(BASE + '/index.html');
  check('second wake-up the same day does not repeat it', (await shown()).length === 0);

  await browser.close();
  process.exit(done());
})().catch(e => { console.error('CRASHED', e.message); process.exit(2); });
