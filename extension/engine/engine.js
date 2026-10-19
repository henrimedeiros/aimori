// Erkennungs-Engine: Vorfilter (Regex) -> Validator (Pruefziffer) -> Kontext.
// Alles synchron und lokal; Zeitbudget je Pruefung (Auflage B13).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const A = DLX.algo;

  const MAX_LEN = 200000;
  const BUDGET_MS = 150;
  const ACTIONS = ['off', 'warn', 'redact', 'block'];
  const RANK = { off: 0, warn: 1, redact: 2, block: 3 };
  const now = () => (g.performance && g.performance.now ? g.performance.now() : Date.now());

  function allDetectors() {
    const out = [];
    for (const p of Object.values(DLX.packs)) out.push(...p.detectors);
    return out;
  }
  // id -> Detektor, einmal je Pruefung gebaut und danach verworfen (nie veraltet); bei
  // doppelter ID gewinnt wie bei find() der erste Eintrag. Spart je Detektor einen
  // Durchlauf ueber alle Detektoren (Design-Review Datei-Pruefung schneller 19.10.2026, Auflage 4).
  function detectorMap() {
    const m = new Map();
    for (const p of Object.values(DLX.packs)) for (const d of p.detectors) if (!m.has(d.id)) m.set(d.id, d);
    return m;
  }

  function defaultAction(d) {
    if (d.act) return d.act;   // z. B. doc_identity: block (Design-Review Code und Bilder, Antwort Default)
    return d.cls === 'tief' ? 'off' : 'warn';
  }

  function actionFor(id, cfg, byId) {
    const r = cfg && cfg.rules && cfg.rules[id];
    if (r && RANK[r] !== undefined) return r;
    if (id === 'dictionary' || id === 'custom_term' || id === 'internal_link') return 'warn';
    const d = byId ? byId.get(id) : allDetectors().find((x) => x.id === id);
    return d ? defaultAction(d) : 'warn';
  }

  // --- Stufen sicher/unsicher (docs/fehlalarme.md, Design-Review Auflagen 2-5) ---
  // Nur Format, keine Pruefziffer: Telefon (weak) und IPv4 (fmtOnly).
  const fmtOnly = (d) => !!(d.weak || d.fmtOnly);
  const isDigit = (c) => c >= '0' && c <= '9';
  const SEQ_SEP = '.,:/-';
  const TOKEN = /[0-9A-Za-z-]/;

  // Offensichtlicher Nicht-Kontext; liest nur ein kleines Fenster je Fund
  // (linear, Auflage 5). Ergebnis: 'seq' | 'hex' | 'path' | 'query' | 'ver' | null.
  function around(text, start, end, value) {
    const prev = text[start - 1] || '', next = text[end] || '';
    // Teil einer laengeren Ziffernfolge (Dezimalzahl, Version, Pfad, UUID-Gruppen).
    if ((SEQ_SEP.indexOf(prev) !== -1 && prev && isDigit(text[start - 2] || '')) ||
      (SEQ_SEP.indexOf(next) !== -1 && next && isDigit(text[end + 1] || ''))) return 'seq';
    // Gruppierter Wert inmitten weiterer Zifferngruppen; eine einzelne Folgegruppe
    // mit 3-4 Ziffern (CVV) oder MM/YY gehoert dazu (Auflage 3).
    if (value.indexOf(' ') !== -1) {
      if (prev === ' ' && isDigit(text[start - 2] || '')) return 'seq';
      const after = text.slice(end, end + 16);
      if (/^ \d/.test(after) && !/^ \d{3,4}(?![\d /.-])/.test(after) && !/^ \d{2}\/\d{2}(?!\d)/.test(after)) return 'seq';
    }
    // Hex-Hash/UUID: Token ueber den Fund hinaus aus Hex-Zeichen mit Buchstabe a-f.
    let s = start, e = end;
    while (s > 0 && start - s < 100 && TOKEN.test(text[s - 1])) s--;
    while (e < text.length && e - end < 100 && TOKEN.test(text[e])) e++;
    if ((s < start || e > end) && e - s >= 16) {
      const tok = text.slice(s, e);
      if (/^[0-9a-f-]+$/i.test(tok) && /[a-f]/i.test(tok) && /\d/.test(tok)) return 'hex';
    }
    // URL-Token: Pfadsegment oder Query/Fragment.
    let w = start;
    while (w > 0 && start - w < 300 && !/[\s"'<>()]/.test(text[w - 1])) w--;
    const url = /^https?:\/\/[^/?#]*/i.exec(text.slice(w, start));
    if (url) {
      const rest = text.slice(w + url[0].length, start);
      if (/[?#]/.test(rest)) return 'query';
      if (rest) return 'path';
    }
    if (/(?:^|[^A-Za-z])v$|version ?$|build ?$/i.test(text.slice(Math.max(0, start - 9), start))) return 'ver';
    return null;
  }

  // Muster aus Katalog und Richtlinie (engine/muster.js, d.maxLen gesetzt): der Text wird in
  // Fenstern von STEP Zeichen (plus laengstem Treffer und je einem Randzeichen fuer /^/$)
  // geprueft und das Zeitbudget zwischen den Fenstern geprueft - ein JS-RegExp laesst sich
  // nicht abbrechen (Design-Review Muster, Auflage 6). Gleiche Treffer wie auf dem ganzen Text.
  const STEP = 2048;
  function windows(d, src, deadline, t) {
    let ws = 0, from = 0, base = 0, sub = null;
    return function next() {
      for (;;) {
        if (sub === null) {
          if (ws >= src.length || (ws > 0 && t() > deadline)) return null;
          base = Math.max(0, ws - 1);
          sub = src.slice(base, Math.min(src.length, ws + STEP + d.maxLen + 1));
          d.re.lastIndex = Math.max(ws, from) - base;
        }
        const m = d.re.exec(sub);
        if (m && m.index + base < ws + STEP) {
          from = m.index + base + m[0].length;
          return { index: m.index + base, 0: m[0] };
        }
        sub = null;
        ws += STEP;
      }
    };
  }

  // HMAC des Werts fuer die Liste "Kein sensibler Wert" (Auflage 10).
  const ignoreHash = (key, id, value) => DLX.dictionary.hmacHex(key, id + ':' + A.compact(value));
  // Typen mit kleinem Wertebereich werden nie ignoriert (Auflage 10).
  // Abgeleitete Typen (Paket context) nie: ein Einzelwert hebt keine Kombi/Liste auf (Design-Review Kontext, Auflage 2).
  const ignorable = (id) => { const d = findDetector(id); return !!d && !fmtOnly(d) && !d.derived; };

  // cfg: { packs: [paket-ids], rules: {id: aktion}, dictionary: {salt, hashes: Set},
  //        terms: [DLX.dictionary.termList(...)], ignore: {key: Uint8Array, hashes: Set},
  //        massMin, idParts }  (Paket context: Schwellen der Richtlinie)
  // Fund: { id, cat, start, end, action, sure, n?, meta? } - meta = Hinweis ueber einen
  // Bereich (mass_list), wird nie ersetzt; seine Einzelfunde bleiben eigene Funde.
  // dl: nur intern fuer Varianten (engine/entschleiern.js) - gemeinsames Zeitbudget.
  function scan(text, cfg, clock, dl) {
    const t = clock || now;
    const res = { findings: [], unscannable: false, reason: null };
    if (typeof text !== 'string' || !text) return res;
    if (text.length > MAX_LEN) { res.unscannable = true; res.reason = 'too_long'; return res; }
    const deadline = dl || t() + BUDGET_MS;
    const strongOnly = (cfg && cfg.strongOnly) || 0;
    const cand = [];
    const ign = cfg && cfg.ignore && cfg.ignore.hashes && cfg.ignore.hashes.size ? cfg.ignore : null;
    const packs = (cfg && cfg.packs) || Object.keys(DLX.packs);
    const ctxOn = !!DLX.context && packs.indexOf('context') !== -1;
    // Code-Detektoren (code: true) nur, wenn der Text Code ist, und nur in den ersten
    // DLX.code.MAX Zeichen (Design-Review Code und Bilder, Auflagen 1, 4); einmal je Pruefung.
    let code = null;
    const isCode = () => (code === null ? (code = !!DLX.code && DLX.code.isCode(text)) : code);
    const hidden = [];   // per "Kein sensibler Wert" ausgeblendet; zaehlen fuer Listen weiter (Auflage 2)
    const lists = [];
    for (const pid of packs) if (DLX.packs[pid]) lists.push(DLX.packs[pid].detectors);
    const byId = detectorMap();
    if (cfg && cfg.org) lists.push(cfg.org);   // Richtlinie customPatterns, Aktion fest je Muster
    for (const detectors of lists) {
      for (const d of detectors) {
        if (d.derived) continue;
        if (strongOnly && !d.org && !strong(d, strongOnly)) continue;
        const action = d.org ? d.act : actionFor(d.id, cfg, byId);
        if (action === 'off') continue;
        // pre: billige Vorpruefung des ganzen Texts (z. B. "enthaelt Buchstaben"); spart grosse Muster bei reinen Zahlenkolonnen.
        if (d.code && !isCode()) continue;
        const src = d.code ? text.slice(0, DLX.code.MAX) : text;
        if (d.pre && !d.pre.test(src)) continue;
        d.re.lastIndex = 0;
        const next = d.maxLen ? windows(d, src, deadline, t) : () => d.re.exec(src);
        let m;
        while ((m = next()) !== null) {
          if (m[0].length === 0) { d.re.lastIndex++; continue; }
          let start = m.index;
          let value = m[0];
          if (d.group && m.groups && m.groups[d.group] !== undefined) {
            value = m.groups[d.group];
            start = m.indices.groups[d.group][0];
          }
          let end = start + value.length;
          let needsCtx = !!d.needsCtx;
          if (d.ctxUnless && d.ctxUnless.test(value)) needsCtx = false;
          if (d.valid) {
            // validGroups: Validator braucht benannte Gruppen (z. B. Schluesselname einer .env-Zeile).
            const ok = d.validGroups ? d.valid(value, m.groups || {}) : d.valid(value);
            if (ok === false) continue;
            if (ok === 'ctx') needsCtx = true;
            else if (typeof ok === 'number') end = start + ok;
          }
          if (needsCtx && !A.hasContext(text, start, end, d.ctx)) continue;
          let sure = true;
          if (fmtOnly(d) || (d.pack !== 'secrets' && d.cat !== 'kontakt')) {
            const nc = around(text, start, end, text.slice(start, end));
            if (nc === 'query') sure = false;
            else if (nc) { if (fmtOnly(d)) continue; sure = false; }   // Pruefziffer-Typen nie verwerfen (Auflage 2)
          }
          // Ohne Normformat (d.fmt) bzw. bei reinen Format-Typen nur mit Kontextwort sicher.
          if (sure && !needsCtx && (fmtOnly(d) || (d.fmt && !d.fmt.test(text.slice(start, end)))) &&
            !(d.ctx && A.hasContext(text, start, end, d.ctx))) sure = false;
          if (d.alone === 'unsure') sure = false;   // z. B. Postadresse: sicher nur als Teil einer Kombi
          if (ign && !fmtOnly(d) && ign.hashes.has(ignoreHash(ign.key, d.id, text.slice(start, end)))) {
            if (ctxOn) hidden.push({ id: d.id, cat: d.cat, start, end, sure, ignored: true });
            continue;
          }
          cand.push({ id: d.id, cat: d.cat, start, end, action, sure, prio: d.generic ? 0 : d.weak ? 1 : 2 });
        }
        if (t() > deadline) { res.unscannable = true; res.reason = 'timeout'; return res; }
      }
    }
    if (cfg && cfg.dictionary && cfg.dictionary.hashes && cfg.dictionary.hashes.size && actionFor('dictionary', cfg) !== 'off') {
      const r = DLX.dictionary.scanDictionary(text, cfg.dictionary, deadline, t);
      if (r.timeout) { res.unscannable = true; res.reason = 'timeout'; return res; }
      const action = actionFor('dictionary', cfg);
      for (const f of r.findings) cand.push(Object.assign(f, { action, sure: true, prio: 2 }));
    }
    // Eigene Begriffe (Richtlinie customTerms + lokale Liste userTerms); gleiches
    // Zeitbudget wie alle Detektoren, Ueberschreitung -> nicht pruefbar (Auflage 4).
    if (cfg && cfg.terms && cfg.terms.length && actionFor('custom_term', cfg) !== 'off') {
      const r = DLX.dictionary.scanTerms(text, cfg.terms, deadline, t);
      if (r.timeout) { res.unscannable = true; res.reason = 'timeout'; return res; }
      const action = actionFor('custom_term', cfg);
      for (const f of r.findings) cand.push(Object.assign(f, { action, sure: true, prio: 2 }));
    }
    // Interne Links (SharePoint/OneDrive, Intranet, Hosts ohne oeffentliche Endung, Richtlinie
    // internalDomains); gleiches Zeitbudget, Timeout oder > 500 Links -> nicht pruefbar (Auflage 1).
    if (actionFor('internal_link', cfg) !== 'off' && /:\/\/|sharepoint\./i.test(text)) {
      const r = DLX.dictionary.scanLinks(text, cfg && cfg.domains, deadline, t);
      if (r.timeout) { res.unscannable = true; res.reason = 'timeout'; return res; }
      if (r.tooMany) { res.unscannable = true; res.reason = 'too_long'; return res; }
      const action = actionFor('internal_link', cfg);
      for (const f of r.findings) cand.push(Object.assign(f, { action, sure: true, prio: 2 }));
    }
    // Eigene Label-Namen (Richtlinie labelNames, vorbereitet in engineConfig) als
    // conf_label, nur mit aktivem Paket marker; gleiches Zeitbudget.
    if (cfg && cfg.labels && cfg.labels.length && packs.indexOf('marker') !== -1 && actionFor('conf_label', cfg) !== 'off') {
      const action = actionFor('conf_label', cfg);
      for (const re of cfg.labels) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m[0].length === 0) { re.lastIndex++; continue; }
          cand.push({ id: 'conf_label', cat: 'firma', start: m.index, end: m.index + m[0].length, action, sure: true, prio: 2 });
        }
        if (t() > deadline) { res.unscannable = true; res.reason = 'timeout'; return res; }
      }
    }
    // Kontext (Paket context) erst nach allen Grundfunden; Zeitueberschreitung oder
    // Fehler -> nichts Abgeleitetes, Grundfunde unveraendert (Auflage 1).
    let derived = null;
    if (ctxOn) {
      try {
        derived = DLX.context.derive(text, cand.concat(hidden), cfg || {}, deadline, t, (id) => actionFor(id, cfg, byId));
      } catch (e) {
        derived = null;
        // Zeitbudget aufgebraucht (u. a. Tabellen-Erkennung) -> nicht pruefbar wie bei allen
        // Detektoren (Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflage 11).
        if (DLX.context.Timeout && e instanceof DLX.context.Timeout) { res.unscannable = true; res.reason = 'timeout'; return res; }
      }
      if (derived) for (const c of derived.upgrade) c.sure = true;
      else res.contextIncomplete = true;
    }
    // Ueberlappungen: Pruefziffer-Typ vor reinem Format (weak) vor generisch, laenger vor kuerzer.
    cand.sort((a, b) => b.prio - a.prio || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const kept = [];
    for (const c of cand) {
      if (kept.every((k) => c.end <= k.start || c.start >= k.end)) kept.push(c);
    }
    // Abgeleitete Funde stufen keinen Grundfund herab: nur, wo sie nichts ueberdecken (Auflage 2).
    // Grundfunde sind hier ueberlappungsfrei und nach Lage sortiert: binaere Suche statt
    // Vergleich mit allen (linear, Design-Review Kontext Auflage 7).
    if (derived) {
      // Gekuerzte Tabellenzeilen (mass_table mit rows) ersetzen alles in ihrem Bereich (Auflage 7
      // Design-Review Tabellen/Verschleierung/Umformen): Grundfunde darin entfallen.
      // Zellen einer Personen-Tabelle gehen vor unsicheren Grundfunden in der Zelle: sonst blendet das
      // Content Script den unsicheren Fund aus und die Zelle bliebe ungeschwaerzt.
      // Die Aktion des Tabellenfunds wird auf die strengste der ersetzten Grundfunde angehoben
      // (Rangfolge wie strictest): nie milder als ohne Tabellen-Erkennung (Pflicht-Pruefung 16.10.2026).
      // Wird der Tabellenfund unten nicht uebernommen, kommen die Grundfunde unveraendert zurueck.
      const replaced = new Map();
      for (const c of derived.add) {
        if (c.id !== 'mass_table') continue;
        const gone = [];
        for (let i = kept.length - 1; i >= 0; i--) {
          const k = kept[i];
          if (k.start >= c.start && k.end <= c.end && (c.rows || !k.sure)) { gone.push(k); kept.splice(i, 1); }
        }
        if (!gone.length) continue;
        replaced.set(c, gone);
        for (const k of gone) if (RANK[k.action] > RANK[c.action]) c.action = k.action;
      }
      const base = kept.slice().sort((a, b) => a.start - b.start);
      const free = (c) => {
        let lo = 0, hi = base.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (base[mid].end <= c.start) lo = mid + 1; else hi = mid; }
        return lo === base.length || base[lo].start >= c.end;
      };
      let lastEnd = -1;
      for (const c of derived.add.sort((a, b) => a.start - b.start)) {
        if (c.start >= lastEnd && free(c)) { kept.push(c); lastEnd = c.end; replaced.delete(c); }
        else raise(kept, c);   // nicht uebernommen: strengere Aktion geht an die ueberlappenden Funde (Runde 4)
      }
      for (const gone of replaced.values()) kept.push(...gone);
      for (const c of derived.meta) kept.push(c);
    }
    // Verschleierte Daten: Varianten im selben Zeitbudget; ein Variantenfund nur, wo kein
    // Grundfund liegt (Design-Review Tabellen/Verschleierung/Umformen, Auflagen 9-11).
    if (DLX.entschleiern && !(cfg && (cfg.variant || cfg.deobfuscation === false))) {
      const extra = deobf(text, cfg || {}, packs, t, deadline, kept);
      if (extra === null) { res.unscannable = true; res.reason = 'timeout'; return res; }
      if (extra === false) { res.unscannable = true; res.reason = 'too_long'; return res; }
      for (const c of extra) if (!raise(kept, c)) kept.push(c);
    }
    kept.sort((a, b) => a.start - b.start);
    res.findings = kept.map(({ id, cat, start, end, action, sure, n, meta, obf, rows }) =>
      Object.assign({ id, cat, start, end, action, sure }, n ? { n } : null, meta ? { meta: true } : null, obf ? { obf } : null, rows ? { rows } : null));
    return res;
  }

  // Starke Detektoren fuer Varianten: Pruefziffer, Geheimnis, Mail, IBAN - keine reinen
  // Format-Typen und keine generischen Muster (wenig Fehlalarme, Design-Review Auflage 9).
  // Stufe 2 (rueckwaerts): nur Pruefziffer - rueckwaerts gelesene Mailadressen sehen oft wie Mailadressen aus.
  const strong = (d, level) => !fmtOnly(d) && !d.generic && !d.code && (level === 2 ? !!d.valid : (!!d.valid || d.pack === 'secrets' || d.id === 'email' || d.id === 'iban'));
  const OVER = {};
  // Hebt die Aktion aller nicht-meta Funde in list, die c ueberlappen, auf die strengere von beiden
  // (RANK wie strictest); true, wenn es eine Ueberlappung gab.
  function raise(list, c) {
    let hit = false;
    for (const k of list) {
      if (k.meta || c.end <= k.start || c.start >= k.end) continue;
      hit = true;
      if (RANK[c.action] > RANK[k.action]) k.action = c.action;
    }
    return hit;
  }
  const MAX_EXTRA = 500;
  // Funde in den Varianten -> Bereiche im Original; null = Zeitbudget ueberschritten oder Fehler,
  // false = Varianten ueber einer Grenze weggelassen (nie still uebersprungen, Pflicht-Pruefung 16.10.2026).
  // kept: Grundfunde; nur neue Funde zaehlen gegen MAX_EXTRA, darueber nicht pruefbar statt still verworfen.
  function deobf(text, cfg, packs, t, deadline, kept) {
    const E = DLX.entschleiern;
    const tick = () => { if (t() > deadline) throw OVER; };
    let vs;
    // Zeitbudget oder jeder andere Fehler -> nicht pruefbar, kein Teilergebnis (Auflage 11).
    try { vs = E.variants(text, tick); } catch (e) { return null; }
    if (vs.truncated) return false;
    vs = vs.list;
    const sub = Object.assign({}, cfg, { variant: true, packs: packs.filter((p) => p !== 'context') });
    const out = [];
    for (const v of vs) {
      // Zeichen-Normalisierung aendert den Text kaum: alle Detektoren; sonst nur starke.
      const r = scan(v.s, Object.assign({}, sub, { strongOnly: v.kind === 'norm' ? 0 : v.kind === 'rev' ? 2 : 1 }), t, deadline);
      if (r.unscannable) return null;
      for (const f of r.findings) {
        if (f.meta) continue;
        const o = E.origin(v, f.start, f.end);
        if (!o) continue;
        // Ueberlappt der Variantenfund einen Grund- oder Tabellenfund, hebt er dessen Aktion an statt
        // still zu entfallen (Pflicht-Pruefung 16.10.2026, Runde 4).
        if (raise(kept, { start: o[0], end: o[1], action: f.action })) continue;
        if (out.length >= MAX_EXTRA) return false;
        out.push(Object.assign({}, f, { start: o[0], end: o[1], obf: v.kind }));
      }
    }
    return out;
  }

  // Strengste Aktion aller Funde (oder null).
  function strictest(findings) {
    let best = null;
    for (const f of findings) if (!best || RANK[f.action] > RANK[best]) best = f.action;
    return best;
  }

  // Zusammenfassung ohne Werte: [{id, cat, n}].
  function summarize(findings) {
    const map = new Map();
    for (const f of findings) {
      const e = map.get(f.id) || { id: f.id, cat: f.cat, n: 0 };
      e.n = Math.min(10000, e.n + (f.n || 1));
      map.set(f.id, e);
    }
    return [...map.values()];
  }

  // Ersetzt Fundstellen von hinten nach vorne durch [Platzhalter].
  // meta-Funde (mass_list) bleiben stehen, ihre Einzelfunde werden ersetzt (Auflage 2).
  function redact(text, findings, label) {
    let out = text;
    const list = findings.filter((f) => !f.meta).sort((a, b) => b.start - a.start);
    for (const f of list) out = out.slice(0, f.start) + '[' + label(f) + ']' + out.slice(f.end);
    return out;
  }

  function findDetector(id) {
    return allDetectors().find((d) => d.id === id) || null;
  }

  DLX.engine = { MAX_LEN, BUDGET_MS, ACTIONS, scan, around, ignoreHash, ignorable, strictest, summarize, redact, actionFor, allDetectors, findDetector, defaultAction };
})(globalThis);
