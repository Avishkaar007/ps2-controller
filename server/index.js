const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execSync } = require('node:child_process');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const { PORT, TARGET_APP, AXIS_THRESHOLD, AUTOFIRE } = require('./config.js');
const {
  loadBindings,
  getBindings,
  getCode,
  setBinding,
  resetBindings,
} = require('./bindings.js');
const {
  loadLayout,
  getLayout,
  setLayout,
  resetLayout,
} = require('./layout.js');
const {
  sendKey,
  focusApp,
  releaseAll,
  initInput,
  closeInput,
  IS_MAC,
} = require('./input.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

loadBindings();
loadLayout();
initInput();

// ---------- HTTP: API + static ----------
function sendJSON(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    });
    res.end(data);
  });
}

const requestHandler = (req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Binding UI page (open on the laptop)
  if (urlPath === '/bind') return serveStatic(res, '/bind.html');

  // Read layout
  if (urlPath === '/api/layout' && req.method === 'GET') {
    return sendJSON(res, getLayout());
  }

  // Update whole layout: { id: {x,y,w,h}, ... }
  if (urlPath === '/api/layout' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const next = JSON.parse(body);
        if (typeof next !== 'object' || next === null) {
          return sendJSON(res, { error: 'bad body' }, 400);
        }
        const saved = setLayout(next);
        console.log('[layout] saved');
        sendJSON(res, { ok: true, layout: saved });
      } catch {
        sendJSON(res, { error: 'invalid json' }, 400);
      }
    });
    return;
  }

  // Reset layout to defaults
  if (urlPath === '/api/layout-reset' && req.method === 'POST') {
    resetLayout();
    console.log('[layout] reset to defaults');
    return sendJSON(res, { ok: true });
  }

  // Read all bindings
  if (urlPath === '/api/bindings' && req.method === 'GET') {
    return sendJSON(res, getBindings());
  }

  // Update one binding: { button, code }
  if (urlPath === '/api/bindings' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { button, code } = JSON.parse(body);
        if (typeof button !== 'string' || typeof code !== 'number') {
          return sendJSON(res, { error: 'bad body' }, 400);
        }
        if (!setBinding(button, code)) {
          return sendJSON(res, { error: 'unknown button' }, 400);
        }
        console.log(`[bindings] ${button} -> key code ${code}`);
        sendJSON(res, { ok: true, button, code });
      } catch {
        sendJSON(res, { error: 'invalid json' }, 400);
      }
    });
    return;
  }

  // Reset to defaults
  if (urlPath === '/api/reset' && req.method === 'POST') {
    resetBindings();
    console.log('[bindings] reset to defaults');
    return sendJSON(res, { ok: true });
  }

  serveStatic(res, urlPath);
};

// ---------- WebSocket + input handling ----------
const server = http.createServer(requestHandler);

const wss = new WebSocketServer({ server });

// WebSocketServer re-emits the http server's 'error'. Swallow EADDRINUSE here
// (the server-level handler prints the friendly message) but catch other errors.
wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') return;
  console.warn('[ws] error:', err.message);
});

let controller = null;
const held = new Set(); // key codes currently held down

// Buttons configured to auto-repeat (mash) while held.
const AUTO = new Set(AUTOFIRE);
// Active autofire loops: button name -> { stop }
const autofireActive = new Map();

// Each "tap" is an atomic key down -> brief hold -> key up, so the key can
// never be left stuck or delivered out of order. To beat the ~50ms cost of
// spawning osascript, we pack several taps into ONE process call; the effective
// tap rate is therefore much higher than one-spawn-per-tap. Tune these if you
// want a different rate: bigger TAP_BATCH = faster, TAP_HOLD = how long the key
// stays down per tap (keep it long enough for the game to register the press).
const TAP_HOLD = 0.012; // seconds the key is held down per tap
const TAP_BATCH = 4;    // taps per osascript call (amortizes spawn overhead)

function tapOnce(code) {
  if (!IS_MAC) return Promise.resolve(); // injection is a no-op off macOS
  let body = '';
  for (let i = 0; i < TAP_BATCH; i++) {
    body += `key down ${code}\ndelay ${TAP_HOLD}\nkey up ${code}\n`;
  }
  const script = `tell application "System Events"\n${body}end tell`;
  return new Promise((resolve) => {
    const p = spawn('osascript', ['-e', script], { stdio: 'ignore' });
    p.on('error', () => resolve());
    p.on('close', () => resolve());
  });
}

async function autofireLoop(button, code, ctrl) {
  while (!ctrl.stop) {
    try {
      await tapOnce(code);
    } catch (err) {
      console.error(`[autofire] tap failed for ${button}:`, err.message);
      await new Promise((r) => setTimeout(r, 50)); // avoid a busy-loop on error
    }
  }
}

function startAutofire(button, code) {
  if (!IS_MAC) return; // nothing to mash off macOS
  const ctrl = { stop: false };
  autofireActive.set(button, ctrl);
  autofireLoop(button, code, ctrl).catch((err) => {
    console.error(`[autofire] ${button} loop error:`, err.message);
  });
}

function stopAutofire(button) {
  const ctrl = autofireActive.get(button);
  if (ctrl) ctrl.stop = true;
  autofireActive.delete(button);
}

function stopAllAutofire() {
  for (const ctrl of autofireActive.values()) ctrl.stop = true;
  autofireActive.clear();
}

function press(keyName, down) {
  const code = getCode(keyName);
  if (code === undefined || code === null) return;

  if (down) {
    if (held.has(code)) return; // already down — ignore duplicate (e.g. stick
    held.add(code);             // streaming the same direction every frame)
    if (AUTO.has(keyName)) {
      startAutofire(keyName, code); // server mashes while held
    } else {
      sendKey(code, true);
    }
  } else {
    if (!held.has(code)) return;
    held.delete(code);
    if (AUTO.has(keyName) && autofireActive.has(keyName)) {
      stopAutofire(keyName); // loop finishes its last tap (ends "up")
    } else {
      sendKey(code, false);
    }
  }
}

function clamp(v) {
  return Math.max(-1, Math.min(1, v));
}

function handleAxis(stick, x, y) {
  const sx = clamp(x);
  const sy = clamp(y);
  const prefix = stick === 'left' ? 'lstick' : 'rstick';
  press(`${prefix}_up`, sy < -AXIS_THRESHOLD);
  press(`${prefix}_down`, sy > AXIS_THRESHOLD);
  press(`${prefix}_left`, sx < -AXIS_THRESHOLD);
  press(`${prefix}_right`, sx > AXIS_THRESHOLD);
}

wss.on('connection', (ws) => {
  ws.on('error', () => {
    /* ignore per-socket errors */
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.t === 'hello' && msg.role === 'controller') {
      stopAllAutofire();
      releaseAll([...held]);
      held.clear();
      controller = ws;
      focusApp();
      console.log('[+] Controller connected — focusing', TARGET_APP);
      return;
    }

    if (ws !== controller) return;

    if (msg.t === 'btn') {
      press(msg.k, !!msg.s);
    } else if (msg.t === 'axis') {
      handleAxis(msg.s, msg.x || 0, msg.y || 0);
    } else if (msg.t === 'release') {
      stopAllAutofire();
      releaseAll([...held]);
      held.clear();
    }
  });

  ws.on('close', () => {
    if (ws === controller) {
      stopAllAutofire();
      releaseAll([...held]);
      held.clear();
      controller = null;
      console.log('[-] Controller disconnected — keys released');
    }
  });
});

// ---------- Local IP + QR ----------
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function shutdown() {
  console.log('\nShutting down — releasing keys');
  stopAllAutofire();
  releaseAll([...held]);
  closeInput();
  removePidFile();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Global safety nets: log instead of crashing. If we're going down, drop the
// PID file so a later `npm start` won't try to kill a dead process.
process.on('uncaughtException', (err) => {
  console.error('[uncaught]', err.message);
  removePidFile();
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.message ? reason.message : reason);
  removePidFile();
});

// Friendly recovery if the port is already taken: auto-advance to the next free
// port instead of crashing. Other errors are still fatal.
let activePort = PORT;
const MAX_PORT = PORT + 20;

// Single-instance guard: a previous run that didn't shut down cleanly (crash,
// force-quit, etc.) can keep the port occupied, which made new `npm start`
// invocations collide and re-print the banner. We record our PID and, on
// startup, terminate any stale instance still holding the port so it frees up.
const PID_FILE = path.join(__dirname, '..', '.server.pid');

function removePidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* already gone */
  }
}

function killStaleInstance() {
  try {
    if (!fs.existsSync(PID_FILE)) return;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!Number.isNaN(pid) && pid !== process.pid) {
      try {
        process.kill(pid, 0); // throws if the process is not alive
        console.log(`[init] Stopping stale server (pid ${pid})…`);
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* ignore */
  }
  removePidFile();
}

// Render a URL as a terminal hyperlink (OSC 8) so it is clickable in iTerm2 /
// VSCode / mintty. Terminals that don't support it just show the plain URL.
function link(u) {
  return `\u001b]8;;${u}\u0007${u}\u001b]8;;\u0007`;
}

function startServer() {
  server.listen(activePort, '0.0.0.0');
}

// Banner handlers are attached exactly once. Attaching them inside the retry
// loop would stack a new 'listening' listener on every failed attempt, so the
// text + QR would print multiple times when the port has to advance.
server.on('listening', () => {
  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch {
    /* ignore */
  }

  const ip = getLocalIP();
  const base = `http://${ip}:${activePort}`;
  const controllerUrl = base + '/';
  const bindUrl = base + '/bind';

  if (activePort !== PORT) {
    console.log(`(Port ${PORT} was busy — using ${activePort} instead.)\n`);
  }

  console.log('\n=================================================');
  console.log('  PS2 Remote server');
  console.log('-------------------------------------------------');
  console.log('  Connect phone (controller) : ' + link(controllerUrl));
  console.log('  Map keys on laptop (/bind) : ' + link(bindUrl));
  console.log('=================================================\n');

  const printQR = (label, u) => {
    QRCode.toString(u, { type: 'terminal', small: true }, (err, qr) => {
      if (!err) {
        console.log(label);
        console.log(qr);
        console.log('');
      }
    });
  };

  printQR('Scan to CONNECT phone controller:', controllerUrl);

  console.log('On your laptop, open ' + link(bindUrl) + ' to map keys.');
  console.log('On the phone controller, tap Edit to rearrange buttons.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && activePort < MAX_PORT) {
    console.warn(`Port ${activePort} busy — trying ${activePort + 1}…`);
    activePort += 1;
    startServer();
  } else {
    console.error('\n✖ Server error:', err.message);
    process.exit(1);
  }
});

// Terminate any stale instance left from a previous run, then wait briefly so
// the OS releases the port before we bind to it.
killStaleInstance();
setTimeout(startServer, 600);
