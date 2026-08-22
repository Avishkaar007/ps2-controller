// Live, editable key bindings.
// Default bindings come from config.js; any saved overrides live in
// ~/.ps2-remote/bindings.json (so they persist across restarts and work even
// when the app is packaged, since the binary's own directory is read-only).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { KEYMAP: DEFAULTS } = require('./config.js');

const DATA_DIR = path.join(os.homedir(), '.ps2-remote');
const FILE = path.join(DATA_DIR, 'bindings.json');

// `bindings` is a mutable module-level object so getCode() always reads live state.
let bindings = { ...DEFAULTS };

function loadBindings() {
  try {
    if (fs.existsSync(FILE)) {
      const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      bindings = { ...DEFAULTS, ...data };
    }
  } catch {
    console.warn('[bindings] could not read bindings.json — using defaults');
  }
  return bindings;
}

function getBindings() {
  return { ...bindings };
}

function getCode(name) {
  return bindings[name];
}

function setBinding(button, code) {
  if (!(button in DEFAULTS)) return false;
  bindings[button] = code;
  save();
  return true;
}

function resetBindings() {
  bindings = { ...DEFAULTS };
  try {
    fs.unlinkSync(FILE);
  } catch {
    /* file may not exist */
  }
  return bindings;
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(bindings, null, 2));
  } catch (e) {
    console.warn('[bindings] save failed:', e.message);
  }
}

module.exports = { loadBindings, getBindings, getCode, setBinding, resetBindings };
