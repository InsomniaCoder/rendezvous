/**
 * app.js — Schengen Calculator UI logic
 * Task 3: Timeline rendering and summary bar
 */

// ---------------------------------------------------------------------------
// App State
// ---------------------------------------------------------------------------

const state = {
  stays: [],
  today: new Date()
};

// ---------------------------------------------------------------------------
// Date Utility Helpers
// ---------------------------------------------------------------------------

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Note: addDays and diffDays are already defined in schengen.js (as globals).
// We use those directly since they operate on UTC midnight values.

function subMonths(date, n) {
  const d = startOfDay(date);
  const month = d.getUTCMonth() - n;
  d.setUTCMonth(month);
  return d;
}

function addMonths(date, n) {
  const d = startOfDay(date);
  const month = d.getUTCMonth() + n;
  d.setUTCMonth(month);
  return d;
}

function formatDate(date) {
  // "Jan 25" style — short month + 2-digit year
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = months[date.getUTCMonth()];
  const y = String(date.getUTCFullYear()).slice(-2);
  return m + ' ' + y;
}

function formatDateFull(date) {
  // "Jan 5, 2025"
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = months[date.getUTCMonth()];
  const d = date.getUTCDate();
  const y = date.getUTCFullYear();
  return m + ' ' + d + ', ' + y;
}

function formatRolloff(rolloffResult) {
  if (!rolloffResult) return '—';
  const { date, daysFreed } = rolloffResult;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = months[date.getUTCMonth()];
  const d = date.getUTCDate();
  return daysFreed + 'd free on ' + m + ' ' + d;
}

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

function updateSummaryBar() {
  const today = state.today;

  for (const person of ['you', 'partner']) {
    const cardId = person === 'you' ? 'summary-you' : 'summary-partner';
    const card = document.getElementById(cardId);

    const used = daysInWindow(state.stays, person, today);
    const remaining = daysRemaining(state.stays, person, today);
    const rolloff = nextRolloffDate(state.stays, person, today);

    card.querySelector('.days-used').textContent = used + ' / 90 days';
    card.querySelector('.days-remaining').textContent = remaining + ' days remaining';
    card.querySelector('.rolloff-info').textContent = formatRolloff(rolloff);

    if (remaining <= 20) {
      card.classList.add('warning');
    } else {
      card.classList.remove('warning');
    }
  }
}

// ---------------------------------------------------------------------------
// Timeline Canvas Rendering
// ---------------------------------------------------------------------------

const LABEL_HEIGHT = 20;
const ROW_HEIGHT = 40;
const ROW_PADDING = 8;
const BAR_HEIGHT = ROW_HEIGHT - ROW_PADDING * 2;   // 24px
const CANVAS_HEIGHT = LABEL_HEIGHT + ROW_HEIGHT * 2; // 100px
const LEFT_MARGIN = 50;

const COLOR_YOU = '#3f51b5';
const COLOR_PARTNER = '#e91e63';
const COLOR_YOU_LIGHT = 'rgba(63, 81, 181, 0.25)';
const COLOR_PARTNER_LIGHT = 'rgba(233, 30, 99, 0.25)';

// Click zones stored for hit testing
let clickZones = [];

// Computed range vars (set inside renderTimeline so dateFromX can read them)
let _rangeStart = null;
let _totalDays = 0;
let _canvas = null;

function renderTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;
  _canvas = canvas;

  // Resize canvas to match CSS layout
  canvas.height = CANVAS_HEIGHT;
  canvas.width = canvas.offsetWidth;

  const ctx = canvas.getContext('2d');
  const today = startOfDay(state.today);

  // Date range: 6 months before today → 3 months after today
  const rangeStart = startOfDay(subMonths(today, 6));
  const rangeEnd = startOfDay(addMonths(today, 3));
  const totalDays = diffDays(rangeEnd, rangeStart);

  // Store in module scope for dateFromX
  _rangeStart = rangeStart;
  _totalDays = totalDays;

  const W = canvas.width;
  const drawableWidth = W - LEFT_MARGIN;

  function dateToX(date) {
    const days = diffDays(startOfDay(date), rangeStart);
    return LEFT_MARGIN + (days / totalDays) * drawableWidth;
  }

  const dayWidth = drawableWidth / totalDays;

  // Reset click zones
  clickZones = [];

  // 1. Background
  ctx.fillStyle = '#f5f7fa';
  ctx.fillRect(0, 0, W, CANVAS_HEIGHT);

  // 2. 180-day window bracket (today − 179 days to today)
  const windowStart = addDays(today, -179);
  const wxStart = dateToX(windowStart);
  const wxEnd = dateToX(today);
  ctx.fillStyle = 'rgba(255, 235, 59, 0.25)';
  ctx.fillRect(wxStart, 0, wxEnd - wxStart, CANVAS_HEIGHT);

  // 3. Month labels
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#9e9e9e';
  ctx.textBaseline = 'top';

  // Iterate months from rangeStart to rangeEnd
  let labelDate = new Date(rangeStart);
  labelDate.setUTCDate(1); // snap to 1st of month
  // If rangeStart is already past the 1st, start from the next month
  if (rangeStart.getUTCDate() !== 1) {
    labelDate.setUTCMonth(labelDate.getUTCMonth() + 1);
  }

  while (labelDate <= rangeEnd) {
    const x = dateToX(labelDate);
    if (x >= LEFT_MARGIN && x <= W - 10) {
      const label = formatDate(labelDate);
      ctx.fillText(label, x + 2, 2);
    }
    labelDate = new Date(labelDate);
    labelDate.setUTCMonth(labelDate.getUTCMonth() + 1);
  }

  // 4. Person row labels
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px system-ui, sans-serif';

  // "You" label
  ctx.fillStyle = COLOR_YOU;
  const youRowMidY = LABEL_HEIGHT + ROW_HEIGHT / 2;
  ctx.fillText('You', 4, youRowMidY);

  // "Partner" label
  ctx.fillStyle = COLOR_PARTNER;
  const partnerRowMidY = LABEL_HEIGHT + ROW_HEIGHT + ROW_HEIGHT / 2;
  ctx.fillText('Ptnr', 2, partnerRowMidY);

  // 5. Stay bars
  for (const stay of state.stays) {
    const isYou = stay.person === 'you';
    const color = isYou ? COLOR_YOU : COLOR_PARTNER;
    const colorLight = isYou ? COLOR_YOU_LIGHT : COLOR_PARTNER_LIGHT;

    let x1 = dateToX(stay.from);
    let x2 = dateToX(stay.to) + dayWidth; // add one day width

    // Clip to canvas bounds
    const clippedX1 = Math.max(LEFT_MARGIN, x1);
    const clippedX2 = Math.min(W, x2);

    if (clippedX2 <= clippedX1) continue; // fully out of view

    const rowOffset = isYou ? 0 : ROW_HEIGHT;
    const barY = LABEL_HEIGHT + rowOffset + ROW_PADDING;

    if (stay.planned) {
      // Planned: light fill + diagonal hatching
      ctx.fillStyle = colorLight;
      ctx.fillRect(clippedX1, barY, clippedX2 - clippedX1, BAR_HEIGHT);

      // Diagonal stripes at 45°
      ctx.save();
      ctx.beginPath();
      ctx.rect(clippedX1, barY, clippedX2 - clippedX1, BAR_HEIGHT);
      ctx.clip();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45;

      const stripeSpacing = 6;
      const totalSpan = (clippedX2 - clippedX1) + BAR_HEIGHT;
      for (let offset = -BAR_HEIGHT; offset <= totalSpan; offset += stripeSpacing) {
        ctx.beginPath();
        ctx.moveTo(clippedX1 + offset, barY);
        ctx.lineTo(clippedX1 + offset + BAR_HEIGHT, barY + BAR_HEIGHT);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      // Past: solid fill
      ctx.fillStyle = color;
      ctx.fillRect(clippedX1, barY, clippedX2 - clippedX1, BAR_HEIGHT);
    }

    // Store click zone (using unclipped x for hit testing accuracy; use clipped for display)
    clickZones.push({
      stay,
      x1: clippedX1,
      x2: clippedX2,
      yTop: barY,
      yBottom: barY + BAR_HEIGHT
    });
  }

  // 6. Today line (drawn after bars so it's on top)
  const todayX = dateToX(today);
  ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(todayX, 0);
  ctx.lineTo(todayX, CANVAS_HEIGHT);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// dateFromX helper
// ---------------------------------------------------------------------------

function dateFromX(x) {
  if (!_canvas || _totalDays === 0) return null;
  const days = Math.round((x - LEFT_MARGIN) / (_canvas.width - LEFT_MARGIN) * _totalDays);
  return addDays(_rangeStart, days);
}

// ---------------------------------------------------------------------------
// Canvas Click Handling
// ---------------------------------------------------------------------------

function onCanvasClick(e) {
  const x = e.offsetX;
  const y = e.offsetY;

  for (const zone of clickZones) {
    if (x >= zone.x1 && x <= zone.x2 && y >= zone.yTop && y <= zone.yBottom) {
      console.log('edit stay', zone.stay.id);
      return;
    }
  }

  // Click outside any stay — add new stay at clicked date
  const clickedDate = dateFromX(x);
  console.log('add stay at', clickedDate);
}

// ---------------------------------------------------------------------------
// Stay List (stub — implemented in Task 4)
// ---------------------------------------------------------------------------

function renderStayList() {
  // Stub — Task 4 will implement this
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  updateSummaryBar();
  renderTimeline();
  renderStayList();
}

// ---------------------------------------------------------------------------
// Seed Data (for visual testing)
// ---------------------------------------------------------------------------

state.stays = [
  {
    id: '1',
    person: 'you',
    from: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    to: new Date(Date.now() - 47 * 24 * 60 * 60 * 1000),
    country: 'France',
    planned: false
  },
  {
    id: '2',
    person: 'you',
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
    country: 'Germany',
    planned: false
  },
  {
    id: '3',
    person: 'you',
    from: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    to: new Date(Date.now() + 24 * 24 * 60 * 60 * 1000),
    country: 'Italy',
    planned: true
  },
  {
    id: '4',
    person: 'partner',
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    to: new Date(Date.now() - 72 * 24 * 60 * 60 * 1000),
    country: 'Spain',
    planned: false
  },
  {
    id: '5',
    person: 'partner',
    from: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    to: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    planned: false
  }
];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

window.addEventListener('resize', renderTimeline);

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('timeline-canvas');
  if (canvas) {
    canvas.addEventListener('click', onCanvasClick);
  }
  render();
});
