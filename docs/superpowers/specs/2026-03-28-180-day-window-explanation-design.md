# 180-Day Window Explanation Text

**Date:** 2026-03-28

## Summary

Add a static info box below the summary cards explaining how the 180-day rolling window is calculated, so users understand what the day counts mean without needing to read the source code.

## Placement

Insert a `<div id="window-explanation">` immediately after `<div id="summary-bar">` in `index.html`.

## Content

> The 90-day count uses a **rolling 180-day window** ending on today (or your simulated date). The window spans from **[today − 179 days] to today** — 180 days inclusive. Any stay that overlaps this range is counted, including planned future trips. Use "Simulate date" to see how your count would look on any future date — stays planned up to that date are included in the calculation.

## Styling

Add a new rule in `style.css` for `#window-explanation`:

- Light blue background (`#f0f4ff` or similar)
- Left border accent in blue (`#4a80f0` or matching the existing palette)
- Rounded corners, comfortable padding
- Small font size (matches existing helper/label text in the UI)

## Scope

- **`index.html`** — add the `<div>` after `#summary-bar`
- **`style.css`** — add styles for `#window-explanation`
- No changes to `app.js` or `schengen.js`
