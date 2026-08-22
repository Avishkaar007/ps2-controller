// Platform key injection. macOS uses AppleScript `System Events`; Windows uses
// the PowerShell + SendInput utility in win-inject.js. Other platforms are a
// safe no-op so the server still runs for UI / testing.
//
// Buttons arrive as macOS virtual key codes (the numbers in config.js KEYMAP).
// Each press/release spawns a short external process that does the injection.
// Simple and reliable for normal play — the joystick sends a direction once and
// the server ignores duplicates, so keys are not repeated.

const { spawn } = require('node:child_process');
const { TARGET_APP } = require('./config.js');

const APP = process.env.PCSX2_APP || TARGET_APP;

// True only on macOS, where AppleScript `System Events` key injection works.
const IS_MAC = process.platform === 'darwin';
// True on Windows, where we shell out to the SendInput utility below.
const IS_WIN = process.platform === 'win32';

// Lazily load the Windows injector so this file never fails to require on
// macOS / Linux (the file itself is harmless, but we don't need it there).
let win = null;
if (IS_WIN) {
  try {
    win = require('./win-inject.js');
  } catch {
    win = null;
  }
}

let warned = false;
function warnOnce(msg) {
  if (!warned) {
    console.warn(msg);
    warned = true;
  }
}

// Bring PCSX2 (or the configured app) to the front so injected keys land there.
function focusApp(app = APP) {
  if (IS_MAC) {
    try {
      spawn('osascript', ['-e', `tell application "${app}" to activate`], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    return;
  }
  if (IS_WIN && win) {
    win.focusApp(app);
    return;
  }
}

function sendKey(code, down) {
  if (IS_MAC) {
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
    return;
  }

  if (IS_WIN && win) {
    win.send(code, down);
    return;
  }

  if (code === undefined || code === null) return;
  warnOnce(
    '[input] Key injection is not supported on this platform yet ' +
      '(Windows/Linux). Keys are ignored — add a platform injector to enable them.'
  );
}

function releaseAll(codes = []) {
  if (IS_WIN && win) {
    win.releaseAll(codes);
    return;
  }
  for (const c of codes) sendKey(c, false);
}

function initInput() {
  if (IS_WIN && win && win.initInput) win.initInput();
}
function closeInput() {
  if (IS_WIN && win && win.closeInput) win.closeInput();
}

module.exports = { IS_MAC, IS_WIN, focusApp, sendKey, releaseAll, initInput, closeInput };
