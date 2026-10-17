// Mandanten-Vorlagen: eine Basis-Richtlinie plus Abweichungen je Kunde in einer
// JSON-Datei -> je Kunde die Rollout-Dateien fuer Intune (Settings Catalog,
// Custom OMA-URI) und GPO (ADMX, .reg, PowerShell) samt Kurzanleitung.
// Nur lokale Dateien: kein Netz, keine Graph-/Tenant-Aufrufe, nichts wird hochgeladen.
// Design-Review: docs/sicherheit/design-review-mandanten.md (Auflagen 1-11).
//
// Aufruf: node scripts/mandanten.mjs <mandanten.json> [--out <ordner>] [--force]
// Standard-Ausgabe: Ordner "ausgabe" neben der Mandanten-Datei (gitignoriert).
// Die Ausgabe kann Salz und Pruefsummen eigener Begriffe enthalten: vertraulich
// behandeln, nicht in Sync-Ordnern ablegen. Konsole und Fehler nennen nur
// Dateinamen, Feldpfade und Zahlen, nie Werte (Auflage 10).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { validate } from './lib/schema.mjs';
import { build, extensionId, policiesFrom } from './build-admx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const SCHEMA_TEXT = fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8');
const SCHEMA = JSON.parse(SCHEMA_TEXT);
const DEPLOY_PS1 = fs.readFileSync(path.join(ROOT, 'enterprise', 'Deploy-Policy.ps1'));

export const MAX_PNG = 64 * 1024;
export const MAX_SVG = 32 * 1024;
export const MAX_LOGO = 140000; // wie extension/common/policy.js
const BROWSER = {
  edge: { label: 'Microsoft Edge', reg: 'SOFTWARE\\Policies\\Microsoft\\Edge', app: 'DlxEdge', ps: 'Edge' },
  chrome: { label: 'Google Chrome', reg: 'SOFTWARE\\Policies\\Google\\Chrome', app: 'DlxChrome', ps: 'Chrome' },
};

class MandantenFehler extends Error {}
const fehler = (m) => { throw new MandantenFehler(m); };

// --- Eingabe pruefen -----------------------------------------------------------
const VERBOTEN = new Set(['__proto__', 'constructor', 'prototype']);
const istObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Auflage 1: gefaehrliche Schluessel auf jeder Ebene ablehnen.
export function pruefeSchluessel(v, pfad = '$') {
  if (Array.isArray(v)) v.forEach((x, i) => pruefeSchluessel(x, `${pfad}[${i}]`));
  else if (istObjekt(v)) {
    for (const k of Object.keys(v)) {
      if (VERBOTEN.has(k)) fehler(`${pfad}: Schluessel nicht erlaubt`);
      pruefeSchluessel(v[k], `${pfad}.${k}`);
    }
  }
}

// Objekte tief zusammenfuehren, Listen und einfache Werte ersetzen (Auflage 1).
export function merge(basis, abw) {
  pruefeSchluessel(basis); pruefeSchluessel(abw);
  const out = {};
  for (const [k, v] of Object.entries(basis || {})) out[k] = structuredClone(v);
  for (const [k, v] of Object.entries(abw || {})) {
    out[k] = istObjekt(v) && istObjekt(out[k]) ? merge(out[k], v) : structuredClone(v);
  }
  return out;
}

const RESERVIERT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
export function pruefeKundenId(id, pfad) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || RESERVIERT.test(id)) fehler(`${pfad}: ungueltige Kunden-id (a-z, 0-9, -, max. 40)`);
}

// Auflage 3: nur https, ohne Zugangsdaten und Fragment; Zeichen, die in Forcelist
// (';') oder Registry/Skript stoeren koennten, gar nicht erst zulassen.
export function pruefeUrl(u, pfad) {
  let url;
  if (typeof u !== 'string' || u.length > 2000 || /[\s;'"`<>\\]/.test(u) || /[^\x21-\x7e]/.test(u)) fehler(`${pfad}: ungueltige URL`);
  try { url = new URL(u); } catch (e) { fehler(`${pfad}: ungueltige URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || u.includes('#')) fehler(`${pfad}: nur https ohne Zugangsdaten und Fragment`);
}

function erweiterung(cfg) {
  const e = cfg.erweiterung === undefined ? { edge: {}, chrome: {} } : cfg.erweiterung;
  if (!istObjekt(e) || !Object.keys(e).length) fehler('$.erweiterung: Objekt mit edge und/oder chrome erwartet');
  const out = {};
  for (const [b, v] of Object.entries(e)) {
    if (!BROWSER[b]) fehler(`$.erweiterung.${b}: nur edge oder chrome`);
    if (!istObjekt(v)) fehler(`$.erweiterung.${b}: Objekt erwartet`);
    for (const k of Object.keys(v)) if (k !== 'id' && k !== 'updateUrl') fehler(`$.erweiterung.${b}.${k}: unbekannte Eigenschaft`);
    const id = v.id === undefined ? extensionId(JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'))) : v.id;
    if (typeof id !== 'string' || !/^[a-p]{32}$/.test(id)) fehler(`$.erweiterung.${b}.id: 32 Zeichen a-p erwartet`);
    if (v.updateUrl !== undefined) pruefeUrl(v.updateUrl, `$.erweiterung.${b}.updateUrl`);
    out[b] = { id, updateUrl: v.updateUrl };
  }
  return out;
}

// --- Logo ----------------------------------------------------------------------
// Auflage 4: Pfad nur relativ und innerhalb des Mandanten-Ordners, keine Links,
// Groesse vor dem Einlesen.
export function ladeLogo(ordner, rel, pfad) {
  if (typeof rel !== 'string' || !rel || rel.length > 200 || /[\x00-\x1f]/.test(rel)) fehler(`${pfad}: ungueltiger Logo-Pfad`);
  const teile = rel.split(/[\\/]/);
  if (path.isAbsolute(rel) || /^[\\/]/.test(rel) || rel.includes(':') || teile.includes('..') || teile.includes('')) {
    fehler(`${pfad}: Logo-Pfad muss relativ im Ordner der Mandanten-Datei liegen`);
  }
  const basis = fs.realpathSync(ordner);
  let p = basis;
  for (const t of teile) {
    p = path.join(p, t);
    let st;
    try { st = fs.lstatSync(p); } catch (e) { fehler(`${pfad}: Logo-Datei nicht gefunden`); }
    if (st.isSymbolicLink()) fehler(`${pfad}: Links/Junctions sind nicht erlaubt`);
  }
  const echt = fs.realpathSync(p);
  const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  if (!fold(echt).startsWith(fold(basis.endsWith(path.sep) ? basis : basis + path.sep))) fehler(`${pfad}: Logo-Pfad ausserhalb des Ordners`);
  const st = fs.statSync(echt);
  if (!st.isFile()) fehler(`${pfad}: keine Datei`);
  const art = /\.png$/i.test(echt) ? 'png' : /\.svg$/i.test(echt) ? 'svg' : null;
  if (!art) fehler(`${pfad}: nur .png oder .svg`);
  if (st.size > (art === 'png' ? MAX_PNG : MAX_SVG)) fehler(`${pfad}: Logo zu gross (PNG max. ${MAX_PNG / 1024} KB, SVG max. ${MAX_SVG / 1024} KB)`);
  const buf = fs.readFileSync(echt);
  if (art === 'png') pruefePng(buf, pfad); else pruefeSvg(buf, pfad);
  const uri = `data:image/${art === 'png' ? 'png' : 'svg+xml'};base64,${buf.toString('base64')}`;
  if (uri.length > MAX_LOGO) fehler(`${pfad}: Logo zu gross`);
  // Dieselbe Pruefung wie die Erweiterung beim Laden der Richtlinie (Auflage 14): ein hier
  // angenommenes Logo darf dort nicht still durch das Standardsymbol ersetzt werden.
  if (erweiterungsPruefer().validate({ branding: { logo: uri } }).errors.length) fehler(`${pfad}: Logo wird von der Erweiterung abgelehnt`);
  return uri;
}

let pruefer = null;
function erweiterungsPruefer() {
  if (!pruefer) {
    const ctx = vm.createContext({ URL, TextEncoder, performance, atob });
    for (const f of ['branding.js', 'engine/core.js', 'engine/muster.js', 'engine/packs-global.js', 'engine/packs-secrets.js', 'engine/packs-country.js',
      'engine/packs-world.js', 'engine/dictionary.js', 'engine/engine.js', 'common/aisites.js', 'common/quellen.js', 'common/policy.js']) vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctx, { filename: f });
    pruefer = ctx.DLX.policy;
  }
  return pruefer;
}

export function pruefePng(buf, pfad = 'logo') {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(sig) || buf.readUInt32BE(8) !== 13 || buf.toString('latin1', 12, 16) !== 'IHDR') fehler(`${pfad}: kein gueltiges PNG`);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (!w || !h || w > 512 || h > 512) fehler(`${pfad}: PNG hoechstens 512x512 Pixel`);
}

// Auflage 5: SVG per Tokenizer mit Allowlist pruefen; nichts wird still bereinigt,
// Unerlaubtes bricht ab (der Admin entfernt es selbst aus der Datei).
const SVG_ELEMENTE = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient',
  'radialgradient', 'stop', 'title', 'desc', 'clippath', 'mask', 'use', 'symbol', 'text', 'tspan']);
const SVG_ATTRIBUTE = new Set(['xmlns', 'xmlns:xlink', 'version', 'id', 'width', 'height', 'viewbox', 'preserveaspectratio', 'x', 'y', 'x1', 'y1',
  'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'offset',
  'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'clip-path', 'clip-rule', 'clippathunits', 'mask',
  'maskunits', 'maskcontentunits', 'href', 'xlink:href', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'letter-spacing']);
const ENTITAET = /&(?!(amp|lt|gt|quot|apos);)/;

export function pruefeSvg(buf, pfad = 'logo') {
  const bad = (m) => fehler(`${pfad}: SVG ${m}`);
  if (buf[0] === 0xef || buf[0] === 0xfe || buf[0] === 0xff || buf.includes(0)) bad('mit BOM, UTF-16 oder NUL nicht erlaubt');
  let s;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { bad('ist kein gueltiges UTF-8'); }
  let i = 0;
  const decl = /^<\?xml\s+version\s*=\s*["']1\.[01]["'](\s+encoding\s*=\s*["']([^"']*)["'])?(\s+standalone\s*=\s*["'](yes|no)["'])?\s*\?>/.exec(s);
  if (decl) {
    if (decl[2] && decl[2].toLowerCase() !== 'utf-8') bad('nur mit Kodierung UTF-8');
    i = decl[0].length;
  }
  const stapel = [];
  let wurzel = false;
  const tagName = /<([A-Za-z_][\w.:-]*)/y, attr = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y, ende = /\s*(\/?)>/y, schluss = /<\/([A-Za-z_][\w.:-]*)\s*>/y;
  const elName = (n) => {
    const l = n.toLowerCase();
    if (l.includes(':') && !l.startsWith('svg:')) bad('Element mit fremdem Namensraum');
    return l.replace(/^svg:/, '');
  };
  while (i < s.length) {
    if (s.startsWith('<!--', i)) {
      const e = s.indexOf('-->', i + 4);
      if (e < 0) bad('Kommentar ohne Ende');
      i = e + 3; continue;
    }
    if (s.startsWith('<!', i) || s.startsWith('<?', i)) bad('mit DOCTYPE, CDATA oder Verarbeitungsanweisung nicht erlaubt');
    if (s.startsWith('</', i)) {
      schluss.lastIndex = i;
      const m = schluss.exec(s);
      if (!m || stapel.pop() !== elName(m[1])) bad('ist nicht wohlgeformt');
      i = schluss.lastIndex; continue;
    }
    if (s[i] === '<') {
      tagName.lastIndex = i;
      const m = tagName.exec(s);
      if (!m) bad('ist nicht wohlgeformt');
      const name = elName(m[1]);
      if (!SVG_ELEMENTE.has(name)) bad('Element nicht erlaubt');
      if (!stapel.length && (wurzel || name !== 'svg')) bad('braucht genau ein svg-Wurzelelement');
      wurzel = true;
      let j = tagName.lastIndex;
      const gesehen = new Set();
      for (;;) {
        attr.lastIndex = j;
        const a = attr.exec(s);
        if (!a) break;
        j = attr.lastIndex;
        const an = a[1].toLowerCase(), av = a[2] !== undefined ? a[2] : a[3];
        if (!SVG_ATTRIBUTE.has(an) || gesehen.has(an)) bad('Attribut nicht erlaubt');
        gesehen.add(an);
        if (av.includes('<') || av.includes('&#') || ENTITAET.test(av)) bad('Attributwert nicht erlaubt');
        if (/javascript:/i.test(av.replace(/\s+/g, ''))) bad('Attributwert nicht erlaubt');
        if ((an === 'href' || an === 'xlink:href') && !/^#[\w.-]+$/.test(av)) bad('nur interne Verweise (#id) erlaubt');
        if (/url\s*\(\s*(?!["']?#)/i.test(av)) bad('nur interne url(#id) erlaubt');
        if (an === 'xmlns' && av !== 'http://www.w3.org/2000/svg') bad('falscher Namensraum');
        if (an === 'xmlns:xlink' && av !== 'http://www.w3.org/1999/xlink') bad('falscher Namensraum');
      }
      ende.lastIndex = j;
      const e = ende.exec(s);
      if (!e) bad('ist nicht wohlgeformt');
      if (!e[1]) stapel.push(name);
      i = ende.lastIndex; continue;
    }
    const n = s.indexOf('<', i);
    const text = s.slice(i, n < 0 ? s.length : n);
    if ((!stapel.length && text.trim()) || ENTITAET.test(text) || text.includes('&#') || text.includes('>')) bad('Text nicht erlaubt');
    i = n < 0 ? s.length : n;
  }
  if (!wurzel || stapel.length) bad('ist nicht wohlgeformt');
}

// --- Richtlinie je Kunde ---------------------------------------------------------
export function kundeRichtlinie(cfg, kunde, ordner, k) {
  const pfad = `$.kunden[${k}]`;
  if (!istObjekt(kunde)) fehler(`${pfad}: Objekt erwartet`);
  for (const key of Object.keys(kunde)) if (!['id', 'name', 'logo', 'richtlinie'].includes(key)) fehler(`${pfad}.${key}: unbekannte Eigenschaft`);
  pruefeKundenId(kunde.id, `${pfad}.id`);
  if (typeof kunde.name !== 'string' || !kunde.name.trim() || kunde.name.length > 80) fehler(`${pfad}.name: 1-80 Zeichen`);
  if (kunde.richtlinie !== undefined && !istObjekt(kunde.richtlinie)) fehler(`${pfad}.richtlinie: Objekt erwartet`);
  const p = merge(cfg.basis || {}, kunde.richtlinie || {});
  if (p.branding !== undefined && !istObjekt(p.branding)) fehler(`${pfad}.richtlinie.branding: Objekt erwartet`);
  p.branding = Object.assign({}, p.branding);
  if (!p.branding.companyName) p.branding.companyName = kunde.name;
  if (kunde.logo !== undefined) p.branding.logo = ladeLogo(ordner, kunde.logo, `${pfad}.logo`);
  // Auflage 2: Schema-Pruefung erst auf der fertigen Richtlinie.
  const errs = validate(SCHEMA, p);
  if (errs.length) fehler(`${pfad}: Richtlinie passt nicht zum Schema: ${errs.join('; ')}`);
  return p;
}

// --- Ausgabeformate ------------------------------------------------------------
const STEUER = /[\x00-\x1f\x7f]/;

// Auflage 6: .reg (UTF-16LE mit BOM). Genau eine Loeschzeile, Pfad nur aus der
// geprueften Erweiterungs-id; Werte escaped, Steuerzeichen brechen ab.
export function regDatei(browser, id, policy) {
  if (!/^[a-p]{32}$/.test(id) || !BROWSER[browser]) fehler('reg: ungueltige Erweiterung');
  const wurzel = `HKEY_LOCAL_MACHINE\\${BROWSER[browser].reg}\\3rdparty\\extensions\\${id}\\policy`;
  const abschnitte = new Map([[wurzel, []]]);
  const esc = (v, pfad) => {
    if (STEUER.test(v)) fehler(`${pfad}: Steuerzeichen/Zeilenumbruch nicht erlaubt`);
    return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  };
  const name = (k, pfad) => {
    if (STEUER.test(k) || /[\\[\]]/.test(k) || k.length > 255) fehler(`${pfad}: Schluesselname nicht erlaubt`);
    return k;
  };
  const wert = (key, n, v, pfad) => {
    const z = abschnitte.get(key);
    if (typeof v === 'boolean') z.push(`"${esc(n, pfad)}"=dword:0000000${v ? 1 : 0}`);
    else if (Number.isInteger(v) && v >= 0 && v <= 0xffffffff) z.push(`"${esc(n, pfad)}"=dword:${v.toString(16).padStart(8, '0')}`);
    else if (typeof v === 'string') z.push(`"${esc(n, pfad)}"="${esc(v, pfad)}"`);
    else fehler(`${pfad}: Wert nicht unterstuetzt`);
  };
  const lauf = (obj, key, pfad) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = `${pfad}.${k}`;
      if (Array.isArray(v) || istObjekt(v)) {
        const sub = `${key}\\${name(k, p)}`;
        abschnitte.set(sub, []);
        if (Array.isArray(v)) v.forEach((x, i) => wert(sub, String(i + 1), typeof x === 'string' ? x : fehler(`${p}[${i}]: nur Text`), `${p}[${i}]`));
        else lauf(v, sub, p);
      } else wert(key, name(k, p), v, p);
    }
  };
  lauf(policy, wurzel, '$');
  const L = ['Windows Registry Editor Version 5.00', '', `[-${wurzel}]`, ''];
  for (const [k, z] of abschnitte) L.push(`[${k}]`, ...z, '');
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(L.join('\r\n') + '\r\n', 'utf16le')]);
}

// Auflage 8: XML-Attributwert; fuer XML 1.0 unzulaessige Zeichen brechen ab.
export function xmlAttr(v, pfad) {
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]/.test(v) || /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/.test(v)) fehler(`${pfad}: Zeichen nicht erlaubt`);
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(//g, '&#xF000;');
}

const holen = (obj, punkte) => punkte.split('.').reduce((o, k) => (istObjekt(o) && Object.hasOwn(o, k) ? o[k] : undefined), obj);

// Custom OMA-URI per ADMX-Ingestion: erst die ADMX der Erweiterung, dann je gesetzter
// Richtlinie eine Zeile <enabled/> mit <data>-Elementen (Listen mit U+F000 getrennt).
export function omaZeilen(browser, id, policy) {
  const b = BROWSER[browser];
  const admx = build(id).files[`dlx-${browser}.admx`];
  const zeilen = [{ name: `ADMX ${b.label}`, omaUri: `./Device/Vendor/MSFT/Policy/ConfigOperations/ADMXInstall/${b.app}/Policy/dlx${browser}`, dataType: 'String', value: admx }];
  for (const p of policiesFrom(SCHEMA)) {
    const v = policy[p.name];
    if (v === undefined) continue;
    let wert;
    if (p.boolean) wert = v ? '<enabled/>' : '<disabled/>';
    else {
      const daten = [];
      for (const e of p.elements) {
        const x = e.key ? holen(policy, e.key) : v;
        if (x === undefined) continue;
        let t;
        if (e.kind === 'list') t = (e.explicit ? Object.entries(x).flat() : x).map(String).join('');
        else t = String(x);
        daten.push(`<data id="${e.id}" value="${xmlAttr(t, `$.${e.key || p.name}`)}"/>`);
      }
      wert = '<enabled/>' + daten.join('');
    }
    zeilen.push({ name: p.name, omaUri: `./Device/Vendor/MSFT/Policy/Config/${b.app}~Policy~dlx_root/${p.name}`, dataType: 'String', value: wert });
  }
  return zeilen;
}

export function extensionSettings(id, updateUrl) {
  return JSON.stringify({ [id]: { installation_mode: 'force_installed', update_url: updateUrl } });
}

// Auflage 7: Deploy-Skript, Schema, Richtlinie und URL nur Base64-kodiert; keine
// Eingabewerte im Skript-Code. Temporaere Dateien nur fuer Administratoren, SYSTEM
// und den ausfuehrenden Benutzer lesbar, danach geloescht.
export function rolloutPs1(erw, policy) {
  const b64 = (x) => Buffer.from(x).toString('base64');
  const aufrufe = Object.entries(erw).map(([b, e]) => {
    const url = e.updateUrl ? ` -UpdateUrl ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(e.updateUrl)}')))` : '';
    return `  & $deploy -ExtensionId '${e.id}' -Browser ${BROWSER[b].ps} -PolicyJson $policyPfad -SchemaPath $schemaPfad${url} -PlanOnly:$PlanOnly -WhatIf:$WhatIfPreference`;
  });
  return ['<#',
    '.SYNOPSIS',
    '  Rollout der Browser-Erweiterungs-Richtlinie fuer einen Kunden (erzeugt von scripts/mandanten.mjs).',
    '.DESCRIPTION',
    '  Enthaelt Deploy-Policy.ps1, managed_schema.json und die Richtlinie Base64-kodiert.',
    '  Prueft die Richtlinie gegen das Schema, sichert vorherige Werte und ersetzt nur den',
    '  eigenen Schluessel ...\\3rdparty\\extensions\\<ID>\\policy. Vorher mit -PlanOnly pruefen.',
    '  Vertraulich: kann Salz und Pruefsummen eigener Begriffe enthalten.',
    '.EXAMPLE',
    '  powershell.exe -NoProfile -ExecutionPolicy Bypass -File Rollout.ps1 -PlanOnly',
    '#>',
    '[CmdletBinding(SupportsShouldProcess = $true)]',
    'param([switch]$PlanOnly)',
    'Set-StrictMode -Version 2.0',
    "$ErrorActionPreference = 'Stop'",
    `$deploy = [ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(DEPLOY_PS1)}')))`,
    "$dir = Join-Path ([IO.Path]::GetTempPath()) ('dlx-rollout-' + [Guid]::NewGuid().ToString('N'))",
    '$acl = New-Object System.Security.AccessControl.DirectorySecurity',
    '$acl.SetAccessRuleProtection($true, $false)',
    "foreach ($sid in @((New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')), (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')), [Security.Principal.WindowsIdentity]::GetCurrent().User)) {",
    "  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))",
    '}',
    'New-Item -ItemType Directory -Path $dir | Out-Null',
    'try {',
    '  Set-Acl -LiteralPath $dir -AclObject $acl',
    "  $schemaPfad = Join-Path $dir 'managed_schema.json'",
    "  $policyPfad = Join-Path $dir 'policy.json'",
    `  [IO.File]::WriteAllBytes($schemaPfad, [Convert]::FromBase64String('${b64(SCHEMA_TEXT)}'))`,
    `  [IO.File]::WriteAllBytes($policyPfad, [Convert]::FromBase64String('${b64(JSON.stringify(policy, null, 2))}'))`,
    ...aufrufe,
    '} finally {',
    '  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue',
    '}',
    ''].join('\r\n');
}

function anleitung(kunde, erw, dateien) {
  const has = (f) => dateien.includes(f);
  const L = [`# Rollout: ${kunde.name}`, '',
    'Erzeugt von `scripts/mandanten.mjs`. **Vertraulich:** Die Dateien können Salz und Prüfsummen eigener Begriffe enthalten – nicht in Sync-Ordnern ablegen, nach dem Rollout löschen.',
    'Schritt-für-Schritt-Anleitung: `docs/fuer-unternehmen.md` im Paket.', '',
    '| Datei | Zweck |', '|---|---|',
    '| `richtlinie.json` | Fertige Richtlinie (Basis + Abweichungen, gegen das Schema geprüft) |'];
  for (const b of Object.keys(erw)) {
    const l = BROWSER[b].label;
    if (has(`intune/${b}-extensionsettings.json`)) L.push(`| \`intune/${b}-extensionsettings.json\` | ${l}: Wert für „ExtensionSettings“ (Erweiterung erzwingen) im Einstellungskatalog bzw. in der GPO |`);
    L.push(`| \`intune/${b}-oma-uri.json\` | ${l}: Zeilen für ein benutzerdefiniertes Intune-Profil (OMA-URI, ADMX-Ingestion) |`);
    L.push(`| \`gpo/${b}-richtlinie.reg\` | ${l}: Registry-Variante (ersetzt nur den eigenen Schlüssel) |`);
  }
  L.push('| `Rollout.ps1` | PowerShell-Rollout (Intune-Plattformskript, GPO-Startskript, RMM); zuerst mit `-PlanOnly` |',
    '| `../_admx/` | ADMX/ADML für GPO (Central Store) bzw. Intune-Import |', '');
  for (const [b, e] of Object.entries(erw)) {
    L.push(`- ${BROWSER[b].label}: Erweiterungs-ID \`${e.id}\`${e.updateUrl ? '' : ' – keine Update-URL angegeben: Erweiterung wird nicht erzwungen (nur Richtlinie).'}`);
  }
  L.push('');
  return L.join('\r\n');
}

// --- Ausgabe schreiben ---------------------------------------------------------
// Auflage 9: Ausgabe im Repo nur, wenn gitignoriert; keine Links; atomar.
function repoVon(p) {
  for (let d = p; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

export function pruefeAusgabe(out) {
  const abs = path.resolve(out);
  let vorhanden = abs;
  while (!fs.existsSync(vorhanden)) vorhanden = path.dirname(vorhanden);
  const repo = repoVon(fs.realpathSync(vorhanden));
  if (!repo) return abs;
  try {
    execFileSync('git', ['-C', repo, 'check-ignore', '-q', '--', path.relative(repo, path.join(fs.realpathSync(vorhanden), path.relative(vorhanden, abs)))], { stdio: 'ignore', windowsHide: true });
  } catch (e) {
    fehler('Ausgabeordner liegt in einem Git-Repo und ist nicht gitignoriert (oder Git fehlt) - anderen Ordner mit --out waehlen');
  }
  return abs;
}

function keinLink(p) {
  try { if (fs.lstatSync(p).isSymbolicLink()) fehler(`${path.basename(p)}: Links/Junctions sind nicht erlaubt`); } catch (e) { if (e instanceof MandantenFehler) throw e; }
}

function schreibe(ordner, rel, inhalt, force) {
  const ziel = path.join(ordner, rel);
  let d = ordner;
  keinLink(d);
  for (const t of path.relative(ordner, path.dirname(ziel)).split(path.sep).filter(Boolean)) { d = path.join(d, t); keinLink(d); }
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  keinLink(ziel);
  if (fs.existsSync(ziel) && !force) fehler(`${rel}: existiert bereits (--force ueberschreibt nur bekannte Dateien)`);
  const tmp = `${ziel}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, inhalt, { flag: 'wx' });
  fs.renameSync(tmp, ziel);
}

// Liest die Mandanten-Datei und liefert je Kunde { id, dateien: { rel: Inhalt } }.
export function erzeuge(datei) {
  const ordner = path.dirname(path.resolve(datei));
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(datei, 'utf8').replace(/^﻿/, '')); } catch (e) { fehler(`${path.basename(datei)}: kein gueltiges JSON`); }
  if (!istObjekt(cfg)) fehler('$: Objekt erwartet');
  pruefeSchluessel(cfg);
  for (const k of Object.keys(cfg)) if (!['$kommentar', 'erweiterung', 'basis', 'kunden'].includes(k)) fehler(`$.${k}: unbekannte Eigenschaft`);
  if (cfg.basis !== undefined && !istObjekt(cfg.basis)) fehler('$.basis: Objekt erwartet');
  if (!Array.isArray(cfg.kunden) || !cfg.kunden.length || cfg.kunden.length > 500) fehler('$.kunden: Liste mit 1-500 Kunden erwartet');
  const erw = erweiterung(cfg);
  const ids = new Set();
  const kunden = cfg.kunden.map((kunde, k) => {
    const policy = kundeRichtlinie(cfg, kunde, ordner, k);
    if (ids.has(kunde.id)) fehler(`$.kunden[${k}].id: doppelt`);
    ids.add(kunde.id);
    const dateien = { 'richtlinie.json': JSON.stringify(policy, null, 2) + '\n' };
    for (const [b, e] of Object.entries(erw)) {
      if (e.updateUrl) dateien[`intune/${b}-extensionsettings.json`] = extensionSettings(e.id, e.updateUrl) + '\n';
      dateien[`intune/${b}-oma-uri.json`] = JSON.stringify(omaZeilen(b, e.id, policy), null, 2) + '\n';
      dateien[`gpo/${b}-richtlinie.reg`] = regDatei(b, e.id, policy);
    }
    dateien['Rollout.ps1'] = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(rolloutPs1(erw, policy))]);
    dateien['ANLEITUNG.md'] = anleitung(kunde, erw, Object.keys(dateien));
    return { id: kunde.id, dateien };
  });
  const admx = {};
  for (const [b, e] of Object.entries(erw)) {
    for (const [rel, inhalt] of Object.entries(build(e.id).files)) if (rel.endsWith(`dlx-${b}.admx`) || rel.endsWith(`dlx-${b}.adml`)) admx[`${b}/${rel}`] = inhalt;
  }
  return { kunden, admx };
}

export function schreibeAlles(ergebnis, out, force) {
  const ziel = pruefeAusgabe(out);
  fs.mkdirSync(ziel, { recursive: true });
  keinLink(ziel);
  const alle = Object.keys(ergebnis.admx).map((rel) => path.join(ziel, '_admx', rel))
    .concat(...ergebnis.kunden.map((k) => Object.keys(k.dateien).map((rel) => path.join(ziel, k.id, rel))));
  if (!force && alle.some((p) => fs.existsSync(p))) fehler('Ausgabe existiert bereits (--force ueberschreibt nur bekannte Dateien)');
  let n = 0;
  for (const [rel, inhalt] of Object.entries(ergebnis.admx)) { schreibe(ziel, path.join('_admx', rel), inhalt, force); n++; }
  for (const k of ergebnis.kunden) {
    for (const [rel, inhalt] of Object.entries(k.dateien)) { schreibe(path.join(ziel, k.id), rel, inhalt, force); n++; }
  }
  return { ziel, dateien: n };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const datei = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  const oi = args.indexOf('--out');
  try {
    if (!datei) fehler('Aufruf: node scripts/mandanten.mjs <mandanten.json> [--out <ordner>] [--force]');
    const out = oi >= 0 ? args[oi + 1] : path.join(path.dirname(path.resolve(datei)), 'ausgabe');
    const erg = erzeuge(datei);
    const r = schreibeAlles(erg, out, args.includes('--force'));
    for (const k of erg.kunden) console.log(`${k.id}: ${Object.keys(k.dateien).length} Dateien`);
    console.log(`${erg.kunden.length} Kunden, ${r.dateien} Dateien geschrieben nach ${r.ziel}`);
    console.log('Vertraulich: kann Salz und Pruefsummen eigener Begriffe enthalten - nicht in Sync-Ordnern ablegen.');
  } catch (e) {
    console.error('Fehler: ' + (e instanceof MandantenFehler ? e.message : 'unerwartet (' + (e.code || e.name) + ')'));
    process.exitCode = 1;
  }
}
