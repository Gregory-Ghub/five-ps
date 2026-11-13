// Pure-logic tests for the service worker's reminder decisions (no browser needed).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// load the real sw.js in a sandbox that stubs the service-worker globals
const sandbox = { module: { exports: {} }, self: { addEventListener() {} }, caches: {}, location: { origin: 'http://localhost' } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), sandbox, { filename: 'sw.js' });
const { reminderDue, reminderText } = sandbox.module.exports;
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  -> ' + x}`); };
const at = (h, m = 0, day = 3) => new Date(2026, 2, day, h, m);
const rec = (over = {}) => ({ on: true, time: '20:00', last: '', date: '2026-03-03', done: ['play', 'pain'], ...over });

check('off: never due', !reminderDue(rec({ on: false }), at(21)));
check('no record: not due', !reminderDue(null, at(21)));
check('before reminder time: not due', !reminderDue(rec(), at(19, 59)));
check('at reminder time: due', reminderDue(rec(), at(20, 0)));
check('late evening: due', reminderDue(rec(), at(23, 59)));
check('already sent today: not due', !reminderDue(rec({ last: '2026-03-03' }), at(21)));
check('sent yesterday: due again', reminderDue(rec({ last: '2026-03-02' }), at(21)));
const ALL6 = ['payday', 'play', 'pain', 'partnership', 'physical', 'passion'];
check('all six done: not due', !reminderDue(rec({ done: ALL6 }), at(21)));
check('five of six done: still due (Passion is missing)', reminderDue(rec({ done: ALL6.slice(0, 5) }), at(21)));
check('stale record from yesterday counts as nothing done today', reminderDue(rec({ date: '2026-03-02', done: ALL6 }), at(21)));
check('custom time respected', !reminderDue(rec({ time: '21:30' }), at(21, 0)) && reminderDue(rec({ time: '21:30' }), at(21, 30)));

let t = reminderText(rec(), at(21));
check('text counts progress', t.body.startsWith('2 of 6'), t.body);
check('text lists only the missing P\'s', /Payday/.test(t.body) && /Partnership/.test(t.body) && /Physical/.test(t.body) && /Passion/.test(t.body) && !/Play/.test(t.body) && !/Pain/.test(t.body), t.body);
t = reminderText(rec({ done: [] }), at(21));
check('text when nothing done', /Nothing squeezed/.test(t.body), t.body);
t = reminderText(rec({ date: '2026-03-02', done: ['payday'] }), at(21));
check('stale record reads as nothing done', /Nothing squeezed/.test(t.body), t.body);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
