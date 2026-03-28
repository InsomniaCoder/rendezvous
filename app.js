/**
 * app.js — Schengen Calculator UI logic
 */

// ---------------------------------------------------------------------------
// App State
// ---------------------------------------------------------------------------

const state = {
  stays: [],
  today: new Date()
};

let editingStayId = null;

// ---------------------------------------------------------------------------
// Date Utility Helpers
// ---------------------------------------------------------------------------

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Note: addDays and diffDays are globals from schengen.js

function subMonths(date, n) {
  const d = startOfDay(date);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

function addMonths(date, n) {
  const d = startOfDay(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

function formatDate(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[date.getUTCMonth()] + ' ' + String(date.getUTCFullYear()).slice(-2);
}

function formatDateFull(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + date.getUTCFullYear();
}

function formatDateShort(date) {
  // "Jan 5" — for stay list display
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[date.getUTCMonth()] + ' ' + date.getUTCDate();
}

function formatRolloff(rolloffResult) {
  if (!rolloffResult) return '—';
  const { date, daysFreed } = rolloffResult;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return daysFreed + 'd free on ' + months[date.getUTCMonth()] + ' ' + date.getUTCDate();
}

function toDateInputValue(date) {
  const d = startOfDay(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

function updateSummaryBar() {
  const today = state.today;
  for (const person of ['you', 'partner']) {
    const card = document.getElementById(person === 'you' ? 'summary-you' : 'summary-partner');
    const used = daysInWindow(state.stays, person, today);
    const remaining = daysRemaining(state.stays, person, today);
    const rolloff = nextRolloffDate(state.stays, person, today);

    card.querySelector('.days-used').textContent = used + ' / 90 days';
    card.querySelector('.days-remaining').textContent = remaining + ' days remaining';
    card.querySelector('.rolloff-info').textContent = formatRolloff(rolloff);
    card.classList.toggle('warning', remaining <= 20);
  }
}

// ---------------------------------------------------------------------------
// Timeline Canvas Rendering
// ---------------------------------------------------------------------------

const LABEL_HEIGHT = 20;
const ROW_HEIGHT = 40;
const ROW_PADDING = 8;
const BAR_HEIGHT = ROW_HEIGHT - ROW_PADDING * 2;
const CANVAS_HEIGHT = LABEL_HEIGHT + ROW_HEIGHT * 2;
const LEFT_MARGIN = 50;

const COLOR_YOU = '#3f51b5';
const COLOR_PARTNER = '#e91e63';
const COLOR_YOU_LIGHT = 'rgba(63, 81, 181, 0.25)';
const COLOR_PARTNER_LIGHT = 'rgba(233, 30, 99, 0.25)';

let clickZones = [];
let _rangeStart = null;
let _totalDays = 0;
let _canvas = null;

function renderTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;
  _canvas = canvas;

  canvas.height = CANVAS_HEIGHT;
  canvas.width = canvas.offsetWidth;

  const ctx = canvas.getContext('2d');
  const today = startOfDay(state.today);

  const rangeStart = startOfDay(subMonths(today, 6));
  const rangeEnd = startOfDay(addMonths(today, 3));
  const totalDays = diffDays(rangeEnd, rangeStart);

  _rangeStart = rangeStart;
  _totalDays = totalDays;

  const W = canvas.width;
  const drawableWidth = W - LEFT_MARGIN;

  function dateToX(date) {
    const days = diffDays(startOfDay(date), rangeStart);
    return LEFT_MARGIN + (days / totalDays) * drawableWidth;
  }

  const dayWidth = drawableWidth / totalDays;
  clickZones = [];

  // 1. Background
  ctx.fillStyle = '#f5f7fa';
  ctx.fillRect(0, 0, W, CANVAS_HEIGHT);

  // 2. 180-day window bracket
  const windowStart = addDays(today, -179);
  const wxStart = dateToX(windowStart);
  const wxEnd = dateToX(today);
  ctx.fillStyle = 'rgba(255, 235, 59, 0.25)';
  ctx.fillRect(wxStart, 0, wxEnd - wxStart, CANVAS_HEIGHT);

  // 3. Month labels
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#9e9e9e';
  ctx.textBaseline = 'top';

  let labelDate = new Date(rangeStart);
  labelDate.setUTCDate(1);
  if (rangeStart.getUTCDate() !== 1) {
    labelDate.setUTCMonth(labelDate.getUTCMonth() + 1);
  }
  while (labelDate <= rangeEnd) {
    const x = dateToX(labelDate);
    if (x >= LEFT_MARGIN && x <= W - 10) {
      ctx.fillText(formatDate(labelDate), x + 2, 2);
    }
    labelDate = new Date(labelDate);
    labelDate.setUTCMonth(labelDate.getUTCMonth() + 1);
  }

  // 4. Person row labels
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = COLOR_YOU;
  ctx.fillText('You', 4, LABEL_HEIGHT + ROW_HEIGHT / 2);
  ctx.fillStyle = COLOR_PARTNER;
  ctx.fillText('Partner', 2, LABEL_HEIGHT + ROW_HEIGHT + ROW_HEIGHT / 2);

  // 5. Stay bars
  for (const stay of state.stays) {
    const isYou = stay.person === 'you';
    const color = isYou ? COLOR_YOU : COLOR_PARTNER;
    const colorLight = isYou ? COLOR_YOU_LIGHT : COLOR_PARTNER_LIGHT;

    const x1 = dateToX(stay.from);
    const x2 = dateToX(stay.to) + dayWidth;
    const clippedX1 = Math.max(LEFT_MARGIN, x1);
    const clippedX2 = Math.min(W, x2);
    if (clippedX2 <= clippedX1) continue;

    const barY = LABEL_HEIGHT + (isYou ? 0 : ROW_HEIGHT) + ROW_PADDING;

    if (stay.planned) {
      ctx.fillStyle = colorLight;
      ctx.fillRect(clippedX1, barY, clippedX2 - clippedX1, BAR_HEIGHT);

      ctx.save();
      ctx.beginPath();
      ctx.rect(clippedX1, barY, clippedX2 - clippedX1, BAR_HEIGHT);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45;
      const totalSpan = (clippedX2 - clippedX1) + BAR_HEIGHT;
      for (let offset = -BAR_HEIGHT; offset <= totalSpan; offset += 6) {
        ctx.beginPath();
        ctx.moveTo(clippedX1 + offset, barY);
        ctx.lineTo(clippedX1 + offset + BAR_HEIGHT, barY + BAR_HEIGHT);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(clippedX1, barY, clippedX2 - clippedX1, BAR_HEIGHT);
    }

    clickZones.push({ stay, x1: clippedX1, x2: clippedX2, yTop: barY, yBottom: barY + BAR_HEIGHT });
  }

  // 6. Today line
  const todayX = dateToX(today);
  ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(todayX, 0);
  ctx.lineTo(todayX, CANVAS_HEIGHT);
  ctx.stroke();
}

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
      openEditPopover(zone.stay);
      return;
    }
  }

  const clickedDate = dateFromX(x);
  if (clickedDate) openAddPopover(clickedDate);
}

// ---------------------------------------------------------------------------
// Stay List
// ---------------------------------------------------------------------------

function renderStayList() {
  const container = document.getElementById('stay-list');
  if (!container) return;

  if (state.stays.length === 0) {
    container.innerHTML = '<p class="stay-empty">No stays added yet.</p>';
    return;
  }

  const sorted = [...state.stays].sort((a, b) => b.from - a.from);

  container.innerHTML = sorted.map(stay => {
    const dotClass = stay.person === 'you' ? 'you' : 'partner';
    const duration = diffDays(stay.to, stay.from) + 1;
    const dates = formatDateShort(stay.from) + ' – ' + formatDateShort(stay.to);
    const countryBadge = stay.country ? `<span class="badge badge-country">${escapeHtml(stay.country)}</span>` : '';
    const plannedBadge = stay.planned ? '<span class="badge badge-planned">Planned</span>' : '';
    return `
      <div class="stay-entry">
        <span class="stay-dot ${dotClass}"></span>
        <span class="stay-dates">${dates}</span>
        <span class="stay-duration">${duration}d</span>
        ${countryBadge}
        ${plannedBadge}
        <button class="btn-delete" data-id="${stay.id}">✕</button>
      </div>`;
  }).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      state.stays = state.stays.filter(s => s.id !== btn.dataset.id);
      render();
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

function setActiveToggle(group, value) {
  const btns = group === 'person'
    ? [document.getElementById('person-you'), document.getElementById('person-partner')]
    : [document.getElementById('type-past'), document.getElementById('type-planned')];
  btns.forEach(b => b.classList.toggle('active', b.dataset.value === value));
}

function openAddPopover(date) {
  document.getElementById('popover-title').textContent = 'Add Stay';
  const dateStr = toDateInputValue(date);
  document.getElementById('from-date').value = dateStr;
  document.getElementById('to-date').value = dateStr;
  document.getElementById('country').value = '';
  setActiveToggle('person', 'you');
  const isPlanned = startOfDay(date) >= startOfDay(state.today);
  setActiveToggle('type', isPlanned ? 'true' : 'false');
  hideViolationWarning();
  editingStayId = null;
  document.getElementById('popover-overlay').classList.remove('hidden');
}

function openEditPopover(stay) {
  document.getElementById('popover-title').textContent = 'Edit Stay';
  document.getElementById('from-date').value = toDateInputValue(stay.from);
  document.getElementById('to-date').value = toDateInputValue(stay.to);
  document.getElementById('country').value = stay.country || '';
  setActiveToggle('person', stay.person);
  setActiveToggle('type', stay.planned ? 'true' : 'false');
  hideViolationWarning();
  editingStayId = stay.id;
  document.getElementById('popover-overlay').classList.remove('hidden');
}

function closePopover() {
  document.getElementById('popover-overlay').classList.add('hidden');
  hideViolationWarning();
  editingStayId = null;
}

function checkViolation() {
  const fromVal = document.getElementById('from-date').value;
  const toVal = document.getElementById('to-date').value;
  const activePersonBtn = document.querySelector('#person-you.active, #person-partner.active');
  const person = activePersonBtn ? activePersonBtn.dataset.value : 'you';

  if (!fromVal || !toVal || toVal < fromVal) {
    hideViolationWarning();
    return;
  }

  const newStay = { id: '__check__', person, from: new Date(fromVal), to: new Date(toVal), planned: true };
  const existingStays = state.stays.filter(s => s.id !== editingStayId);
  const result = wouldExceedLimit(newStay, existingStays, person);

  if (result.exceeds) {
    document.getElementById('violation-date').textContent = ' on ' + formatDateFull(result.firstViolationDate);
    document.getElementById('violation-warning').classList.remove('hidden');
  } else {
    hideViolationWarning();
  }
}

function hideViolationWarning() {
  document.getElementById('violation-warning').classList.add('hidden');
  document.getElementById('violation-date').textContent = '';
}

// ---------------------------------------------------------------------------
// Toggle Button Wiring
// ---------------------------------------------------------------------------

function setupToggleButtons() {
  ['person-you', 'person-partner'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      setActiveToggle('person', document.getElementById(id).dataset.value);
      checkViolation();
    });
  });
  ['type-past', 'type-planned'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      setActiveToggle('type', document.getElementById(id).dataset.value);
    });
  });
  document.getElementById('from-date').addEventListener('change', checkViolation);
  document.getElementById('to-date').addEventListener('change', checkViolation);
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
// Seed Data
// ---------------------------------------------------------------------------

state.stays = [
  { id: '1', person: 'you', from: new Date(Date.now() - 60*24*60*60*1000), to: new Date(Date.now() - 47*24*60*60*1000), country: 'France', planned: false },
  { id: '2', person: 'you', from: new Date(Date.now() - 30*24*60*60*1000), to: new Date(Date.now() - 21*24*60*60*1000), country: 'Germany', planned: false },
  { id: '3', person: 'you', from: new Date(Date.now() + 10*24*60*60*1000), to: new Date(Date.now() + 24*24*60*60*1000), country: 'Italy', planned: true },
  { id: '4', person: 'partner', from: new Date(Date.now() - 90*24*60*60*1000), to: new Date(Date.now() - 72*24*60*60*1000), country: 'Spain', planned: false },
  { id: '5', person: 'partner', from: new Date(Date.now() - 20*24*60*60*1000), to: new Date(Date.now() - 10*24*60*60*1000), planned: false },
];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

window.addEventListener('resize', renderTimeline);

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('timeline-canvas');
  if (canvas) canvas.addEventListener('click', onCanvasClick);

  document.getElementById('btn-cancel').addEventListener('click', closePopover);
  document.getElementById('popover-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('popover-overlay')) closePopover();
  });

  document.getElementById('stay-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const activePersonBtn = document.querySelector('#person-you.active, #person-partner.active');
    const person = activePersonBtn ? activePersonBtn.dataset.value : 'you';
    const fromVal = document.getElementById('from-date').value;
    const toVal = document.getElementById('to-date').value;
    const country = document.getElementById('country').value.trim() || undefined;
    const activePlannedBtn = document.querySelector('#type-past.active, #type-planned.active');
    const planned = activePlannedBtn ? activePlannedBtn.dataset.value === 'true' : false;

    if (toVal < fromVal) {
      alert('End date must be on or after start date.');
      return;
    }

    if (editingStayId) {
      const idx = state.stays.findIndex(s => s.id === editingStayId);
      if (idx !== -1) {
        state.stays[idx] = { id: editingStayId, person, from: new Date(fromVal), to: new Date(toVal), country, planned };
      }
    } else {
      state.stays.push({ id: Date.now().toString(), person, from: new Date(fromVal), to: new Date(toVal), country, planned });
    }

    closePopover();
    render();
  });

  document.getElementById('btn-add-stay').addEventListener('click', () => openAddPopover(new Date()));

  setupToggleButtons();
  render();
});
