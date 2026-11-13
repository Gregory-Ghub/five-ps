const { BASE, launch, makeChecker } = require('./helpers');
const URL = BASE + '/index.html';
const { check, done } = makeChecker();
(async () => {
  const b = await launch();
  // 2026-01-07 and 01-09 produced a negative index (crash) before the fix
  for (const day of ['2026-01-07', '2026-01-09', '2026-01-14', '2026-03-03']) {
    const ctx = await b.newContext({ serviceWorkers: 'block' });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.clock.setFixedTime(new Date(day + 'T12:00:00'));
    await p.goto(URL);
    await p.click('[data-wildreveal]');
    const face = await p.locator('#wild .wt').innerText();
    check(`${day}: card revealed with real text`, face && face !== 'undefined', face);
    await p.reload();
    check(`${day}: survives reload`, (await p.locator('#wild .wt').innerText()) === face);
    await p.click('[data-tab="progress"]');
    check(`${day}: progress tab renders (orchard drawn)`, (await p.locator('#orchard svg').count()) === 1);
    await p.click('[data-tab="today"]');
    await p.click('[data-wilddo]');
    const n1 = await p.evaluate(() => state.entries.length);
    check(`${day}: "I did it" logs an entry`, n1 === 1, n1);
    // delete the wild entry -> card is playable again
    await p.locator('.entries li button[data-del]').first().click();
    check(`${day}: deleting entry re-opens card`, (await p.locator('[data-wilddo]').count()) === 1);
    check(`${day}: no page errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  // legacy broken save (no text) recovers instead of crashing
  const ctx = await b.newContext({ serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-01-07T12:00:00'));
  await p.addInitScript(() => { if (!localStorage.getItem('fivePs.v1')) localStorage.setItem('fivePs.v1', JSON.stringify({ entries: [], wild: { '2026-01-07': { revealed: true, p: 'play', done: false } }, reviews: {} })); });
  await p.goto(URL);
  check('legacy card without text shows reveal button again', (await p.locator('[data-wildreveal]').count()) === 1);
  check('legacy card: no page errors', errs.length === 0, errs.join('|'));
  await ctx.close(); await b.close();
  process.exit(done());
})().catch(e => { console.error('CRASHED', e.message); process.exit(2); });
