// The to-do list: everything planned on earlier days that never got done.
const { BASE, launch, makeChecker } = require('./helpers');
const { check, done } = makeChecker();
const URL = BASE + '/index.html';
const TODAY = '2026-03-10', TOMORROW = '2026-03-11';

(async () => {
  const browser = await launch();
  const plan = (id, date, p, text) => ({ id, date, p, text, done: false, planned: true });
  const base = () => ({
    entries: [
      plan('old', '2026-03-05', 'payday', 'Send the invoice'),
      plan('mid', '2026-03-08', 'pain', 'Cold shower'),
      plan('new', '2026-03-09', 'play', 'Play a board game'),
      { id: 'dn', date: '2026-03-09', p: 'physical', text: 'Walk', done: true },            // done: must not appear
      plan('tod', TODAY, 'partnership', 'Call an old friend'),                                // today: not overdue yet
      plan('fut', TOMORROW, 'passion', 'Book a trip'),                                        // future: not overdue
    ], wild: {}, reviews: {}, passionFrom: '2026-03-01',
  });
  async function open(state) {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.clock.setFixedTime(new Date(TODAY + 'T12:00:00'));
    await page.addInitScript(s => { if (!localStorage.getItem('fivePs.v1')) localStorage.setItem('fivePs.v1', s); }, JSON.stringify(state));
    await page.goto(URL);
    return { ctx, page, errs };
  }
  const items = page => page.locator('#todo .hitem');
  const entry = (page, id) => page.evaluate(id => state.entries.find(e => e.id === id), id);
  const onDay = (page, d) => page.evaluate(d => state.entries.filter(e => e.date === d).map(e => e.text), d);

  let { ctx, page, errs } = await open(base());
  check('to-do list is visible on the Today tab', await page.locator('#todo').isVisible() && await page.locator('#tab-today').isVisible());
  check('lists only earlier plans that were not done (3)', (await items(page).count()) === 3, await items(page).count());
  const texts = await items(page).locator('.ht').allInnerTexts();
  check('oldest first, done / today / future items excluded', texts[0].includes('Send the invoice') && texts[2].includes('board game') && !texts.join().includes('Walk') && !texts.join().includes('Call an old friend') && !texts.join().includes('Book a trip'), texts.join(' | '));
  check('header shows the count', (await page.locator('#todo h2').innerText()).includes('3 planned earlier'));
  check('items show how long ago they were planned', (await items(page).first().innerText()).includes('5 days ago'), await items(page).first().innerText());

  // add one to tomorrow
  await items(page).first().locator('[data-todoadd]').click();
  check('+ Tomorrow copies it into tomorrow\'s plan', (await onDay(page, TOMORROW)).includes('Send the invoice'));
  const orig = await entry(page, 'old');
  check('the original stays in history as not done (stats stay honest)', orig.done === false && orig.carried === TOMORROW, JSON.stringify(orig));
  check('it leaves the to-do list', (await items(page).count()) === 2);
  check('a confirmation with a link to that day is shown', (await page.locator('.todonote').innerText()).includes('Send the invoice') && await page.locator('.todonote a[data-date]').count() === 1);
  const copy = (await page.evaluate(() => state.entries.filter(e => e.date === '2026-03-11' && e.text === 'Send the invoice')))[0];
  check('the copy is a planned (not done) entry for the same P', copy.done === false && copy.p === 'payday' && copy.planned === true);

  // history keeps the trail
  check('history says where it was re-planned', await page.evaluate(() => itemHtml(state.entries.find(e => e.id === 'old'), todayStr(), true).includes('re-planned')));

  // no duplicate plans
  await page.evaluate(() => { state.entries.push({ id: 'dup', date: '2026-03-06', p: 'payday', text: 'Send the invoice', done: false, planned: true }); render(); });
  await items(page).filter({ hasText: '6 Mar' }).locator('[data-todoadd]').click().catch(async () => { await items(page).first().locator('[data-todoadd]').click(); });
  check('adding an identical task does not create a second plan', (await page.evaluate(() => state.entries.filter(e => e.date === '2026-03-11' && e.text === 'Send the invoice').length)) === 1);

  // did it today
  const before = await page.locator('.score').innerText();
  await items(page).filter({ hasText: 'Cold shower' }).locator('[data-tododone]').click();
  check('"Did it today" logs a done entry for today', await page.evaluate(() => state.entries.some(e => e.date === '2026-03-10' && e.text === 'Cold shower' && e.done === true)));
  check('...and counts toward today\'s score', (await page.locator('.score').innerText()) !== before);

  // remove
  await page.evaluate(() => { state.entries.push({ id: 'junk', date: '2026-03-04', p: 'play', text: 'Junk idea', done: false, planned: true }); render(); });
  const tomorrowBefore = (await onDay(page, TOMORROW)).length;
  await items(page).filter({ hasText: 'Junk idea' }).locator('[data-tododrop]').click();
  check('✕ removes it from the list without planning it anywhere', (await items(page).filter({ hasText: 'Junk idea' }).count()) === 0 && (await onDay(page, TOMORROW)).length === tomorrowBefore);
  check('persists across a reload', await (async () => { await page.reload(); return (await entry(page, 'junk')).carried === 'removed'; })());

  // add all
  const left = await items(page).count();
  await page.click('[data-todoall]');
  check('Add all moves everything to tomorrow', (await items(page).count()) === 0 && (await page.locator('#todo').innerText()).includes('Nothing is waiting'));
  check('tomorrow\'s plan has the added items', (await onDay(page, TOMORROW)).includes('Play a board game'));
  check('no page errors', errs.length === 0, errs.join('|'));
  await ctx.close();

  // planning a later day: items go to the day you are viewing
  ({ ctx, page } = await open(base()));
  await page.click('#next'); await page.click('#next');       // viewing 2026-03-12
  check('while viewing a future day the buttons name that day', (await items(page).first().locator('[data-todoadd]').innerText()).includes('Mar 12'), await items(page).first().locator('[data-todoadd]').innerText());
  await items(page).first().locator('[data-todoadd]').click();
  check('item is added to the day being viewed', (await onDay(page, '2026-03-12')).includes('Send the invoice'));
  check('...and shows up in that day\'s cards', (await page.locator('.pcard').first().innerText()).includes('Send the invoice'));
  await ctx.close();

  // long lists collapse
  const many = base(); for (let i = 0; i < 6; i++) many.entries.push(plan('m' + i, '2026-03-0' + (1 + (i % 4)), 'play', 'Extra ' + i));
  ({ ctx, page } = await open(many));
  check('long lists show 5 and offer "Show all"', (await items(page).count()) === 5 && (await page.locator('[data-todomore]').innerText()).includes('Show all 9'), await page.locator('[data-todomore]').innerText());
  await page.click('[data-todomore]');
  check('"Show all" reveals everything', (await items(page).count()) === 9);
  await ctx.close();

  // empty state
  ({ ctx, page } = await open({ entries: [], wild: {}, reviews: {}, passionFrom: '2026-03-01' }));
  check('empty list is still visible and friendly', await page.locator('#todo').isVisible() && (await page.locator('#todo').innerText()).includes('all caught up'));
  await ctx.close();

  await browser.close();
  process.exit(done());
})().catch(e => { console.error('CRASHED', e.message); process.exit(2); });
