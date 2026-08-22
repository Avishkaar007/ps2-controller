// macOS key injection via AppleScript `System Events` (the original approach).
//
// Buttons arrive as macOS virtual key codes (the numbers in config.js KEYMAP).
// Each press/release spawns a short `osascript` that does `key down <code>` /
// `key up <code>`. Simple and reliable for normal play — the joystick sends a
// direction once and the server ignores duplicates, so keys are not repeated.

const { spawn } = require('node:child_process');
const { TARGET_APP } = require('./config.js');

const APP = process.env.PCSX2_APP || TARGET_APP;

// True only on macOS, where AppleScript `System Events` key injection works.
// On other platforms injection is a safe no-op (the Windows/Linux versions
// need their own injector) so the server still runs for UI / testing.
const IS_MAC = process.platform === 'darwin';

let warned = false;
function warnOnce(msg) {
  if (!warned) {
    console.warn(msg);
    warned = true;
  }
}

// Bring PCSX2 (or the configured app) to the front so injected keys land there.
function focusApp(app = APP) {
  if (!IS_MAC) return;
  try {
    spawn('osascript', ['-e', `tell application "${app}" to activate`], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

function sendKey(code, down) {
  if (!IS_MAC) {
    warnOnce(
      '[input] Key injection is not supported on this platform yet ' +
        '(Windows/Linux). Keys are ignored — add a platform injector to enable them.'
    );
    return;
  }
  if (code === undefined || code === null) return;
  const verb = down ? 'down' : 'up';
  try {
    spawn(
      'osascript',
      ['-e', `tell application "System Events"\nkey ${verb} ${code}\nend tell`],
      { stdio: 'ignore' }
    );
  } catch {
    /* ignore */
  }
}

function releaseAll(codes = []) {
  for (const c of codes) sendKey(c, false);
}

function initInput() {}
function closeInput() {}

module.exports = { IS_MAC, focusApp, sendKey, releaseAll, initInput, closeInput };
