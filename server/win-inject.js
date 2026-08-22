// Windows key injection utility for PS2 Remote (UNTESTED on Windows).
//
// The server talks to PCSX2 through keystrokes. On macOS those come from
// AppleScript `System Events`; on Windows we use PowerShell + the Win32
// `SendInput` API with *hardware scan codes*, which is the approach most
// likely to reach games that read raw input rather than normal window
// messages.
//
// This file is intentionally dependency-free (it just shells out to
// `powershell.exe`) and is wired into server/input.js when running on win32.
// The author has no Windows machine, so the mapping below is best-effort and
// needs a real Windows run to confirm. See README "Windows" for status.

const { spawn } = require('node:child_process');

// Maps the macOS key codes used in config.js KEYMAP -> Windows scan codes
// (Set 1 / PS/2 make code, as consumed by SendInput's wScan with
// KEYEVENTF_SCANCODE). Each entry mirrors a KEYMAP line; if you add a binding
// in config.js, add its scan code here too.
//
// Scan codes (hex): A=1E B=30 C=2E D=20 E=12 F=21 G=22 H=23 I=17 J=24 K=25
// L=26 M=32 N=31 O=18 P=19 Q=10 R=13 S=1F T=14 U=16 V=2F W=11 X=2D Y=15 Z=2C
// 1=02 2=03 3=04 4=05 0=0B Return=1C Backspace=0E
// ArrowUp=48 ArrowDown=50 ArrowLeft=4B ArrowRight=4D ,=33 .=34
const MAC_TO_WIN_SCAN = {
  40: 0x25, // K  (cross)
  38: 0x24, // J  (square)
  34: 0x17, // I  (triangle)
  37: 0x26, // L  (circle)

  126: 0x48, // Arrow Up   (dpad_up)
  125: 0x50, // Arrow Down (dpad_down)
  123: 0x4b, // Arrow Left (dpad_left)
  124: 0x4d, // Arrow Right(dpad_right)

  12: 0x10, // Q (l1)
  14: 0x12, // E (r1)
  18: 0x02, // 1 (l2)
  20: 0x04, // 3 (r2)
  19: 0x03, // 2 (l3)
  21: 0x05, // 4 (r3)

  36: 0x1c, // Return  (start)
  51: 0x0e, // Backspace (select)

  13: 0x11, // W (lstick_up)
  1:  0x1f, // S (lstick_down)
  0:  0x1e, // A (lstick_left)
  2:  0x20, // D (lstick_right)

  32: 0x16, // U (rstick_up)
  46: 0x32, // M (rstick_down)
  43: 0x33, // , (rstick_left)
  47: 0x34, // . (rstick_right)
};

// Single-key press/release via SendInput. `next` is called when the process
// has exited (or errored) so callers can chain if they want.
function send(code, down, next) {
  const sc = MAC_TO_WIN_SCAN[code];
  if (sc === undefined) {
    if (next) next();
    return;
  }
  // KEYEVENTF_SCANCODE = 0x0008; KEYEVENTF_KEYUP = 0x0002
  const flags = down ? 0x0008 : (0x0008 | 0x0002);
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinKey {
  [DllImport("user32.dll")]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public KEYBDINPUT ki; public long pad; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags;
    public uint time; public IntPtr dwExtraInfo;
  }
}
"@
$ki = New-Object WinKey+KEYBDINPUT
$ki.wScan = [ushort]("\${env:SCAN}" -as [int])
$ki.dwFlags = [uint32]("\${env:FLAGS}" -as [int])
$inp = New-Object WinKey+INPUT
$inp.type = 1
$inp.ki = $ki
[WinKey]::SendInput(1, @($inp), [System.Runtime.InteropServices.Marshal]::SizeOf($inp)) | Out-Null
`;
  const p = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      stdio: 'ignore',
      env: { ...process.env, SCAN: String(sc), FLAGS: String(flags) },
    }
  );
  const done = () => { if (next) next(); };
  p.on('error', done);
  p.on('close', done);
}

// Best-effort: bring the PCSX2 window (by title substring) to the foreground
// so injected keys land in the emulator.
function focusApp(app = 'PCSX2') {
  const script = `
$sh = New-Object -ComObject WScript.Shell
$sh.AppActivate('${app.replace(/'/g, "''")}') | Out-Null
`;
  try {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: 'ignore',
    });
    p.on('error', () => {});
  } catch {
    /* ignore */
  }
}

function releaseAll(codes = []) {
  for (const c of codes) send(c, false);
}

function initInput() {}
function closeInput() {}

module.exports = { send, focusApp, releaseAll, initInput, closeInput };
