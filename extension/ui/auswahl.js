// Eigenes Auswahlfeld im Marken-Design statt nativem select (Popup, Training-Ampel):
// Knopf mit aria-haspopup=listbox + Liste role=listbox, Tastatur (Pfeile, Pos1/Ende,
// Enter/Leertaste, Esc, Tab, Tippen springt zum Namen), hell/dunkel ueber die Tokens.
// Nur DOM ueber DLX.dom.h (createElement/Textknoten), kein HTML aus Text, keine Stil-Strings,
// keine URLs, keine Bilder: Icon je Dienst = Monogramm-Kachel, Farbe per Klasse aus der
// festen Kategorie-Liste (Design-Review KI vorladen 16.10.2026, Auflagen 8, 10).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const { h } = DLX.dom;
  const KATEGORIEN = ['chat', 'suche', 'code', 'bild', 'video', 'audio', 'sammler', 'begleiter', 'schreiben', 'uebersetzung', 'praesentation'];

  // Zwei Zeichen aus dem Namen: Anfangsbuchstaben der ersten zwei Woerter, sonst die ersten zwei Zeichen.
  function mono(name) {
    const w = String(name).replace(/\(.*?\)/g, '').split(/[\s.-]+/).filter((x) => /^[\p{L}\p{N}]/u.test(x));
    const m = w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2);
    return m.toUpperCase();
  }
  const kachel = (it) => h('span', { class: 'dlx-mono dlx-mono-' + (KATEGORIEN.includes(it.kat) ? it.kat : 'chat'), 'aria-hidden': 'true' }, mono(it.name));

  let zaehler = 0;
  // opts: { id, label, placeholder, items: [{ value, name, kat }], onChange(value) }
  function auswahl(opts) {
    const nr = ++zaehler;
    const items = opts.items.slice();
    let value = null;
    let aktiv = -1;
    const wert = h('span', { class: 'dlx-auswahl-wert' }, opts.placeholder);
    const knopf = h('button', { type: 'button', class: 'dlx-auswahl-knopf', id: opts.id, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': opts.label },
      wert, h('span', { class: 'dlx-auswahl-pfeil', 'aria-hidden': 'true' }));
    const liste = h('ul', { class: 'dlx-auswahl-liste', role: 'listbox', id: 'dlx-auswahl-' + nr, tabindex: '-1', 'aria-label': opts.label, hidden: true });
    const zeilen = items.map((it, i) => {
      const li = h('li', { class: 'dlx-auswahl-option', role: 'option', id: 'dlx-auswahl-' + nr + '-' + i, 'data-wert': it.value, 'aria-selected': 'false' },
        kachel(it), h('span', null, it.name));
      li.addEventListener('mousedown', (e) => e.preventDefault());
      li.addEventListener('click', () => waehle(i));
      li.addEventListener('mousemove', () => markiere(i, false));
      return li;
    });
    liste.append(...zeilen);
    knopf.setAttribute('aria-controls', liste.id);
    const root = h('div', { class: 'dlx-auswahl' }, knopf, liste);

    function markiere(i, scroll) {
      if (aktiv >= 0) zeilen[aktiv].classList.remove('dlx-aktiv');
      aktiv = Math.max(0, Math.min(items.length - 1, i));
      zeilen[aktiv].classList.add('dlx-aktiv');
      liste.setAttribute('aria-activedescendant', zeilen[aktiv].id);
      if (scroll !== false) zeilen[aktiv].scrollIntoView({ block: 'nearest' });
    }
    function oeffne() {
      if (!liste.hidden) return;
      liste.hidden = false;
      knopf.setAttribute('aria-expanded', 'true');
      root.classList.add('dlx-offen');
      markiere(value === null ? 0 : items.findIndex((x) => x.value === value));
      liste.focus();
    }
    function schliesse(fokus) {
      if (liste.hidden) return;
      liste.hidden = true;
      knopf.setAttribute('aria-expanded', 'false');
      root.classList.remove('dlx-offen');
      if (fokus) knopf.focus();
    }
    function setze(i) {
      value = items[i].value;
      zeilen.forEach((z, k) => z.setAttribute('aria-selected', k === i ? 'true' : 'false'));
      wert.replaceChildren(kachel(items[i]), h('span', null, items[i].name));
    }
    function waehle(i) {
      setze(i);
      schliesse(true);
      opts.onChange(value);
    }

    knopf.addEventListener('click', () => (liste.hidden ? oeffne() : schliesse(true)));
    knopf.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); oeffne(); }
    });
    let suche = '';
    let sucheBis = 0;
    liste.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowDown') markiere(aktiv + 1);
      else if (k === 'ArrowUp') markiere(aktiv - 1);
      else if (k === 'Home') markiere(0);
      else if (k === 'End') markiere(items.length - 1);
      else if (k === 'PageDown') markiere(aktiv + 8);
      else if (k === 'PageUp') markiere(aktiv - 8);
      else if (k === 'Enter' || k === ' ') { if (aktiv >= 0) waehle(aktiv); }
      else if (k === 'Escape') schliesse(true);
      else if (k === 'Tab') { schliesse(false); return; }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Tippen springt zum ersten passenden Namen (Buchstaben innert 0,7 s sammeln).
        const now = Date.now();
        suche = (now < sucheBis ? suche : '') + k.toLowerCase();
        sucheBis = now + 700;
        const i = items.findIndex((x) => x.name.toLowerCase().startsWith(suche));
        if (i >= 0) markiere(i);
      } else return;
      e.preventDefault();
    });
    root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) schliesse(false); });

    return { el: root, oeffne, get value() { return value; } };
  }

  DLX.auswahl = Object.freeze({ auswahl, mono });
})(globalThis);
