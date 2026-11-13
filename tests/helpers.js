// Shared setup for the browser tests.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'http://localhost:8765';

// Use CHROME_PATH if set, otherwise look for a Playwright-managed Chromium
// (install one with: npx playwright-core install chromium).
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(root)) return undefined;
  const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  const exe = dir && path.join(root, dir, 'chrome-linux64', 'chrome');
  return exe && fs.existsSync(exe) ? exe : undefined;
}

const launch = () => chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });

function makeChecker() {
  const r = { pass: 0, fail: 0 };
  const check = (name, ok, extra = '') => {
    ok ? r.pass++ : r.fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + extra}`);
  };
  const done = () => { console.log(`\n${r.pass} passed, ${r.fail} failed`); return r.fail ? 1 : 0; };
  return { check, done };
}

const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); };

module.exports = { BASE, launch, makeChecker, daysAgo, fmt };
