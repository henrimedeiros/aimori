// Erzeugt aus extension/common/aisites.js (eine Quelle der Wahrheit):
// - Manifest: optional_host_permissions, WAR fuer ui/aibanner.html, CSP frame-ancestors
// - docs/ki-seiten-liste.md: Tabelle und Beispiel fuer die Browser-Richtlinie URLBlocklist
// (Design-Review KI-Seiten 14.10.2026, Auflagen 1, 9, 12). Aufruf: Teil von npm run build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, ROOT } from '../tests/helpers/load.mjs';

export const AI = () => load(['common/aisites.js']).aisites;
const BANNER = 'ui/aibanner.html';

// Manifest mit den aus der Liste erzeugten Feldern; alles andere bleibt unveraendert.
export function manifestFor(m) {
  const ai = AI();
  const origins = Array.from(ai.origins());
  const out = JSON.parse(JSON.stringify(m));
  // activeTab und declarativeContent nur fuer die Training-Ampel (Design-Review Training-Ampel 16.10.2026, Auflage 1).
  // alarms nur fuer das Ende der Pause per Tastenkuerzel (Design-Review Alltag 14.10.2026, Auflage 8).
  out.permissions = ['storage', 'scripting', 'offscreen', 'activeTab', 'declarativeContent', 'alarms'];
  // Dazu https://*/* nur optional fuer vertrauliche Quellen (Zwischenablage-Schutz); angefordert
  // werden nur die Origins der Quellenliste (Design-Review Antwort/Zwischenablage 16.10.2026, Auflagen 7, 23).
  out.optional_host_permissions = origins.concat('https://*/*');
  // Waechter auch auf den statischen Seiten (gleiche Origins, kein neues Recht).
  for (const cs of out.content_scripts) if (!cs.js.includes('content/aiguard.js')) cs.js.splice(cs.js.indexOf('content/content.js'), 0, 'content/aiguard.js');
  const war = out.web_accessible_resources.filter((w) => !w.resources.includes(BANNER));
  war.push({ resources: [BANNER], matches: origins, use_dynamic_url: true });
  out.web_accessible_resources = war;
  const fa = "frame-ancestors 'self' " + origins.map((o) => o.slice(0, -2)).join(' ') + ';';
  out.content_security_policy.extension_pages = out.content_security_policy.extension_pages.replace(/frame-ancestors [^;]*;/, fa);
  return out;
}

const KAT = { chat: 'Chat', suche: 'Suche', code: 'Code', bild: 'Bild', video: 'Video', audio: 'Audio', begleiter: 'Begleiter', sammler: 'Mehrere Modelle', schreiben: 'Schreiben', uebersetzung: 'Übersetzung', praesentation: 'Präsentation' };

export function renderDoc() {
  const ai = AI();
  const L = ['# Bekannte KI-Seiten', '',
    'Automatisch erzeugt aus `extension/common/aisites.js` mit `npm run build` – nicht von Hand ändern. Stand der Liste: ' + ai.STAND + '.', '',
    'Die IDs gelten für die Richtlinien `allowedAiSites` und `blockedAiSites` (siehe `docs/ki-seiten.md`). ' +
    '«Anbieter-Sitz» ist das Land des Firmensitzes laut öffentlichen Angaben – keine Aussage darüber, wo Daten gespeichert oder verarbeitet werden.', '',
    '| ID | Name | Kategorie | Anbieter-Sitz | Hosts |', '|---|---|---|---|---|'];
  for (const x of ai.LIST) L.push(`| \`${x.id}\` | ${x.name} | ${KAT[x.kategorie] || x.kategorie} | ${x.anbieterSitz} | ${x.hosts.map((h) => '`' + h + (x.pfad ? x.pfad : '') + '`').join(', ')} |`);
  L.push('', `Summe: ${ai.LIST.length} KI-Seiten, ${ai.origins().length} Hosts.`, '',
    '## Harte Sperre mit der Browser-Richtlinie URLBlocklist', '',
    'Die Sperrseite der Erweiterung ist eine Überlagerung. Eine harte Sperre gibt es nur mit der Browser-Richtlinie `URLBlocklist` (Edge und Chrome). ' +
    'Beispiel mit allen Hosts der Liste – vor dem Einsatz die freigegebenen Tools entfernen:', '', '```json', '{', '  "URLBlocklist": [');
  const entries = ai.LIST.flatMap((x) => x.hosts.map((h) => '    ' + JSON.stringify(h + (x.pfad || ''))));
  L.push(entries.join(',\n'), '  ]', '}', '```', '');
  return L.join('\n');
}

export const TRAIN = () => load(['common/aisites.js', 'common/training.js'], { URL }).training;
const WERT = { ja: 'ja (Standard an)', nein: 'nein', teils: 'teils', unbekannt: 'unklar' };

// docs/ki-training-liste.md aus extension/common/training.js (Auflage 15).
export function renderTrainingDoc() {
  const ai = AI(), tr = TRAIN();
  const L = ['# KI-Training je Seite', '',
    'Automatisch erzeugt aus `extension/common/training.js` mit `npm run build` – nicht von Hand ändern. Stand der Angaben: ' + tr.STAND + '. Erklärung: [Training-Ampel](ki-training.md).', '',
    'Angaben laut Herstellerquelle, ohne Gewähr. «Privat» = Gratis- und Einzelkonten, «Firma» = Team-/Enterprise-Konten; «–» = keine Firmenvariante.', '',
    '| ID | Name | Privat | Firma | Opt-out-Einstellung | Quelle | Hinweis |', '|---|---|---|---|---|---|---|'];
  for (const x of tr.LIST) {
    const s = ai.byId(x.id);
    L.push(`| \`${x.id}\` | ${s ? s.name : x.id} | ${WERT[x.personal]} | ${x.business === null ? '–' : WERT[x.business]} | ${x.optOut ? '<' + x.optOut + '>' : '–'} | <${x.quelle}> | ${x.notiz} |`);
  }
  const n = (f) => tr.LIST.filter((x) => tr.ampel(x.id, 'personal', Date.parse(tr.STAND)).farbe === f).length;
  L.push('', `Summe: ${tr.LIST.length} Seiten. Ampel für Privatkonten: ${n('rot')} rot, ${n('gelb')} gelb, ${n('gruen')} grün.`, '');
  return L.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'docs', 'ki-training-liste.md'), renderTrainingDoc());
  const mf = path.join(ROOT, 'extension', 'manifest.json');
  fs.writeFileSync(mf, JSON.stringify(manifestFor(JSON.parse(fs.readFileSync(mf, 'utf8'))), null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'docs', 'ki-seiten-liste.md'), renderDoc());
  console.log('extension/manifest.json und docs/ki-seiten-liste.md geschrieben');
}
