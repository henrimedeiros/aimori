// Hinweise auf versteckte Anweisungen (Prompt-Injection) in eingefuegtem Text,
// eingefuegtem HTML und hochgeladenen Textdokumenten (Design-Review KI-Agenten
// 16.10.2026, docs/sicherheit/design-review-ki-agenten.md). Heuristik, kein
// Nachweis: Ergebnis sind nur Zaehler je Art, nie Ausschnitte (Auflage 4).
// Das HTML wird nur als Text zerlegt \u2013 kein DOMParser, kein DOM, keine
// Ressourcen; @import/url() bleiben Text (Auflage 1).
(function (g) {
  'use strict';
  const DLX = g.DLX = g.DLX || {};

  const LIMITS = Object.freeze({ chars: 2000000, ms: 300, bytes: 2 * 1024 * 1024, hiddenMin: 80, charsMin: 3 });
  // Textdokumente, die als Text gelesen werden (Auflage 5): Endung ODER MIME genuegt (strengere Regel).
  const DOC_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|log)$/i;
  const DOC_MIME = /^(text\/[a-z0-9.+-]+|application\/(json|xml|xhtml\+xml|ld\+json))$/i;
  const HTML_DOC = (f) => /\.html?$/i.test(f.name || '') || /html/i.test(f.type || '');
  const isDoc = (f) => !!f && (DOC_EXT.test(f.name || '') || DOC_MIME.test(f.type || ''));

  // --- Unsichtbare Zeichen (Auflage 2: Emoji, Indisch, RTL, BOM, Flaggen ausgenommen) ---
  const RTL = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  const INDIC = /[\u0900-\u0DFF]/;
  const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F]/u;
  const BIDI_SOFT = new Set([0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x2066, 0x2067, 0x2068, 0x2069]);
  const INVISIBLE = new Set([0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
    0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF]);
  const isTag = (c) => c >= 0xE0000 && c <= 0xE007F;

  // Zaehlt unsichtbare Zeichen ausserhalb der legitimen Faelle; tags = Unicode-Tag-Zeichen.
  function invisibleChars(text) {
    const cps = Array.from(text);
    const rtl = RTL.test(text);
    let n = 0, tags = 0;
    for (let i = 0; i < cps.length; i++) {
      const c = cps[i].codePointAt(0);
      if (c === 0x1F3F4) {               // Flaggen-Sequenz: schwarze Fahne + Tags + U+E007F
        let j = i + 1;
        while (j < cps.length && isTag(cps[j].codePointAt(0)) && cps[j].codePointAt(0) !== 0xE007F) j++;
        if (j < cps.length && cps[j].codePointAt(0) === 0xE007F && j > i + 1) { i = j; continue; }
        continue;
      }
      if (isTag(c)) { tags++; continue; }
      if (!INVISIBLE.has(c)) continue;
      if (c === 0xFEFF && i === 0) continue;
      const prev = cps[i - 1] || '', next = cps[i + 1] || '';
      if (c === 0x200D && (EMOJI.test(prev) || EMOJI.test(next) || INDIC.test(prev) || INDIC.test(next))) continue;
      if (c === 0x200C && (INDIC.test(prev) || INDIC.test(next) || RTL.test(prev) || RTL.test(next))) continue;
      if (rtl && BIDI_SOFT.has(c)) continue;
      n++;
    }
    return { n, tags };
  }

  // --- Typische Umgehungs-Saetze, 6 Sprachen (Auflage 3: nur lineare Muster) ---
  const PHRASES = [
    /(?:ignore|disregard|forget|override)\s(?:all\s|any\s|the\s|your\s)?(?:previous|prior|above|earlier|preceding|system)\s(?:instructions|prompts?|directions|rules|messages|guidelines)/u,
    /(?:reveal|print|show|repeat|output|leak)\s(?:your|the)\s(?:system\sprompt|hidden\sinstructions|initial\sinstructions)/u,
    /(?:new|updated|important)\sinstructions\sfor\s(?:the\s)?(?:ai|assistant|llm|model|agent|chatbot)/u,
    /you\sare\snow\s(?:dan|in\sdeveloper\smode|jailbroken|unrestricted|no\slonger\sbound)/u,
    /(?:do\snot|don't|never)\s(?:tell|inform|mention\sto|show)\s(?:the\s)?user/u,
    /ignorier(?:e|en\ssie)?\s(?:alle\s|s[a\u00E4]mtliche\s|die\s)?(?:vorherigen|bisherigen|obigen|vorangegangenen|vorigen)\s(?:anweisungen|instruktionen|befehle|regeln|vorgaben)/u,
    /vergiss\s(?:alle\s|die\s)?(?:vorherigen|bisherigen|obigen)\s(?:anweisungen|instruktionen|regeln)/u,
    /(?:neue|wichtige)\sanweisungen\sf[u\u00FC]r\s(?:die\s|den\s)?(?:ki|assistenten|agenten|modell)/u,
    /(?:sag|sage|erz[a\u00E4]hl)\s(?:es\s)?(?:dem|der)\s(?:benutzer|nutzer|anwender)(?:in)?\snicht/u,
    /ignore[sz]?\s(?:toutes\s)?(?:les\s)?instructions\s(?:pr[e\u00E9]c[e\u00E9]dentes|ci-dessus|ant[e\u00E9]rieures)/u,
    /oublie[sz]?\s(?:toutes\s)?(?:les\s)?instructions\s(?:pr[e\u00E9]c[e\u00E9]dentes|ant[e\u00E9]rieures)/u,
    /(?:ignora|dimentica)\s(?:tutte\s)?(?:le\s)?istruzioni\s(?:precedenti|sopra)/u,
    /(?:ignore|ignora|esque[c\u00E7]a)\s(?:todas\s)?(?:as\s)?instru[c\u00E7][o\u00F5]es\s(?:anteriores|acima)/u,
    /(?:ignora|olvida)\s(?:todas\s)?(?:las\s)?instrucciones\s(?:anteriores|previas)/u,
  ];
  // NFKC, unsichtbare Zeichen raus, klein, Leerraum zusammen (Auflage 3).
  const INVIS_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;
  const normalize = (t) => t.normalize('NFKC').replace(INVIS_RE, '').toLowerCase().replace(/[\s\u00A0]+/g, ' ');
  function phrases(text) {
    const t = normalize(text);
    let n = 0;
    for (const re of PHRASES) {
      const all = new RegExp(re.source, 'gu');
      while (all.exec(t)) { if (++n >= 99) return n; }
    }
    return n;
  }

  // --- Versteckter Text in HTML (Auflage 1: Stile nur aus dem Text) -----------
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const RAW = new Set(['script', 'style', 'template', 'noscript', 'textarea', 'title']);
  const NAMED = { white: [255, 255, 255], black: [0, 0, 0], transparent: [0, 0, 0, 0] };
  function color(v) {
    if (!v) return null;
    v = String(v).trim().toLowerCase();
    if (NAMED[v]) return NAMED[v];
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
    if (m) {
      const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]{1,6})\s*)?\)$/.exec(v);
    if (m) { const c = [+m[1], +m[2], +m[3]]; if (m[4] !== undefined) c.push(+m[4]); return c; }
    return null;
  }
  const near = (a, b) => !!a && !!b && [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= 16);
  const clear = (c) => !!c && c.length === 4 && c[3] === 0;

  function decls(css) {
    const out = {};
    for (const part of String(css).slice(0, 4000).split(';')) {
      const i = part.indexOf(':');
      if (i < 1) continue;
      out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).replace(/!important/i, '').trim().toLowerCase();
    }
    return out;
  }
  // Nur einfache Selektoren: tag, .klasse, #id (Auflage 1); Rest ignoriert.
  function styleRules(css, rules) {
    const re = /([^{}]{1,300})\{([^{}]{0,4000})\}/g;
    let m;
    while ((m = re.exec(css))) {
      const d = decls(m[2]);
      for (const sel of m[1].split(',')) {
        const s = sel.trim().toLowerCase();
        if (/^[.#]?[a-z0-9_-]{1,60}$/.test(s)) rules.set(s, Object.assign(rules.get(s) || {}, d));
      }
    }
  }
  function attrs(src) {
    const out = {};
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let m;
    while ((m = re.exec(src))) out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    return out;
  }
  const px = (v) => { const m = /^(-?[0-9.]{1,8})(px|pt|em|rem|%)?$/.exec(v || ''); return m ? { n: +m[1], u: m[2] || '' } : null; };
  function hiddenBy(d, a, frame) {
    if (a.hidden !== undefined) return true;
    if (d.display === 'none' || d.visibility === 'hidden' || d.visibility === 'collapse') return true;
    if (d.opacity !== undefined && parseFloat(d.opacity) === 0) return true;
    const fs = px(d['font-size']);
    if (fs && fs.n === 0) return true;
    if (fs && (fs.u === 'px' || fs.u === 'pt') && fs.n < 2) return true;
    for (const k of ['left', 'top', 'text-indent', 'margin-left', 'margin-top']) { const p = px(d[k]); if (p && p.u === 'px' && p.n <= -999) return true; }
    if (/rect\(\s*0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?\s*\)/.test(d.clip || '')) return true;
    if (clear(frame.fg)) return true;
    return near(frame.fg, frame.bg);
  }

  // Liefert { chars: sichtbare Zeichen in verstecktem Text, text: versteckter Text (nur im Speicher) }.
  function hiddenHtml(html, deadline) {
    html = String(html).slice(0, LIMITS.chars);
    const rules = new Map();
    const css = /<style\b[^>]*>([^<]*)<\/style\s*>/gi;
    let m;
    while ((m = css.exec(html))) styleRules(m[1], rules);
    const root = { name: '#root', hidden: false, fg: [0, 0, 0], bg: [255, 255, 255] };
    const stack = [root];
    let chars = 0, text = '', raw = null, steps = 0;
    const tok = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]{0,30})((?:[^>"']|"[^"]{0,2000}"|'[^']{0,2000}'){0,4000})>|<|[^<]+/g;
    while ((m = tok.exec(html))) {
      if ((++steps & 255) === 0 && Date.now() > deadline) return null;
      if (m[2]) {
        const name = m[2].toLowerCase();
        if (raw) { if (m[1] && name === raw) raw = null; continue; }
        if (m[1]) {
          const at = stack.map((f) => f.name).lastIndexOf(name);
          if (at > 0) stack.length = at;
          continue;
        }
        if (VOID.has(name) || /\/\s*$/.test(m[3])) continue;
        const a = attrs(m[3]);
        const d = Object.assign({}, rules.get(name) || {});
        for (const c of String(a.class || '').toLowerCase().split(/\s+/)) if (c && rules.has('.' + c)) Object.assign(d, rules.get('.' + c));
        if (a.id && rules.has('#' + a.id.toLowerCase())) Object.assign(d, rules.get('#' + a.id.toLowerCase()));
        Object.assign(d, decls(a.style || ''));
        const top = stack[stack.length - 1];
        const fg = color(d.color) || (name === 'font' && color(a.color)) || top.fg;
        const bgv = d['background-color'] || (d.background && d.background.split(/\s+/)[0]);
        const bgc = color(bgv) || color(a.bgcolor);
        const frame = { name, fg, bg: bgc && !clear(bgc) ? bgc : top.bg };
        frame.hidden = top.hidden || hiddenBy(d, a, frame);
        stack.push(frame);
        if (RAW.has(name)) { raw = name; stack.pop(); }
        continue;
      }
      if (raw || m[0][0] === '<') continue;
      if (!stack[stack.length - 1].hidden) continue;
      const t = m[0].replace(/&[#a-z0-9]{1,10};/gi, ' ');
      chars += t.replace(/\s+/g, '').length;
      if (text.length < 20000) text += ' ' + t;
    }
    return { chars, text };
  }

  // Gesamtpruefung. Ergebnis: { n: Anzahl Arten mit Treffer (0..3), unscannable: Grenze ueberschritten }.
  function check(input, now = Date.now) {
    const deadline = now() + LIMITS.ms;
    const text = String(input.text || '');
    const html = input.html ? String(input.html) : '';
    if (text.length > LIMITS.chars || html.length > LIMITS.chars) return { n: 0, unscannable: true };
    let n = 0, extra = '';
    const inv = invisibleChars(text + (html ? '\n' + html : ''));
    if (inv.tags > 0 || inv.n >= LIMITS.charsMin) n++;
    if (now() > deadline) return { n, unscannable: true };
    if (html) {
      const h = hiddenHtml(html, deadline);
      if (!h) return { n, unscannable: true };
      if (h.chars >= LIMITS.hiddenMin || (h.chars > 0 && phrases(h.text) > 0)) n++;
      extra = h.text;
    }
    if (phrases(text + ' ' + extra) > 0) n++;
    if (now() > deadline) return { n, unscannable: true };
    return { n, unscannable: false };
  }

  DLX.injektion = Object.freeze({ LIMITS, isDoc, HTML_DOC, invisibleChars, phrases, hiddenHtml, check });
})(globalThis);
