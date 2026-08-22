// PS2 Remote — phone-side controller.
// Connects to the laptop server over WebSocket and streams button / stick input.
// Positions/sizes come from the server layout (/api/layout).

const statusEl = document.getElementById('status');
const overlay = document.getElementById('overlay');

const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
let ws = null;
let connected = false;
let pending = []; // messages queued while disconnected

// Current scale of the #gamepad (set by fitGamepad). Used to convert stick drag
// pixels into the design coordinate space for the knob.
let scale = 1;

// When true, the controller is in layout-edit mode (drag/resize), so normal
// button/stick input is suppressed.
let editing = false;

let lastStatus = 'Not connected';
let flashTimer = null;

function setStatus(text) {
  lastStatus = text;
  statusEl.textContent = text;
}

// Show a transient message for `ms` (default 3s), then restore the previous
// status (e.g. the connection state) so it doesn't stick forever.
function flashStatus(text, ms = 3000) {
  statusEl.textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    statusEl.textContent = lastStatus;
  }, ms);
}

// ---------- Global client-side error handling ----------
// Catch anything that slips through so the controller never dies silently.
window.addEventListener('error', (e) => {
  console.error('[controller]', e.message);
  setStatus('Error: ' + e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  console.error('[controller]', r && r.message ? r.message : r);
});

// Widgets that can be rearranged in edit mode. SELECT/START stay in the fixed
// top grid, so they are intentionally excluded here.
const EDITABLE = ['l2', 'l1', 'r1', 'r2', 'stickL', 'dpad', 'face', 'stickR'];

const bindUrlEl = document.getElementById('bindUrl');
if (bindUrlEl) bindUrlEl.textContent = location.host + '/bind';
const editUrlEl = document.getElementById('editUrl');
if (editUrlEl) editUrlEl.textContent = location.host + '/edit';

// ---------- Layout ----------
async function applyLayout() {
  try {
    const res = await fetch('/api/layout');
    const layout = await res.json();
    // Only position editable widgets; SELECT/START live in the fixed top grid.
    for (const id of EDITABLE) {
      const geo = layout[id];
      const el = document.getElementById(id);
      if (!el || !geo) continue;
      el.style.left = geo.x + 'px';
      el.style.top = geo.y + 'px';
      el.style.width = geo.w + 'px';
      el.style.height = geo.h + 'px';
    }
  } catch {
    /* fall back to CSS-less default; editing will fix */
  }
}

// Scale the fixed-size gamepad to fit the viewport (no overlaps on any phone).
const DESIGN_W = 760;
const DESIGN_H = 380;
function fitGamepad() {
  const gp = document.getElementById('gamepad');
  if (!gp) return;
  scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
  gp.style.transform = `translate(-50%, 0) scale(${scale})`;
}
window.addEventListener('resize', fitGamepad);
window.addEventListener('orientationchange', fitGamepad);

function connect() {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    connected = true;
    ws.send(JSON.stringify({ t: 'hello', role: 'controller' }));
    pending.forEach((m) => ws.send(m));
    pending = [];
    setStatus('Connected');
  };

  ws.onclose = () => {
    connected = false;
    setStatus('Disconnected — retrying…');
    setTimeout(connect, 1500);
  };

  ws.onerror = () => ws.close();
}

function send(obj) {
  const m = JSON.stringify(obj);
  if (connected && ws && ws.readyState === 1) ws.send(m);
  else pending.push(m);
}

function btn(name, down) {
  send({ t: 'btn', k: name, s: down ? 1 : 0 });
}

// ---------- Buttons ----------
// Each on-screen button is a single key: hold = key down, release = key up.
// The Mac server injects the real key event (robotjs), so no software
// autofire is needed — that avoids flooding the OS with rapid events.
document.querySelectorAll('[data-key]').forEach((el) => {
  const key = el.dataset.key;
  el._down = false;

  function press(down) {
    if (down === el._down) return; // ignore duplicate state
    el._down = down;
    btn(key, down);
  }

  el.addEventListener('pointerdown', (e) => {
    if (editing) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch {}
    el.classList.add('active');
    press(true);
  });

  const release = () => {
    el.classList.remove('active');
    press(false);
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
});

// ---------- Analog sticks ----------
function setupStick(id, axisName) {
  const el = document.getElementById(id);
  const knob = el.querySelector('.knob');
  let activeId = null;

  function move(clientX, clientY) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    // Convert screen px -> design px (knob lives inside the scaled gamepad).
    const lx = dx / scale;
    const ly = dy / scale;
    knob.style.transform = `translate(calc(-50% + ${lx}px), calc(-50% + ${ly}px))`;
    send({
      t: 'axis',
      s: axisName,
      x: +(dx / max).toFixed(3),
      y: +(dy / max).toFixed(3),
    });
  }

  el.addEventListener('pointerdown', (e) => {
    if (editing) return;
    e.preventDefault();
    activeId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch {}
    move(e.clientX, e.clientY);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId === activeId) move(e.clientX, e.clientY);
  });

  const end = (e) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    knob.style.transform = 'translate(-50%, -50%)';
    send({ t: 'axis', s: axisName, x: 0, y: 0 });
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

setupStick('stickL', 'left');
setupStick('stickR', 'right');

// ---------- Start overlay (also triggers fullscreen + landscape) ----------
document.getElementById('startBtn').addEventListener('click', () => {
  overlay.style.display = 'none';

  const el = document.documentElement;
  const fs = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fs) {
    fs.call(el).catch(() => {});
  }

  // Try to force landscape (works on Android Chrome; iOS ignores it, so the
  // rotate prompt above handles that case).
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } catch {
    /* not supported */
  }
updateOrientation();

// ---------- Fullscreen re-entry button ----------
// Shows only when the page is NOT in fullscreen (e.g. after swiping up on
// Android). Hidden automatically when fullscreen is active.
const fsBtn = document.getElementById('fsBtn');

function updateFullscreenBtn() {
  if (!fsBtn) return;
  const fs = document.fullscreenElement || document.webkitFullscreenElement;
  fsBtn.classList.toggle('show', !fs);
}
document.addEventListener('fullscreenchange', updateFullscreenBtn);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

fsBtn.addEventListener('click', () => {
  const el = document.documentElement;
  const fs = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fs) fs.call(el).catch(() => {});
});

updateFullscreenBtn();

  connect();
});

// Release everything if the page is hidden / closed.
window.addEventListener('pagehide', () => {
  if (connected && ws) ws.send(JSON.stringify({ t: 'release' }));
});

// ---------- Orientation: controller is landscape-only ----------
const rotateScreen = document.getElementById('rotateScreen');

function isPortrait() {
  if (screen.orientation && screen.orientation.type) {
    return screen.orientation.type.startsWith('portrait');
  }
  return window.matchMedia('(orientation: portrait)').matches;
}
function updateOrientation() {
  if (!rotateScreen) return;
  if (isPortrait()) rotateScreen.classList.add('show');
  else rotateScreen.classList.remove('show');
}
window.addEventListener('resize', updateOrientation);
if (screen.orientation && screen.orientation.addEventListener) {
  screen.orientation.addEventListener('change', updateOrientation);
} else {
  window.addEventListener('orientationchange', updateOrientation);
}
updateOrientation();

// Init
applyLayout();
fitGamepad();

// ---------- In-page layout editor ----------
const editBtn = document.getElementById('editBtn');
const editLabel = editBtn ? editBtn.querySelector('span') : null;
function setEditLabel(t) {
  if (editLabel) editLabel.textContent = t;
}

function toDesign(clientX, clientY) {
  const r = document.getElementById('gamepad').getBoundingClientRect();
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function currentGeo(el) {
  return {
    x: parseFloat(el.style.left) || 0,
    y: parseFloat(el.style.top) || 0,
    w: parseFloat(el.style.width) || el.offsetWidth,
    h: parseFloat(el.style.height) || el.offsetHeight,
  };
}

function startDrag(e, el) {
  if (e.target.classList && e.target.classList.contains('handle')) return;
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch {}
  const g = currentGeo(el);
  const start = toDesign(e.clientX, e.clientY);
  const ox = g.x, oy = g.y;
  const move = (ev) => {
    try {
      const p = toDesign(ev.clientX, ev.clientY);
      g.x = clamp(ox + (p.x - start.x), 0, 760 - g.w);
      g.y = clamp(oy + (p.y - start.y), 0, 380 - g.h);
      el.style.left = g.x + 'px';
      el.style.top = g.y + 'px';
    } catch (err) {
      console.error('[drag]', err.message);
    }
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

function startResize(e, el) {
  e.preventDefault();
  e.stopPropagation();
  try { el.setPointerCapture(e.pointerId); } catch {}
  const g = currentGeo(el);
  const start = toDesign(e.clientX, e.clientY);
  const ow = g.w, oh = g.h;
  const move = (ev) => {
    try {
      const p = toDesign(ev.clientX, ev.clientY);
      g.w = Math.max(40, clamp(ow + (p.x - start.x), 40, 760 - g.x));
      g.h = Math.max(40, clamp(oh + (p.y - start.y), 40, 380 - g.y));
      el.style.width = g.w + 'px';
      el.style.height = g.h + 'px';
    } catch (err) {
      console.error('[resize]', err.message);
    }
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

function enableEdit() {
  editing = true;
  document.body.classList.add('editing');
  setEditLabel('Done');

  for (const id of EDITABLE) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (!el.querySelector('.handle')) {
      const h = document.createElement('div');
      h.className = 'handle';
      el.appendChild(h);
    }
    el.onpointerdown = (e) => startDrag(e, el);
    const handle = el.querySelector('.handle');
    if (handle) handle.onpointerdown = (e) => startResize(e, el);
  }
}

function saveLayout() {
  const layout = {};
  for (const id of EDITABLE) {
    const el = document.getElementById(id);
    if (!el) continue;
    const g = currentGeo(el);
    layout[id] = { x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h) };
  }
  fetch('/api/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(layout),
  })
    .then((r) => r.json())
    .then((d) => flashStatus(d.ok ? 'Layout saved' : 'Save failed'))
    .catch(() => flashStatus('Save failed'));
}

function disableEdit(save) {
  editing = false;
  document.body.classList.remove('editing');
  setEditLabel('Edit');

  for (const id of EDITABLE) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.onpointerdown = null;
    const h = el.querySelector('.handle');
    if (h) h.remove();
  }

  if (save) saveLayout();
}

// Edit button toggles edit mode on/off (saving when leaving).
editBtn.addEventListener('click', () => {
  if (editing) disableEdit(true);
  else enableEdit();
});
