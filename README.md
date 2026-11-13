# The 5 P's – Squeeze the Juice

A daily habit tracker built around five categories. Do at least one thing in each, every day, and you've **fully squeezed** the day.

| | P | Meaning |
|---|---|---|
| 💰 | **Payday** | Entrepreneurial moves that make money |
| 🎮 | **Play** | Pure fun, no productivity required |
| 🔥 | **Pain** | Something hard you did on purpose |
| 🤝 | **Partnership** | Network, or turn a stranger into a friend |
| 💪 | **Physical** | Exercise for your health |

It's a single static page with no build step, no dependencies and no account. It works offline and installs like an app.

## Features

**Daily tracking**
- Log what you did under each P, or **plan** tasks up to 30 days ahead and tick them off on the day.
- An orange fills in one segment per P, and a juice glass fills alongside it. All five triggers a squeeze celebration with sound and a quote.

**Streaks and motivation**
- **Streak shields:** every 7 fully squeezed days in a row earns a shield (max 2). A missed day spends a shield instead of resetting your streak ("never miss twice").
- **Heatmap** of the last 26 weeks, and a **weekly balance radar** that points out your most neglected P.
- **Orchard:** one tree per month with an orange per day. Squeeze every day of a month for a golden tree and a trophy.
- **Wild Card:** a daily surprise challenge aimed at the P you've neglected most this week.
- **Juice Oracle:** random facts about you, drawn from your own data.

**Reflection**
- **Weekly review:** juice level, balance, highlight of the week, a suggested focus, and a written intention for the week with a "did I keep it?" check-in.
- **History:** filter by range, status and view (by date, by P, or by week). Mark missed plans done or move them to today. Export the current view as CSV.

**Your data**
- Everything is stored in your browser's `localStorage` (key `fivePs.v1`). Nothing is sent anywhere.
- **Export / Import** a JSON backup. Importing skips damaged entries and can be undone.
- A reminder banner nudges you to back up after 3 active days, then weekly.

**App behavior**
- Installable (PWA) with an **Install app** button. On iPhone it shows the Share → Add to Home Screen steps.
- Works offline through a service worker.
- **Daily reminder:** tap **🔔 Daily reminder** in the footer, allow notifications and pick a time (default 20:00). If you haven't squeezed all five P's by then, you get a nudge listing what's left. It never fires while you're looking at the app, at most once a day, and not at all if you're done. See [Reminder limits](#reminder-limits).

## Reminder limits

This is a static site with no server, so it **cannot send true push notifications** to a closed app. Two best-effort paths cover most cases:

- **App open in a background tab or window:** the page checks every 30 seconds and fires at your reminder time.
- **App installed, on Chrome or Edge (Android and desktop):** the service worker asks for Periodic Background Sync wake-ups. The *browser* decides when they run (often every several hours, and only for apps you use regularly), so the reminder can be late or skipped.

Safari and Firefox don't support background wake-ups, and iPhone only allows notifications from an installed app (Share → Add to Home Screen). If you need a guaranteed reminder, also set an alarm on your phone.

## Run it locally

Service workers need `http://localhost` or HTTPS, so don't open the file directly.

```
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Any static host works. For GitHub Pages: repo **Settings → Pages**, set the source to the `main` branch, root folder. The site appears at `https://<user>.github.io/five-ps/`.

## Project layout

```
index.html            the whole app: markup, styles and script
sw.js                 service worker (offline cache)
manifest.webmanifest  PWA manifest
icon*.png, icon.svg   app icons
tests/                browser tests (see tests/README.md)
```

## Updating the app

The service worker serves cached files first and refreshes them in the background, so an update normally appears on the load *after* you deploy it. To push a change out faster, bump `CACHE` in `sw.js` (for example `five-ps-v7` → `five-ps-v8`) in the same commit.

## Tests

End-to-end tests drive the real app in headless Chromium (about 15 seconds, 98 checks):

```
cd tests
npm install
npx playwright-core install chromium   # once
npm test
```

They cover saved data surviving a load, the backup reminder and undo-import flow, the Wild Card, the install button, and the daily reminder (including a real service-worker wake-up). See [`tests/README.md`](tests/README.md).

## Data and privacy

All data stays in your browser. Clearing site data erases it, and each browser, device and URL keeps its own copy (`localhost` and the deployed site are separate). Use **Export backup** to move or protect your data.
