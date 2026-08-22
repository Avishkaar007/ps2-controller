# PS2 Remote

Use your **phone as a PS2 controller** for **PCSX2** on macOS.

Your Mac runs a small local server that prints a **QR code**, serves a
full-screen **PlayStation-style controller** to your phone, receives input over
WebSocket, and injects it as keystrokes into PCSX2.

> Windows support is planned — `server/input.js` is the only platform-specific
> piece, so a Windows build mainly needs a different key injector there.

## Requirements

- macOS (Apple Silicon or Intel)
- Node.js 18+
- [PCSX2](https://pcsx2.net) running on the Mac, kept as the frontmost window
- Phone (Android or iOS) on the **same Wi-Fi** as the Mac

## Install & run

```bash
npm install
npm start
```

The terminal prints a QR code and two URLs:

| URL                            | Purpose                                  |
| ------------------------------ | ---------------------------------------- |
| `http://<mac-ip>:8080/`       | **Controller** — open on your phone      |
| `http://<mac-ip>:8080/bind`   | **Key bindings** — open on your Mac only |

## Connect your phone

1. Scan the QR code (or open the controller URL).
2. Tap **TAP TO START** — this also requests fullscreen and connects.
3. Play. Keep PCSX2 as the frontmost window.

## macOS permission

Key injection uses AppleScript `System Events`. Grant it once:

**System Settings → Privacy & Security → Accessibility → +** and add the app you
run `node` from (Terminal, iTerm, or your IDE). Without this, keystrokes won't
reach PCSX2. If a firewall blocks incoming connections, allow port `8080`.

## Autofire (hold to mash)

Holding an **autofire-enabled** button repeatedly taps it — handy for mash/QTE
prompts (e.g. God of War "press O"). Enabled by default for **Circle, Square,
Cross, and Triangle**.

It runs server-side and is atomic, so a hold can never get stuck or flood the
OS. To change which buttons mash, edit `AUTOFIRE` in `server/config.js`, or set
the env var:

```bash
AUTOFIRE=circle,square,cross,triangle,l1,r1 npm start
```

The tap rate lives in `server/index.js` (`TAP_HOLD`, `TAP_BATCH`). It is capped
by `osascript` startup (~25 taps/sec); a native injector could go much faster.

## Bindings

Each control maps to a macOS key code. Defaults:

| Button     | Key      | Code | Button     | Key        | Code |
| ---------- | -------- | ---- | ---------- | ---------- | ---- |
| Cross      | K        | 40   | D-pad ↑    | Arrow Up   | 126  |
| Square     | J        | 38   | D-pad ↓    | Arrow Down | 125  |
| Triangle   | I        | 34   | D-pad ←    | Arrow Left | 123  |
| Circle     | L        | 37   | D-pad →    | Arrow Right| 124  |
| L1         | Q        | 12   | R1         | E          | 14   |
| L2         | 1        | 18   | R2         | 3          | 20   |
| L3         | 2        | 19   | R3         | 4          | 21   |
| Start      | Return   | 36   | Select     | Backspace  | 51   |
| Left stick | W/A/S/D  | 13/1/0/2 | Right stick | U/M/,/. | 32/46/43/47 |

Sticks are **digital** (pushed past `AXIS_THRESHOLD` = a press). Change bindings
in `server/config.js` (`KEYMAP`), or live on the `/bind` page (Mac browser): click
**Capture**, press a key, and it's saved to `server/bindings.json`. Replicate the
same keys in **PCSX2 → Settings → Controllers**.

## Configuration

| Env var      | Default  | Purpose                                          |
| ------------ | -------- | ------------------------------------------------- |
| `PORT`       | `8080`   | Server port                                      |
| `PCSX2_APP`  | `PCSX2`  | App name if yours is versioned (e.g. `PCSX2 1.7.0`) |

```bash
PORT=9000 PCSX2_APP="PCSX2 1.7.0" npm start
```

## How it works

```
Phone (controller UI) ──WebSocket──▶ Mac server ──AppleScript──▶ PCSX2
```

- `server/index.js` — HTTP server, WebSocket hub, QR, input dispatch, autofire
- `server/input.js` — macOS key injection (no native modules)
- `server/config.js` — port, app, bindings, autofire set
- `public/` — the controller web app
