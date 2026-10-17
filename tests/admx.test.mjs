// ADMX/ADML: aktuell zum Schema, wohlgeformtes XML (eigener Parser + auf
// Windows zusaetzlich der .NET-XML-Parser), alle Verweise aufgeloest (B19).
// PowerShell-Skripte: Syntax, Trockenlauf mit Beispiel-JSON, Schema-Abweisung.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, EXT, load as loadExt, ENGINE_FILES as EF } from './helpers/load.mjs';
import { build, extensionId, NESTED_DECIMAL_DEFAULT } from '../scripts/build-admx.mjs';

const ADMX_DIR = path.join(ROOT, 'enterprise', 'admx');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
const ID = extensionId(manifest);
const { files } = build();
const WIN = process.platform === 'win32';

// Minimaler Wohlgeformtheits-Pruefer: Tags balanciert, Attribute in Anfuehrungszeichen.
function wellFormed(xml) {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+="[^"<]*")*)\s*(\/?)>|<!--[\s\S]*?-->|([<>])/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[5]) return `loses Zeichen ${m[5]} bei ${m.index}`;
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return `falsches Ende ${m[2]}`; } else if (!m[4]) stack.push(m[2]);
  }
  return stack.length ? `offen: ${stack.join(',')}` : null;
}

test('ADMX/ADML im Repo sind aktuell (npm run build)', () => {
  for (const [rel, content] of Object.entries(files)) {
    assert.equal(fs.readFileSync(path.join(ADMX_DIR, rel), 'utf8').replace(/\r\n/g, '\n'), content.replace(/\r\n/g, '\n'), rel);
  }
});

test('ADMX/ADML sind wohlgeformtes XML', () => {
  for (const [rel, content] of Object.entries(files)) assert.equal(wellFormed(content), null, rel);
  if (WIN) {
    const list = Object.keys(files).map((r) => path.join(ADMX_DIR, r).replace(/'/g, "''"));
    const ps = list.map((f) => `[void][xml](Get-Content -Raw -Encoding UTF8 -LiteralPath '${f}')`).join('; ') + "; 'ok'";
    assert.equal(execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true }).trim(), 'ok');
  }
});

test('jede Richtlinie entspricht einem Schema-Schluessel, Registry-Pfad mit Erweiterungs-ID', () => {
  for (const b of ['chrome', 'edge']) {
    const admx = files[`dlx-${b}.admx`];
    const names = [...admx.matchAll(/<policy name="([^"]+)"/g)].map((x) => x[1]);
    assert.deepEqual(names.sort(), Object.keys(schema.properties).sort());
    const base = b === 'chrome' ? 'Software\\Policies\\Google\\Chrome' : 'Software\\Policies\\Microsoft\\Edge';
    for (const [, key] of admx.matchAll(/ key="([^"]+)"/g)) assert.ok(key.startsWith(`${base}\\3rdparty\\extensions\\${ID}\\policy`), key);
  }
});

test('alle $(string.x)/$(presentation.x) und refIds sind in en-US und de-DE aufgeloest', () => {
  for (const b of ['chrome', 'edge']) {
    const admx = files[`dlx-${b}.admx`];
    const strings = new Set([...admx.matchAll(/\$\(string\.([^)]+)\)/g)].map((x) => x[1]));
    const pres = new Set([...admx.matchAll(/\$\(presentation\.([^)]+)\)/g)].map((x) => x[1]));
    const elementIds = new Set([...admx.matchAll(/<(?:text|list|enum|decimal) id="([^"]+)"/g)].map((x) => x[1]));
    for (const lang of ['en-US', 'de-DE']) {
      const adml = files[`${lang}/dlx-${b}.adml`];
      const have = new Set([...adml.matchAll(/<string id="([^"]+)">/g)].map((x) => x[1]));
      for (const s of strings) assert.ok(have.has(s), `${lang} ${b}: string ${s}`);
      const havePres = new Set([...adml.matchAll(/<presentation id="([^"]+)">/g)].map((x) => x[1]));
      for (const p of pres) assert.ok(havePres.has(p), `${lang} ${b}: presentation ${p}`);
      for (const [, ref] of adml.matchAll(/refId="([^"]+)"/g)) assert.ok(elementIds.has(ref), `${lang} ${b}: refId ${ref}`);
    }
  }
});

test('XML-Escaping der Schema-Texte', () => {
  assert.ok(files['en-US/dlx-chrome.adml'].includes('&apos;send anyway&apos;'));
  assert.ok(!/<string id="[^"]+">[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/.test(files['de-DE/dlx-edge.adml']));
});

test('PowerShell-Skripte: Syntax fehlerfrei', { skip: !WIN }, () => {
  for (const f of ['Deploy-Policy.ps1', 'Remove-Policy.ps1', 'Detect-Policy.ps1']) {
    const p = path.join(ROOT, 'enterprise', f).replace(/'/g, "''");
    const ps = `$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${p}', [ref]$null, [ref]$e); $e.Count`;
    assert.equal(execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true }).trim(), '0', f);
  }
});

// Trockenlauf: schreibt nichts, braucht keine Adminrechte.
function plan(json, extra = []) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', path.join(ROOT, 'enterprise', 'Deploy-Policy.ps1'),
    '-ExtensionId', ID, '-PolicyJson', json, '-Browser', 'Edge', '-PlanOnly', ...extra], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

test('Deploy-Trockenlauf: Registry-Werte passen zur ADMX-Struktur', { skip: !WIN }, () => {
  const out = plan(path.join(ROOT, 'enterprise', 'example-policy.json'), ['-UpdateUrl', 'https://updates.example.com/dlx.xml']).trim().split(/\r?\n/);
  const key = `HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\3rdparty\\extensions\\${ID}\\policy`;
  assert.ok(out.includes(`${key}\\branding | productName | String | Example KI-Schutz`));
  assert.ok(out.includes(`${key}\\countryPacks | 1 | String | CH`));
  assert.ok(out.includes(`${key}\\rules | ch_ahv | String | block`));
  assert.ok(out.includes(`${key} | allowUserOverride | DWord | 0`));
  assert.ok(out.includes(`${key}\\dictionary\\hashes | 2 | String | 370e8dd07ee676d74fc43ddaf2eb5b20eb08bd8e209dcb39564df60ef728...`));
  assert.ok(out.includes(`${key}\\documentFingerprints | shingle | DWord | 8`), 'Ganzzahl im Unterschluessel');
  assert.ok(out.includes(`${key}\\documentFingerprints\\data | 1 | String | AAAAAQAAAAI=`), 'Fingerabdruck-Daten als Liste');
  assert.ok(out[out.length - 1].endsWith(`| String | ${ID};https://updates.example.com/dlx.xml`));
});

test('Deploy lehnt schema-widrige Richtlinie ab', { skip: !WIN }, () => {
  const bad = path.join(ROOT, 'scripts', 'e2e', 'tmp', 'bad-policy.json');
  fs.mkdirSync(path.dirname(bad), { recursive: true });
  fs.writeFileSync(bad, JSON.stringify({ language: 'xx', unknownKey: true, rules: { iban: 'delete' } }));
  assert.throws(() => plan(bad), (e) => /Richtlinie ungueltig/.test(String(e.stderr)) && /unknownKey/.test(String(e.stderr)));
  fs.rmSync(bad);
});

// KI-Antworten pruefen und Zwischenablage-Schutz (Pflicht-Pruefung 16.10.2026): neue Schluessel in allen Vorlagen.
test('ADMX/ADML enthalten answerCheck, sensitiveSources, sensitiveSourceAction (Edge/Chrome, en/de)', () => {
  for (const f of ['dlx-edge.admx', 'dlx-chrome.admx', 'en-US/dlx-edge.adml', 'de-DE/dlx-edge.adml', 'en-US/dlx-chrome.adml', 'de-DE/dlx-chrome.adml']) {
    const x = fs.readFileSync(path.join(ADMX_DIR, f), 'utf8');
    for (const k of ['answerCheck', 'sensitiveSources', 'sensitiveSourceAction']) assert.ok(x.includes(k), f + ': ' + k);
  }
});

// Fingerabdruecke und Sprachmodus (Design-Review Diktat und Fingerabdruecke 16.10.2026).
const FPX = loadExt(['branding.js', ...EF, 'engine/fingerabdruck.js', 'common/policy.js']);
const FP = FPX.fingerprint;
const P = FPX.policy;
const SALZ = 'a1'.repeat(32);
test('ADMX-Vorgaben der verschachtelten Zahlen = Standard der Erweiterung', () => {
  assert.deepEqual(NESTED_DECIMAL_DEFAULT, { 'documentFingerprints.shingle': FP.DEFAULTS.shingle, 'documentFingerprints.sample': FP.DEFAULTS.sample, 'documentFingerprints.minMatches': FP.DEFAULTS.minMatches });
  const p = P.validate({ documentFingerprints: { salt: SALZ, data: ['AAAAAQ=='] } }).value.documentFingerprints;
  assert.deepEqual([p.shingle, p.sample, p.minMatches, p.action], [FP.DEFAULTS.shingle, FP.DEFAULTS.sample, FP.DEFAULTS.minMatches, 'warn']);
  const admx = fs.readFileSync(path.join(ROOT, 'enterprise', 'admx', 'dlx-edge.admx'), 'utf8');
  assert.match(admx, /<list id="documentFingerprints_data" key="[^"]+\\policy\\documentFingerprints\\data" valuePrefix="" \/>/);
  assert.match(admx, /<decimal id="documentFingerprints_sample" [^>]*valueName="sample" minValue="1" maxValue="64"/);
  assert.match(admx, /<enum id="voiceMode" /);
});
