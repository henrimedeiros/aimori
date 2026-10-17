// Muster aus dem Gemeinschafts-Katalog (muster/katalog.json, gebuendelt als
// engine/packs-community.js) und aus der Richtlinie customPatterns.
// Nur Daten, kein Code: Regex-Quelle nach statischer Pruefung safeRegex, Validator
// nur per Name aus fester Liste (Design-Review Muster 16.10.2026, Auflagen 3, 5, 8, 10).
// Laedt nichts nach - neue Muster kommen nur mit einem Erweiterungs-Update.
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const A = DLX.algo;

  const MAX_SRC = 300;      // Zeichen Regex-Quelle
  const MAX_Q = 64;         // hoechste Wiederholung {n,m} (Auflage 5)
  const MAX_GROUP_Q = 10;   // Gruppe mit inneren ?-Quantoren hoechstens so oft
  const MAX_COST = 1000;    // Produkt der Wiederholungs-Spielraeume (Backtracking-Grenze)
  const MAX_MATCH = 256;    // laengster moeglicher Treffer
  const MIN_MATCH = 3;      // kuerzester Treffer
  const CATS = ['person', 'finanz', 'sozial', 'gesundheit', 'firma', 'kontakt', 'steuer', 'technik', 'reise', 'id-national'];
  const CLASSES = ['hoch', 'mittel', 'tief'];
  const VALIDATORS = {
    keiner: null,
    luhn: (v) => A.luhn(A.digits(v)),
    mod97: (v) => A.mod97(A.compact(v)),
    ean13: (v) => A.ean13(A.digits(v)),
    iso7064_11_10: (v) => A.iso7064_11_10(A.digits(v)),
  };
  // Nur druckbare Zeichen: keine Steuer-, Format- (Bidi, Nullbreite) oder Zeilentrenner (Auflage 8).
  const TEXT_RE = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u;
  const textOk = (s, max) => typeof s === 'string' && s.length >= 1 && s.length <= max && s.trim() === s && TEXT_RE.test(s);

  // --- statische ReDoS-Pruefung ---------------------------------------------
  // Konservativ: keine Rueckverweise, keine Lookarounds, keine benannten Gruppen,
  // keine unbeschraenkten Quantoren (* + {n,}), {n,m} nur bis 64; Alternation nicht
  // in wiederholten Gruppen; innere variable Quantoren in wiederholten Gruppen nur ?
  // (Gruppe hoechstens 10-mal); das Produkt aller Spielraeume ist begrenzt (deckt auch
  // benachbarte, sich ueberlappende Quantoren ab). Liefert { ok, minLen, maxLen, cost }
  // oder { ok: false, err } (err = fester Code, nie Teile der Quelle).
  function safeRegex(src, flags) {
    if (typeof src !== 'string' || !src || src.length > MAX_SRC) return { ok: false, err: 'length' };
    if (typeof flags !== 'string' || !/^(?:i?u?)$/.test(flags)) return { ok: false, err: 'flags' };
    let i = 0;
    const fail = (err) => { throw { dlxRegex: err }; };
    const ZERO = () => ({ min: 0, max: 0, cost: 1, alt: false, varAny: false, varBig: false, group: false });
    const ONE = () => ({ min: 1, max: 1, cost: 1, alt: false, varAny: false, varBig: false, group: false });

    function alt() {
      const br = [seq()];
      while (src[i] === '|') { i++; br.push(seq()); }
      if (br.length === 1) return br[0];
      return {
        min: Math.min(...br.map((b) => b.min)), max: Math.max(...br.map((b) => b.max)),
        cost: br.reduce((a, b) => a + b.cost, 0), alt: true,
        varAny: br.some((b) => b.varAny), varBig: br.some((b) => b.varBig), group: false,
      };
    }
    function seq() {
      const n = ZERO();
      while (i < src.length && src[i] !== '|' && src[i] !== ')') {
        const a = quant(atom());
        n.min += a.min; n.max += a.max; n.cost *= a.cost;
        n.alt = n.alt || a.alt; n.varAny = n.varAny || a.varAny; n.varBig = n.varBig || a.varBig;
        if (n.cost > MAX_COST) fail('cost');
      }
      return n;
    }
    function cls() {
      i++;
      if (src[i] === '^') i++;
      if (src[i] === ']') fail('class');
      while (i < src.length && src[i] !== ']') {
        if (src[i] === '[') fail('class');
        if (src[i] === '\\') {
          const e = src[i + 1];
          if (e === undefined || /[0-9kpPc]/.test(e)) fail('escape');
          i += 2;
        } else i++;
      }
      if (src[i] !== ']') fail('class');
      i++;
      return ONE();
    }
    function atom() {
      const c = src[i];
      if (c === '(') {
        i++;
        if (src[i] === '?') { if (src[i + 1] === ':') i += 2; else fail('group'); }
        const inner = alt();
        if (src[i] !== ')') fail('paren');
        i++;
        return Object.assign(inner, { group: true });
      }
      if (c === '[') return cls();
      if (c === '\\') {
        const e = src[i + 1];
        if (e === undefined) fail('escape');
        if (/[0-9kpPc]/.test(e)) fail('escape');   // Rueckverweise, Unicode-Eigenschaften, Steuerzeichen
        i += 2;
        if (e === 'b' || e === 'B') return ZERO();
        if (e === 'x') i += 2;
        else if (e === 'u') { if (src[i] === '{') fail('escape'); i += 4; }
        return ONE();
      }
      if (c === '^' || c === '$') { i++; return ZERO(); }
      if ('*+?{}]'.indexOf(c) !== -1) fail('quant');
      i++;
      return ONE();
    }
    function quant(a) {
      const c = src[i];
      let lo, hi;
      if (c === '*' || c === '+') fail('unbounded');
      if (c === '?') { lo = 0; hi = 1; i++; }
      else if (c === '{') {
        const m = /^\{(\d{1,3})(,(\d{1,3})?)?\}/.exec(src.slice(i, i + 10));
        if (!m) fail('quant');
        if (m[2] && m[3] === undefined) fail('unbounded');
        lo = Number(m[1]); hi = m[2] ? Number(m[3]) : lo;
        if (hi < lo || hi > MAX_Q || hi === 0) fail('bound');
        i += m[0].length;
      } else return a;
      if (src[i] === '?') i++;   // lazy
      if (src[i] && '*+?{'.indexOf(src[i]) !== -1) fail('quant');
      if (a.max === 0) fail('quant');
      const variable = hi > lo;
      if (a.group && hi > 1) {
        if (a.alt) fail('alternation');
        if (a.varBig || (a.varAny && hi > MAX_GROUP_Q)) fail('nested');
      }
      let cost = 1;
      for (let k = 0; k < hi; k++) { cost *= a.cost; if (cost > MAX_COST) fail('cost'); }
      cost *= hi - lo + 1;
      if (cost > MAX_COST) fail('cost');
      return {
        min: a.min * lo, max: a.max * hi, cost, alt: a.alt && hi === 1, group: false,
        varAny: a.varAny || variable, varBig: a.varBig || (variable && !(lo === 0 && hi === 1)),
      };
    }

    let r;
    try {
      r = alt();
      if (i !== src.length) fail('paren');
    } catch (e) {
      if (e && e.dlxRegex) return { ok: false, err: e.dlxRegex };
      throw e;
    }
    if (r.max > MAX_MATCH) return { ok: false, err: 'maxlen' };
    if (r.min < MIN_MATCH) return { ok: false, err: 'minlen' };
    try { new RegExp(src, 'g' + flags); } catch (e) { return { ok: false, err: 'syntax' }; }
    return { ok: true, minLen: r.min, maxLen: r.max, cost: r.cost };
  }

  // --- Eintrag -> Detektor ------------------------------------------------------
  // Liest nur Laufzeitfelder (Auflage 7); liefert { d } oder { err } (fester Code).
  function compile(e, prefix) {
    if (!e || typeof e !== 'object') return { err: 'entry' };
    const idRe = new RegExp('^' + prefix + '[a-z0-9_]{2,40}$');
    if (typeof e.id !== 'string' || !idRe.test(e.id)) return { err: 'id' };
    if (CATS.indexOf(e.cat) === -1) return { err: 'cat' };
    const flags = e.flags === undefined ? '' : e.flags;
    const s = safeRegex(e.regex, flags);
    if (!s.ok) return { err: 'regex_' + s.err };
    const ctx = e.ctx === undefined ? [] : e.ctx;
    if (!Array.isArray(ctx) || ctx.length > 20 || !ctx.every((w) => textOk(w, 40))) return { err: 'ctx' };
    const needsCtx = e.needsCtx === undefined ? false : e.needsCtx;
    if (typeof needsCtx !== 'boolean' || (needsCtx && !ctx.length)) return { err: 'needsCtx' };
    const d = { id: e.id, cat: e.cat, re: new RegExp(e.regex, 'g' + flags), maxLen: s.maxLen, ctx: ctx.length ? ctx.slice() : undefined, needsCtx };
    return { d, s };
  }

  // Katalog-Eintrag (Gemeinschaft): Namen de/en, Klasse, Validator; ohne Pruefziffer und
  // ohne ohneKontextSicher nur reines Format -> sicher nur mit Kontextwort (docs/fehlalarme.md).
  function compileCatalog(e) {
    const r = compile(e, 'cm_');
    if (r.err) return r;
    if (!e.name || !textOk(e.name.de, 60) || !textOk(e.name.en, 60)) return { err: 'name' };
    if (CLASSES.indexOf(e.cls) === -1) return { err: 'cls' };
    const vname = e.validator === undefined ? 'keiner' : e.validator;
    if (!Object.hasOwn(VALIDATORS, vname)) return { err: 'validator' };
    const sure = e.ohneKontextSicher === undefined ? false : e.ohneKontextSicher;
    if (typeof sure !== 'boolean') return { err: 'ohneKontextSicher' };
    const d = r.d;
    d.cls = e.cls;
    d.name = { de: e.name.de, en: e.name.en };
    if (VALIDATORS[vname]) d.valid = VALIDATORS[vname];
    else if (!sure && !d.needsCtx) d.fmtOnly = true;
    return { d, s: r.s };
  }

  // Richtlinien-Eintrag (Organisation): Aktion nie schwaecher als warn (Auflage 10),
  // Anzeige nur generisch (i18n org_pattern), kein Admin-Text in der Oberflaeche.
  const ORG_ACTIONS = ['warn', 'redact', 'block'];
  const ORG_KEYS = ['id', 'regex', 'flags', 'category', 'context', 'requireContext', 'action'];
  function compileOrg(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).some((k) => ORG_KEYS.indexOf(k) === -1)) return { err: 'entry' };
    if (e.flags !== undefined && e.flags !== '' && e.flags !== 'i') return { err: 'flags' };
    const action = e.action === undefined ? 'warn' : e.action;
    if (ORG_ACTIONS.indexOf(action) === -1) return { err: 'action' };
    const r = compile({ id: e.id, regex: e.regex, flags: e.flags, cat: e.category === undefined ? 'firma' : e.category, ctx: e.context, needsCtx: e.requireContext }, 'org_');
    if (r.err) return r;
    r.d.act = action;
    r.d.cls = 'hoch';
    r.d.org = true;
    return r;
  }

  // Gebuendelter, signaturgepruefter Katalog -> Paket "community" (fehlerhafte Eintraege
  // werden ausgelassen; die Pruefpipeline laesst sie gar nicht erst in den Katalog).
  function register(catalog) {
    const detectors = [];
    const seen = new Set(Object.values(DLX.packs).flatMap((p) => p.detectors.map((d) => d.id)));
    for (const e of (catalog && Array.isArray(catalog.muster) ? catalog.muster : [])) {
      const r = compileCatalog(e);
      if (r.err || seen.has(r.d.id)) continue;
      seen.add(r.d.id);
      detectors.push(r.d);
    }
    DLX.registerPack({ id: 'community', kind: 'global', version: catalog && catalog.version, detectors });
  }

  // Richtlinie customPatterns: ein ungueltiger Eintrag verwirft das ganze Feld (wie labelNames).
  const MAX_ORG = 50;
  function orgList(list) {
    if (!Array.isArray(list) || list.length > MAX_ORG) return null;
    const out = [];
    const ids = new Set();
    for (const e of list) {
      const r = compileOrg(e);
      if (r.err || ids.has(e.id)) return null;
      ids.add(e.id);
      out.push(e);
    }
    return out;
  }
  // Fuer die Engine: Detektoren einmal je Richtlinien-Aenderung bauen.
  function orgDetectors(list) {
    const ok = orgList(list);
    return ok && ok.length ? ok.map((e) => Object.assign(compileOrg(e).d, { pack: 'org' })) : null;
  }

  DLX.muster = { safeRegex, compileCatalog, compileOrg, register, orgList, orgDetectors, textOk, CATS, CLASSES, VALIDATORS, MAX_ORG, MAX_SRC, MAX_Q };
})(globalThis);
