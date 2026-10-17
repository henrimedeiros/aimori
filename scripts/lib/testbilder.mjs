// Selbst erzeugte Test-Screenshots (nur erfundene bzw. offizielle Testwerte):
// ein kopfloser Edge zeichnet Rechnungs-/Ticket-artige Bilder per Canvas und
// liefert PNG/JPEG/WebP-Bytes. Kein Netz (about:blank, DevTools nur 127.0.0.1),
// eigenes Wegwerf-Profil. Genutzt von scripts/bild-messung.mjs und der E2E.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Zeichnet eine Szene: { w, h, theme: 'hell'|'dunkel', font, size, lines: [text], format, quality, scale }
// Zeilen mit fuehrendem '#' werden als Kopfzeile (fett, Balken) gezeichnet.
export const DRAW = `(s) => {
  const c = document.createElement('canvas');
  const k = s.scale || 1;
  c.width = Math.round(s.w * k); c.height = Math.round(s.h * k);
  const g = c.getContext('2d');
  g.scale(k, k);
  const dark = s.theme === 'dunkel';
  g.fillStyle = dark ? '#1e1f22' : '#ffffff'; g.fillRect(0, 0, s.w, s.h);
  g.fillStyle = dark ? '#2b2d31' : '#f2f4f7'; g.fillRect(0, 0, s.w, 36);
  let y = 60;
  for (const raw of s.lines) {
    const head = raw.startsWith('#');
    const t = head ? raw.slice(1) : raw;
    if (head) { g.fillStyle = dark ? '#383a40' : '#e4e7ec'; g.fillRect(16, y - s.size, s.w - 32, s.size * 1.6); }
    g.fillStyle = dark ? '#e3e5e8' : (s.grau ? '#667085' : '#101828');
    g.font = (head ? 'bold ' : '') + s.size + 'px ' + (s.font || 'Segoe UI');
    g.fillText(t, 24, y);
    y += Math.round(s.size * 1.9);
  }
  const type = s.format === 'jpeg' ? 'image/jpeg' : s.format === 'webp' ? 'image/webp' : 'image/png';
  return c.toDataURL(type, s.quality || 0.9).split(',')[1];
}`;

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const waiting = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
  const call = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { call, close: () => ws.close() };
}

// Startet Edge, rendert alle Szenen, beendet Edge. Rueckgabe: Buffer je Szene.
export async function renderBilder(scenes) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-bilder-'));
  const profile = path.join(tmp, 'profil');
  const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--disable-sync', '--disable-background-networking',
    '--disable-component-update', '--disable-extensions', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const pids = [edge.pid];
  try {
    let port = 0;
    for (let i = 0; i < 80 && !port; i++) {
      try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch (e) { await sleep(250); }
    }
    if (!port) throw new Error('Edge-DevTools nicht erreichbar');
    const base = `http://127.0.0.1:${port}`;
    let page = null;
    for (let i = 0; i < 40 && !page; i++) { page = (await (await fetch(base + '/json/list')).json()).find((t) => t.type === 'page'); if (!page) await sleep(250); }
    const b = await connect((await (await fetch(base + '/json/version')).json()).webSocketDebuggerUrl);
    const info = await b.call('SystemInfo.getProcessInfo');
    for (const p of (info.result && info.result.processInfo) || []) if (p.type === 'browser') pids.push(p.id);
    const c = await connect(page.webSocketDebuggerUrl);
    const out = [];
    for (const s of scenes) {
      const r = await c.call('Runtime.evaluate', { expression: `(${DRAW})(${JSON.stringify(s)})`, returnByValue: true });
      out.push(Buffer.from(r.result.result.value, 'base64'));
    }
    c.close();
    b.call('Browser.close');
    await sleep(800);
    b.close();
    return out;
  } finally {
    for (const pid of pids) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await sleep(300);
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

// Rechnungs-/Ticket-Vorlage mit eingesetzten Zeilen.
export function rechnung(werte, opts = {}) {
  const lines = ['#Rechnung Nr. 2026-0147', 'Musterfirma AG, Beispielstrasse 1, 8000 Zuerich', 'Datum: 14.10.2026   Faellig: 13.11.2026',
    '#Position                         Menge     Betrag', 'Beratung Netzwerk                 3 h      CHF 450.00', 'Lizenz Jahresabo                  1        CHF 120.00',
    ...werte.flatMap((w) => w.split('\n')),'Vielen Dank fuer Ihren Auftrag.'];
  // Breite nach der laengsten Zeile, damit nichts abgeschnitten wird.
  const size = opts.size || 16;
  const longest = Math.max(...lines.map((l) => l.length));
  return Object.assign({ w: Math.max(900, Math.ceil(longest * size * 0.62) + 60), h: 80 + lines.length * Math.round(size * 1.9), size, lines }, opts);
}
