# Rendezvous — Schengen Calculator

**Live:** https://insomniacoder.github.io/rendezvous/

Track 90/180-day Schengen stays for two people.

## What it does

The Schengen Area limits non-EU visitors to **90 days in any rolling 180-day window**. This tool helps you track how many days you've used and plan future trips without exceeding the limit.

- Tracks stays for two people (You and Partner) independently
- Visualises stays on a timeline with a highlighted 180-day window
- Warns you when adding a stay would breach the 90-day limit
- Shows when days will roll off the window next

## The 90/180 rule

The 90-day count uses a **rolling 180-day window** ending on today. The window spans from **today − 179 days to today** — 180 days inclusive. Any stay overlapping that range is counted, including planned future trips.

## Features

- **Timeline canvas** — visual overview of past and planned stays, with the active 180-day window highlighted in yellow
- **Summary cards** — days used, days remaining, and next roll-off date per person
- **Stay list** — all stays sorted chronologically; click any row to edit it
- **Add / edit / delete stays** — date picker with auto-fill, country label, past/planned toggle
- **Simulate date** — set a hypothetical "today" to see how your count looks on any future date; planned stays up to that date are included in the calculation

## Usage

No build step required. Open `index.html` directly in a browser.

```bash
open index.html
```

## Project structure

```
index.html      — markup
style.css       — styles
app.js          — UI logic and event handling
schengen.js     — pure calculation functions (no DOM dependency)
```

`schengen.js` exports pure functions and can be used in Node.js for testing without a browser.
