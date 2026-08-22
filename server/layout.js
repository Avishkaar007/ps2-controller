// Editable on-screen layout (positions/sizes of every control), in design units.
// Defaults match the 760x380 design canvas; saved overrides live in
// ~/.ps2-remote/layout.json (writable even when packaged).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = path.join(os.homedir(), '.ps2-remote');
const FILE = path.join(DATA_DIR, 'layout.json');

const DESIGN = { w: 760, h: 380 };

const DEFAULT_LAYOUT = {
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

function loadLayout() {
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

function getLayout() {
  return { ...layout };
}

function setLayout(next) {
  const merged = {};
  for (const id of Object.keys(DEFAULT_LAYOUT)) {
    merged[id] = next && next[id] ? next[id] : layout[id];
  }
  layout = merged;
  save();
  return layout;
}

function resetLayout() {
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
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(layout, null, 2));
  } catch (e) {
    console.warn('[layout] save failed:', e.message);
  }
}

module.exports = { DESIGN, loadLayout, getLayout, setLayout, resetLayout };
