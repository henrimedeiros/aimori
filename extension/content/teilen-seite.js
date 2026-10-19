// Bildschirmteilen erkennen, Teil 1 (Design-Review Bildschirmteilen 17.10.2026,
// docs/sicherheit/design-review-bildschirmteilen.md): laeuft in der Seitenwelt (world MAIN) nur auf
// den erteilten Meeting-Seiten (Meet, Teams, Zoom). Umhuellt getDisplayMedia, ohne das Verhalten zu
// aendern: dasselbe Promise geht an die Seite, Fehler unveraendert, eigener Code wirft nie (Auflage 1).
// Gemeldet wird nur ein fester Text per Ereignis auf document: "an:<Flaeche>" bzw. "aus", wenn kein
// Track mehr laeuft (ended, inactive oder readyState per 1-s-Abfrage, Auflage 2). Kein Zugriff auf
// Bild oder Ton, keine Stream-Daten, keine globalen Variablen.
(function () {
  'use strict';
  const proto = typeof MediaDevices === 'function' ? MediaDevices.prototype : null;
  const orig = proto && proto.getDisplayMedia;
  if (typeof orig !== 'function') return;
  const EV = 'dlx-teilen';
  const SURFACES = ['browser', 'window', 'monitor'];
  const apply = Reflect.apply, dispatch = EventTarget.prototype.dispatchEvent, Ev = CustomEvent, doc = document;
  const live = new Set();       // laufende Video-Tracks, nur solange sie laufen
  let timer = 0;

  function fire(s) { try { apply(dispatch, doc, [new Ev(EV, { detail: s })]); } catch (e) { /* still */ } }
  function sweep() {
    try {
      for (const t of live) if (t.readyState === 'ended') live.delete(t);
      if (live.size) return;
      clearInterval(timer);
      timer = 0;
      fire('aus');
    } catch (e) { /* still */ }
  }
  function onStream(stream) {
    try {
      const tracks = stream && typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : [];
      const t = tracks.find((x) => x.readyState === 'live');
      if (!t) return;
      const set = typeof t.getSettings === 'function' ? t.getSettings() : {};
      const surface = SURFACES.indexOf(set.displaySurface) !== -1 ? set.displaySurface : 'monitor';
      live.add(t);
      t.addEventListener('ended', sweep);
      stream.addEventListener('inactive', sweep);
      if (!timer) timer = setInterval(sweep, 1000);
      fire('an:' + surface);
    } catch (e) { /* still */ }
  }
  proto.getDisplayMedia = function getDisplayMedia(...args) {
    const p = apply(orig, this, args);
    try { p.then(onStream, () => {}); } catch (e) { /* still */ }
    return p;
  };
})();
