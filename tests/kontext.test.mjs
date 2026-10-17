// Paket context: Identitaets-Kombi, besonders schuetzenswerte Inhalte (Art. 9),
// Personaldaten, Massenlisten. Design-Review Kontext 14.10.2026, Auflagen 1-14
// in docs/sicherheit/design-review-kontext.md. Alle Personen, Adressen, Nummern
// sind erfunden (Mustermann/Example, example.com, Fiktiv-Telefonbereiche
// +44 7700 900xxx und +1 202 555 01xx, IBAN mit selbst gerechneter Pruefziffer).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, EXT, ENGINE_FILES } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'engine/pseudonym.js', 'common/policy.js'], { URL });
const ALL = { packs: Object.keys(DLX.packs), rules: {} };
const NO_CTX = { packs: Object.keys(DLX.packs).filter((p) => p !== 'context'), rules: {} };
const scan = (text, cfg = ALL) => Array.from(DLX.engine.scan(text, cfg).findings, (f) => Object.assign({}, f, { v: text.slice(f.start, f.end) }));
const ids = (text, cfg) => scan(text, cfg).map((f) => f.id);
const one = (text, id, cfg) => scan(text, cfg).find((f) => f.id === id) || null;
const CTX_IDS = ['identity_combo', 'art9_health', 'hr_record', 'art9_belief', 'mass_list', 'postal_address'];
const ctxIds = (text, cfg) => ids(text, cfg).filter((id) => CTX_IDS.includes(id));

// --- Besonders schuetzenswerte Inhalte: positiv und negativ in 7 Sprachen ------
const ART9 = {
  art9_health: {
    yes: ['Herr Max Mustermann hat Diabetes und nimmt Insulin.', 'Mr John Example was diagnosed with depression last week.',
      'Madame Marie Exemple souffre de diabète.', 'Sig. Paolo Esempio è affetto da diabete.', 'La Sra. Ana Ejemplo padece cáncer.',
      'O Sr. João Exemplo sofre de depressão.', 'Mevr. Sanne Voorbeeld is zwanger.', 'Diagnose ICD-10 F32.1 bei Patientin Anna Beispiel.'],
    no: ['Was ist Diabetes?', 'What are the symptoms of depression?', 'Quels sont les symptômes du diabète ?', 'Che cos’è il diabete?',
      '¿Qué es el cáncer?', 'O que é depressão?', 'Wat is diabetes?', 'Kann eine Frau Diabetes bekommen?', 'Erkläre den ICD-10-Code F32.1.',
      'Wie viel Insulin braucht ein Kind mit Diabetes?', 'Ich habe Diabetes, welche Ernährung hilft?'],
  },
  hr_record: {
    yes: ['Frau Erika Mustermann erhält die fristlose Kündigung.', 'Mr John Example gets a written warning and his salary is cut.',
      'Monsieur Pierre Exemple reçoit un avertissement.', 'Lo stipendio di Sig. Paolo Esempio è troppo alto.', 'Despido de la Sra. Carmen Ejemplo.',
      'Avaliação de desempenho do Sr. Pedro Exemplo.', 'Ontslag van Dhr. Jan Voorbeeld.'],
    no: ['Wie schreibe ich eine Kündigung?', 'How do I write a written warning?', 'Comment calculer le salaire net ?', 'Come si calcola lo stipendio netto?',
      '¿Cómo se calcula el salario?', 'Como calcular o salário líquido?', 'Hoe bereken ik het loon?', 'Lohnt sich ein Wechsel der Krankenkasse?'],
  },
  art9_belief: {
    yes: ['Herr Max Mustermann ist katholisch.', 'Mrs Jane Example is a trade union member.', 'Madame Sophie Exemple est syndiquée.',
      'Sig.ra Chiara Esempio è iscritta al sindacato.', 'Sr. Juan Ejemplo es afiliado al sindicato.', 'Sra. Ana Exemplo é muçulmana.',
      'Dhr. Jan Voorbeeld is vakbondslid.'],
    no: ['Was ist der Unterschied zwischen katholisch und reformiert?', 'What does a trade union do?', 'Qu’est-ce qu’un syndicat ?',
      'Che cosa fa un sindacato?', '¿Qué hace un sindicato?', 'O que é um sindicato?', 'Wat doet een vakbond?'],
  },
};
for (const [id, c] of Object.entries(ART9)) {
  test(`${id}: mit Personenbezug sicher, allgemeine Fragen nie (7 Sprachen)`, () => {
    for (const t of c.yes) { const f = one(t, id); assert.ok(f && f.sure, t); }
    for (const t of c.no) assert.deepEqual(ctxIds(t), [], t);
  });
}

test('Personenbezug: schwache Signale nur unsicher, erste Person und anderer Absatz nie (Auflage 9)', () => {
  for (const t of ['Mein Mitarbeiter hat Krebs.', 'Herr M. hat Diabetes.', 'Personalnummer 48213: Kündigung zum Monatsende.',
    'My employee was diagnosed with cancer.', 'Notre salarié souffre de dépression.']) {
    const f = scan(t).find((x) => CTX_IDS.includes(x.id));
    assert.ok(f && f.sure === false, t);
  }
  assert.deepEqual(ctxIds('Ich habe Diabetes.'), []);
  assert.deepEqual(ctxIds('I was diagnosed with depression.'), []);
  assert.deepEqual(ctxIds('Herr Max Mustermann ruft morgen an.\n\nWas ist Diabetes?'), [], 'Leerzeile trennt den Absatz');
  const far = 'Herr Max Mustermann. ' + 'Bitte lies den folgenden Abschnitt. '.repeat(12) + 'Was ist Diabetes?';
  assert.deepEqual(ctxIds(far), [], 'mehr als 300 Zeichen entfernt');
  assert.ok(one('Patient: Max Mustermann\nDiagnose: Diabetes Typ 2', 'art9_health').sure, 'Schluessel Patient:');
  assert.ok(one('Erika Mustermann, Tel. +44 7700 900123, ist schwanger.', 'art9_health').sure, 'Telefon als Personenbezug');
  // Stichwort im Namen ("Herr Parkinson") ist kein Gesundheitsfund.
  assert.deepEqual(ctxIds('Herr Max Parkinson ruft an.'), []);
  assert.deepEqual(ctxIds('Frau Erika Krebs hat morgen Geburtstag.'), []);
});

// --- Identitaet ---------------------------------------------------------------
test('identity_combo: Name + Geburtsdatum + weiterer Teil in mehreren Sprachen; Teile sicher (Auflage 3)', () => {
  const yes = ['Max Mustermann, geb. 01.02.1980, Musterstrasse 12, 8000 Zürich',
    'John Example, born 03/04/1985, 221 Example Street',
    'Marie Exemple, née le 05.06.1990, 12 rue de la Paix, 75002 Paris',
    'Paolo Esempio, nato il 07.08.1975, Via Roma 12, 00100 Roma',
    'Ana Ejemplo, fecha de nacimiento: 09.10.1988, Calle Mayor 5, 28013 Madrid',
    'João Exemplo, data de nascimento 11.12.1979, telefone +44 7700 900123',
    'Herr Max Mustermann\nGeburtsdatum: 01.02.1980\nmax.mustermann@example.com'];
  for (const t of yes) {
    const fs2 = scan(t);
    const c = fs2.find((f) => f.id === 'identity_combo');
    assert.ok(c && c.sure && /Max|John|Marie|Paolo|Ana|João/.test(c.v), t);
    for (const f of fs2) assert.ok(f.sure, t + ' ' + f.id + ' sicher');
    assert.ok(fs2.some((f) => f.id === 'birthdate'), t);
  }
  const t = 'Max Mustermann, geb. 01.02.1980, Musterstrasse 12, 8000 Zürich';
  assert.deepEqual(ids(t).sort(), ['birthdate', 'identity_combo', 'postal_address']);
  // Geschwaerzt bleibt nichts Erkennendes stehen.
  const out = DLX.engine.redact(t, DLX.engine.scan(t, ALL).findings, (f) => f.id);
  assert.equal(out, '[identity_combo], geb. [birthdate], [postal_address]');
});

test('identity_combo: Einzelteile allein nur dezent bzw. gar nicht', () => {
  assert.deepEqual(ids('Max Mustermann kommt morgen.'), [], 'Name allein nie');
  assert.equal(one('Adresse: Musterstrasse 12, 8000 Zürich', 'postal_address').sure, false, 'Adresse allein unsicher');
  assert.equal(one('Lieferung an Musterstrasse 12, 8000 Zürich', 'postal_address').sure, false);
  assert.equal(one('Max Mustermann, geb. 01.02.1980', 'identity_combo'), null, 'nur zwei Teile');
  assert.equal(one('geb. 01.02.1980, Musterstrasse 12, 8000 Zürich', 'identity_combo'), null, 'ohne Name');
  assert.equal(one('geboren am 01.02.1980', 'birthdate').sure, true, 'birthdate unveraendert');
  assert.equal(one('Musterstrasse 12, 8000 Zürich, Tel. +44 7700 900123', 'identity_combo'), null);
  // Adresse ausserhalb des Umkreises von 400 Zeichen.
  const far = 'Max Mustermann, geb. 01.02.1980. ' + 'x '.repeat(260) + 'Musterstrasse 12, 8000 Zürich';
  assert.equal(one(far, 'identity_combo'), null);
});

test('identityMinParts 2-4 (Richtlinie) wirkt', () => {
  const two = 'Max Mustermann, geb. 01.02.1980';
  const three = 'Max Mustermann, geb. 01.02.1980, Musterstrasse 12, 8000 Zürich';
  const four = three + ', Tel. +44 7700 900123';
  const c = (n) => Object.assign({}, ALL, { idParts: n });
  assert.ok(one(two, 'identity_combo', c(2)));
  assert.equal(one(three, 'identity_combo', c(4)), null);
  assert.ok(one(four, 'identity_combo', c(4)));
});

// --- Massenlisten -------------------------------------------------------------
function ibanDE(n) {
  const bban = '37040044' + String(5320130 + n).padStart(10, '0');
  const num = DLX.algo.alphaToNum(bban + 'DE00');
  const check = String(98 - DLX.algo.modStr(num, 97)).padStart(2, '0');
  return 'DE' + check + bban;
}
const emails = (n, sep = '\n') => Array.from({ length: n }, (_, i) => `kunde${i}@example.com`).join(sep);

test('mass_list: Mail/Telefon/IBAN/Namen in Zeilen, CSV, TSV, Markdown, JSON; Anzahl in der Leiste', () => {
  const cases = [
    [emails(12), 12],
    ['Vorname;Nachname;E-Mail\n' + Array.from({ length: 11 }, (_, i) => `Anna${i};Muster;kunde${i}@example.com`).join('\n'), 11],
    ['Vorname\tNachname\tOrt\n' + Array.from({ length: 10 }, (_, i) => `Max${i}\tMuster\tBern`).join('\n'), 10],
    ['| First name | Last name | Phone |\n|---|---|---|\n' + Array.from({ length: 10 }, (_, i) => `| Jane${i} | Example | +44 7700 9001${String(i).padStart(2, '0')} |`).join('\n'), 10],
    ['[' + Array.from({ length: 13 }, (_, i) => `{"firstName":"Jane${i}","lastName":"Example"}`).join(',') + ']', 13],
    ['[' + Array.from({ length: 10 }, (_, i) => `{"mail":"kunde${i}@example.com"}`).join(', ') + ']', 10],
    [Array.from({ length: 10 }, (_, i) => 'IBAN ' + ibanDE(i)).join('\n'), 10],
    [Array.from({ length: 10 }, (_, i) => `+1 202 555 01${String(10 + i)}`).join('\n'), 10],
  ];
  for (const [t, n] of cases) {
    const f = scan(t).find((x) => x.id === 'mass_list');
    assert.ok(f && f.sure && f.meta, t.slice(0, 60));
    assert.equal(f.n, n, t.slice(0, 60));
    const s = Array.from(DLX.engine.summarize(DLX.engine.scan(t, ALL).findings)).find((x) => x.id === 'mass_list');
    assert.equal(s.n, n, 'Anzahl in der Zusammenfassung');
  }
});

test('mass_list: Duplikate einmal, unter der Schwelle nie, Produktliste nie, Schwelle per Richtlinie', () => {
  assert.equal(one(emails(9), 'mass_list'), null);
  assert.equal(one(Array(15).fill('support@example.com').join('\n'), 'mass_list'), null, 'gleiche Adresse zaehlt einmal');
  const products = 'Name;Preis;Menge\n' + Array.from({ length: 20 }, (_, i) => `Artikel ${i};${i + 1}.50;${i}`).join('\n');
  assert.equal(one(products, 'mass_list'), null, 'Spalte "Name" allein ist keine Namensliste');
  assert.equal(one('Vorname;Nachname\n\n' + Array.from({ length: 12 }, (_, i) => `Anna${i};Muster`).join('\n'), 'mass_list'), null, 'Kopfzeile nicht direkt davor');
  assert.equal(one(Array.from({ length: 12 }, (_, i) => `${7000000000 + i * 7919}`).join('\n'), 'mass_list'), null, 'Zahlenkolonne ist keine Telefonliste');
  const lager = Array.from({ length: 12 }, (_, i) => `Lager 079 123 45 ${String(10 + i)}`).join('\n');
  assert.equal(one(lager, 'mass_list'), null, 'gruppierte Lagernummern ohne Telefon-Wort');
  assert.equal(one('Name;Telefon\n' + lager.replace(/Lager /g, 'Muster;'), 'mass_list').n, 12, 'mit Spaltenkopf Telefon');
  assert.ok(one(emails(3), 'mass_list', Object.assign({}, ALL, { massMin: 3 })));
  assert.equal(one(emails(10), 'mass_list', Object.assign({}, ALL, { massMin: 11 })), null);
});

// --- Auflage 2: nie schwaecher als vorher -----------------------------------
test('Auflage 2: Einzelfunde behalten Aktion und werden geschwaerzt; Ausnahme hebt Liste nicht auf; Grundfunde unveraendert', () => {
  const t = emails(12);
  const cfg = Object.assign({}, ALL, { rules: { email: 'block' } });
  const r = DLX.engine.scan(t, cfg).findings;
  assert.equal(r.filter((f) => f.id === 'email' && f.action === 'block').length, 12, 'Blockieren bleibt');
  assert.equal(DLX.engine.strictest(r), 'block');
  const w = DLX.engine.scan(t, ALL).findings;
  assert.equal(w.filter((f) => f.id === 'email' && f.action === 'warn').length, 12, 'Warnen bleibt');
  const red = DLX.engine.redact(t, w, () => 'X');
  assert.equal(red, Array(12).fill('[X]').join('\n'), 'Schwaerzen ersetzt alle Einzelfunde, nie den Listenblock');
  const pseudo = DLX.pseudonym.create().pseudonymize(t, w, () => 'X');
  assert.ok(!/@/.test(pseudo) && !/MASS_LIST/.test(pseudo), 'Platzhalter nur fuer Einzelfunde');
  // "Kein sensibler Wert" fuer alle Einzelwerte: Liste bleibt.
  const key = new Uint8Array(32).fill(7);
  const hashes = new Set(Array.from({ length: 12 }, (_, i) => DLX.engine.ignoreHash(key, 'email', `kunde${i}@example.com`)));
  const ig = scan(t, Object.assign({}, ALL, { ignore: { key, hashes } }));
  assert.deepEqual(ig.map((f) => f.id), ['mass_list']);
  for (const id of ['identity_combo', 'art9_health', 'hr_record', 'art9_belief', 'mass_list']) assert.equal(DLX.engine.ignorable(id), false, id);
  // Grundfunde sind mit und ohne Paket context gleich (bis auf Hochstufung zu sicher).
  for (const s of ['Max Mustermann, geb. 01.02.1980, Tel. +44 7700 900123, IBAN CH93 0076 2011 6238 5295 7', emails(12),
    'Herr Max Mustermann, AHV 756.1234.5678.97, hat Diabetes.']) {
    const base = scan(s, NO_CTX).map((f) => [f.id, f.start, f.end, f.action].join());
    const withCtx = scan(s).filter((f) => !CTX_IDS.includes(f.id)).map((f) => [f.id, f.start, f.end, f.action].join());
    assert.deepEqual(withCtx, base, s);
  }
});

// --- Auflage 1: nichts Halbes ---------------------------------------------------
test('Auflage 1: Zeitueberschreitung oder Fehler in derive -> keine abgeleiteten Funde, Grundfunde wie ohne Paket', () => {
  const t = 'Herr Max Mustermann, geb. 01.02.1980, Musterstrasse 12, 8000 Zürich, hat Diabetes.\n' + emails(12);
  assert.throws(() => DLX.context.derive(t, [], {}, 0, () => 1, () => 'warn'));
  const L = load();
  const base = L.engine.scan(t, NO_CTX).findings.map((f) => f.id + f.start);
  // Zeitueberschreitung = nicht pruefbar wie bei allen Detektoren (Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflage 11).
  L.context.derive = () => { throw new L.context.Timeout('timeout'); };
  const r0 = L.engine.scan(t, { packs: Object.keys(L.packs), rules: {} });
  assert.equal(r0.unscannable, true);
  assert.equal(r0.reason, 'timeout');
  for (const fail of [() => { throw new Error('x'); }]) {
    L.context.derive = fail;
    const r = L.engine.scan(t, { packs: Object.keys(L.packs), rules: {} });
    assert.equal(r.contextIncomplete, true);
    const got = r.findings.filter((f) => f.id !== 'postal_address').map((f) => f.id + f.start);
    assert.deepEqual(got, base);
    assert.equal(r.findings.find((f) => f.id === 'postal_address').sure, false, 'keine halbe Hochstufung');
  }
});

// --- Auflage 4: hinaus nur id/Kategorie/Anzahl --------------------------------
test('Auflage 4: Zusammenfassung nur id/cat/n, Anzahl gedeckelt; Content Script schickt nur diese Felder', () => {
  const s = Array.from(DLX.engine.summarize([{ id: 'mass_list', cat: 'person', n: 9000 }, { id: 'mass_list', cat: 'person', n: 5000 }]));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), [{ id: 'mass_list', cat: 'person', n: 10000 }]);
  const src = fs.readFileSync(path.join(EXT, 'content', 'content.js'), 'utf8');
  // Sende-Zusammenfassung: id/cat/n, bei Code zusaetzlich nur Zeilennummern aus DLX.code.linesOf (Design-Review Code und Bilder, Auflage 5).
  assert.ok(src.includes("lines && !WHOLE(s) && lines.get(s.id) && lines.get(s.id).length ? { lines: lines.get(s.id).slice() } : null"), 'Sende-Zusammenfassung');
  assert.ok(src.includes('DLX.code.isCode(p.text) ? DLX.code.linesOf(p.text, p.findings) : null'), 'Zeilen nur aus linesOf');
  assert.ok(src.includes('(s) => Object.assign({ id: s.id, cat: s.cat, n: s.n },'), 'Live-Zusammenfassung');
  const ctx = fs.readFileSync(path.join(EXT, 'engine', 'packs-context.js'), 'utf8');
  assert.ok(!/console\.|fetch\(|XMLHttpRequest|sendMessage|postMessage|storage\./.test(ctx), 'Paket ohne Ausgabe, Netz, Nachrichten, Speicher');
});

// Chrome/Edge laden Content Scripts mit Nicht-Zeichen (U+FFFE/U+FFFF, U+FDD0-U+FDEF) oder
// BOM nicht ("isn't UTF-8 encoded") - dann laeuft die ganze Erweiterung auf der Seite nicht
// (im E2E gefunden 14.10.2026: Escapes in einer Regex-Klasse waren als Zeichen gespeichert).
test('Content-Script-Dateien ohne Nicht-Zeichen und BOM', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const files = new Set(manifest.content_scripts.flatMap((c) => c.js || []));
  for (const f of files) {
    const s = fs.readFileSync(path.join(EXT, f), 'utf8');
    for (const c of s) {
      const k = c.codePointAt(0);
      assert.ok(!((k & 0xFFFE) === 0xFFFE || (k >= 0xFDD0 && k <= 0xFDEF) || k === 0xFEFF), f + ' U+' + k.toString(16));
    }
  }
});

// --- Auflage 7: Laufzeit und ReDoS -----------------------------------------------
test('Auflage 7: pathologische Eingaben > 100k Zeichen schnell; Kontextpruefung <= 30 % des Budgets', () => {
  const inputs = [
    'Aaaa '.repeat(25000),
    'Herr Max Mustermann '.repeat(6000),
    Array.from({ length: 10000 }, (_, i) => 'Vorname;Nachname;' + i).join('\n'),
    '1 2 3 4 5 6 7 8 9 0 '.repeat(6000),
    'Musterstrasse 12 '.repeat(7000),
    'rue de la Paix 1 '.repeat(7000),
    ('Herr Max Mustermann hat Diabetes, Kündigung, katholisch. ').repeat(1800),
  ];
  // Nur die Pakete, deren Muster die Kontextpruefung nutzt: haelt die CPU-Last des Tests klein,
  // damit parallel laufende Zeitbudget-Tests (fehlalarme.test.mjs) nicht ausgebremst werden.
  const CTX_ONLY = { packs: ['contact', 'context'], rules: {} };
  for (const t of inputs) {
    assert.ok(t.length > 90000, 'gross');
    const t0 = performance.now();
    DLX.engine.scan(t, CTX_ONLY, () => 0);
    assert.ok(performance.now() - t0 < 3000, 'scan ' + t.slice(0, 20));
  }
  // Typische grosse Eingabe (Text + Liste, ~50k): derive allein <= 45 ms (30 % von 150 ms).
  const big = ('Herr Max Mustermann hat Diabetes. Bitte die Kündigung pruefen. ').repeat(400) + '\n' + emails(800);
  const cands = DLX.engine.scan(big, NO_CTX, () => 0).findings;
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    DLX.context.derive(big, cands, {}, Infinity, () => 0, () => 'warn');
    best = Math.min(best, performance.now() - t0);
  }
  assert.ok(best <= 45, 'derive ' + best.toFixed(1) + ' ms');
});

test('Auflage 7: mehr als 5000 Kandidaten -> direkt mass_list, Rest uebersprungen', () => {
  const t = Array.from({ length: 6000 }, (_, i) => `a${i}@x.example`).join(' ');
  const fs3 = scan(t, { packs: ['contact', 'context'], rules: {} });
  const f = fs3.find((x) => x.id === 'mass_list');
  assert.ok(f && f.meta && f.n === 6000);
  assert.equal(fs3.filter((x) => x.id === 'email').length, 6000, 'Einzelfunde bleiben');
});

// --- Auflage 8: Normalisierung ---------------------------------------------------
test('Auflage 8: unsichtbare Zeichen, NBSP, Doppelgaenger, CRLF; Fund zeigt auf den Originaltext', () => {
  const zw = 'Herr Max Muster\u200bmann hat Dia\u200bbetes.';
  const f = one(zw, 'art9_health');
  assert.ok(f && f.sure && f.v === 'Dia\u200bbetes', JSON.stringify(f && f.v));
  assert.ok(one('Herr\u00a0Max\u00a0Mustermann hat Diabetes.', 'art9_health').sure);
  assert.ok(one('Herr Max Mustermann hat Diаbetes.', 'art9_health').sure, 'kyrillisches a');
  assert.ok(one('Herr Max Mustermann\r\nhat Diabetes.', 'art9_health').sure);
  assert.deepEqual(ctxIds('Herr Max Mustermann ruft an.\r\n\r\nWas ist Diabetes?'), [], 'CRLF-Leerzeile trennt');
  const n = DLX.context.norm('a\u200bb\r\ncＡ');
  assert.equal(n.s, 'ab\ncA');
  assert.deepEqual(Array.from(n.map), [0, 2, 4, 5, 6, 7]);   // letzter Eintrag = Textende
});

// --- Anrede + ein Name (Handtest 14.10.2026; Design-Review Anrede, Auflagen 1-4) ---
test('Anrede + einzelner Name, auch GANZ GROSS, gilt als Personenbezug', () => {
  for (const [t, id] of [['Herr XY hat Diabetes.', 'art9_health'], ['Frau Mustermann erhält die Kündigung.', 'hr_record'],
    ['Herr MÜLLER-BEISPIEL ist katholisch.', 'art9_belief'], ['Hr. Muster-Beispiel hat Krebs.', 'art9_health'], ['Fr. XY hat Burnout.', 'art9_health'],
    ['Mr EXAMPLE was diagnosed with cancer.', 'art9_health'], ['Mrs Example gets a written warning.', 'hr_record'], ['Ms XY is pregnant.', 'art9_health'],
    ['Monsieur EXEMPLE est syndiqué.', 'art9_belief'], ['Mme Exemple souffre de dépression.', 'art9_health'], ['M. XY a un cancer.', 'art9_health'],
    ['Madame XY reçoit un avertissement.', 'hr_record'], ['Signora Esempio ha il cancro.', 'art9_health'], ['Sig.ra XY ha il cancro.', 'art9_health'],
    ['Sr. Ejemplo tiene diabetes.', 'art9_health'], ['Sra. XY tiene cáncer.', 'art9_health'], ['Senhor Exemplo tem diabetes.', 'art9_health'],
    ['Senhora XY tem depressão.', 'art9_health'], ['Dr. Mustermann hat Diabetes.', 'art9_health'], ['Herr Dr. XY hat Krebs.', 'art9_health'],
    ['Dr. med. Mustermann hat Diabetes.', 'art9_health'], ['Frau Prof. Dr. h.c. Muster hat Krebs.', 'art9_health'],
    ['Herr Doktor Mustermann hat Krebs.', 'art9_health'], ['Herr Müller hat Krebs.', 'art9_health'], ['Herr O’NEILL ist in der Gewerkschaft.', 'art9_belief']]) {
    const f = one(t, id);
    assert.ok(f && f.sure, t);
  }
  assert.ok(ctxIds('Herr XY, Musterstrasse 12, 8000 Zürich, geb. 01.02.1980').includes('identity_combo'), 'Identitaets-Kombi mit GROSS-Name');
});

test('Anrede ohne Namen, Grussformeln und Sperrliste: kein Fund; Name allein bleibt ohne Fund', () => {
  for (const t of ['Sehr geehrter Herr, was ist Diabetes?', 'Sehr geehrte Damen und Herren, wie schreibe ich eine Kündigung?',
    'Hallo Herr Doktor, ich habe Diabetes.', 'FRAU DOKTOR, was ist Krebs?', 'Frau CEO hat Krebs.', 'Herr HR prüft die Kündigung.',
    'Fr. CHF 50 für die Krebsliga.', 'Kann eine Frau Diabetes bekommen?', 'Der Herr XY ist katholisch.', 'Herr xy hat Diabetes.',
    'Herr XY- hat Krebs.', 'Herr -XY hat Krebs.', 'Herr -- hat Krebs.', 'Herr X hat Diabetes.', 'Dr. Google sagt, es sei Krebs.',
    'Herr XY ruft morgen an.', 'Dr. XY ruft an.', 'Frau Mustermann kommt um 10 Uhr.']) {
    assert.deepEqual(scan(t).filter((f) => CTX_IDS.includes(f.id) && f.sure).map((f) => f.id), [], t);
  }
});

test('Anrede-Muster: 100k-Eingaben mit GROSS-Folgen, Bindestrichen und Titelketten < 50 ms (Auflage 1)', () => {
  const inputs = ['Herr ' + 'XY-'.repeat(34000), 'Herr ' + 'ABCDEFGHIJ'.repeat(10000), 'Dr. '.repeat(25000) + 'XY',
    'Herr Dr. med. '.repeat(7200), ('Frau ' + 'X-'.repeat(20) + ' ').repeat(2200), 'Herr XY '.repeat(12500)];
  for (const t of inputs) {
    assert.ok(t.length > 90000, 'gross');
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      DLX.context.derive(t, [], {}, Infinity, () => 0, () => 'warn');
      best = Math.min(best, performance.now() - t0);
    }
    assert.ok(best < 50, t.slice(0, 16) + ': ' + best.toFixed(1) + ' ms');
  }
});
