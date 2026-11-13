// Daily reminder in the page: permission flow, timing, dedupe, and skip rules.
const { BASE, launch, makeChecker } = require('./helpers');
const { check, done } = makeChecker();
const URL = BASE + '/index.html';
const DAY = '2026-03-03';

(async () => {
  const browser = await launch();
  // time is frozen at `at`; the spy replaces showNotification so we can see what would be shown
  async function open({ at = '21:00', granted = true, hidden = true, noNotification = false } = {}) {
    const ctx = await browser.newContext({ permissions: granted ? ['notifications'] : [] });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.clock.setFixedTime(new Date(`${DAY}T${at}:00`));
    await page.addInitScript(([hidden, noN]) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      if (noN) delete window.Notification;
    }, [hidden, noNotification]);
    await page.goto(URL);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      window.__notes = [];
      ServiceWorkerRegistration.prototype.showNotification = function (t, o) { window.__notes.push({ t, o }); return Promise.resolve(); };
    });
    return { ctx, page, errs };
  }
  const notes = page => page.evaluate(() => window.__notes);
  const logDone = (page, ps) => page.evaluate(([day, ps]) => {
    ps.forEach((p, i) => state.entries.push({ id: 'x' + i, date: day, p, text: 't', done: true })); save();
  }, [DAY, ps]);
  const enable = async page => { await page.click('#remind'); await page.waitForFunction(() => remind.on); };

  // enabling
  let { ctx, page, errs } = await open();
  check('starts off, time picker hidden', (await page.locator('#remind').innerText()).includes('off') && !(await page.locator('#remindTime').isVisible()));
  await enable(page);
  check('enabling turns it on and shows the time picker', (await page.locator('#remind').innerText()).includes('on') && await page.locator('#remindTime').isVisible());
  const stored = await page.evaluate(() => idbGet());
  check('settings mirrored to IndexedDB for the service worker', stored && stored.on === true && stored.time === '20:00', JSON.stringify(stored));
  check('setting survives reload', await (async () => { await page.reload(); return page.evaluate(() => remind.on); })());

  // firing + dedupe
  await page.evaluate(async () => { ServiceWorkerRegistration.prototype.showNotification = function (t, o) { (window.__notes ||= []).push({ t, o }); return Promise.resolve(); }; window.__notes = []; });
  await logDone(page, ['play', 'pain']);
  await page.evaluate(() => maybeRemind());
  let n = await notes(page);
  check('fires once after the reminder time', n.length === 1, JSON.stringify(n));
  check('message shows progress and what is missing', n[0] && /2 of 6/.test(n[0].o.body) && /Payday/.test(n[0].o.body) && !/Play/.test(n[0].o.body), n[0] && n[0].o.body);
  await page.evaluate(() => maybeRemind());
  check('does not fire a second time the same day', (await notes(page)).length === 1);
  await page.evaluate(async () => { remind.last = ''; await maybeRemind(); });
  check('worker\'s "already sent" mark in IndexedDB also blocks a duplicate', (await notes(page)).length === 1);
  check('no page errors', errs.length === 0, errs.join('|'));
  await ctx.close();

  // not yet time
  ({ ctx, page } = await open({ at: '19:00' }));
  await enable(page); await page.evaluate(() => maybeRemind());
  check('before the reminder time: nothing', (await notes(page)).length === 0);
  await ctx.close();

  // everything already done
  ({ ctx, page } = await open());
  await enable(page); await logDone(page, ['payday', 'play', 'pain', 'partnership', 'physical', 'passion']);
  await page.evaluate(() => maybeRemind());
  check('all six done: no reminder', (await notes(page)).length === 0);
  await ctx.close();

  // looking at the app
  ({ ctx, page } = await open({ hidden: false }));
  await enable(page); await page.evaluate(() => maybeRemind());
  check('app visible: no reminder', (await notes(page)).length === 0);
  await ctx.close();

  // turned off
  ({ ctx, page } = await open());
  await enable(page); await page.click('#remind'); await page.waitForFunction(() => !remind.on);
  await page.evaluate(() => maybeRemind());
  check('turned off: no reminder', (await notes(page)).length === 0);
  await ctx.close();

  // permission denied
  ({ ctx, page } = await open({ granted: false }));
  let msg = ''; page.once('dialog', d => { msg = d.message(); d.accept(); });
  await page.click('#remind'); await page.waitForTimeout(300);
  check('blocked permission: explains and stays off', /blocked/i.test(msg) && !(await page.evaluate(() => remind.on)), msg);
  await ctx.close();

  // no Notification API (e.g. iPhone Safari outside an installed app)
  ({ ctx, page } = await open({ noNotification: true }));
  msg = ''; page.once('dialog', d => { msg = d.message(); d.accept(); });
  await page.click('#remind'); await page.waitForTimeout(300);
  check('unsupported browser: explains how to install', /Add to Home Screen/.test(msg) && !(await page.evaluate(() => remind.on)), msg);
  await ctx.close();

  await browser.close();
  process.exit(done());
})().catch(e => { console.error('CRASHED', e.message); process.exit(2); });
