// Editable on-screen layout (positions/sizes of every control), in design units.
// Defaults match the 760x380 design canvas; saved overrides live in layout.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, 'layout.json');

export const DESIGN = { w: 760, h: 380 };

export const DEFAULT_LAYOUT = {
  l2:     { x: 40,  y: 8,   w: 84,  h: 46 },
  l1:     { x: 140, y: 8,   w: 84,  h: 46 },
  r1:     { x: 536, y: 8,   w: 84,  h: 46 },
  r2:     { x: 636, y: 8,   w: 84,  h: 46 },
  select: { x: 300, y: 16,  w: 80,  h: 36 },
  start:  { x: 384, y: 16,  w: 80,  h: 36 },
  stickL: { x: 85,  y: 185, w: 130, h: 130 },
  dpad:   { x: 255, y: 175, w: 150, h: 150 },
  face:   { x: 405, y: 145, w: 150, h: 150 },
  stickR: { x: 590, y: 230, w: 120, h: 120 },
};

let layout = { ...DEFAULT_LAYOUT };

export function loadLayout() {
  try {
    if (fs.existsSync(FILE)) {
      const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      layout = { ...DEFAULT_LAYOUT, ...data };
    }
  } catch {
    console.warn('[layout] could not read layout.json — using defaults');
  }
  return layout;
}

export function getLayout() {
  return { ...layout };
}

export function setLayout(next) {
  const merged = {};
  for (const id of Object.keys(DEFAULT_LAYOUT)) {
    merged[id] = next && next[id] ? next[id] : layout[id];
  }
  layout = merged;
  save();
  return layout;
}

export function resetLayout() {
  layout = { ...DEFAULT_LAYOUT };
  try {
    fs.unlinkSync(FILE);
  } catch {
    /* no file */
  }
  return layout;
}

function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(layout, null, 2));
  } catch (e) {
    console.warn('[layout] save failed:', e.message);
  }
}
