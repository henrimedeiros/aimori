// Tests: Laenderpakete automatisch nach Zeitzone und Sprachregion (nur lokal),
// mehrdeutige Zonen, Mischfaelle, Reise, Richtlinien-Vorrang, Ueberschreiben.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/policy.js', 'common/i18n.js'], { URL });
const P = DLX.policy;
const plain = (v) => JSON.parse(JSON.stringify(v));
const det = (timeZone, languages) => plain(P.detectCountries({ timeZone, languages }));
const packs = (timeZone, languages) => det(timeZone, languages).countries;
const ALL_GLOBAL = ['finance', 'secrets', 'contact', 'travel', 'marker', 'context', 'community'];

test('jedes Paketland wird ueber seine Zeitzone erkannt', () => {
  const cases = {
    'Europe/Zurich': ['CH', 'EU'], 'Europe/Berlin': ['DE', 'EU'], 'Europe/Vienna': ['AT', 'EU'], 'Europe/Paris': ['FR', 'EU'],
    'Europe/Rome': ['IT', 'EU'], 'Europe/Brussels': ['BE', 'EU'], 'Europe/Amsterdam': ['NL', 'EU'], 'America/New_York': ['US'], 'America/Sao_Paulo': ['BR'],
  };
  for (const [tz, want] of Object.entries(cases)) {
    const r = det(tz, ['en']);
    assert.deepEqual(r.countries, want, tz);
    assert.equal(r.reasons[want[0]], 'timezone', tz);
  }
  for (const tz of ['America/Chicago', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico', 'Pacific/Guam', 'US/Eastern', 'America/Indiana/Indianapolis']) {
    assert.deepEqual(packs(tz, ['en']), ['US'], tz);
  }
  for (const tz of ['Indian/Reunion', 'America/Martinique', 'America/Cayenne']) assert.deepEqual(packs(tz, []), ['FR', 'EU'], tz);
  // Laenderpakete weltweit (14.10.2026): je Land eine typische Zone.
  const welt = {
    'Europe/Vaduz': 'LI', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Lisbon': 'PT', 'Atlantic/Azores': 'PT', 'Europe/Luxembourg': 'LU', 'Europe/Stockholm': 'SE',
    'Europe/Copenhagen': 'DK', 'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI', 'Atlantic/Reykjavik': 'IS', 'Europe/Dublin': 'IE', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
    'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Zagreb': 'HR', 'Europe/Ljubljana': 'SI', 'Europe/Athens': 'GR',
    'Asia/Nicosia': 'CY', 'Europe/Malta': 'MT', 'Europe/Tallinn': 'EE', 'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV',
  };
  for (const [tz, c] of Object.entries(welt)) assert.deepEqual(det(tz, ['en']), { countries: [c, 'EU'], reasons: { [c]: 'timezone', EU: 'eu' } }, tz);
  const ausserEu = {
    'Europe/London': 'GB', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Mexico_City': 'MX', 'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR',
    'America/Santiago': 'CL', 'America/Bogota': 'CO', 'Asia/Kolkata': 'IN', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG',
    'Australia/Sydney': 'AU', 'Australia/Perth': 'AU', 'Pacific/Auckland': 'NZ', 'Africa/Johannesburg': 'ZA', 'Europe/Istanbul': 'TR', 'Asia/Jerusalem': 'IL',
    'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Africa/Lagos': 'NG',
  };
  for (const [tz, c] of Object.entries(ausserEu)) assert.deepEqual(det(tz, ['en']), { countries: [c], reasons: { [c]: 'timezone' } }, tz);
  // Jedes Paketland ist ueber mindestens eine Zone erreichbar.
  const erreicht = new Set(['CH', 'DE', 'AT', 'FR', 'IT', 'BE', 'NL', 'US', 'BR', 'EU', ...Object.values(welt), ...Object.values(ausserEu)]);
  assert.deepEqual(Array.from(P.COUNTRY).filter((c) => !erreicht.has(c)), []);
  for (const tz of ['America/Manaus', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Noronha', 'America/Rio_Branco', 'Brazil/East']) {
    assert.deepEqual(packs(tz, ['pt']), ['BR'], tz);
  }
  for (const tz of ['America/Sao', 'Asia/Bangkok', 'Africa/Cairo', 'Antarctica/Troll', 'America/Lima']) assert.deepEqual(packs(tz, ['en']), [], tz);
});

test('mehrdeutige Zonen: Sprachregion vor Sprache vor Hauptland', () => {
  assert.deepEqual(packs('Europe/Busingen', []), ['DE', 'EU'], 'ohne Hinweis Hauptland');
  assert.deepEqual(packs('Europe/Busingen', ['en']), ['DE', 'EU']);
  assert.deepEqual(packs('Europe/Busingen', ['de-CH']), ['CH', 'EU']);
  assert.deepEqual(packs('Europe/Busingen', ['de-DE']), ['DE', 'EU']);
  assert.deepEqual(packs('Europe/Busingen', ['de']), ['DE', 'CH', 'EU'], 'Sprache passt zu beiden: beide');
  assert.deepEqual(packs('Europe/Brussels', ['nl-NL']), ['NL', 'EU']);
  assert.deepEqual(packs('Europe/Brussels', ['fr']), ['BE', 'EU']);
  assert.deepEqual(packs('Europe/Brussels', ['nl']), ['BE', 'NL', 'EU']);
  // Zonen ohne Land: nur Regionen bzw. Rueckfall auf die Sprache.
  for (const tz of ['UTC', 'Etc/UTC', 'Etc/GMT+2', 'GMT', '', 'Mars/Base']) {
    assert.deepEqual(det(tz, ['de-CH']), { countries: ['CH', 'EU'], reasons: { CH: 'region', EU: 'eu' } }, tz);
    assert.deepEqual(det(tz, ['de']), { countries: ['DE', 'AT', 'CH', 'EU'], reasons: { DE: 'language', AT: 'language', CH: 'language', EU: 'eu' } }, tz);
  }
});

test('Mischfaelle: Zeitzone plus Regionen aller Sprachen, Sprache allein nur als Rueckfall', () => {
  assert.deepEqual(det('Europe/Zurich', ['pt-BR', 'en-US']), { countries: ['CH', 'BR', 'EU'], reasons: { CH: 'timezone', BR: 'region', EU: 'eu' } });
  assert.deepEqual(packs('Europe/Zurich', ['pt-BR']), ['CH', 'BR', 'EU']);
  assert.deepEqual(packs('Europe/Zurich', ['fr']), ['CH', 'EU'], 'Sprache fr ergaenzt FR/BE nicht');
  assert.deepEqual(packs('Europe/Berlin', ['de-AT', 'de-DE']), ['DE', 'AT', 'EU']);
  assert.deepEqual(packs('America/New_York', ['es-ES']), ['US', 'ES', 'EU'], 'EU-Region mit eigenem Paket');
  // Asia/Bangkok: Zone ohne Paketland.
  assert.deepEqual(packs('Asia/Bangkok', ['fr-RE']), ['FR', 'EU'], 'Ueberseegebiet');
  assert.deepEqual(packs('Asia/Bangkok', ['en-PR']), ['US']);
  assert.deepEqual(packs('Asia/Bangkok', ['fr-RE', 'en-PR']), ['FR', 'EU'], 'US aus Folgesprache nie');
  assert.deepEqual(packs('Asia/Bangkok', ['pt-BR', 'de']), ['BR']);
  assert.deepEqual(packs('Asia/Bangkok', ['pt', 'de']), ['PT', 'BR', 'EU'], 'nur erste Sprache (pt -> PT, BR)');
  assert.deepEqual(packs('Asia/Bangkok', ['es-419', 'zh-Hant-TW']), ['ES', 'EU'], 'Region 419 ohne Paket -> Sprache es');
  assert.deepEqual(packs('Asia/Bangkok', ['th-TH', 'ar']), [], 'Sprachen ohne Paketland');
  assert.deepEqual(packs('Asia/Tokyo', ['de_CH']), ['JP', 'CH', 'EU'], 'Unterstrich wird toleriert');
});

test('Folgesprachen: en-US aus Chrome/Edge aktiviert US nicht (Design-Review Länderpakete, Auflagen 2, 3, 6)', () => {
  // Typische Browser-Listen: Chrome/Edge haengen en-US, en an.
  assert.deepEqual(det('Europe/Zurich', ['de-CH', 'de', 'en-US', 'en']), { countries: ['CH', 'EU'], reasons: { CH: 'timezone', EU: 'eu' } });
  assert.deepEqual(packs('Europe/Zurich', ['de-CH', 'en-US']), ['CH', 'EU']);
  assert.deepEqual(packs('Europe/Berlin', ['de-DE', 'de', 'en-US', 'en']), ['DE', 'EU']);
  assert.deepEqual(packs('Europe/Zurich', ['de', 'en-US', 'en']), ['CH', 'EU'], 'erste Sprache ohne Region');
  assert.deepEqual(packs('UTC', ['de-CH', 'en-US']), ['CH', 'EU'], 'UTC: US aus Folgesprache nie');
  assert.deepEqual(packs('', ['de', 'en-US']), ['DE', 'AT', 'CH', 'EU'], 'unbekannte Zone: nur Sprachrueckfall, kein US');
  assert.deepEqual(det('America/New_York', ['en-US', 'en']), { countries: ['US'], reasons: { US: 'timezone' } });
  assert.deepEqual(packs('America/Chicago', ['de-CH', 'en-US']), ['US', 'CH', 'EU']);
  assert.deepEqual(det('Europe/Zurich', ['pt-BR', 'pt', 'en-US', 'en']), { countries: ['CH', 'BR', 'EU'], reasons: { CH: 'timezone', BR: 'region', EU: 'eu' } });
  assert.deepEqual(packs('America/Sao_Paulo', ['pt-BR', 'en-US']), ['BR']);
  // Folgesprachen zaehlen nur, wenn die Zeitzone kein Land liefert.
  assert.deepEqual(packs('Europe/Zurich', ['en', 'de-DE', 'fr-FR']), ['CH', 'EU'], 'bekannte Zone: Folgesprachen nicht');
  assert.deepEqual(packs('Etc/UTC', ['en', 'de-AT', 'en-US']), ['AT', 'EU'], 'unbekannte Zone: Folgesprachen ja, US nein');
  assert.deepEqual(packs('Etc/UTC', ['en-GB', 'pt-BR']), ['GB', 'BR'], 'erste Sprache und Folgesprache mit Paket');
  assert.deepEqual(packs('Etc/UTC', ['en-TH', 'pt-BR']), ['BR'], 'erste Sprache ohne Paket, Folgesprache mit Paket');
  // Erste gueltige Sprache = erster parsbarer Eintrag.
  assert.deepEqual(packs('Europe/Zurich', ['!!', 'pt-BR', 'en-US']), ['CH', 'BR', 'EU']);
  // Mehrdeutige Zonen nutzen weiter alle Sprachen zur Aufloesung (feste Liste).
  assert.deepEqual(packs('Europe/Busingen', ['de-CH', 'en-US']), ['CH', 'EU']);
  assert.deepEqual(packs('Europe/Busingen', ['en-US', 'de-CH']), ['CH', 'US', 'EU'], 'en-US als erste Sprache zaehlt voll');
  assert.deepEqual(packs('Europe/Brussels', ['fr', 'nl-NL']), ['NL', 'EU']);
});

test('Reise: Zeitzone wechselt -> Pakete folgen, solange Automatisch gilt', () => {
  const run = (tz, langs, local) => plain(P.effective({}, local || {}, { timeZone: tz, languages: langs })).cfg.countryPacks;
  assert.deepEqual(run('Europe/Zurich', ['de']), ['CH', 'EU']);
  assert.deepEqual(run('America/New_York', ['de']), ['US'], 'Schweizer Paket faellt in den USA weg');
  assert.deepEqual(run('America/New_York', ['de-CH']), ['US', 'CH', 'EU'], 'Sprachregion haelt CH');
  assert.deepEqual(run('Etc/UTC', ['de']), ['DE', 'AT', 'CH', 'EU'], 'unbekannte Zone: Rueckfall Sprache');
  assert.deepEqual(run('Europe/Zurich', ['de']), ['CH', 'EU'], 'zurueck');
  const manual = { countryMode: 'manual', countryPacks: ['IT'] };
  assert.deepEqual(run('America/New_York', ['de'], manual), ['IT'], 'manuell: keine Nachfuehrung');
});

test('robuste Eingaben: geerbte Namen, zu lang, kaputte Sprachen, Fehler -> bisheriges Verhalten', () => {
  for (const tz of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 42, null, {}]) {
    assert.deepEqual(packs(tz, ['de']), ['DE', 'AT', 'CH', 'EU'], String(tz));
  }
  assert.deepEqual(packs('Europe/Zurich' + ' '.repeat(60), ['en']), [], 'ueber 64 Zeichen: kein Signal');
  assert.deepEqual(packs('Europe/Zurich', 'de-CH'), ['CH', 'EU'], 'languages kein Array: nur Zeitzone');
  assert.deepEqual(packs('', [null, 5, '', '!!', '__proto__-xx', 'constructor', 'x'.repeat(40) + '-CH', 'fr-CH']), ['CH', 'EU'], 'ungueltige Eintraege werden uebersprungen');
  assert.deepEqual(packs('', ['fr-CH', null, 5]), ['CH', 'EU']);
  const many = Array.from({ length: 20 }, () => 'en');
  assert.deepEqual(packs('', many.concat('de-CH')), [], 'nur die ersten 20 Sprachen');
  assert.deepEqual(packs('', many.slice(1).concat('de-CH')), ['CH', 'EU']);
  for (const env of [null, undefined, 'kaputt', 7, []]) assert.deepEqual(plain(P.detectCountries(env)).countries, [], String(env));
  assert.deepEqual(plain(P.detectCountries('de-CH')).countries, plain(P.countriesForLocale('de-CH')), 'Sprachkuerzel wie bisher');
  const boom = { languages: ['de'], get timeZone() { throw new Error('x'); } };
  assert.deepEqual(plain(P.detectCountries(boom)).countries, ['DE', 'AT', 'CH', 'EU'], 'Ausnahme -> Sprache');
});

test('Richtlinie: countryPacks hat immer Vorrang, autoCountryPacks sperrt den Modus', () => {
  const env = { timeZone: 'Europe/Zurich', languages: ['de-CH'] };
  const eff = (m, l) => plain(P.effective(m, l, env));
  const a = eff({ countryPacks: ['US'], autoCountryPacks: true }, { countryMode: 'manual', countryPacks: ['IT'] });
  assert.deepEqual(a.cfg.countryPacks, ['US']);
  assert.equal(a.country.mode, 'managed');
  assert.equal(a.locked.countryPacks, true);
  assert.equal(a.locked.countryMode, true);
  const b = eff({ autoCountryPacks: false }, {});
  assert.equal(b.country.mode, 'manual');
  assert.deepEqual(b.cfg.countryPacks, ['CH', 'EU'], 'ohne Benutzerwahl: Erkennung als Vorbelegung');
  assert.equal(b.locked.countryMode, true);
  assert.equal(b.locked.countryPacks, undefined, 'Benutzer waehlt die Pakete selbst');
  assert.deepEqual(eff({ autoCountryPacks: false }, { countryPacks: ['IT'] }).cfg.countryPacks, ['IT']);
  const c = eff({ autoCountryPacks: true }, { countryMode: 'manual', countryPacks: ['IT'] });
  assert.equal(c.country.mode, 'auto');
  assert.deepEqual(c.cfg.countryPacks, ['CH', 'EU']);
  for (const bad of ['true', 1, 'false', 0, null, {}]) {
    const d = eff({ autoCountryPacks: bad }, { countryMode: 'manual', countryPacks: ['IT'] });
    assert.ok(d.errors.includes('autoCountryPacks'), String(bad));
    assert.equal(d.country.mode, 'manual', 'falscher Typ wird verworfen');
    assert.equal(d.locked.countryMode, undefined);
  }
  const e = eff({ countryMode: 'manual' }, {});
  assert.ok(e.errors.includes('unknown:countryMode'), 'countryMode ist kein Richtlinien-Schluessel');
  assert.equal(e.country.mode, 'auto');
  assert.deepEqual(eff({ countryPacks: ['DE'] }, {}).cfg.globalPacks, ALL_GLOBAL);
  const br = plain(P.effective({ countryPacks: ['BR'] }, {}, { timeZone: 'Europe/Zurich', languages: ['de-CH', 'en-US'] }));
  assert.deepEqual([br.cfg.countryPacks, br.country.mode, br.cfg.globalPacks], [['BR'], 'managed', ALL_GLOBAL], 'BR per Richtlinie');
  const us = plain(P.effective({ countryPacks: ['CH', 'US', 'EU'] }, {}, { timeZone: 'Europe/Zurich', languages: ['de-CH', 'en-US'] }));
  assert.deepEqual(us.cfg.countryPacks, ['CH', 'US', 'EU'], 'US weiter per Richtlinie moeglich');
});

test('Ueberschreiben und zurueck auf Automatisch', () => {
  const env = { timeZone: 'Europe/Vienna', languages: ['de'] };
  const eff = (l) => plain(P.effective({}, l, env));
  assert.deepEqual(eff({}).cfg.countryPacks, ['AT', 'EU']);
  assert.equal(eff({}).country.mode, 'auto');
  const m = eff({ countryMode: 'manual', countryPacks: ['IT', 'US'] });
  assert.deepEqual([m.country.mode, m.cfg.countryPacks], ['manual', ['IT', 'US']]);
  assert.deepEqual(eff({ countryMode: 'manual', countryPacks: [] }).cfg.countryPacks, [], 'bewusst leer bleibt leer');
  assert.deepEqual(eff({ countryMode: 'auto', countryPacks: ['IT'] }).cfg.countryPacks, ['AT', 'EU'], 'Automatisch ignoriert alte Auswahl');
  assert.deepEqual(eff({ countryPacks: ['IT'] }).cfg.countryPacks, ['AT', 'EU'], 'ohne Modus = automatisch');
  for (const bad of ['Manual', 'x', true, null, 1]) assert.equal(eff({ countryMode: bad, countryPacks: ['IT'] }).country.mode, 'auto', String(bad));
  assert.deepEqual(eff({ countryMode: 'manual', countryPacks: ['IT'] }).cfg.globalPacks, ALL_GLOBAL, 'globale Pakete bleiben');
});

test('cfg fuer Content Scripts enthaelt weder Zeitzone noch Sprachen noch Gruende', () => {
  const e = plain(P.effective({ autoCountryPacks: true }, { countryMode: 'manual' }, { timeZone: 'Europe/Zurich', languages: ['pt-BR', 'en-US'] }));
  // aiSiteMode/allowedAiSites/blockedAiSites entfernt der Service Worker vor dem Senden (tests/aisites.test.mjs).
  assert.deepEqual(Object.keys(e.cfg).sort(), ['accountRules', 'aiSiteMode', 'allowNotSensitive', 'allowPause', 'allowPlaceholders', 'allowRephrase', 'allowUserOverride', 'allowedAiSites', 'allowedSites', 'answerCheck',
    'barCompact', 'barTheme', 'blockUncheckedFiles', 'blockWhenInactive', 'blockedAiSites', 'branding', 'competenceHideSensitive', 'competenceRecord', 'complianceFrameworks', 'complianceReport',
    'complianceReportDays', 'copySidebarHint', 'countryPacks', 'customPatterns', 'customTerms', 'deobfuscation', 'detection', 'dictionary', 'documentFingerprints', 'formGuardSites', 'globalPacks',
    'hiddenInstructionAction', 'hiddenInstructionScan', 'identityMinParts', 'imageScan', 'internalDomains', 'labelNames', 'language', 'learningMode', 'massListMin', 'rules', 'screenShareGuard', 'sensitiveSourceAction', 'sensitiveSources',
    'suggestedAiSite', 'tableMinColumns', 'tableMinRows', 'tableRedaction', 'tableScan', 'trainingAmpel', 'uncertainFindings', 'userTerms', 'voiceMode']);
  const s = JSON.stringify(e.cfg);
  for (const w of ['Europe', 'Zurich', 'pt-BR', 'en-US', 'timezone', 'region', 'reasons']) assert.ok(!s.includes(w), w);
});

test('Anzeige: Laendernamen nur aus der festen Tabelle, mit Grund', () => {
  const I = DLX.i18n;
  const r = P.detectCountries({ timeZone: 'Europe/Zurich', languages: ['de-CH'] });
  assert.equal(I.t('de', 'countryAuto', { list: I.countryList('de', r.countries, r.reasons) }), 'Automatisch: Schweiz (Zeitzone), EU');
  assert.equal(I.countryList('en', ['US', 'CH'], { US: 'region', CH: 'language' }), 'United States (language region), Switzerland (language)');
  assert.equal(I.countryList('fr', ['<b>', '__proto__', 'XX'], {}), 'aucun');
  assert.equal(I.countryList('de', ['CH'], { CH: '__proto__' }), 'Schweiz');
  for (const c of P.COUNTRY) for (const l of I.LANGS) assert.ok(Object.hasOwn(I.STRINGS[l], 'cn_' + c), l + ' ' + c);
});
