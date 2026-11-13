// Nudges: encouragement (banner + notification) when a P has gone quiet.
const { BASE, launch, makeChecker } = require('./helpers');
const { check, done } = makeChecker();
const URL = BASE + '/index.html';
const TODAY = '2026-03-10';

(async () => {
  const browser = await launch();
  const ent = (date, p) => ({ id: `${date}-${p}`, date, p, text: `${p} thing`, done: true });
  // started 2026-03-01. payday yesterday, play today, pain 8 days ago, partnership 2 days ago, physical never, passion never (added 03-04)
  const state = () => ({ entries: [ent('2026-03-01', 'payday'), ent('2026-03-02', 'pain'), ent('2026-03-08', 'partnership'), ent('2026-03-09', 'payday'), ent('2026-03-10', 'play')], wild: {}, reviews: {}, passionFrom: '2026-03-04' });
  async function open({ st = state(), at = TODAY + 'T12:00:00', hidden = false, granted = false, ctx } = {}) {
    ctx = ctx || await browser.newContext({ permissions: granted ? ['notifications'] : [] });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.clock.setFixedTime(new Date(at));
    await page.addInitScript(([s, h]) => { if (!localStorage.getItem('fivePs.v1')) localStorage.setItem('fivePs.v1', s); Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); }, [JSON.stringify(st), hidden]);
    await page.goto(URL);
    return { ctx, page, errs };
  }

  let { ctx, page, errs } = await open();
  const gaps = await page.evaluate(() => neglected().map(x => `${x.p.id}:${x.days}:${x.never}`));
  check('quiet P\'s found, longest first', JSON.stringify(gaps) === JSON.stringify(['physical:9:true', 'pain:8:false', 'passion:6:true']), JSON.stringify(gaps));
  check('2 days is not "quiet", and a P done today never is', !gaps.some(g => g.startsWith('partnership') || g.startsWith('play') || g.startsWith('payday')));
  check('Passion is measured from when it was added, not from day one', gaps.includes('passion:6:true'));
  const banner = page.locator('#nudge');
  check('banner is shown', await banner.isVisible());
  let t = await banner.innerText();
  check('banner names the most neglected P', t.includes('Physical') && t.includes('haven’t logged any Physical yet'), t);
  check('banner encourages and suggests an idea', /Try:/.test(t) && t.length > 80, t);
  check('banner mentions the other quiet P\'s', t.includes('Pain (8d)') && t.includes('Passion (6d)'), t);
  await page.click('[data-nudgeuse]');
  const val = await page.inputValue('.pcard input[data-p="physical"]');
  check('"Use this idea" puts the idea into that P\'s input', await page.evaluate(v => IDEAS.physical.includes(v), val) && val.length > 5, val);
  check('...and focuses it', await page.evaluate(() => document.activeElement.dataset.p === 'physical'));

  // dismiss -> snoozed for the day
  await page.click('[data-nudgeclose]');
  check('dismiss hides the banner', !(await banner.isVisible()));
  await page.reload();
  check('stays hidden after reload the same day', !(await page.locator('#nudge').isVisible()));
  const page2 = await ctx.newPage();
  await page2.clock.setFixedTime(new Date('2026-03-11T12:00:00'));
  await page2.goto(URL);
  check('comes back the next day', await page2.locator('#nudge').isVisible());
  check('no page errors', errs.length === 0, errs.join('|'));
  await ctx.close();

  // fixes itself once you do the quiet P
  ({ ctx, page } = await open());
  await page.fill('.pcard input[data-p="physical"]', 'ran 5k'); await page.press('.pcard input[data-p="physical"]', 'Enter');
  t = await page.locator('#nudge').innerText();
  check('doing the neglected P clears it from the nudge', !t.includes('Physical') && t.includes('Pain'), t);
  await ctx.close();

  // thresholds and new users
  ({ ctx, page } = await open({ st: { entries: [ent('2026-03-08', 'play'), ent('2026-03-10', 'payday')], wild: {}, reviews: {}, passionFrom: '2026-03-01' } }));
  const g2 = await page.evaluate(() => neglected().map(x => `${x.p.id}:${x.days}`));
  check('2 days quiet (play) and 0 days (payday) are not nudged', !g2.some(x => x.startsWith('play') || x.startsWith('payday')) && g2.length === 0, JSON.stringify(g2));
  await ctx.close();
  ({ ctx, page } = await open({ st: { entries: [], wild: {}, reviews: {}, passionFrom: TODAY } }));
  check('brand-new user with no entries is never nudged', !(await page.locator('#nudge').isVisible()));
  await ctx.close();
  ({ ctx, page } = await open({ st: { entries: [ent('2026-03-09', 'play')], wild: {}, reviews: {}, passionFrom: TODAY } }));
  check('someone who started yesterday is not nudged', !(await page.locator('#nudge').isVisible()));
  await ctx.close();

  // notification carries the nudge
  ({ ctx, page } = await open({ at: TODAY + 'T21:00:00', hidden: true, granted: true }));
  await page.evaluate(async () => { await navigator.serviceWorker.ready; window.__notes = []; ServiceWorkerRegistration.prototype.showNotification = function (t, o) { window.__notes.push({ t, o }); return Promise.resolve(); }; });
  await page.click('#remind'); await page.waitForFunction(() => remind.on);
  const rec = await page.evaluate(() => idbGet());
  check('last-done dates are mirrored for the service worker', rec.lastDone && rec.lastDone.pain === '2026-03-02' && rec.lastDone.physical === '2026-03-01' && Object.keys(rec.lastDone).length === 6, JSON.stringify(rec.lastDone));
  await page.evaluate(() => maybeRemind());
  const notes = await page.evaluate(() => window.__notes);
  check('the reminder notification names the quiet P', notes.length === 1 && /Physical has been quiet for 9 days/.test(notes[0].o.body) && /Give it a go/.test(notes[0].o.body), JSON.stringify(notes));
  check('...alongside the day\'s progress', /of 6 P’s done/.test(notes[0].o.body), notes[0].o.body);
  await ctx.close();

  await browser.close();
  process.exit(done());
})().catch(e => { console.error('CRASHED', e.message); process.exit(2); });
