// Kleiner DOM-Baukasten fuer die Erweiterungsseiten: nur createElement,
// textContent und gepruefte Attribute (keine HTML-Strings, Auflage B7/B8).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const SVG = 'http://www.w3.org/2000/svg';

  const ownPage = (v) => typeof chrome !== 'undefined' && !!chrome.runtime && typeof chrome.runtime.getURL === 'function' &&
    /^[a-z]+\.html(#[a-z-]+)?$/.test(v.slice(chrome.runtime.getURL('ui/').length)) && v.startsWith(chrome.runtime.getURL('ui/'));

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (/^on/i.test(k)) throw new Error('event attributes not allowed');
      // Nur https-Links und eigene Erweiterungsseiten unter ui/ ("Mehr erfahren", Design-Review 14.10.2026 Auflage 7).
      if (k === 'href' && !/^https:\/\//.test(String(v)) && !ownPage(String(v))) continue;
      if (k === 'src' && !/^(data:image\/(png|svg\+xml);base64,|\.\.\/icons\/)/.test(String(v))) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
    if (tag === 'a') el.setAttribute('rel', 'noopener noreferrer');
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }

  // SVG-Element mit festen Attributen (nur aus dem Code, nie aus Daten).
  function s(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  // Signet "Helm-Schild" der Marke (Pfade 1:1 aus icons/signet-kraeftig.svg, fuer
  // kleine Groessen bis 32 px; Test tests/marke.test.mjs). Verlaufs-IDs mit Praefix
  // dlx- und Zaehler, nur per createElementNS/setAttribute (Design-Review Marke
  // 16.10.2026, Auflage 4). Mit gepruefter Whitelabel-Farbe einfarbig.
  const SIGNET_FORM = [
    ['M44 16 C62 66 138 66 156 16 C130 52 70 52 44 16 Z', 'gold'],
    ['M42 70 Q100 54 158 70 V106 C158 142 134 166 100 180 C66 166 42 142 42 106 Z', 'ring'],
    ['M70 116 C70 98 83 88 100 88 C117 88 130 98 130 116 Z', 'body'],
    ['M66 122 H134 L128 142 H72 Z', 'body'],
  ];
  const VERLAUF = {
    gold: [{ x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#FFF1C9'], [0.5, '#F7C25A'], [1, '#C8892B']]],
    body: [{ x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#FF7A3D'], [1, '#F0244F']]],
    ring: [{ gradientUnits: 'userSpaceOnUse', x1: 40, y1: 40, x2: 160, y2: 180 }, [[0, '#FF7A3D'], [1, '#F0244F']]],
  };
  let signetNr = 0;
  let signetFarbe = ''; // nur nach Pruefung in applyBranding gesetzt (#rrggbb, Kontrast)
  function signet(cls) {
    const id = 'dlx-sg' + (++signetNr);
    const svg = s('svg', { viewBox: '0 0 200 200', class: cls || 'dlx-signet', 'aria-hidden': 'true', focusable: 'false' });
    if (!signetFarbe) {
      const defs = s('defs', {});
      for (const [name, [attrs, stops]] of Object.entries(VERLAUF)) {
        const lg = s('linearGradient', Object.assign({ id: id + '-' + name }, attrs));
        for (const [offset, color] of stops) lg.append(s('stop', { offset, 'stop-color': color }));
        defs.append(lg);
      }
      svg.append(defs);
    }
    for (const [d, art] of SIGNET_FORM) {
      const farbe = signetFarbe || 'url(#' + id + '-' + art + ')';
      svg.append(s('path', art === 'ring' ? { d, fill: 'none', stroke: farbe, 'stroke-width': 14, 'stroke-linejoin': 'round' } : { d, fill: farbe }));
    }
    return svg;
  }

  // Strichsymbole (24er-Raster, wie die Website).
  const ICONS = {
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    alert: ['M12 8v5', 'M12 16.5v.01', 'M10.3 4.2L2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    gear: ['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z', 'M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 0 1-2.1 1.2L14.7 21h-4l-.3-2a7.6 7.6 0 0 1-2.1-1.2l-1.9.7-2-3.4 1.6-1.2a7.6 7.6 0 0 1 0-2.9L4.4 9.8l2-3.4 1.9.7a7.6 7.6 0 0 1 2.1-1.2l.3-2h4l.3 2a7.6 7.6 0 0 1 2.1 1.2l1.9-.7 2 3.4-1.6 1.2a7.6 7.6 0 0 1 0 2.9z'],
  };
  function icon(name) {
    const svg = s('svg', { viewBox: '0 0 24 24', class: 'dlx-icon', 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    for (const d of ICONS[name]) svg.append(s('path', { d }));
    return svg;
  }

  // Relative Leuchtdichte und Kontrast (WCAG).
  function lum(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  const HEX = /^#[0-9a-fA-F]{6}$/;

  // Branding-Farben (Whitelabel) als CSS-Variablen: primaryColor faerbt Signet
  // (einfarbig) und Hauptknopf (statt Marken-Verlauf), accentColor die Markierung der Fundstelle. Nur #rrggbb und nur
  // mit Kontrast >= 3:1 zur Flaeche des aktuellen Themas, sonst gelten die
  // Design-Tokens. "Trotzdem senden" bleibt immer neutral (Design-Review 14.10.2026 Auflage 6).
  function applyBranding(branding, dark) {
    const root = document.documentElement;
    const surface = dark ? '#1c1c20' : '#ffffff';
    const p = branding.primaryColor || '';
    if (HEX.test(p) && contrast(p, surface) >= 3) {
      root.style.setProperty('--dlx-brand', p);
      root.style.setProperty('--dlx-haupt-grund', p);
      root.style.setProperty('--dlx-signet', p);
      signetFarbe = p;
      root.style.setProperty('--dlx-brand-ink', contrast(p, '#ffffff') >= contrast(p, '#0a0a0b') ? '#ffffff' : '#0a0a0b');
    }
    const a = branding.accentColor || '';
    if (HEX.test(a) && contrast(a, surface) >= 3) root.style.setProperty('--dlx-mark', a);
  }

  // Logo nur als <img> aus data:image/png bzw. svg+xml (base64, wie die Richtlinie es
  // validiert, Auflage B8); alles andere -> Signet. Groesse 28 (Kopf) bzw. 20 (Leiste).
  const LOGO = /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;
  function mark(branding, size) {
    return LOGO.test(branding.logo || '') ? h('img', { class: 'dlx-logo', src: branding.logo, alt: '', width: size, height: size }) : signet('dlx-signet dlx-logo');
  }

  // Produktname fuer die Anzeige: String, ohne Steuer-/Format-/Bidi-Zeichen, getrimmt,
  // hoechstens 40 Zeichen; sonst der feste Name aus branding.js (Design-Review
  // Anrede/Leiste 14.10.2026, Auflage 7). Gesetzt wird er nur als Text ueber h().
  function productName(branding) {
    const v = branding && typeof branding.productName === 'string' ? branding.productName.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 40).trim() : '';
    return v || DLX.branding.productName;
  }

  // Wortmarke: beim festen Namen das fuehrende "AI" abgesetzt, das I mit Serifen (CSS
  // .dlx-ai-i, Markenvorgabe 17.10.2026); der Text bleibt der volle Name fuer Kopieren und
  // Screenreader. Ein anderer Whitelabel-Name bleibt reiner Text (auch mit "AI" vorn). Die Spans
  // entstehen nur aus der Konstante in branding.js, nie aus Richtlinien-Text; cfg.branding mischt
  // Standard und Richtlinie (policy.js), ein gleichlautender Richtlinien-Name ist darum nicht
  // unterscheidbar und zeigt dieselbe Marke (Design-Review Serifen-I 17.10.2026, Auflage 2).
  function wordmark(branding) {
    const name = DLX.branding.productName;
    if (productName(branding) !== name || !/^AI./.test(name)) return [productName(branding)];
    return [h('span', { class: 'dlx-ai' }, 'A', h('span', { class: 'dlx-ai-i' }, 'I')), name.slice(2)];
  }

  // Marke: Logo oder Signet, dazu Produktname.
  function brand(branding, subtitle) {
    const m = mark(branding, 28);
    return h('div', { class: 'dlx-brand' }, m,
      h('div', null, h('div', { class: 'dlx-product' }, wordmark(branding)), subtitle ? h('div', { class: 'dlx-sub' }, subtitle) : null));
  }

  DLX.dom = { h, signet, icon, applyBranding, mark, brand, productName, wordmark, contrast };
})(globalThis);
