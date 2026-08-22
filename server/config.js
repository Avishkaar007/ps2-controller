// Central configuration for the PS2 Remote server.
//
// To change bindings, edit the numbers below. They are macOS "System Events"
// key codes. Replicate the SAME bindings inside PCSX2 (LilyPad / Game Pad
// configuration) so the emulator reacts to these keys.

const PORT = Number(process.env.PORT) || 8080;

// Name of the PCSX2 app as it appears in macOS (used to bring it to front).
// If you run a versioned build, set PCSX2_APP env var, e.g. "PCSX2 1.7.0".
const TARGET_APP = process.env.PCSX2_APP || 'PCSX2';

// How far an analog stick must be pushed (0..1) before it counts as a press.
const AXIS_THRESHOLD = 0.6;

// Buttons that auto-repeat (mash) while held, so a single hold = many taps.
// Comma-separated button names; override with the AUTOFIRE env var.
// Currently Circle, Square, Cross and Triangle mash while held.
const AUTOFIRE = (process.env.AUTOFIRE || 'circle,square,cross,triangle')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// macOS key codes (decimal). Find more at:
// https://developer.apple.com/macosx/technotes/tn/tn2450.html
const KEYMAP = {
  // Face buttons (PCSX2 defaults)
  cross:    40,  // K
  square:   38,  // J
  triangle: 34,  // I
  circle:   37,  // L

  // D-pad (arrow keys)
  dpad_up:    126, // Arrow Up
  dpad_down:  125, // Arrow Down
  dpad_left:  123, // Arrow Left
  dpad_right: 124, // Arrow Right

  // Shoulders
  l1: 12,  // q
  r1: 14,  // e
  l2: 18,  // 1
  r2: 20,  // 3
  l3: 19,  // 2
  r3: 21,  // 4

  // Center
  start:   36,  // Return
  select:  51,  // Backspace

  // Left analog stick -> WASD
  lstick_up:    13, // w
  lstick_down:  1,  // s
  lstick_left:  0,  // a
  lstick_right: 2,  // d

  // Right analog stick -> U M , .  (kept off I/J/K/L so it doesn't clash
  // with the face buttons above, which now use I/J/K/L)
  rstick_up:    32, // u
  rstick_down:  46, // m
  rstick_left:  43, // comma
  rstick_right: 47, // period
};

module.exports = { PORT, TARGET_APP, AXIS_THRESHOLD, AUTOFIRE, KEYMAP };
