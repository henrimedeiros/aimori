// Lokale Zaehler (Auflagen A12, B16): nur Tageszahlen je Seite, Kategorie und
// Entscheidung, 90 Tage; nie Zeitstempel je Ereignis, Texte, Werte oder Hashes.
// Form: { 'YYYY-MM-DD': { site: { kategorie: { entscheidung: zahl } } } }
(function (g) {
  'use strict';
  const DLX = g.DLX;

  const KEEP_DAYS = 90;
  const DECISIONS = ['redact', 'pseudonym', 'cancel', 'override', 'notsensitive', 'blocked', 'file', 'inactive', 'site'];
  const SITES = ['chatgpt', 'claude', 'gemini', 'copilot', 'm365copilot', 'perplexity'];
  const ID = /^[a-z][a-z-]{1,20}$/;

  const day = (d) => d.toISOString().slice(0, 10);

  function add(stats, date, site, cat, decision, n) {
    if (SITES.indexOf(site) === -1 || DECISIONS.indexOf(decision) === -1 || !ID.test(cat)) return stats;
    const k = day(date);
    const d = Object.hasOwn(stats, k) ? stats[k] : (stats[k] = {});
    const s = Object.hasOwn(d, site) ? d[site] : (d[site] = {});
    const c = Object.hasOwn(s, cat) ? s[cat] : (s[cat] = {});
    c[decision] = (Object.hasOwn(c, decision) ? c[decision] : 0) + Math.max(1, Math.min(1000, n | 0));
    return stats;
  }

  function prune(stats, now) {
    const limit = day(new Date(now.getTime() - KEEP_DAYS * 86400000));
    for (const k of Object.keys(stats)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k < limit) delete stats[k];
    return stats;
  }

  // Summe je Entscheidung ab einem Tag (inklusive).
  function totals(stats, fromDay) {
    const out = {};
    for (const [k, sites] of Object.entries(stats)) {
      if (k < fromDay) continue;
      for (const cats of Object.values(sites)) for (const decs of Object.values(cats)) {
        for (const [dec, n] of Object.entries(decs)) out[dec] = (out[dec] || 0) + n;
      }
    }
    return out;
  }

  DLX.stats = { KEEP_DAYS, DECISIONS, day, add, prune, totals };
})(globalThis);
