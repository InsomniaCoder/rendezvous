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
// Schengen Country List
// ---------------------------------------------------------------------------

const SCHENGEN_COUNTRIES = [
  'Austria', 'Belgium', 'Croatia', 'Czech Republic', 'Denmark', 'Estonia',
  'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Italy',
  'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands',
  'Norway', 'Poland', 'Portugal', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
  'Switzerland'
];

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
    const total = state.stays
      .filter(s => s.person === person)
      .reduce((sum, s) => sum + diffDays(s.to, s.from) + 1, 0);

    card.querySelector('.days-used').textContent = used + ' / 90 days';
    card.querySelector('.days-remaining').textContent = remaining + ' days remaining';
    card.querySelector('.days-total').textContent = total + ' days total across all stays';
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

let clickZones = [];
let _rangeStart = null;
let _totalDays = 0;
let _canvas = null;

function renderTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;
  _canvas = canvas;

  // --- DPI fix: scale canvas backing store to devicePixelRatio ---
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.offsetWidth;
  const cssHeight = CANVAS_HEIGHT;

  // Set the CSS display size once (keeps layout stable)
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';

  // Set the actual pixel buffer at physical resolution
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  const ctx = canvas.getContext('2d');
  // Scale all drawing operations so 1 unit == 1 CSS pixel
  ctx.scale(dpr, dpr);

  const today = startOfDay(state.today);

  const rangeStart = startOfDay(subMonths(today, 6));
  const rangeEnd = startOfDay(addMonths(today, 3));
  const totalDays = diffDays(rangeEnd, rangeStart);

  _rangeStart = rangeStart;
  _totalDays = totalDays;

  // All drawing coordinates are in CSS pixels from here on
  const W = cssWidth;
  const H = cssHeight;
  const drawableWidth = W - LEFT_MARGIN;

  function dateToX(date) {
    const days = diffDays(startOfDay(date), rangeStart);
    return LEFT_MARGIN + (days / totalDays) * drawableWidth;
  }

  const dayWidth = drawableWidth / totalDays;
  clickZones = [];

  // 1. Background — alternate row colours for the two person rows
  ctx.fillStyle = '#f5f7fa';
  ctx.fillRect(0, 0, W, H);

  // "You" row — slightly lighter
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(0, LABEL_HEIGHT, W, ROW_HEIGHT);

  // "Partner" row — slightly tinted
  ctx.fillStyle = 'rgba(233, 30, 99, 0.04)';
  ctx.fillRect(0, LABEL_HEIGHT + ROW_HEIGHT, W, ROW_HEIGHT);

  // 2. 180-day window: yellow fill + a distinct top border line
  const windowStart = addDays(today, -179);
  const wxStart = dateToX(windowStart);
  const wxEnd = dateToX(today);

  ctx.fillStyle = 'rgba(255, 235, 59, 0.18)';
  ctx.fillRect(wxStart, 0, wxEnd - wxStart, H);

  // Top accent line for the window bracket
  ctx.strokeStyle = 'rgba(245, 195, 0, 0.70)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wxStart, 1);
  ctx.lineTo(wxEnd, 1);
  ctx.stroke();

  // Left and right edge ticks for the bracket
  ctx.strokeStyle = 'rgba(245, 195, 0, 0.55)';
  ctx.lineWidth = 1.5;
  [wxStart, wxEnd].forEach(x => {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 6);
    ctx.stroke();
  });

  // 3. Row separator lines
  // Between label area and first row
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT_MARGIN, LABEL_HEIGHT);
  ctx.lineTo(W, LABEL_HEIGHT);
  ctx.stroke();

  // Between the two person rows
  ctx.beginPath();
  ctx.moveTo(0, LABEL_HEIGHT + ROW_HEIGHT);
  ctx.lineTo(W, LABEL_HEIGHT + ROW_HEIGHT);
  ctx.stroke();

  // Bottom of last row
  ctx.beginPath();
  ctx.moveTo(0, LABEL_HEIGHT + ROW_HEIGHT * 2);
  ctx.lineTo(W, LABEL_HEIGHT + ROW_HEIGHT * 2);
  ctx.stroke();

  // 4. Month labels with tick marks
  ctx.font = '11px Inter, system-ui, sans-serif';
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
      ctx.fillText(formatDate(labelDate), x + 3, 3);

      // Tick mark at bottom of label area
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, LABEL_HEIGHT - 4);
      ctx.lineTo(x, LABEL_HEIGHT);
      ctx.stroke();
    }
    labelDate = new Date(labelDate);
    labelDate.setUTCMonth(labelDate.getUTCMonth() + 1);
  }

  // 5. Person row labels
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = COLOR_YOU;
  ctx.fillText('You', 4, LABEL_HEIGHT + ROW_HEIGHT / 2);
  ctx.fillStyle = COLOR_PARTNER;
  ctx.fillText('Partner', 2, LABEL_HEIGHT + ROW_HEIGHT + ROW_HEIGHT / 2);

  // 6. Stay bars
  for (const stay of state.stays) {
    const isYou = stay.person === 'you';
    const color = isYou ? COLOR_YOU : COLOR_PARTNER;
    const x1 = dateToX(stay.from);
    const x2 = dateToX(stay.to) + dayWidth;
    const clippedX1 = Math.max(LEFT_MARGIN, x1);
    const clippedX2 = Math.min(W, x2);
    if (clippedX2 <= clippedX1) continue;

    const barY = LABEL_HEIGHT + (isYou ? 0 : ROW_HEIGHT) + ROW_PADDING;

    ctx.fillStyle = color;
    ctx.fillRect(clippedX1, barY, clippedX2 - clippedX1, BAR_HEIGHT);

    // Subtle border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(clippedX1 + 0.5, barY + 0.5, clippedX2 - clippedX1 - 1, BAR_HEIGHT - 1);

    clickZones.push({ stay, x1: clippedX1, x2: clippedX2, yTop: barY, yBottom: barY + BAR_HEIGHT });
  }

  // 7. Today line — full-opacity red, slightly thicker, with a label above
  const todayX = dateToX(today);

  // "Today" label above the line
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#f44336';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText('Today', todayX, 2);
  ctx.textAlign = 'left'; // reset

  ctx.strokeStyle = '#f44336';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(todayX, LABEL_HEIGHT);
  ctx.lineTo(todayX, H);
  ctx.stroke();
}

function dateFromX(x) {
  if (!_canvas || _totalDays === 0) return null;
  // Use CSS pixel width (offsetWidth) so coordinate math stays in logical pixels
  const cssWidth = _canvas.offsetWidth;
  const days = Math.round((x - LEFT_MARGIN) / (cssWidth - LEFT_MARGIN) * _totalDays);
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

  const totalTogether = state.stays.reduce((sum, s) => sum + diffDays(s.to, s.from) + 1, 0);
  const togetherEl = document.getElementById('time-together');
  if (togetherEl) togetherEl.textContent = totalTogether > 0 ? totalTogether + 'd together · ' : '';

  if (state.stays.length === 0) {
    container.innerHTML = '<p class="stay-empty">No stays added yet.</p>';
    return;
  }

  const sorted = [...state.stays].sort((a, b) => a.from - b.from);

  container.innerHTML = sorted.map(stay => {
    const dotClass = stay.person === 'you' ? 'you' : 'partner';
    const duration = diffDays(stay.to, stay.from) + 1;
    const dates = formatDateShort(stay.from) + ' – ' + formatDateShort(stay.to);
    const countryBadge = stay.country ? `<span class="badge badge-country">${escapeHtml(stay.country)}</span>` : '';
    return `
      <div class="stay-entry">
        <span class="stay-dot ${dotClass}"></span>
        <span class="stay-dates">${dates}</span>
        <span class="stay-duration">${duration}d</span>
        ${countryBadge}
        <button class="btn-delete" data-id="${stay.id}">✕</button>
      </div>`;
  }).join('');

  container.querySelectorAll('.stay-entry').forEach(row => {
    row.addEventListener('click', () => {
      const stay = state.stays.find(s => s.id === row.querySelector('.btn-delete').dataset.id);
      if (stay) openEditPopover(stay);
    });
  });

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
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
    : [];
  btns.forEach(b => b && b.classList.toggle('active', b.dataset.value === value));
}

function openAddPopover(date) {
  document.getElementById('popover-title').textContent = 'Add Stay';
  const dateStr = toDateInputValue(date);
  document.getElementById('from-date').value = dateStr;
  document.getElementById('to-date').value = dateStr;
  document.getElementById('country').value = '';
  setActiveToggle('person', 'you');
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
  function syncToDate() {
    const fromVal = document.getElementById('from-date').value;
    const toInput = document.getElementById('to-date');
    if (fromVal && (!toInput.value || toInput.value < fromVal)) {
      toInput.value = fromVal;
    }
    checkViolation();
  }
  document.getElementById('from-date').addEventListener('change', syncToDate);
  document.getElementById('from-date').addEventListener('input', syncToDate);
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
// Init
// ---------------------------------------------------------------------------

window.addEventListener('resize', renderTimeline);

document.addEventListener('DOMContentLoaded', () => {
  state.stays = [
    { id: '1', person: 'you',     from: new Date('2026-04-21'), to: new Date('2026-05-02') },
    { id: '2', person: 'you',     from: new Date('2026-05-09'), to: new Date('2026-05-21') },
    { id: '3', person: 'you',     from: new Date('2026-08-01'), to: new Date('2026-08-16') },
    { id: '4', person: 'partner', from: new Date('2026-07-04'), to: new Date('2026-07-12') },
    { id: '5', person: 'partner', from: new Date('2026-09-04'), to: new Date('2026-09-12') },
    { id: '6', person: 'partner', from: new Date('2026-10-04'), to: new Date('2026-10-12') },
  ];

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

    if (toVal < fromVal) {
      alert('End date must be on or after start date.');
      return;
    }

    if (editingStayId) {
      const idx = state.stays.findIndex(s => s.id === editingStayId);
      if (idx !== -1) {
        state.stays[idx] = { id: editingStayId, person, from: new Date(fromVal), to: new Date(toVal), country };
      }
    } else {
      state.stays.push({ id: Date.now().toString(), person, from: new Date(fromVal), to: new Date(toVal), country });
    }

    state.stays.sort((a, b) => a.from - b.from);

    closePopover();
    render();
  });

  document.getElementById('btn-add-stay').addEventListener('click', () => openAddPopover(state.today));

  const simulateDateInput = document.getElementById('simulate-date');
  const simulateClearBtn = document.getElementById('simulate-clear');

  simulateDateInput.value = toDateInputValue(state.today);

  simulateDateInput.addEventListener('change', () => {
    if (simulateDateInput.value) {
      state.today = startOfDay(new Date(simulateDateInput.value));
    } else {
      state.today = new Date();
      simulateDateInput.value = toDateInputValue(state.today);
    }
    render();
  });

  simulateClearBtn.addEventListener('click', () => {
    state.today = new Date();
    simulateDateInput.value = toDateInputValue(state.today);
    render();
  });

  setupCountryCombobox();
  setupToggleButtons();
  render();
});

// ---------------------------------------------------------------------------
// Country Combobox
// ---------------------------------------------------------------------------

function setupCountryCombobox() {
  const input = document.getElementById('country');
  const dropdown = document.getElementById('country-dropdown');

  function showSuggestions(query) {
    const q = query.trim().toLowerCase();
    const matches = q
      ? SCHENGEN_COUNTRIES.filter(c => c.toLowerCase().includes(q))
      : SCHENGEN_COUNTRIES;

    if (matches.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    dropdown.innerHTML = matches.map(c =>
      `<li data-value="${c}">${c}</li>`
    ).join('');
    dropdown.classList.remove('hidden');
  }

  function closeDropdown() {
    dropdown.classList.add('hidden');
  }

  input.addEventListener('focus', () => showSuggestions(input.value));
  input.addEventListener('input', () => showSuggestions(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  dropdown.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault(); // prevent input blur before click registers
    input.value = li.dataset.value;
    closeDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!input.closest('.country-combobox').contains(e.target)) closeDropdown();
  });
}
