// PS2 Remote — binding page. Lets you assign a macOS key code to each control.

// Controls shown on the binding page (in display order).
const BUTTONS = [
  ['cross', 'Cross (X)'],
  ['square', 'Square'],
  ['triangle', 'Triangle'],
  ['circle', 'Circle (O)'],
  ['dpad_up', 'D-Pad Up'],
  ['dpad_down', 'D-Pad Down'],
  ['dpad_left', 'D-Pad Left'],
  ['dpad_right', 'D-Pad Right'],
  ['l1', 'L1'],
  ['l2', 'L2'],
  ['r1', 'R1'],
  ['r2', 'R2'],
  ['l3', 'L3'],
  ['r3', 'R3'],
  ['start', 'Start'],
  ['select', 'Select'],
  ['lstick_up', 'Left Stick Up'],
  ['lstick_down', 'Left Stick Down'],
  ['lstick_left', 'Left Stick Left'],
  ['lstick_right', 'Left Stick Right'],
  ['rstick_up', 'Right Stick Up'],
  ['rstick_down', 'Right Stick Down'],
  ['rstick_left', 'Right Stick Left'],
  ['rstick_right', 'Right Stick Right'],
];

// KeyboardEvent.code -> macOS key code.
const DOM_TO_MAC = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7,
  KeyC: 8, KeyV: 9, KeyB: 11, KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15,
  KeyY: 16, KeyT: 17, Key1: 18, Key2: 19, Key3: 20, Key4: 21, Key6: 22,
  Key5: 23, Equal: 24, Key9: 25, Key7: 26, Minus: 27, Key8: 28, Key0: 29,
  BracketRight: 30, KeyO: 31, KeyU: 32, BracketLeft: 33, KeyI: 34, KeyP: 35,
  Enter: 36, KeyL: 37, KeyJ: 38, KeyK: 39, Semicolon: 40, Quote: 41,
  Backslash: 42, Comma: 43, Slash: 44, KeyN: 45, KeyM: 46, Period: 47,
  Tab: 48, Space: 49, Backquote: 50, Delete: 51, Escape: 53,
  ArrowUp: 126, ArrowDown: 125, ArrowLeft: 123, ArrowRight: 124,
};

// Reverse map for friendly labels: mac code -> "A", "1", "Arrow Up", etc.
const MAC_LABEL = {};
for (const [dom, code] of Object.entries(DOM_TO_MAC)) {
  MAC_LABEL[code] =
    dom
      .replace('Key', '')
      .replace('Digit', '')
      .replace('Arrow', 'Arrow ')
      .replace('BracketLeft', '[')
      .replace('BracketRight', ']')
      .replace('Backslash', '\\')
      .replace('Semicolon', ';')
      .replace('Quote', "'")
      .replace('Backquote', '`')
      .replace('Slash', '/')
      .replace('Comma', ',')
      .replace('Period', '.')
      .replace('Equal', '=')
      .replace('Minus', '-')
      .replace('Enter', 'Return');
}

// Options list for the <select>, sorted by label.
const OPTIONS = Object.entries(DOM_TO_MAC)
  .map(([dom, code]) => ({ code, label: MAC_LABEL[code] || dom }))
  .sort((a, b) => a.label.localeCompare(b.label));

function labelFor(code) {
  if (code === undefined) return '—';
  return MAC_LABEL[code] ? `${MAC_LABEL[code]} (${code})` : `code ${code}`;
}

const rows = document.getElementById('rows');
const msg = document.getElementById('msg');

function flash(text, kind) {
  msg.textContent = text;
  msg.className = kind || '';
  if (text) setTimeout(() => { msg.textContent = ''; msg.className = ''; }, 2500);
}

function buildRows(bindings) {
  rows.innerHTML = '';
  for (const [name, label] of BUTTONS) {
    const code = bindings[name];

    const tr = document.createElement('tr');

    const tdCtrl = document.createElement('td');
    tdCtrl.className = 'control';
    tdCtrl.textContent = label;

    const tdKey = document.createElement('td');
    const keySpan = document.createElement('span');
    keySpan.className = 'key';
    keySpan.textContent = labelFor(code);
    tdKey.appendChild(keySpan);

    const tdCap = document.createElement('td');
    const capBtn = document.createElement('button');
    capBtn.className = 'capture';
    capBtn.textContent = 'Capture';
    tdCap.appendChild(capBtn);

    const tdPick = document.createElement('td');
    const sel = document.createElement('select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '—';
    sel.appendChild(none);
    for (const o of OPTIONS) {
      const opt = document.createElement('option');
      opt.value = o.code;
      opt.textContent = `${o.label} (${o.code})`;
      if (o.code === code) opt.selected = true;
      sel.appendChild(opt);
    }
    tdPick.appendChild(sel);

    tr.append(tdCtrl, tdKey, tdCap, tdPick);
    rows.appendChild(tr);

    // --- Capture flow ---
    let armed = false;
    let captureTimer = null;
    let keyHandler = null;
    const disarm = () => {
      if (captureTimer) clearTimeout(captureTimer);
      captureTimer = null;
      if (keyHandler) window.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
      capBtn.classList.remove('armed');
      capBtn.textContent = 'Capture';
      armed = false;
    };
    const arm = () => {
      if (armed) return;
      armed = true;
      capBtn.classList.add('armed');
      capBtn.textContent = 'Press a key… (5s)';
      keyHandler = (e) => {
        e.preventDefault();
        disarm();
        const mac = DOM_TO_MAC[e.code];
        if (mac === undefined) {
          flash(`"${e.key}" not supported — pick from the list`, 'err');
          return;
        }
        saveBinding(name, mac, keySpan, sel);
      };
      window.addEventListener('keydown', keyHandler, true);
      // Auto-cancel after 5 seconds, returning to the original state.
      captureTimer = setTimeout(() => {
        disarm();
        flash('Capture timed out — try again', 'err');
      }, 5000);
    };
    capBtn.addEventListener('click', arm);

    // --- Select flow ---
    sel.addEventListener('change', () => {
      if (sel.value === '') return;
      saveBinding(name, Number(sel.value), keySpan, sel);
    });
  }
}

function saveBinding(name, code, keySpan, sel) {
  fetch('/api/bindings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ button: name, code }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        keySpan.textContent = labelFor(code);
        sel.value = String(code);
        flash(`Bound ${name} → ${labelFor(code)}`, 'ok');
      } else {
        flash(data.error || 'Save failed', 'err');
      }
    })
    .catch(() => flash('Network error', 'err'));
}

document.getElementById('resetBtn').addEventListener('click', () => {
  fetch('/api/reset', { method: 'POST' })
    .then(() => load())
    .then(() => flash('Reset to defaults', 'ok'))
    .catch(() => flash('Network error', 'err'));
});

function load() {
  return fetch('/api/bindings')
    .then((r) => r.json())
    .then((bindings) => buildRows(bindings));
}

load();
