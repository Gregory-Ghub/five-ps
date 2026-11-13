// Regression: saved data must survive a page load (a load-order bug once made every load start empty).
const { BASE, launch, makeChecker, daysAgo } = require('./helpers');
const { check, done } = makeChecker();

(async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  const saved = {
    entries: [0, 1, 2, 3, 4].map(n => ({ id: 'e' + n, date: daysAgo(n), p: 'payday', text: 'task ' + n, done: n !== 4 })),
    wild: { [daysAgo(1)]: { revealed: true, p: 'play', text: 'x', done: true } },
    reviews: { '2026-01-04': { intention: 'keep going', kept: true } },
  };
  await page.addInitScript(s => { if (!localStorage.getItem('fivePs.v1')) localStorage.setItem('fivePs.v1', s); }, JSON.stringify(saved));
  await page.goto(BASE + '/index.html');

  const loaded = await page.evaluate(() => ({ e: state.entries.length, w: Object.keys(state.wild).length, r: Object.keys(state.reviews).length }));
  check('all 5 saved entries load', loaded.e === 5, JSON.stringify(loaded));
  check('saved wild cards and reviews load', loaded.w === 1 && loaded.r === 1, JSON.stringify(loaded));

  // a normal action must write the full data back, not an empty log
  await page.fill('.pcard input[data-p="play"]', 'new thing');
  await page.press('.pcard input[data-p="play"]', 'Enter');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fivePs.v1')).entries.length);
  check('adding an entry keeps the old ones (6 stored)', stored === 6, 'stored=' + stored);

  await page.reload();
  check('data survives a reload', (await page.evaluate(() => state.entries.length)) === 6);
  check('no console/page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  process.exit(done());
})().catch(e => { console.error('CRASHED', e.message); process.exit(2); });
