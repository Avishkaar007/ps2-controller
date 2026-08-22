// Live, editable key bindings.
// Default bindings come from config.js; any saved overrides live in
// server/bindings.json (so they persist across restarts).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYMAP as DEFAULTS } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, 'bindings.json');

// `bindings` is a mutable module-level object so getCode() always reads live state.
let bindings = { ...DEFAULTS };

export function loadBindings() {
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

export function getBindings() {
  return { ...bindings };
}

export function getCode(name) {
  return bindings[name];
}

export function setBinding(button, code) {
  if (!(button in DEFAULTS)) return false;
  bindings[button] = code;
  save();
  return true;
}

export function resetBindings() {
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
    fs.writeFileSync(FILE, JSON.stringify(bindings, null, 2));
  } catch (e) {
    console.warn('[bindings] save failed:', e.message);
  }
}
