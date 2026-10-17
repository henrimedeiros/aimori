// Tests: Geheimnisse in Code/Konfiguration und Vertraulichkeits-Vermerke
// (Design-Review docs/sicherheit/design-review-geheimnisse-vermerke.md).
// Alle Schluessel erfunden und zur Laufzeit zusammengesetzt (Auflage 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './load.mjs';
import { rnd, HEX, B64, JWT } from './testwerte.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/policy.js'], { URL });
const P = DLX.policy;
const ALL = { packs: Object.keys(DLX.packs), rules: {} };
const scan = (t, cfg = ALL) => Array.from(DLX.engine.scan(t, cfg).findings);
const ids = (t, cfg) => scan(t, cfg).map((f) => f.id);
const hits = (t, id, cfg) => scan(t, cfg).filter((f) => f.id === id).map((f) => t.slice(f.start, f.end));

test('Platzhalter-Muster ohne Backtracking (Auflage Pflicht-Pruefung 14.10.2026)', () => {
  for (const v of ['your' + 'a'.repeat(150) + '!', 'your' + '-ab'.repeat(60) + '!', 'insert' + ' a'.repeat(90) + '!']) {
    const t0 = performance.now();
    assert.equal(DLX.validators.isPlaceholder(v), false);
    assert.ok(performance.now() - t0 < 50, v.slice(0, 12));
  }
});

test('Platzhalter werden nur als ganzer Wert ausgeschlossen (Auflage 6)', () => {
  const ph = ['changeme', 'xxx', 'XXXXXXXX', '********', '<your-key>', '<API_KEY>', '${DB_PASSWORD}', '{{ secret }}', '%TOKEN%', '$TOKEN',
    'your-api-key-here', 'your_api_key', 'insert_token_here', 'example', 'dummy', 'xxxx-xxxx-xxxx', 'REDACTED'];
  for (const v of ph) assert.equal(DLX.validators.isPlaceholder(v), true, v);
  for (const v of ['example' + rnd(20), rnd(20) + 'EXAMPLE', 'my' + rnd(12), 'Sommer2024!', 'changeme' + rnd(6)]) assert.equal(DLX.validators.isPlaceholder(v), false, v);
  // Ein echter Schluessel mit "example" im Wert wird gemeldet (kein Umgehungsweg).
  assert.ok(ids('API_KEY=example' + rnd(24)).includes('env_secret'));
  assert.ok(ids('token ' + 'ghp_' + 'EXAMPLE' + rnd(29)).includes('github_pat'));
});

test('Platzhalter und Beispiele in Code und Konfiguration melden nichts', () => {
  const quiet = [
    'API_KEY=your-api-key-here', 'SECRET_KEY=changeme', 'DB_PASSWORD=${DB_PASSWORD}', 'OPENAI_API_KEY=<your-openai-key>', 'TOKEN_TTL=3600',
    'PASSWORD_MIN_LENGTH=12', 'JWT_SECRET_FILE=/run/secrets/jwt', 'AUTH_TOKEN_URL=https://login.example.com/token', 'API_KEY_ENABLED=true',
    'password: process.env.DB_PASSWORD', 'const password = config["db:password"];', 'password = os.environ["DB_PASSWORD"]', 'pwd: ${PWD}',
    'const newPassword = userPassword;', 'password = user_password', '"password": "********"', 'secret: <secret>', 'token: ${{ secrets.GITHUB_TOKEN }}',
    'postgres://user:password@localhost:5432/app', 'Server=db;Database=app;User Id=sa;Password=<password>;', 'jdbc:mysql://db:3306/app?user=app&password=changeme',
    'ghp_' + 'x'.repeat(36), 'sk_' + 'live_' + 'X'.repeat(24), 'AKIA' + 'IOSFODNN7EXAMPLE', 'Bearer eyJ' + rnd(20) + '.eyJ' + rnd(20) + '.' + rnd(20),
    '-----BEGIN ' + 'CERTIFICATE-----', '-----BEGIN ' + 'PUBLIC KEY-----', 'ssh-rsa AAAAB3NzaC1yc2E' + rnd(60, B64) + ' user@host',
    'sha256: ' + rnd(64, HEX), '"integrity": "sha512-' + rnd(86, B64) + '=="', 'commit ' + rnd(40, HEX),
  ];
  for (const t of quiet) assert.deepEqual(ids(t).filter((id) => DLX.packs.secrets.detectors.some((d) => d.id === id)), [], t);
});

test('.env, Konfiguration und Verbindungs-Strings', () => {
  const pw = rnd(14);
  assert.deepEqual(hits('export DB_PASSWORD="' + pw + '"', 'env_secret'), [pw]);
  assert.deepEqual(hits('  STRIPE_WEBHOOK_SECRET=' + pw + ' # prod', 'env_secret'), [pw]);
  assert.deepEqual(hits('db_password: ' + pw, 'cfg_password'), [pw]);
  assert.deepEqual(hits('"client_secret": "' + pw + '"', 'cfg_password'), [pw]);
  assert.deepEqual(hits('pwd: Sommerferien', 'cfg_password'), ['Sommerferien']);
  assert.ok(ids('mongodb+srv://app:' + pw + '@cluster0.example.net/db').includes('conn_db'));
  assert.ok(ids('redis://:' + pw + '@cache.example.com:6379').includes('conn_db'), 'Redis ohne Benutzer');
  assert.ok(ids('amqps://guest:' + pw + '@mq.example.com/vhost').includes('conn_db'));
  assert.ok(ids('Host=db.example.com;Port=5432;Username=app;Password=' + pw).includes('conn_ado'), 'Npgsql');
  assert.ok(ids('Uid=app;Pwd=' + pw + ';Server=db.example.com;Database=x').includes('conn_ado'), 'Passwort zuerst');
  assert.ok(ids('jdbc:postgresql://db.example.com/app?user=app&password=' + pw).includes('conn_jdbc'));
  assert.ok(ids('DefaultEndpointsProtocol=https;AccountName=demo;AccountKey=' + rnd(86, B64) + '==;EndpointSuffix=core.windows.net').includes('azure_storage'));
  assert.ok(ids('AccountEndpoint=https://demo.documents.azure.com:443/;AccountKey=' + rnd(86, B64) + '==;').includes('azure_storage'), 'Cosmos DB');
  assert.ok(ids('sv=2024-01-01&ss=b&srt=sco&sp=rl&se=2026-12-31&sig=' + rnd(40)).includes('azure_sas'), 'SAS ohne URL');
});

test('Privater Schluessel: ganzer Block, ohne END bis zur Grenze (Auflage 3)', () => {
  const BEGIN = '-----BEGIN ' + 'OPENSSH PRI' + 'VATE KEY-----', END = '-----END ' + 'OPENSSH PRI' + 'VATE KEY-----';
  const body = Array.from({ length: 5 }, () => rnd(64, B64)).join('\n');
  const t = 'Schluessel:\n' + BEGIN + '\n' + body + '\n' + END + '\nDanke';
  assert.deepEqual(hits(t, 'pem_private'), [BEGIN + '\n' + body + '\n' + END]);
  const red = DLX.engine.redact(t, scan(t), () => 'X');
  assert.equal(red.includes(body.slice(0, 20)), false, 'Schwaerzen ersetzt den Inhalt');
  // Abgeschnitten: bis Textende; sehr lang: hoechstens Kopf + 12000 Zeichen.
  const cut = BEGIN + '\n' + body.slice(0, 100);
  assert.deepEqual(hits(cut, 'pem_private'), [cut]);
  const long = BEGIN + '\n' + rnd(20000, B64);
  assert.equal(hits(long, 'pem_private')[0].length, BEGIN.length + 12000);
  const pgp = '-----BEGIN PGP ' + 'PRI' + 'VATE KEY BLOCK-----\n\n' + rnd(200, B64) + '\n-----END PGP ' + 'PRI' + 'VATE KEY BLOCK-----';
  assert.deepEqual(hits(pgp, 'pem_private'), [pgp]);
});

test('JWT nur mit gueltiger Struktur (Auflage 5)', () => {
  assert.equal(DLX.validators.jwtOk(JWT), true);
  const [h, b, s] = JWT.split('.');
  assert.equal(DLX.validators.jwtOk(['eyJ' + rnd(30), b, s].join('.')), false, 'Kopf kein JSON');
  const noAlg = Buffer.from('{"typ":"JWT"}').toString('base64url');
  assert.equal(DLX.validators.jwtOk([noAlg, b, s].join('.')), false, 'ohne alg');
  const arr = Buffer.from('[1,2,3]').toString('base64url');
  assert.equal(DLX.validators.jwtOk([h, arr, s].join('.')), false, 'Nutzdaten kein Objekt');
  assert.equal(DLX.validators.jwtOk([h, 'e'.repeat(9000), s].join('.')), false, 'zu lang');
  assert.deepEqual(hits('Authorization: Bearer ' + JWT, 'jwt'), [JWT]);
});

test('Vermerke: Wendungen ueberall, Einzelwoerter nur in Vermerk-Stellung (Auflage 10)', () => {
  const yes = ['Klassifizierung: Vertraulich', 'Vertraulichkeit: Intern', 'Sensitivity: Highly Confidential\\All Employees', 'Classification: Internal',
    'Dieses Dokument ist streng vertraulich.', 'For internal use only', 'INTERNAL USE ONLY', 'VERTRAULICH', '*** CONFIDENTIAL ***', 'Confidential',
    '[Streng vertraulich]', 'Classified as Confidential', 'Strictement confidentiel', 'Documento ad uso interno', 'Estrictamente confidencial',
    'Uso interno exclusivo', 'Strikt vertrouwelijk', 'Ściśle poufne', 'Для служебного пользования', '社外秘', '대외비', 'Under NDA until launch',
    'RISERVATO', 'Classificazione: Riservato', 'Clasificación: Confidencial', 'Classificação: Confidencial'];
  for (const t of yes) assert.ok(ids(t).includes('conf_marker'), t);
  const no = ['Bitte behandeln Sie das vertraulich.', 'Wir haben das intern besprochen.', 'Intern', 'Internal', 'The internal API returns 500.',
    'Keep this confidential between us.', 'We signed an NDA last week.', 'enum Level { PUBLIC, INTERNAL, CONFIDENTIAL }', 'case CONFIDENTIAL:',
    'HTTP 500 INTERNAL SERVER ERROR', 'const CONFIDENTIAL = 3;', 'Level.CONFIDENTIAL', 'La réunion interne est demain.', 'Il documento è riservato ai soci.',
    'Los datos son confidenciales.', 'O processo interno foi revisto.', 'secret_sauce = True', 'Label: General', 'Sensitivity: Public'];
  for (const t of no) assert.deepEqual(ids(t).filter((id) => id === 'conf_marker'), [], t);
});

test('Purview-Metadaten: nur nicht-oeffentliche Labels, Fund ohne Namen (Auflage 10)', () => {
  const guid = '3f2a9c1e-7b4d-4e8f-9a6b-2c5d8e1f0a7b';
  const t = 'MSIP_Label_' + guid + '_Enabled=true; MSIP_Label_' + guid + '_Name=Highly Confidential; MSIP_Label_' + guid + '_SiteId=x';
  const f = scan(t).filter((x) => x.id === 'conf_label');
  assert.equal(f.length, 1);
  assert.deepEqual(Object.keys(f[0]).sort(), ['action', 'cat', 'end', 'id', 'start', 'sure']);
  for (const n of ['General', 'Public', 'Personal', 'Öffentlich', 'Allgemein']) assert.equal(ids('MSIP_Label_' + guid + '_Name=' + n).length, 0, n);
});

test('Richtlinie labelNames: nur verwaltet, ganzes Feld verworfen bei Fehler (Auflagen 1 und 4)', () => {
  const ok = P.validate({ labelNames: ['Nur Verwaltungsrat', 'Vorstand (vertraulich)', 'Stufe 3\\Projekt'] });
  assert.deepEqual(Array.from(ok.value.labelNames), ['Nur Verwaltungsrat', 'Vorstand (vertraulich)', 'Stufe 3\\Projekt']);
  assert.deepEqual(Array.from(P.validate({ labelNames: ['Nur Verwaltungsrat'] }, true).errors), ['unknown:labelNames'], 'Benutzerwert verworfen');
  for (const bad of [['ok Name', 'x'], ['a\u0000b'], ['Name mit <b>'], 'kein Array', Array.from({ length: 51 }, (_, i) => 'Label ' + i), ['a'.repeat(65)], ['(a+)+$'], ['.*'], ['Stufe [1-9]']]) {
    const r = P.validate({ labelNames: bad });
    assert.equal(r.value.labelNames, undefined, JSON.stringify(bad).slice(0, 40));
    assert.deepEqual(Array.from(r.errors), ['labelNames'], 'Fehler nennt nur den Schluessel');
  }
  // Lokal gespeicherter Wert wirkt nie; Richtlinie wirkt.
  assert.equal(P.effective({}, { labelNames: ['Nur Verwaltungsrat'] }, 'de-CH').cfg.labelNames, null);
  const e = P.effective({ labelNames: ['Nur Verwaltungsrat'] }, {}, 'de-CH');
  const ec = P.engineConfig(e.cfg);
  const t = 'Fusszeile: nur verwaltungsrat – Stand Q3';
  assert.deepEqual(hits(t, 'conf_label', ec), ['nur verwaltungsrat']);
  assert.deepEqual(hits('Nur Verwaltungsratsmitglieder', 'conf_label', ec), [], 'nur ganze Woerter');
  // Paket marker aus -> auch eigene Labels aus.
  assert.deepEqual(hits(t, 'conf_label', Object.assign({}, ec, { packs: ec.packs.filter((p) => p !== 'marker') })), []);
  assert.equal(P.validate({ labelNames: Array.from({ length: 50 }, (_, i) => 'Label ' + i) }).value.labelNames.length, 50);
  assert.equal(P.validate({ labelNames: ['a'.repeat(64)] }).value.labelNames.length, 1);
  // compile escaped alles (auch wenn Regex-Syntax die Richtlinie nie passiert), Teile zu hoechstens 50 Namen.
  const many = DLX.markers.compile(Array.from({ length: 120 }, (_, i) => 'Stufe ' + i + ' (a+b)*'));
  assert.equal(many.length, 3);
  const lit = DLX.markers.compile(['(a+)+$', '.*']);
  const t0 = performance.now();
  const evil = 'a'.repeat(5000) + '!';
  for (const re of lit) { re.lastIndex = 0; assert.equal(re.test(evil), false, 'als Literal'); }
  lit[0].lastIndex = 0;
  assert.equal(lit[0].test('Vermerk (a+)+$ Ende'), true, 'Literal wird gefunden');
  assert.ok(performance.now() - t0 < 50, 'unter 50 ms');
  assert.equal(many[0].test('Stufe 7 (a+b)*'), true);
  many[0].lastIndex = 0;
  assert.equal(many[0].test('Stufe 7 aab'), false);
  // Eingebaute Einzelwoerter laufen ueber conf_marker (Vermerk-Stellung), nicht ueberall.
  assert.equal(DLX.markers.compile(['Intern', 'Vertraulich']), null);
});

test('ReDoS: boesartige Fast-Treffer > 100k Zeichen bleiben im Zeitbudget (Auflage 7)', () => {
  const BEGIN = '-----BEGIN ' + 'RSA PRI' + 'VATE KEY-----';
  const evil = {
    envKette: 'A_'.repeat(60000),
    envZeilen: ('DB_PASSWORD=' + 'A'.repeat(40) + '\n').repeat(3000),
    gleich: 'A='.repeat(60000),
    pemOhneEnd: (BEGIN + '\n').repeat(4000),
    puttyOhneMac: ('PuTTY-User-Key-File-3: ssh-rsa\n').repeat(4000),
    base64: rnd(150000, B64),
    jwtArtig: ('eyJ' + rnd(20) + '.').repeat(6000),
    adoKette: 'Server=x;'.repeat(15000),
    redisKette: 'a.b:6379,'.repeat(15000),
    jdbcKette: 'jdbc:sqlserver://x;'.repeat(7000),
    vermerkSchluessel: 'Klassifizierung Klassifizierung: '.repeat(4000),
    grossbuchstaben: 'CONFIDENTIAL, '.repeat(9000),
    zeilen: (' -*[ \n').repeat(30000),
    msip: ('MSIP_Label_' + '3f2a9c1e-7b4d-4e8f-9a6b-2c5d8e1f0a7b' + '_Name=').repeat(2500),
  };
  const labels = DLX.markers.compile(Array.from({ length: 200 }, (_, i) => 'Label Stufe ' + i));
  for (const [name, t] of Object.entries(evil)) {
    assert.ok(t.length > 100000, name);
    // Nur die betroffenen Pakete (die anderen misst tests/fehlalarme.test.mjs); haelt die Testlast klein.
    const r = DLX.engine.scan(t.slice(0, DLX.engine.MAX_LEN), { packs: ['secrets', 'marker'], rules: {}, labels });
    assert.equal(r.unscannable, false, name);
  }
});

test('Schema-Muster ohne Unicode-Escapes und Lookarounds (Chrome prueft Richtlinien-Muster mit RE2; sonst laedt die Erweiterung keine Richtlinie)', async () => {
  const fs = await import('node:fs');
  const { EXT } = await import('./load.mjs');
  const raw = fs.readFileSync(EXT + '/managed_schema.json', 'utf8');
  const bad = [];
  JSON.parse(raw, (k, v) => { if (k === 'pattern' && /\\u|\\x|\(\?<|\(\?=|\(\?!/.test(v)) bad.push(v); return v; });
  assert.deepEqual(bad, []);
});
