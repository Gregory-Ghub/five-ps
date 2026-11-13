# Browser tests

End-to-end tests that drive the real app in headless Chromium (Playwright).

```
cd tests
npm install
npx playwright-core install chromium   # once, unless you set CHROME_PATH
npm test                               # all tests (~10s)
node run.js backup                     # only files whose name contains "backup"
```

`run.js` starts its own static server on port 8765 (override with `PORT`). Set `CHROME_PATH` to use a specific Chrome/Chromium binary.

| File | Covers |
|---|---|
| `passion.test.js` | The 6th P: content, the six-P full-day rule, migrating old data, orchard removed |
| `load.test.js` | Saved data survives load, save and reload |
| `backup.test.js` | Backup reminder banner, Back up now, snooze, import skipping bad entries, undo import |
| `install.test.js` | Install button: appears when installable, calls the prompt, hides when installed, iOS instructions |
| `wild.test.js` | Wild Card reveal/play/delete, including dates that used to crash |
| `reminder.test.js` | Daily reminder in the page: permission flow, timing, once-a-day, skips when done / visible / off |
| `sw.test.js` | The service worker's reminder decisions (pure logic, no browser) |
| `periodic.test.js` | A real `periodicsync` event delivered to the real service worker |
