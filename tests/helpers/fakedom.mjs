// Kleines Fake-DOM fuer Content-Script-Tests im vm-Kontext: nur eigener Code,
// keine Abhaengigkeit (Design-Review Live-Hinweis, A11). Kann genau die
// Selektoren der Seitenadapter: Tag, #id, .klasse, [attr], [attr="v"],
// [attr*="v"], Nachfahre (Leerzeichen) und Listen (Komma).

function splitTop(sel, sep) {
  const out = [];
  let depth = 0, quoted = false, cur = '';
  for (const ch of sel) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '[') depth++;
    if (!quoted && ch === ']') depth--;
    const isSep = sep === ' ' ? /\s/.test(ch) : ch === sep;
    if (!quoted && depth === 0 && isSep) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseCompound(s) {
  const c = { tag: null, id: null, cls: [], attrs: [] };
  while (s) {
    let m;
    if ((m = /^#([\w-]+)/.exec(s))) c.id = m[1];
    else if ((m = /^\.([\w-]+)/.exec(s))) c.cls.push(m[1]);
    else if ((m = /^\[([\w-]+)(?:(\*?=)"([^"]*)")?\]/.exec(s))) c.attrs.push([m[1], m[2], m[3]]);
    else if ((m = /^[a-z][\w-]*/i.exec(s))) c.tag = m[0].toUpperCase();
    else if ((m = /^\*/.exec(s))) { /* * = jedes Element (Kontoerkennung) */ }
    else throw new Error('Fake-DOM kann diesen Selektor nicht: ' + s);
    s = s.slice(m[0].length);
  }
  return c;
}

function matchCompound(el, c) {
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  const classes = (el.getAttribute('class') || '').split(/\s+/);
  if (c.cls.some((k) => !classes.includes(k))) return false;
  for (const [name, op, v] of c.attrs) {
    const a = el.getAttribute(name);
    if (a === null) return false;
    if (op === '=' && a !== v) return false;
    if (op === '*=' && !a.includes(v)) return false;
  }
  return true;
}

function matchOne(el, sel) {
  const parts = splitTop(sel, ' ').map(parseCompound);
  if (!matchCompound(el, parts[parts.length - 1])) return false;
  let i = parts.length - 2;
  for (let n = el.parentNode; i >= 0 && n && n.nodeType === 1; n = n.parentNode) if (matchCompound(n, parts[i])) i--;
  return i < 0;
}

class El {
  constructor(doc, tag, attrs = {}) {
    this.ownerDocument = doc;
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs));
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.hidden = false;
    this.value = '';
    this.own = '';
    this.shadow = null;
    this.style = { cssText: '', setProperty(k, v) { this[k] = v; } };
  }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  get type() { return this.getAttribute('type') || (this.tagName === 'BUTTON' ? 'submit' : ''); }
  set type(v) { this.setAttribute('type', v); }
  get isContentEditable() { return this.getAttribute('contenteditable') === 'true'; }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this.own = String(v); }
  get innerText() { return this.textContent; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  append(...nodes) { for (const n of nodes) { n.remove(); n.parentNode = this; this.children.push(n); } }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  get isConnected() {
    let n = this;
    while (n.parentNode || n.host) n = n.parentNode || n.host;
    return n === this.ownerDocument.documentElement;
  }
  matches(sel) { return splitTop(sel, ',').some((s) => matchOne(this, s)); }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(sel)) return n; return null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  getClientRects() { return this.hidden || !this.isConnected ? [] : [{}]; }
  getBoundingClientRect() { return this.rect || { left: 10, top: 300, width: 760, height: 40, right: 770, bottom: 340 }; }
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  click() { this.clicks = (this.clicks || 0) + 1; }
  addEventListener(t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); }
  attachShadow() { const r = new El(this.ownerDocument, '#shadow'); r.nodeType = 11; r.host = this; this.shadow = r; return r; }
  // composedPath() vom Element bis window (durch Shadow Roots hindurch).
  path(win) { const p = []; for (let n = this; n; n = n.parentNode || n.host || null) p.push(n); p.push(win); return p; }
}

export function fakeDom() {
  const doc = {
    activeElement: null,
    inserted: [],
    createElement: (tag) => new El(doc, tag),
    createRange: () => ({ selectNodeContents() {} }),
    // Editor-Eingabe: ersetzt (nach "alles markieren") den ganzen Inhalt.
    execCommand(cmd, ui, text) {
      const el = doc.activeElement;
      if (cmd !== 'insertText' || !el) return false;
      if (el.tagName === 'TEXTAREA') el.value = text; else el.textContent = text;
      doc.inserted.push(text);
      return true;
    },
    visibilityState: 'visible',
    // Textknoten = eigener Text eines Elements (own), in Dokumentreihenfolge.
    createTreeWalker(root) {
      const list = [];
      const walk = (n) => { if (n.own) list.push({ nodeType: 3, data: n.own, parentNode: n, parentElement: n }); n.children.forEach(walk); };
      walk(root);
      let i = 0;
      return { nextNode: () => list[i++] || null };
    },
    querySelectorAll: (sel) => doc.documentElement.querySelectorAll(sel),
    querySelector: (sel) => doc.documentElement.querySelector(sel),
  };
  doc.documentElement = new El(doc, 'html');
  doc.body = new El(doc, 'body');
  doc.documentElement.append(doc.body);
  const el = (tag, attrs, ...kids) => { const n = new El(doc, tag, attrs); n.append(...kids); return n; };

  const win = {
    innerWidth: 1000, innerHeight: 800, listeners: {},
    addEventListener(t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); },
  };
  // Ereignis wie der Browser: Capture-Listener auf window zuerst.
  function fire(type, target, props = {}) {
    const path = target ? target.path(win) : [win];
    const e = Object.assign({
      type, target, isTrusted: true, defaultPrevented: false, stopped: false,
      composedPath: () => path,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      stopPropagation() {},
    }, props);
    for (const fn of win.listeners[type] || []) { fn(e); if (e.stopped) break; }
    return e;
  }
  // Klick auf ein Element im Shadow Root (Listener am Element selbst).
  function clickOn(node, props = {}) {
    const e = Object.assign({ type: 'click', isTrusted: true, composedPath: () => node.path(win), preventDefault() {}, stopPropagation() {} }, props);
    for (const fn of node.listeners.click || []) fn(e);
    return e;
  }

  // Zeitgeber von Hand weiterschalten (Entprellung pruefbar).
  let now = 0, seq = 0;
  const timers = new Map();
  const setTimeout = (fn, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn }); return id; };
  const clearTimeout = (id) => { timers.delete(id); };
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  }

  return { doc, win, el, fire, clickOn, advance, setTimeout, clearTimeout };
}
