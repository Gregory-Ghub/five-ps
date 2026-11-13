const fs = require('fs');
const os = require('os');
const path = require('path');
const { BASE, launch, makeChecker, daysAgo } = require('./helpers');
const URL = BASE + '/index.html';
const seed = days => ({ entries: days.map((n, i) => ({ id: 'e' + i, date: daysAgo(n), p: 'play', text: 'seed ' + i, done: true })), wild: {}, reviews: {} });

const { check, done } = makeChecker();

(async () => {
  const browser = await launch();
  const errors = [];
  async function fresh(ls) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(([ls, once]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    }, [ls, true]);
    await page.goto(URL);
    return { ctx, page };
  }
  const vis = (page, id) => page.locator('#' + id).isVisible();
  const text = (page, id) => page.locator('#' + id).innerText();

  // 1. empty log: no banner
  let { ctx, page } = await fresh({});
  check('empty log: no backup banner', !(await vis(page, 'backupBanner')));
  check('empty log: footer says not backed up yet', (await text(page, 'backupInfo')) === 'Not backed up yet', await text(page, 'backupInfo'));
  check('empty log: undo button hidden', !(await vis(page, 'undoImport')));
  await ctx.close();

  // 2. only 2 active days: still no banner
  ({ ctx, page } = await fresh({ 'fivePs.v1': JSON.stringify(seed([0, 1])) }));
  check('2 active days: no banner yet', !(await vis(page, 'backupBanner')));
  await ctx.close();

  // 3. 3 active days, never backed up: banner shows
  ({ ctx, page } = await fresh({ 'fivePs.v1': JSON.stringify(seed([0, 1, 2])) }));
  check('3 active days: banner visible', await vis(page, 'backupBanner'));
  check('banner says "Back up your progress"', (await text(page, 'backupBanner')).includes('Back up your progress'), await text(page, 'backupBanner'));

  // 4. Back up now -> download + banner gone + footer + stored date
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-backupnow]')]);
  const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('Back up now downloads a JSON file', /^five-ps-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('downloaded file contains the 3 entries', saved.entries.length === 3, JSON.stringify(saved).slice(0, 80));
  check('banner hides after backup', !(await vis(page, 'backupBanner')));
  check('footer says Last backup: today', (await text(page, 'backupInfo')) === 'Last backup: today', await text(page, 'backupInfo'));
  check('lastBackup stored as today', (await page.evaluate(() => localStorage.getItem('fivePs.lastBackup'))) === daysAgo(0));
  await page.reload();
  check('banner stays hidden after reload', !(await vis(page, 'backupBanner')));
  await ctx.close();

  // 5. backed up 3 days ago: no banner. 8 days ago: banner with day count
  ({ ctx, page } = await fresh({ 'fivePs.v1': JSON.stringify(seed([0, 1, 2])), 'fivePs.lastBackup': daysAgo(3) }));
  check('backed up 3 days ago: no banner', !(await vis(page, 'backupBanner')));
  await ctx.close();
  ({ ctx, page } = await fresh({ 'fivePs.v1': JSON.stringify(seed([0, 1, 2])), 'fivePs.lastBackup': daysAgo(8) }));
  check('backed up 8 days ago: banner visible', await vis(page, 'backupBanner'));
  check('banner mentions 8 days', (await text(page, 'backupBanner')).includes('8 days'), await text(page, 'backupBanner'));

  // 6. dismiss snoozes until tomorrow
  await page.click('[data-backupclose]');
  check('dismiss hides banner', !(await vis(page, 'backupBanner')));
  await page.reload();
  check('dismissed banner stays hidden after reload (snoozed)', !(await vis(page, 'backupBanner')));
  await ctx.close();

  // 7. snooze from yesterday does not hide it
  ({ ctx, page } = await fresh({ 'fivePs.v1': JSON.stringify(seed([0, 1, 2])), 'fivePs.lastBackup': daysAgo(8), 'fivePs.backupSnooze': daysAgo(1) }));
  check('yesterday\'s snooze has expired', await vis(page, 'backupBanner'));
  await ctx.close();

  // 8. import then undo
  ({ ctx, page } = await fresh({ 'fivePs.v1': JSON.stringify(seed([0, 1, 2])) }));
  const importFile = path.join(os.tmpdir(), `five-ps-import-test-${process.pid}.json`);
  const imp = seed([0]); imp.entries.push({ id: 'bad', date: 'nope', p: 'x', text: 'broken' });
  fs.writeFileSync(importFile, JSON.stringify(imp));
  page.on('dialog', d => d.accept());
  await page.setInputFiles('#file', importFile);
  await page.waitForFunction(() => !document.getElementById('undoImport').hidden);
  const afterImport = await page.evaluate(() => JSON.parse(localStorage.getItem('fivePs.v1')).entries.length);
  check('import replaced data and skipped the damaged entry', afterImport === 1, 'entries=' + afterImport);
  check('undo button appears after import', await vis(page, 'undoImport'));
  await page.click('#undoImport');
  await page.waitForFunction(() => document.getElementById('undoImport').hidden);
  const afterUndo = await page.evaluate(() => JSON.parse(localStorage.getItem('fivePs.v1')).entries.length);
  check('undo restores the 3 original entries', afterUndo === 3, 'entries=' + afterUndo);
  check('undo button hides after use', !(await vis(page, 'undoImport')));
  fs.unlinkSync(importFile);
  await ctx.close();

  check('no console/page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  process.exit(done());
})().catch(e => { console.error('TEST CRASHED', e); process.exit(2); });
