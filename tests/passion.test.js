// The 6th P (Passion): content, full-day rule, migration of old data, and the orchard being gone.
const { BASE, launch, makeChecker } = require('./helpers');
const { check, done } = makeChecker();
const URL = BASE + '/index.html';
const CORE = ['payday', 'play', 'pain', 'partnership', 'physical'];

(async () => {
  const browser = await launch();
  async function open({ at = '2026-03-10T12:00:00', state, reuse } = {}) {
    const ctx = reuse || await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.clock.setFixedTime(new Date(at));
    if (state) await page.addInitScript(s => { if (!localStorage.getItem('fivePs.v1')) localStorage.setItem('fivePs.v1', s); }, JSON.stringify(state));
    await page.goto(URL);
    return { ctx, page, errs };
  };
  const ent = (date, p, extra = {}) => ({ id: `${date}-${p}`, date, p, text: `${p} thing`, done: true, ...extra });

  // ---- content ----
  let { ctx, page, errs } = await open();
  const info = await page.evaluate(() => ({
    n: PS.length, ids: PS.map(p => p.id), cards: document.querySelectorAll('.pcard').length,
    ideas: Object.fromEntries(PS.map(p => [p.id, IDEAS[p.id].length])),
    wild: Object.fromEntries(PS.map(p => [p.id, (WILD[p.id] || []).length])),
    unique: Object.fromEntries(PS.map(p => [p.id, new Set(IDEAS[p.id]).size === IDEAS[p.id].length])),
  }));
  check('six P\'s, Passion last', info.n === 6 && info.ids[5] === 'passion', JSON.stringify(info.ids));
  check('six cards on the Today tab', info.cards === 6, info.cards);
  check('Pain has lots of examples (20+)', info.ideas.pain >= 20, info.ideas.pain);
  check('every P has 10+ examples', Object.values(info.ideas).every(n => n >= 10), JSON.stringify(info.ideas));
  check('every P has 5+ Wild Card challenges (none missing)', Object.values(info.wild).every(n => n >= 5), JSON.stringify(info.wild));
  check('no duplicate examples', Object.values(info.unique).every(Boolean));
  check('Passion card shows an idea', (await page.locator('.pcard[style*="a855f7"] .idea').innerText()).includes('💡'));
  const a = await page.locator('.pcard').nth(2).locator('.idea').innerText();
  await page.locator('.pcard').nth(2).locator('[data-idea]').click();
  check('"another" cycles to a different idea', a !== await page.locator('.pcard').nth(2).locator('.idea').innerText());

  // ---- orchard is gone, other progress views still render with six axes ----
  await page.click('[data-tab="progress"]');
  check('no orchard or trophy shelf anywhere', (await page.locator('#orchard, #trophies, .trophies, [data-reward]').count()) === 0 && !/orchard|trophy/i.test(await page.locator('body').innerText()));
  check('calendar renders', (await page.locator('#heat svg').count()) === 1);
  check('radar has six axes', (await page.locator('#radar line').count()) === 6, await page.locator('#radar line').count());
  check('no page errors', errs.length === 0, errs.join('|'));
  await ctx.close();

  // ---- a day needs all six ----
  ({ ctx, page, errs } = await open({ state: { entries: [], wild: {}, reviews: {}, passionFrom: '2026-03-01' } }));
  const log = async (p, text) => { await page.fill(`.pcard input[data-p="${p}"]`, text); await page.press(`.pcard input[data-p="${p}"]`, 'Enter'); };
  for (const p of CORE) await log(p, `did ${p}`);
  check('five of six is not a full day (no celebration)', !(await page.locator('#celebrate.show').count()) && (await page.locator('#replay').isHidden()));
  check('score reads 5 / 6', (await page.locator('.score').innerText()).replace(/\s+/g, ' ').includes('5 / 6'), await page.locator('.score').innerText());
  await log('passion', 'rode the rollercoaster');
  check('adding Passion completes the day and celebrates', await page.locator('#celebrate.show').count() === 1);
  check('score reads 6 / 6 and replay is offered', (await page.locator('.score').innerText()).replace(/\s+/g, ' ').includes('6 / 6') && await page.locator('#replay').isVisible());
  check('celebration timing knows about six squeezes', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sq-n').trim())) === '6');
  check('no page errors during the celebration', errs.length === 0, errs.join('|'));
  await ctx.close();

  // ---- old data: past days with the original five still count as full ----
  const legacy = { entries: [...CORE.map(p => ent('2026-03-08', p)), ...CORE.map(p => ent('2026-03-09', p))], wild: {}, reviews: {} }; // saved before Passion existed
  ({ ctx, page, errs } = await open({ state: legacy }));
  const mig = await page.evaluate(() => ({
    from: state.passionFrom, stored: JSON.parse(localStorage.getItem('fivePs.v1')).passionFrom,
    fullThen: dayFull('2026-03-08'), total: stats(hitsByDate()).total, streak: stats(hitsByDate()).streak, need: [dayTotal('2026-03-08'), dayTotal('2026-03-10')],
  }));
  check('migration date is set to the first day on six P\'s', mig.from === '2026-03-10', mig.from);
  check('...and saved immediately, not only on the next action', mig.stored === '2026-03-10', mig.stored);
  check('old five-P days still count as fully squeezed', mig.fullThen === true && mig.total === 2, JSON.stringify(mig));
  check('old streak is preserved (2 days)', mig.streak === 2, mig.streak);
  check('old days need 5, new days need 6', mig.need[0] === 5 && mig.need[1] === 6, JSON.stringify(mig.need));
  // a later visit must not move the migration date
  const page2 = await ctx.newPage();
  await page2.clock.setFixedTime(new Date('2026-03-20T12:00:00'));
  await page2.goto(URL);
  check('migration date does not drift on later visits', (await page2.evaluate(() => state.passionFrom)) === '2026-03-10');
  check('old days still full after the migration date has passed', await page2.evaluate(() => dayFull('2026-03-09')));
  check('no page errors with legacy data', errs.length === 0, errs.join('|'));
  await ctx.close();

  // ---- importing an old backup (no passionFrom) keeps its history full ----
  ({ ctx, page } = await open());
  const backup = JSON.stringify({ entries: CORE.map(p => ent('2026-02-01', p)), wild: {}, reviews: {} });
  require('fs').writeFileSync(require('os').tmpdir() + '/five-ps-legacy-import.json', backup);
  page.on('dialog', d => d.accept());
  await page.setInputFiles('#file', require('os').tmpdir() + '/five-ps-legacy-import.json');
  await page.waitForFunction(() => state.entries.length === 5);
  check('imported old backup: its days stay full', await page.evaluate(() => dayFull('2026-02-01')));
  await ctx.close();

  await browser.close();
  process.exit(done());
})().catch(e => { console.error('CRASHED', e.message); process.exit(2); });
