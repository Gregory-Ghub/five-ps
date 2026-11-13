// Install button: shows only when installable, triggers the browser prompt, hides when installed.
const { BASE, launch, makeChecker } = require('./helpers');
const { check, done } = makeChecker();
const URL = BASE + '/index.html';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// fire a fake beforeinstallprompt whose prompt() we can observe
const fireInstallEvent = page => page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  window.__prompted = 0; e.prompt = () => { window.__prompted++; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});

(async () => {
  const browser = await launch();
  const open = async (opts = {}, init) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', ...opts });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    if (init) await page.addInitScript(init);
    await page.goto(URL);
    return { ctx, page, errs };
  };
  const shown = page => page.locator('#install').isVisible();

  // desktop/Android Chromium
  let { ctx, page, errs } = await open();
  check('hidden when the browser has not offered an install', !(await shown(page)));
  check('browser mini-infobar suppressed (preventDefault)', await fireInstallEvent(page) === true);
  check('button appears once installable', await shown(page));
  await page.click('#install');
  check('click calls the browser install prompt once', (await page.evaluate(() => window.__prompted)) === 1);
  await page.waitForFunction(() => document.getElementById('install').hidden);
  check('button hides after the prompt is used', !(await shown(page)));
  check('no page errors', errs.length === 0, errs.join('|'));
  await ctx.close();

  // appinstalled hides it
  ({ ctx, page } = await open());
  await fireInstallEvent(page);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  check('hides on appinstalled', !(await shown(page)));
  await ctx.close();

  // already running as an installed app
  ({ ctx, page } = await open({}, () => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = q => q.includes('standalone') ? { matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : real(q);
  }));
  await fireInstallEvent(page);
  check('hidden when already installed (standalone)', !(await shown(page)));
  await ctx.close();

  // iOS Safari: manual instructions
  ({ ctx, page } = await open({ userAgent: IPHONE }));
  check('iOS: button shown without any browser event', await shown(page));
  let msg = '';
  page.once('dialog', d => { msg = d.message(); d.accept(); });
  await page.click('#install');
  check('iOS: click explains Share > Add to Home Screen', /Share/.test(msg) && /Add to Home Screen/.test(msg), msg);
  await ctx.close();

  await browser.close();
  process.exit(done());
})().catch(e => { console.error('CRASHED', e.message); process.exit(2); });
