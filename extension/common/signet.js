// Signet der Erweiterung als Pixel (eine Quelle fuer scripts/make-icons.mjs und
// die Ampel-Symbole im Service Worker, Design-Review Training-Ampel 16.10.2026,
// Auflage 6). Reine Rechnung aus festen Werten, keine Eingaben von aussen.
// Neue Marke (16.10.2026): App-Kachel mit dem Signet „Helm-Schild“ nach der
// Markenvorgabe; Pfade 1:1 aus extension/icons/signet.svg (ab 48 px) und
// signet-kraeftig.svg (16 und 32 px), Test tests/marke.test.mjs. Groessen nur aus
// einer Positivliste (Design-Review Marke 16.10.2026, Auflage 5).
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});
  const SIZES = Object.freeze([16, 32, 48, 128]);
  // Ampelfarben: Punkt unten rechts mit weissem Rand.
  const DOTS = Object.freeze({ gruen: [0x1a, 0x7f, 0x37], gelb: [0xd9, 0xa4, 0x06], rot: [0xcf, 0x22, 0x2e] });

  const GOLD = [[0, [0xff, 0xf1, 0xc9]], [0.5, [0xf7, 0xc2, 0x5a]], [1, [0xc8, 0x89, 0x2b]]];
  const URUSHI = [[0, [0xff, 0x7a, 0x3d]], [1, [0xf0, 0x24, 0x4f]]];
  // Formen im Raster 200 x 200: d = Pfad, f = Fuellung (gold diagonal bzw. Urushi
  // senkrecht, je Form-Rahmen) oder s = Kontur (Urushi im Nutzerraum 40,40 -> 160,180).
  const SIGNET = [
    { d: 'M48 18 C64 62 136 62 152 18 C128 48 72 48 48 18 Z', f: 'gold' },
    { d: 'M42 66 Q100 50 158 66 V104 C158 142 134 166 100 180 C66 166 42 142 42 104 Z', s: 8 },
    { d: 'M74 112 C74 96 85 88 100 88 C115 88 126 96 126 112 Z', f: 'body' },
    { d: 'M100 92 L105 99 L100 106 L95 99 Z', f: 'gold' },
    { d: 'M66 117 H134 L140 129 H60 Z', f: 'body' },
    { d: 'M70 134 H130 L126 146 H74 Z', f: 'body' },
  ];
  const KRAEFTIG = [
    { d: 'M44 16 C62 66 138 66 156 16 C130 52 70 52 44 16 Z', f: 'gold' },
    { d: 'M42 70 Q100 54 158 70 V106 C158 142 134 166 100 180 C66 166 42 142 42 106 Z', s: 14 },
    { d: 'M70 116 C70 98 83 88 100 88 C117 88 130 98 130 116 Z', f: 'body' },
    { d: 'M66 122 H134 L128 142 H72 Z', f: 'body' },
  ];
  const GLANZ = 'M0 46 A46 46 0 0 1 46 0 H154 A46 46 0 0 1 200 46 V96 H0 Z';

  // Absolute Pfadbefehle M L H V C Q A Z der Master-SVGs -> Polygonzug.
  function flatten(d) {
    const t = d.match(/[A-Za-z]|-?\d*\.?\d+/g);
    const pts = [];
    let i = 0, x = 0, y = 0, cmd = '';
    const n = () => Number(t[i++]);
    while (i < t.length) {
      if (/[A-Za-z]/.test(t[i])) cmd = t[i++];
      if (cmd === 'M' || cmd === 'L') { x = n(); y = n(); pts.push([x, y]); }
      else if (cmd === 'H') { x = n(); pts.push([x, y]); }
      else if (cmd === 'V') { y = n(); pts.push([x, y]); }
      else if (cmd === 'C' || cmd === 'Q') {
        const c = cmd === 'C' ? [n(), n(), n(), n(), n(), n()] : [n(), n(), n(), n()];
        const x0 = x, y0 = y;
        for (let k = 1; k <= 24; k++) {
          const u = k / 24, v = 1 - u;
          if (cmd === 'C') pts.push([v * v * v * x0 + 3 * v * v * u * c[0] + 3 * v * u * u * c[2] + u * u * u * c[4], v * v * v * y0 + 3 * v * v * u * c[1] + 3 * v * u * u * c[3] + u * u * u * c[5]]);
          else pts.push([v * v * x0 + 2 * v * u * c[0] + u * u * c[2], v * v * y0 + 2 * v * u * c[1] + u * u * c[3]]);
        }
        x = c[c.length - 2]; y = c[c.length - 1];
      } else if (cmd === 'A') { // nur Viertelkreise der Kachel (r, 0 0 1 = im Uhrzeigersinn)
        const r = n(); n(); n(); n(); n(); const ex = n(), ey = n();
        const quer = (ex - x) * (ey - y) < 0, cx = quer ? ex : x, cy = quer ? y : ey;
        const a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ey - cy, ex - cx);
        let da = a1 - a0; if (da < 0) da += 2 * Math.PI;
        for (let k = 1; k <= 12; k++) pts.push([cx + r * Math.cos(a0 + da * k / 12), cy + r * Math.sin(a0 + da * k / 12)]);
        x = ex; y = ey;
      } else if (cmd === 'Z') { cmd = ''; }
      else throw new Error('signet: Pfadbefehl');
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { pts, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  // Nonzero-Regel bzw. Abstand zur geschlossenen Kontur.
  function inside(p, x, y) {
    let w = 0;
    for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
      const [ax, ay] = p[j], [bx, by] = p[k];
      if (ay <= y) { if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++; }
      else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--;
    }
    return w !== 0;
  }
  function nearLine(p, x, y, r) {
    for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
      const [ax, ay] = p[j], [bx, by] = p[k], dx = bx - ax, dy = by - ay;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - ax - u * dx, y - ay - u * dy) <= r) return true;
    }
    return false;
  }
  function ramp(stops, u) {
    u = Math.max(0, Math.min(1, u));
    for (let k = 1; k < stops.length; k++) {
      if (u <= stops[k][0]) {
        const [a, ca] = stops[k - 1], [b, cb] = stops[k], f = (u - a) / (b - a);
        return ca.map((c, i) => c + (cb[i] - c) * f);
      }
    }
    return stops[stops.length - 1][1];
  }
  const prep = (list) => list.map((s) => Object.assign({}, s, flatten(s.d)));
  const FORMEN = { voll: prep(SIGNET), kraeftig: prep(KRAEFTIG) };
  const GL = flatten(GLANZ);
  const KACHEL = {};
  function kachel(rx) { // abgerundetes Quadrat 200 x 200
    if (!KACHEL[rx]) KACHEL[rx] = flatten(`M0 ${rx} A${rx} ${rx} 0 0 1 ${rx} 0 H${200 - rx} A${rx} ${rx} 0 0 1 200 ${rx} V${200 - rx} A${rx} ${rx} 0 0 1 ${200 - rx} 200 H${rx} A${rx} ${rx} 0 0 1 0 ${200 - rx} Z`);
    return KACHEL[rx];
  }

  // Farbe eines Punkts (x, y im Raster 200) als [r, g, b, a] oder null.
  function sample(x, y, size, dot) {
    if (dot) {
      const d = Math.hypot(x - 150, y - 150);
      if (d <= 38.75) return DOTS[dot].concat(1);
      if (d <= 50) return [255, 255, 255, 1];
    }
    const k = kachel(size <= 16 ? 40 : 46);
    if (!inside(k.pts, x, y)) return null;
    // Kachel: senkrechter Verlauf #232327 -> #0C0C0E, Innenkante weiss 14 %, Glanz ab 48 px
    let c = ramp([[0, [0x23, 0x23, 0x27]], [1, [0x0c, 0x0c, 0x0e]]], y / 200);
    const mix = (col, a) => { c = c.map((v, i) => v + (col[i] - v) * a); };
    if (nearLine(k.pts, x, y, 2)) mix([255, 255, 255], 0.14);
    if (size >= 48 && y <= 96 && inside(GL.pts, x, y)) mix([255, 255, 255], 0.16 * (1 - y / 96));
    // Signet: ab 48 px x=20 y=22 b=160, darunter kraeftig x=12 y=12 b=176
    const [ox, oy, sc, formen] = size >= 48 ? [20, 22, 0.8, FORMEN.voll] : [12, 12, 0.88, FORMEN.kraeftig];
    const sx = (x - ox) / sc, sy = (y - oy) / sc;
    for (const f of formen) {
      if (f.s) {
        if (sx >= f.x0 - f.s && sx <= f.x1 + f.s && sy >= f.y0 - f.s && sy <= f.y1 + f.s && nearLine(f.pts, sx, sy, f.s / 2)) c = ramp(URUSHI, ((sx - 40) * 120 + (sy - 40) * 140) / (120 * 120 + 140 * 140));
      } else if (sx >= f.x0 && sx <= f.x1 && sy >= f.y0 && sy <= f.y1 && inside(f.pts, sx, sy)) {
        c = f.f === 'gold' ? ramp(GOLD, ((sx - f.x0) / (f.x1 - f.x0) + (sy - f.y0) / (f.y1 - f.y0)) / 2) : ramp(URUSHI, (sy - f.y0) / (f.y1 - f.y0));
      }
    }
    return c.concat(1);
  }

  // RGBA-Pixel (size*size*4) mit 4x4-Ueberabtastung; size aus SIZES (sonst leer),
  // dot = gruen|gelb|rot oder leer.
  function rgba(size, dot) {
    if (!SIZES.includes(size)) return new Uint8ClampedArray(0);
    const d = dot && Object.hasOwn(DOTS, dot) ? dot : '';
    const ss = 4;
    const out = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let r = 0, gg = 0, b = 0, a = 0;
        for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
          const c = sample(((x + (sx + 0.5) / ss) / size) * 200, ((y + (sy + 0.5) / ss) / size) * 200, size, d);
          if (c) { r += c[0]; gg += c[1]; b += c[2]; a++; }
        }
        const o = (y * size + x) * 4;
        out[o] = a ? Math.round(r / a) : 0; out[o + 1] = a ? Math.round(gg / a) : 0; out[o + 2] = a ? Math.round(b / a) : 0;
        out[o + 3] = Math.round((a / (ss * ss)) * 255);
      }
    }
    return out;
  }

  DLX.signet = Object.freeze({ DOTS, SIZES, PFADE: Object.freeze({ signet: SIGNET.map((s) => s.d), kraeftig: KRAEFTIG.map((s) => s.d) }), rgba });
})(globalThis);
