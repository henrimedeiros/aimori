// Vertrauliche Quellen fuer den Zwischenablage-Schutz (Design-Review Antwort/
// Zwischenablage 16.10.2026): Hostmuster pruefen (Einstellungen und Service Worker
// identisch, Auflage 6), Ausschluesse (Auflage 8) und die gemeinsame
// Text-Normalisierung fuer Kopieren und Einfuegen (Auflagen 11, 16).
// Kein Text wird hier gespeichert; nur Hostmuster und Pruefsummen.
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});

  const MAX_SOURCES = 100;
  const MIN_CHARS = 8;          // Nicht-Leerzeichen nach der Normalisierung (Auflage 11)
  const MAX_TEXT = 200000;      // laengerer Text: nur der Anfang zaehlt (beidseitig gleich)
  // Mehrteilige oeffentliche Endungen: "*.co.uk" waere wie "*.com" (Auflage 6).
  const SUFFIXES = new Set(('co.uk org.uk ac.uk gov.uk me.uk ltd.uk plc.uk net.uk sch.uk nhs.uk com.br net.br org.br gov.br ' +
    'com.au net.au org.au gov.au edu.au co.nz org.nz govt.nz co.jp ne.jp or.jp go.jp ac.jp co.kr or.kr go.kr co.za org.za gov.za ' +
    'com.cn net.cn org.cn gov.cn com.mx gob.mx com.ar gob.ar com.tr gov.tr co.in gov.in net.in org.in com.sg gov.sg com.hk gov.hk ' +
    'com.tw gov.tw co.il gov.il com.my gov.my co.id go.id co.th go.th com.ph gov.ph com.vn gov.vn com.pk gov.pk com.ng gov.ng ' +
    'com.eg gov.eg com.sa gov.sa co.ae gov.ae com.co gov.co com.pe gob.pe com.ve gob.ve com.ec gob.ec com.uy gub.uy cl.it ' +
    'ch.it co.it gv.at ac.at co.at or.at com.pl net.pl org.pl gov.pl com.pt gov.pt com.es gob.es nom.es org.es com.gr gov.gr ' +
    'com.ua gov.ua com.ru gov.ru co.ke go.ke com.qa gov.qa com.kw gov.kw').split(' '));
  // Kleine, feste Vorschlagsliste allgemein bekannter HR-/Lohn-Anbieter (Auflage 18);
  // ein Klick fuegt nur hinzu, Zugriff erst ueber den Knopf in den Einstellungen.
  const SUGGESTIONS = Object.freeze(['*.personio.de', '*.bamboohr.com', '*.myworkday.com', '*.successfactors.com', '*.hibob.com']);
  const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  // Nie als Quelle: KI-Seiten der Liste und der Content-Script-Eintraege, *.cloud.microsoft.
  function aiHosts() {
    const out = ['cloud.microsoft'];
    if (DLX.aisites) for (const x of DLX.aisites.LIST) for (const h of x.hosts) out.push(h);
    if (DLX.adapters) for (const s of DLX.adapters.SITES) for (const h of s.hosts) out.push(h);
    return out;
  }
  const under = (host, base) => host === base || host.endsWith('.' + base);

  // "bank.example.com" oder "*.hr.example.com" -> { pattern, base, wild } | null.
  function parse(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim().toLowerCase();
    if (!s || s.length > 253) return null;
    const wild = s.startsWith('*.');
    const base = wild ? s.slice(2) : s;
    const labels = base.split('.');
    if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
    if (!/^[a-z]/.test(labels[labels.length - 1]) || /^\d+$/.test(labels[labels.length - 1])) return null;   // keine IP-Literale
    if (SUFFIXES.has(base)) return null;
    // Ausschluesse: Quelle darf keinen KI-Host treffen und nicht darunter liegen (Auflage 8).
    for (const h of aiHosts()) if (under(base, h) || (wild && under(h, base))) return null;
    return { pattern: s, base, wild };
  }
  const valid = (v) => parse(v) !== null;
  const originOf = (p) => 'https://' + p.pattern + '/*';

  // Liste -> eindeutige, gueltige Origin-Muster fuer permissions/registerContentScripts.
  function originsOf(list) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const v of list.slice(0, MAX_SOURCES)) {
      const p = parse(v);
      if (p && out.indexOf(originOf(p)) === -1) out.push(originOf(p));
    }
    return out;
  }

  // Passt ein Host (aus sender.origin) zu einem Eintrag der Liste?
  function matches(list, host) {
    if (!Array.isArray(list) || typeof host !== 'string') return false;
    const hst = host.toLowerCase();
    for (const v of list.slice(0, MAX_SOURCES)) {
      const p = parse(v);
      if (p && (p.wild ? under(hst, p.base) : hst === p.base)) return true;
    }
    return false;
  }

  // Gemeinsame Normalisierung (Kopieren in quelle.js, Einfuegen in content.js).
  const normalize = (text) => String(text).slice(0, MAX_TEXT).normalize('NFKC').replace(/\s+/g, ' ').trim();
  const hashable = (norm) => norm.replace(/\s/g, '').length >= MIN_CHARS;

  DLX.quellen = Object.freeze({ MAX_SOURCES, MIN_CHARS, MAX_TEXT, SUGGESTIONS, parse, valid, originsOf, matches, normalize, hashable });
})(globalThis);
