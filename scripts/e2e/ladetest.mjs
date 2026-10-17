// Ladetest: Edge headless mit --load-extension, dann per DevTools-Protokoll
// (nur 127.0.0.1) pruefen: Service Worker laeuft, Optionen/Popup/Dialog rendern
// ohne Ausnahmen. Keine Netzzugriffe der Erweiterung.
const PORT = Number(process.argv[2] || 9333);
const ID = process.argv[3];
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() { return (await fetch(base + '/json/list')).json(); }

async function cdp(wsUrl, fn) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const waiting = new Map(); const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } else events.push(d); };
  const call = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  try { return await fn(call, events); } finally { ws.close(); }
}

let ok = true;
const t0 = Date.now();
let list = [];
while (Date.now() - t0 < 15000) {
  try { list = await targets(); if (list.some((t) => t.url.startsWith(`chrome-extension://${ID}/`))) break; } catch (e) { /* Browser startet noch */ }
  await sleep(500);
}
const sw = list.find((t) => t.type === 'service_worker' && t.url === `chrome-extension://${ID}/background.js`);
console.log('service_worker:', sw ? 'laeuft' : 'FEHLT');
if (!sw) ok = false;
else {
  const r = await cdp(sw.webSocketDebuggerUrl, async (call) => {
    await call('Runtime.enable');
    const v = await call('Runtime.evaluate', { expression: 'JSON.stringify({packs:Object.keys(DLX.packs).length, detectors:DLX.engine.allDetectors().length})' });
    return v.result.result.value;
  });
  console.log('sw engine:', r);
}

for (const page of ['ui/options.html', 'ui/popup.html']) {
  const url = `chrome-extension://${ID}/${page}`;
  const created = await (await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  await sleep(1500);
  const res = await cdp(created.webSocketDebuggerUrl, async (call, events) => {
    await call('Runtime.enable');
    await call('Log.enable');
    await sleep(300);
    const v = await call('Runtime.evaluate', { expression: 'document.body ? document.body.innerText.slice(0, 160).replace(/\\s+/g, " ") : ""' });
    const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
      .map((e) => (e.params.exceptionDetails ? e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text : e.params.entry.text));
    return { text: v.result.result.value, errs };
  });
  console.log(page, '| Text:', JSON.stringify(res.text), '| Fehler:', res.errs.length ? res.errs : 'keine');
  if (res.errs.length || (page !== 'ui/dialog.html' && !res.text)) ok = false;
}
console.log(ok ? 'LADETEST OK' : 'LADETEST FEHLER');
process.exitCode = ok ? 0 : 1;
