// Fehlalarm-Messung der Erkennung: grosser, selbst erzeugter harmloser Korpus
// (nur erfundene Daten, deterministischer Zufall, kein Netz) und Trefferquote
// auf den Testwerten. Aufruf: node scripts/fehlalarm.mjs [--schnell] [--json]
// Ergebnis: Fehlalarmrate je Korpus-Art, je Datentyp und je Paket, getrennt
// nach Stufe sicher (Warnleiste) und unsicher (nur dezenter Hinweis).
// --katalog <datei>: Gemeinschafts-Muster aus dieser Datei statt des gebuendelten Pakets
// (Pruefpipeline scripts/muster.mjs pruefen; ein PR-Katalog ist noch nicht gebaut).
import fs from 'node:fs';
import { load } from '../tests/helpers/load.mjs';
import { loadMitKatalog } from './muster.mjs';
import { POSITIVE } from '../tests/helpers/testwerte.mjs';
import { WORLD_CASES } from '../tests/helpers/testwerte-welt.mjs';

const SCHNELL = process.argv.includes('--schnell');
const JSON_OUT = process.argv.includes('--json');
const N_ZUFALL = SCHNELL ? 10000 : 100000;   // je Laenge 6-24
const N_ART = SCHNELL ? 2000 : 20000;        // je Korpus-Art

// Zielwerte (docs/fehlalarme.md)
const ZIEL_ZUFALL = 1e-5;     // je sicher meldendem Typ und Laenge, reine Zufallsziffern
const ZIEL_CODE_LOG = 1e-4;   // sicher gemeldete Proben im Code-/Log-Korpus

const KAT_I = process.argv.indexOf('--katalog');
const DLX = KAT_I === -1 ? load() : loadMitKatalog(JSON.parse(fs.readFileSync(process.argv[KAT_I + 1], 'utf8')));
const CFG = { packs: Object.keys(DLX.packs), rules: {} };
const PACK_OF = Object.fromEntries(Array.from(DLX.engine.allDetectors(), (d) => [d.id, d.pack]));
const scanAll = (text) => DLX.engine.scan(text, CFG, () => 0).findings;

// --- deterministischer Zufall (mulberry32) ---------------------------------
let seed = 0x5eed1234;
function rnd() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const digits = (n, first = '0123456789') => { let s = first[Math.floor(rnd() * first.length)]; for (let i = 1; i < n; i++) s += Math.floor(rnd() * 10); return s; };
const hex = (n, abc = '0123456789abcdef') => { let s = ''; for (let i = 0; i < n; i++) s += abc[Math.floor(rnd() * abc.length)]; return s; };
const pad = (n, l) => String(n).padStart(l, '0');
const uuid = () => hex(8) + '-' + hex(4) + '-4' + hex(3) + '-' + pick(['8', '9', 'a', 'b']) + hex(3) + '-' + hex(12);
const b64 = (n) => hex(n, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/');
const date = () => ({ y: int(1990, 2030), m: int(1, 12), d: int(1, 28), H: int(0, 23), M: int(0, 59), S: int(0, 59) });
const iso = () => { const t = date(); return `${t.y}-${pad(t.m, 2)}-${pad(t.d, 2)}T${pad(t.H, 2)}:${pad(t.M, 2)}:${pad(t.S, 2)}.${digits(3)}Z`; };
const dmy = () => { const t = date(); return `${pad(t.d, 2)}.${pad(t.m, 2)}.${t.y}`; };
const privIp = () => pick([() => `10.${int(0, 255)}.${int(0, 255)}.${int(1, 254)}`, () => `192.168.${int(0, 255)}.${int(1, 254)}`,
  () => `172.${int(16, 31)}.${int(0, 255)}.${int(1, 254)}`, () => `192.0.2.${int(1, 254)}`, () => `198.51.100.${int(1, 254)}`,
  () => `203.0.113.${int(1, 254)}`, () => '127.0.0.1'])();
const epochS = () => String(int(1500000000, 1900000000));
const epochMs = () => epochS() + digits(3);
const money = () => `${int(1, 99999)}.${pad(int(0, 99), 2)}`;
// Pruefziffer-gueltige Artikel- und Sendungsnummern (GS1 Modulo 10).
function gs1(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (body.charCodeAt(body.length - 1 - i) - 48) * (i % 2 === 0 ? 3 : 1);
  return body + ((10 - (sum % 10)) % 10);
}
// QR-/ESR-Referenz (Modulo 10 rekursiv).
function mod10r(body) {
  const T = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let c = 0;
  for (const ch of body) c = T[(c + Number(ch)) % 10];
  return body + ((10 - c) % 10);
}

// --- Korpus ----------------------------------------------------------------
const ARTEN = {
  code: () => pick([
    () => `const seed = ${digits(int(6, 20), '123456789')};`,
    () => `let id = ${digits(int(8, 19), '123456789')}; // TODO`,
    () => `x = Math.random(); // 0.${digits(16)}`,
    () => `return ${digits(int(1, 4))}.${digits(int(10, 17))};`,
    () => `items = [${Array.from({ length: int(3, 8) }, () => digits(int(4, 12), '123456789')).join(', ')}]`,
    () => `{"id": ${digits(int(9, 18), '123456789')}, "ts": ${epochMs()}, "ref": "${uuid()}"}`,
    () => `INSERT INTO orders VALUES (${digits(int(6, 12), '123456789')}, '${iso().slice(0, 10)}', ${money()});`,
    () => `color: #${hex(6)}; z-index: ${int(1, 99999)};`,
    () => `const big = ${digits(int(15, 24), '123456789')}n;`,
    () => `if (n % ${int(2, 997)} === 0) total += ${digits(int(5, 12), '123456789')};`,
    () => `hash = 0x${hex(int(8, 16))}  # crc`,
    () => `assert f(${digits(int(6, 16), '123456789')}) == ${digits(int(6, 16), '123456789')}`,
    () => `user_id=${digits(int(6, 19), '123456789')}&page=${int(1, 99)}`,
    () => `SELECT * FROM t WHERE id IN (${digits(int(6, 16), '123456789')}, ${digits(int(6, 16), '123456789')});`,
    () => `nonce = "${digits(int(10, 24))}"`,
    () => `elapsed_ns := ${digits(int(9, 16), '123456789')}`,
  ])(),
  logs: () => pick([
    () => `${iso()} INFO [req ${uuid()}] GET /api/orders/${digits(int(6, 18), '123456789')} 200 ${int(1, 9999)}ms from ${privIp()}`,
    () => `${iso()} WARN pid=${int(100, 99999)} tid=${int(100, 99999)} bytes=${digits(int(6, 14), '123456789')} duration_ns=${digits(int(9, 16), '123456789')}`,
    () => `trace_id=${hex(32)} span_id=${hex(16)} parent=${hex(16)} sampled=1`,
    () => `[${dmy()} ${pad(int(0, 23), 2)}:${pad(int(0, 59), 2)}:${pad(int(0, 59), 2)}] job ${digits(int(6, 12), '123456789')} finished in ${digits(int(3, 8))} ms`,
    () => `Exception in thread "main" at com.example.App.run(App.java:${int(1, 9999)}) id=${digits(int(10, 19), '123456789')}`,
    () => `kernel: [${int(1, 99999)}.${digits(6)}] eth0: rx=${digits(int(6, 15), '123456789')} tx=${digits(int(6, 15), '123456789')}`,
    () => `epoch=${epochS()} epoch_ms=${epochMs()} seq=${digits(int(6, 20), '123456789')}`,
    () => `EventID ${int(1000, 9999)} RecordNumber ${digits(int(6, 12), '123456789')} ActivityId {${uuid().toUpperCase()}}`,
    () => `GET /download/${digits(int(12, 20), '123456789')}/file.pdf HTTP/1.1 304 0 "-" ${privIp()}`,
    () => `checkpoint lsn=${digits(int(10, 20), '123456789')} wal=${hex(24).toUpperCase()}`,
  ])(),
  uuid: () => pick([uuid, () => uuid().toUpperCase(), () => `{${uuid()}}`, () => uuid().replace(/-/g, ''),
    () => `${hex(8, '0123456789')}-${hex(4, '0123456789')}-4${hex(3, '0123456789')}-8${hex(3, '0123456789')}-${hex(12, '0123456789')}`])(),
  hashes: () => pick([() => `md5 ${hex(32)}`, () => `sha1: ${hex(40)}`, () => `sha256 ${hex(64)}`, () => `commit ${hex(40)}`,
    () => `git ${hex(7)}`, () => `SHA256=${hex(64).toUpperCase()}`, () => `sha256-${b64(43)}=`, () => `etag "${hex(int(16, 32))}"`])(),
  zeit: () => pick([iso, dmy, epochS, epochMs, () => epochMs() + digits(3), () => epochMs() + digits(6),
    () => { const t = date(); return `${t.y}${pad(t.m, 2)}${pad(t.d, 2)}${pad(t.H, 2)}${pad(t.M, 2)}${pad(t.S, 2)}`; },
    () => `${int(40000, 50000)}.${digits(int(4, 10))}`, () => `${dmy()} ${pad(int(0, 23), 2)}:${pad(int(0, 59), 2)}`,
    () => `${int(1, 12)}/${int(1, 28)}/${int(1990, 2030)} ${int(1, 12)}:${pad(int(0, 59), 2)} PM`])(),
  nummern: () => pick([
    () => `Bestellnummer ${digits(int(6, 14), '123456789')}`, () => `Order #${digits(int(6, 12), '123456789')}`,
    () => `Rechnung Nr. RE-${int(2020, 2030)}-${digits(int(4, 8))}`, () => `Invoice ${digits(int(8, 16), '123456789')}`,
    () => `Sendungsnummer ${gs1('00' + digits(15))}`, () => `Paket ${gs1(digits(int(11, 19), '123456789'))}`,
    () => `Tracking 1Z${hex(6, 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789')}${digits(10)}`,
    () => `Post 99.${pad(int(0, 99), 2)}.${digits(6)}.${digits(8)}`, () => `Ticket INC${digits(7)}`,
    () => `Auftrag ${digits(int(8, 12), '123456789')} vom ${dmy()}`, () => `Kundennummer ${digits(int(6, 10), '123456789')}`,
    () => `Referenz ${mod10r(digits(26))}`, () => `Vertrag ${digits(int(8, 14), '123456789')}`, () => `Fall #${digits(int(6, 9))}`,
  ])(),
  artikel: () => pick([
    () => `EAN ${gs1(pick(['40', '41', '42', '43', '76', '30', '50', '80', '90']) + digits(10))}`,
    () => gs1(pick(['400', '401', '760', '761', '590', '880', '978', '979']) + digits(9)),
    () => `EAN-8 ${gs1(digits(7))}`, () => `UPC ${gs1(digits(11))}`, () => `ISBN ${gs1('978' + digits(9))}`,
    () => `Art.-Nr. ${digits(int(6, 12))}`, () => `GTIN ${gs1('0' + digits(12))}`, () => `SKU ${hex(3, 'ABCDEFGH')}-${digits(int(6, 10))}`,
  ])(),
  versionen: () => pick([
    () => `v${int(0, 30)}.${int(0, 99)}.${int(0, 999)}`, () => `Version ${int(1, 20)}.${int(0, 9)}.${int(0, 99999)}.${int(0, 9999)}`,
    () => `build ${int(10000, 30000)}.${int(1, 9999)}`, () => `Chrome ${int(90, 160)}.0.${int(1000, 9999)}.${int(1, 300)}`,
    () => `${int(1, 9)}.${int(0, 99)}.${int(0, 99)}.${int(0, 99)}`, () => `@scope/pkg@${int(0, 30)}.${int(0, 99)}.${int(0, 99)}-rc.${int(1, 9)}`,
    () => `KB${digits(7)}`, () => `OID 1.3.6.1.4.1.${int(1, 99999)}.${int(1, 99)}.${int(1, 99)}`,
  ])(),
  ip_artig: () => pick([privIp, () => `${privIp()}/${int(8, 30)}`, () => `255.255.${pick(['0', '240', '255'])}.0`,
    () => `Abschnitt ${int(1, 20)}.${int(1, 20)}.${int(1, 20)}.${int(1, 20)}`, () => `${int(1, 9)}.${int(0, 30)}.${int(0, 30)}.${int(0, 300)}`,
    () => `Kapitel ${int(1, 30)}.${int(1, 30)}.${int(1, 30)}`, () => `listen ${privIp()}:${int(1, 65535)}`])(),
  mathe: () => pick([
    () => `${digits(int(5, 10), '123456789')} * ${digits(int(5, 10), '123456789')} = ${digits(int(10, 20), '123456789')}`,
    () => `${Array.from({ length: int(3, 8) }, () => `${int(0, 99999)}.${digits(int(1, 6))}`).join(';')}`,
    () => `${Array.from({ length: int(3, 8) }, () => digits(int(3, 12), '123456789')).join('\t')}`,
    () => `pi = 3.${digits(int(10, 30))}`, () => `${int(1, 9)}.${digits(int(4, 12))}e${int(-30, 30)}`,
    () => `Summe: ${digits(int(6, 16), '123456789')}`, () => `| ${int(1, 999)} | ${digits(int(6, 12), '123456789')} | ${int(0, 100)} % |`,
    () => `=SUMME(A1:A${int(2, 9999)})  ${digits(int(6, 15), '123456789')}`, () => `${int(1, 999)}! = ${digits(int(10, 24), '123456789')}...`,
    () => `0,${digits(int(8, 18))}`, () => `${digits(int(1, 3))}'${digits(3)}'${digits(3)}.${digits(2)}`,
  ])(),
  telefonartig: () => pick([
    () => `Lager ${digits(3)} ${digits(3)} ${digits(2)} ${digits(2)}`, () => `Fach ${digits(3)}-${digits(3)}-${digits(4)}`,
    () => `Durchwahl ${int(100, 9999)}`, () => `Seriennummer ${digits(2)} ${digits(4)} ${digits(4)}`,
    () => `Gruppe ${digits(4)} ${digits(3)} ${digits(3)}`, () => `${digits(3, '123456789')} ${digits(3)} ${digits(4)}`,
  ])(),
  plz: () => pick([
    () => `${int(1000, 9658)} ${pick(['Zuerich', 'Bern', 'Basel', 'Wohlen', 'Aarau'])}`, () => `CH-${int(1000, 9658)}`,
    () => `D-${pad(int(1067, 99998), 5)} ${pick(['Berlin', 'Muenchen', 'Hamburg'])}`, () => `${pad(int(1000, 95999), 5)} Paris`,
    () => `${pad(int(100, 98168), 5)} Roma`, () => `${int(1010, 9992)} Wien`, () => `${pad(int(1000, 99999), 5)}-${pad(int(0, 999), 3)} Sao Paulo`,
    () => `ZIP ${pad(int(501, 99950), 5)}-${pad(int(0, 9999), 4)}`,
  ])(),
  preise: () => pick([
    () => `CHF ${int(1, 999)}'${pad(int(0, 999), 3)}.${pad(int(0, 99), 2)}`, () => `EUR ${int(1, 999)}.${pad(int(0, 999), 3)},${pad(int(0, 99), 2)}`,
    () => `$${int(1, 999)},${pad(int(0, 999), 3)},${pad(int(0, 999), 3)}.${pad(int(0, 99), 2)}`, () => `R$ ${int(1, 999)}.${pad(int(0, 999), 3)},${pad(int(0, 99), 2)}`,
    () => `Total: ${digits(int(4, 12), '123456789')}.${pad(int(0, 99), 2)}`, () => `Preis ${int(1, 99999)}.-`,
  ])(),
  text_de: () => pick([
    () => `Das Meeting ist am ${dmy()} um ${int(8, 18)}:${pad(int(0, 59), 2)} in Raum ${int(100, 999)}.`,
    () => `Bitte die Bestellung ${digits(int(6, 14), '123456789')} bis ${dmy()} pruefen.`,
    () => `Wir haben ${int(2, 99999)} Stueck geliefert, Restmenge ${digits(int(4, 10), '123456789')}.`,
    () => `Die Strecke ist ${int(1, 999)} km lang und dauert ${int(1, 12)} Stunden.`,
    () => `Im Jahr ${int(1900, 2030)} hatte die Gemeinde ${digits(int(4, 7), '123456789')} Einwohner.`,
    () => `Seite ${int(1, 999)} von ${int(1, 999)}, Dokument ${digits(int(8, 16), '123456789')}.`,
  ])(),
  text_en: () => pick([
    () => `The meeting is on ${int(1, 12)}/${int(1, 28)}/${int(2020, 2030)} at ${int(1, 12)} pm in room ${int(100, 999)}.`,
    () => `Please check order ${digits(int(6, 14), '123456789')} before Friday.`,
    () => `We shipped ${int(2, 99999)} units and ${digits(int(4, 10), '123456789')} are pending.`,
    () => `The file has ${digits(int(6, 13), '123456789')} bytes and ${int(1, 9999)} lines.`,
    () => `Case number ${digits(int(6, 16), '123456789')} was closed.`,
  ])(),
  text_fr: () => pick([
    () => `La reunion aura lieu le ${dmy()} a ${int(8, 18)}h${pad(int(0, 59), 2)}, salle ${int(100, 999)}.`,
    () => `Merci de verifier la commande ${digits(int(6, 14), '123456789')}.`,
    () => `Nous avons livre ${int(2, 99999)} pieces, reste ${digits(int(4, 10), '123456789')}.`,
    () => `Le dossier ${digits(int(6, 16), '123456789')} est ferme.`,
  ])(),
  text_it: () => pick([
    () => `La riunione e il ${dmy()} alle ${int(8, 18)}:${pad(int(0, 59), 2)} in sala ${int(100, 999)}.`,
    () => `Controllare l'ordine ${digits(int(6, 14), '123456789')} entro venerdi.`,
    () => `Abbiamo consegnato ${int(2, 99999)} pezzi, ne mancano ${digits(int(4, 10), '123456789')}.`,
    () => `La pratica ${digits(int(6, 16), '123456789')} e chiusa.`,
  ])(),
  text_pt: () => pick([
    () => `A reuniao e no dia ${dmy()} as ${int(8, 18)}h${pad(int(0, 59), 2)}, sala ${int(100, 999)}.`,
    () => `Por favor verifique o pedido ${digits(int(6, 14), '123456789')}.`,
    () => `Entregamos ${int(2, 99999)} unidades, faltam ${digits(int(4, 10), '123456789')}.`,
    () => `O protocolo ${digits(int(6, 16), '123456789')} foi encerrado.`,
  ])(),
};
// Nur zur Information (kein Zielwert): Zufallszahlen im Kartenformat und harmlose
// Saetze mit Kontextwoertern - dort ist "sicher" gewollt, wenn die Pruefziffer stimmt.
ARTEN.kartenformat = () => digits(pick([12, 16, 16, 16, 19])).replace(/(\d{4})(?=\d)/g, '$1 ');
ARTEN.kontextwoerter = () => pick([
  () => `Die Karte zeigt ${int(2, 500)} Orte, Ausgabe ${digits(int(6, 10), '123456789')}.`,
  () => `Visa-Antrag Nr. ${digits(int(8, 16), '123456789')} ist eingegangen.`,
  () => `Server ${privIp()} antwortet auf Port ${int(1, 65535)}.`,
  () => `Tel. Zentrale: Durchwahl ${int(100, 9999)}, Raum ${digits(int(3, 5))}.`,
  () => `Card game score: ${digits(int(6, 16), '123456789')} points.`,
  () => `AHV-Ausweis bestellt am ${dmy()}, Auftrag ${digits(int(8, 12), '123456789')}.`,
])();
// Code und Konfiguration ohne echte Geheimnisse (Design-Review Geheimnisse/Vermerke
// 14.10.2026): Platzhalter, Variablen-Verweise, Hashes, oeffentliche Schluessel,
// Namen mit Geheimnis-Wort fuer Laengen/Dateien/URLs, Code-Konstanten.
const b64u = (n) => hex(n, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_');
const ident = () => pick(['user', 'order', 'item', 'client', 'session', 'cache', 'db', 'app']) + pick(['Id', 'Name', 'Count', 'Key', 'Token', 'Secret', 'Password']);
ARTEN.konfig = () => pick([
  () => pick(['API_KEY', 'SECRET_KEY', 'DB_PASSWORD', 'OPENAI_API_KEY', 'STRIPE_SECRET', 'AUTH_TOKEN', 'CLIENT_SECRET']) + '=' +
    pick(['your-api-key-here', 'changeme', '<your-key>', '${' + 'SECRET}', 'xxxxxxxx', '********', 'your_token_here', '<CHANGE_ME>', '"%API_KEY%"', 'insert-key-here']),
  () => pick(['TOKEN_TTL', 'PASSWORD_MIN_LENGTH', 'SESSION_SECRET_ROTATION_DAYS', 'JWT_EXPIRES_IN', 'API_KEY_HEADER', 'SECRET_NAME', 'TOKEN_URL', 'PASSWORD_FILE']) + '=' +
    pick([String(int(1, 99999)), '/run/secrets/' + pick(['db', 'jwt', 'api']), 'https://login.example.com/oauth2/token', 'X-Api-Key', 'Authorization', pick(['1h', '7d', '30m'])]),
  () => `password: ${pick(['process.env.DB_PASSWORD', 'config.get("db.password")', 'settings.SECRET_KEY', '${' + 'DB_PASSWORD}', '"<password>"', 'os.environ["PWD"]'])}`,
  () => `const ${ident()} = ${pick(['process.env.API_KEY', 'getSecret("api")', 'req.headers["x-api-key"]', 'user.password', 'await vault.read(path)'])};`,
  () => `if (password === confirmPassword && password.length >= ${int(8, 16)}) save(${ident()});`,
  () => `"integrity": "sha512-${b64(86)}=="`,
  () => `"resolved": "https://registry.npmjs.org/pkg-${int(1, 999)}/-/pkg-${int(1, 9)}.${int(0, 20)}.${int(0, 20)}.tgz"`,
  () => `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${b64(43)} user@host${int(1, 99)}`,
  () => '-----BEGIN ' + pick(['CERTIFICATE', 'PUBLIC KEY', 'CERTIFICATE REQUEST']) + '-----',
  () => `etag: "${hex(32)}"`,
  () => `sha256sum ${hex(64)}  release-${int(1, 9)}.${int(0, 30)}.zip`,
  () => `data:image/png;base64,${b64(int(40, 200))}`,
  () => `Authorization: Bearer ${pick(['<token>', '${' + 'TOKEN}', '{{token}}', '$ACCESS_TOKEN'])}`,
  () => `curl -H "X-Api-Key: $API_KEY" https://api.example.com/v${int(1, 3)}/items/${uuid()}`,
  () => `postgres://user:password@localhost:${int(5432, 5439)}/app`,
  () => `Server=localhost;Database=app;Trusted_Connection=True;`,
  () => `token = jwt.sign({ sub: ${ident()} }, process.env.JWT_SECRET, { expiresIn: "${int(1, 24)}h" });`,
  () => `enum Level { PUBLIC, INTERNAL, CONFIDENTIAL, SECRET }  // ${uuid()}`,
  () => `case CONFIDENTIAL: return ${int(1, 9)};`,
  () => `throw new InternalError("HTTP 500 INTERNAL SERVER ERROR id=${uuid()}");`,
  () => `eyJ${b64u(int(20, 60))}.eyJ${b64u(int(20, 120))}.${b64u(43)}`,
  () => `ghp_${'x'.repeat(36)} sk_live_${'X'.repeat(24)} AKIA${'X'.repeat(16)}`,
  () => `secret_sauce = ${pick(['True', 'False', 'None'])}  # ${hex(int(8, 40))}`,
])();
// Fliesstext mit Vermerk-Woertern ausserhalb der Vermerk-Stellung (Auflage 10).
ARTEN.prosa_vermerk = () => pick([
  () => `Bitte behandeln Sie die Angaben zu Auftrag ${digits(int(5, 9), '123456789')} vertraulich.`,
  () => `Wir haben das intern am ${dmy()} besprochen.`,
  () => `Das interne Projekt startet in Woche ${int(1, 52)}, Budget ${int(1, 999)}k.`,
  () => `Keep this confidential between us until ${dmy()}.`,
  () => `We signed an NDA with the vendor last week (${int(2, 30)} pages).`,
  () => `The internal API returned ${int(200, 599)} after ${int(1, 999)} ms.`,
  () => `Our intern starts on ${dmy()} in room ${int(100, 999)}.`,
  () => `La réunion interne est prévue le ${dmy()}, salle ${int(1, 99)}.`,
  () => `Il documento è riservato ai soci, pagina ${int(1, 300)}.`,
  () => `Los datos son confidenciales y se guardan ${int(1, 10)} años.`,
  () => `O processo interno foi revisto em ${dmy()}.`,
  () => `De vertrouwelijke gegevens zijn verwijderd (${int(1, 999)} records).`,
  () => `Secret Santa am ${dmy()}, Budget ${int(10, 50)} CHF.`,
  () => `Die Geheimzahl der Karte ändern Sie am Automaten.`,
])();
const INFO = ['kartenformat', 'kontextwoerter'];
const CODE_LOG = ['code', 'logs', 'uuid', 'hashes', 'konfig', 'prosa_vermerk'];

// Grenz- und Umgehungsfaelle (Design-Review Auflagen 3, 4, 11): erwartete Stufe.
const UMGEHUNG = [
  ['Karte 4242 4242 4242 4242 123', 'cc_visa', 'sicher'],
  ['4242 4242 4242 4242 12/27', 'cc_visa', 'sicher'],
  ['https://example.com/a?ahv=756.1234.5678.97', 'ch_ahv', 'unsicher'],
  ['https://example.com/a?iban=CH9300762011623852957', 'iban', 'unsicher'],
  ['Version 756.1234.5678.97', 'ch_ahv', 'unsicher'],
  ['x = 0.4242424242424242;', 'cc_visa', 'unsicher'],
  ['AHV 7561234567897', 'ch_ahv', 'sicher'],
  // Paket context (docs/kontext-risiken.md): Personenbezug entscheidet die Stufe.
  ['Adresse: Musterstrasse 12, 8000 Zürich', 'postal_address', 'unsicher'],
  ['Max Mustermann, geb. 01.02.1980, Musterstrasse 12, 8000 Zürich', 'postal_address', 'sicher'],
  ['Mein Mitarbeiter hat Krebs.', 'art9_health', 'unsicher'],
  ['Herr Max Mustermann hat Diabetes.', 'art9_health', 'sicher'],
  ['Was ist Diabetes?', 'art9_health', 'keiner'],
  ['Wie schreibe ich eine Kündigung?', 'hr_record', 'keiner'],
  ['Kann eine Frau Krebs bekommen?', 'art9_health', 'keiner'],
  // Anrede + ein Name (Handtest 14.10.2026)
  ['Herr XY hat Diabetes.', 'art9_health', 'sicher'],
  ['Frau Mustermann erhält die Kündigung.', 'hr_record', 'sicher'],
  ['Hallo Herr Doktor, ich habe Diabetes.', 'art9_health', 'keiner'],
];

// --- Kontext-Risiken (Paket context) ------------------------------------------
// Allgemeine Fragen ohne Personenbezug, Prosa mit Namen ohne heikle Stichworte und
// kleine Listen. Jede Probe einzeln geprueft (Listen zaehlen sonst ueber Proben-
// grenzen). Ziel: kein Fund des Pakets context; bei den Fragen auch nicht unsicher.
const CTX_IDS = new Set(Array.from(DLX.packs.context.detectors, (d) => d.id));
const W_GES = { de: ['Diabetes', 'Krebs', 'Depression', 'Burnout', 'Asthma', 'Epilepsie', 'Demenz', 'Alzheimer', 'Insulin', 'Chemotherapie', 'Schwangerschaft', 'ADHS'],
  en: ['diabetes', 'cancer', 'depression', 'dementia', 'epilepsy', 'autism', 'chemotherapy', 'pregnancy', 'ADHD', 'insulin'],
  fr: ['diabète', 'cancer', 'dépression', 'démence', 'épilepsie', 'asthme', 'grossesse'], it: ['diabete', 'cancro', 'depressione', 'demenza', 'epilessia', 'gravidanza'],
  es: ['diabetes', 'cáncer', 'depresión', 'demencia', 'epilepsia', 'embarazo'], pt: ['diabetes', 'câncer', 'depressão', 'demência', 'epilepsia', 'gravidez'],
  nl: ['diabetes', 'kanker', 'depressie', 'dementie', 'epilepsie', 'zwangerschap'] };
const W_HR = { de: ['Kündigung', 'Abmahnung', 'Lohn', 'Gehalt', 'Leistungsbeurteilung', 'Krankmeldung', 'Arbeitszeugnis', 'Lohnabrechnung'],
  en: ['termination', 'salary', 'written warning', 'performance review', 'sick leave', 'payslip'], fr: ['licenciement', 'salaire', 'avertissement', 'arrêt maladie'],
  it: ['licenziamento', 'stipendio', 'busta paga'], es: ['despido', 'salario', 'nómina', 'baja médica'], pt: ['demissão', 'salário', 'avaliação de desempenho'],
  nl: ['ontslag', 'salaris', 'loonstrook', 'ziekmelding'] };
const W_GL = { de: ['Gewerkschaft', 'Konfession', 'Kirchenaustritt', 'Parteimitgliedschaft'], en: ['trade union', 'religion', 'party membership'],
  fr: ['syndicat', 'religion'], it: ['sindacato', 'religione'], es: ['sindicato', 'religión'], pt: ['sindicato', 'religião'], nl: ['vakbond', 'religie'] };
const FRAGE = {
  de: (w) => pick([`Was ist ${w}?`, `Wie behandelt man ${w}?`, `Erkläre ${w} in einfachen Worten.`, `Welche Regeln gelten für ${w} in der Schweiz?`, `Kann eine Frau ${w} bekommen?`, `Schreibe einen Blogartikel über ${w}.`]),
  en: (w) => pick([`What is ${w}?`, `How is ${w} handled in Germany?`, `Explain ${w} in simple terms.`, `Write a short article about ${w}.`, `Can a woman get ${w}?`]),
  fr: (w) => pick([`Qu’est-ce que ${w} ?`, `Comment fonctionne ${w} en France ?`, `Explique ${w} simplement.`]),
  it: (w) => pick([`Che cos’è ${w}?`, `Come funziona ${w} in Italia?`, `Spiega ${w} in parole semplici.`]),
  es: (w) => pick([`¿Qué es ${w}?`, `¿Cómo funciona ${w} en España?`, `Explica ${w} de forma sencilla.`]),
  pt: (w) => pick([`O que é ${w}?`, `Como funciona ${w} no Brasil?`, `Explique ${w} de forma simples.`]),
  nl: (w) => pick([`Wat is ${w}?`, `Hoe werkt ${w} in Nederland?`, `Leg ${w} eenvoudig uit.`]),
};
const frage = (W) => { const l = pick(Object.keys(FRAGE)); return FRAGE[l](pick(W[l])); };
const LEUTE = ['Herr Max Muster', 'Frau Erika Beispiel', 'Mr John Example', 'Mrs Jane Example', 'Madame Marie Exemple', 'Sig. Paolo Esempio', 'Sra. Ana Ejemplo', 'Dhr. Jan Voorbeeld'];
const mails = (n) => Array.from({ length: n }, (_, i) => `kontakt${i}@example.com`);
const ARTEN_KONTEXT = {
  fragen_gesundheit: () => frage(W_GES),
  fragen_personal: () => frage(W_HR),
  fragen_glaube: () => frage(W_GL),
  prosa_namen: () => pick([
    () => `${pick(LEUTE)} kommt am ${dmy()} um ${int(8, 18)} Uhr ins Meeting.`,
    () => `Bitte ${pick(LEUTE)} die Offerte ${digits(int(6, 10), '123456789')} bis Freitag senden.`,
    () => `${pick(LEUTE)} will join the call about project ${hex(6)}.`,
    () => `Danke, ${pick(LEUTE)}, für die Rückmeldung zum Release ${int(1, 9)}.${int(0, 20)}.`,
    () => `Anna Muster und Peter Beispiel planen den Workshop in Raum ${int(100, 999)}.`,
  ])(),
  listen_klein: () => pick([
    () => mails(int(2, 9)).join('\n'),
    () => Array(int(10, 40)).fill(pick(['support@example.com', 'info@example.org', 'noreply@example.net'])).join('\n'),
    () => 'Name;Preis;Menge\n' + Array.from({ length: int(10, 40) }, (_, i) => `Artikel ${i};${money()};${int(1, 99)}`).join('\n'),
    () => 'Produkt\tName\tLager\n' + Array.from({ length: int(10, 40) }, (_, i) => `P-${digits(5)}\tSchraube M${int(2, 12)}\t${int(0, 999)}`).join('\n'),
    () => `const team = [${mails(int(2, 5)).map((m) => `'${m}'`).join(', ')}];`,
    () => Array.from({ length: int(10, 40) }, () => `${iso()} INFO user=${digits(6, '123456789')} status=${pick(['200', '204', '301'])}`).join('\n'),
  ])(),
  // Anrede ohne Namen, Grussformeln, Anrede + Rolle/Abkuerzung und Anrede + Name ohne
  // heikles Stichwort (Handtest 14.10.2026). Steht am Ende: die Proben davor bleiben gleich.
  anrede_ohne_namen: () => pick([
    () => `${pick(['Sehr geehrter Herr', 'Sehr geehrte Frau', 'Sehr geehrte Damen und Herren', 'Dear Sir', 'Madame, Monsieur', 'Gentile Signora', 'Prezado Senhor'])}, ${frage(W_GES)}`,
    () => `${pick(['Hallo Herr Doktor', 'Guten Tag Frau Doktor', 'Grüezi Herr Pfarrer', 'Liebe Frau Kollegin', 'Hello Mr President', 'Bonjour Monsieur le Directeur'])}, ${frage(W_HR)}`,
    () => `${pick(['Frau CEO', 'Herr HR', 'Herr IT', 'Frau AG'])} ${pick(['prüft', 'liest', 'schreibt'])} ${frage(W_GES)}`,
    () => `${pick(['Herr XY', 'Frau MUSTER', 'Mr EXAMPLE', 'Mme EXEMPLE', 'Sig.ra ESEMPIO', 'Dr. Beispiel'])} kommt am ${dmy()} um ${int(8, 18)} Uhr.`,
    () => `Fr. ${money()} für ${pick(['das Abo', 'die Lizenz', 'den Workshop'])} ${int(1, 9)}.`,
  ])(),
};
const FRAGEN = ['fragen_gesundheit', 'fragen_personal', 'fragen_glaube'];
function measureEach(samples) {
  const out = { n: samples.length, flagged: { sicher: 0, unsicher: 0 }, types: {} };
  for (const s of samples) {
    let best = null;
    for (const f of scanAll(s)) {
      if (!CTX_IDS.has(f.id)) continue;
      const st = stageOf(f);
      const t = out.types[f.id] || (out.types[f.id] = { sicher: 0, unsicher: 0 });
      t[st]++;
      if (st === 'sicher' || !best) best = st;
    }
    if (best) out.flagged[best]++;
  }
  return out;
}

// --- Messung ----------------------------------------------------------------
// Proben werden zu Blocks verbunden; der Abstand (>50 Zeichen) haelt das
// Kontextfenster jeder Probe von den Nachbarn fern.
const SEP = '\n' + ' '.repeat(60) + '\n';
const stageOf = (f) => (f.sure === false ? 'unsicher' : 'sicher');

function measure(samples) {
  const out = { n: samples.length, flagged: { sicher: 0, unsicher: 0 }, types: {} };
  for (let i = 0; i < samples.length; i += 400) {
    const chunk = samples.slice(i, i + 400);
    const starts = [];
    let pos = 0;
    for (const s of chunk) { starts.push(pos); pos += s.length + SEP.length; }
    const text = chunk.join(SEP);
    const hit = new Map();   // Probe -> beste Stufe
    for (const f of scanAll(text)) {
      let k = starts.length - 1;
      while (starts[k] > f.start) k--;
      const st = stageOf(f);
      const t = out.types[f.id] || (out.types[f.id] = { sicher: 0, unsicher: 0 });
      t[st]++;
      if (st === 'sicher' || !hit.has(k)) hit.set(k, st);
    }
    for (const st of hit.values()) out.flagged[st]++;
  }
  return out;
}

const result = { zufall: {}, arten: {}, trefferquote: null };
const typeTotals = {};
function addTypes(types) {
  for (const [id, c] of Object.entries(types)) {
    const t = typeTotals[id] || (typeTotals[id] = { sicher: 0, unsicher: 0 });
    t.sicher += c.sicher; t.unsicher += c.unsicher;
  }
}

for (let len = 6; len <= 24; len++) {
  const samples = Array.from({ length: N_ZUFALL }, () => digits(len));
  const r = measure(samples);
  result.zufall[len] = r;
  addTypes(r.types);
}
for (const [art, gen] of Object.entries(ARTEN)) {
  const r = measure(Array.from({ length: N_ART }, gen));
  result.arten[art] = r;
  addTypes(r.types);
}
result.kontext = {};
for (const [art, gen] of Object.entries(ARTEN_KONTEXT)) {
  const r = measureEach(Array.from({ length: N_ART }, gen));
  result.kontext[art] = r;
  addTypes(r.types);
}

// Trefferquote: jeder Testwert muss seinen Datentyp liefern (beliebige Stufe);
// "sicher" zaehlt zusaetzlich, ob er in der Warnleiste landet.
const tq = { n: 0, ok: 0, sicher: 0, fehlend: [] };
const WORLD_IDS = new Set(WORLD_CASES.map((c) => c[0]));
for (const [id, text] of POSITIVE.concat(WORLD_CASES.map(([i, pos]) => [i, pos]))) {
  tq.n++;
  // Laenderpakete Phase 2/3: nur das eigene Paket aktiv (gleich gebaute Nummern anderer
  // Laender ueberdecken sich sonst), Klasse tief per Regel eingeschaltet.
  const world = WORLD_IDS.has(id);
  const fs = DLX.engine.scan(text, { packs: world ? [PACK_OF[id]] : CFG.packs, rules: world ? { [id]: 'warn' } : { br_cep: 'warn' } }).findings;
  const f = Array.from(fs).find((x) => x.id === id);
  if (f) { tq.ok++; if (stageOf(f) === 'sicher') tq.sicher++; } else tq.fehlend.push(id);
}
result.trefferquote = tq;
const umg = UMGEHUNG.map(([text, id, want]) => {
  const f = Array.from(scanAll(text)).find((x) => x.id === id);
  return { id, want, got: f ? stageOf(f) : 'keiner' };
});
result.umgehung = umg;

// Zielpruefung: reine Zufallsziffern je sicher meldendem Typ und Laenge < 1:100000.
const verstoesse = [];
for (const [len, r] of Object.entries(result.zufall)) {
  for (const [id, c] of Object.entries(r.types)) if (c.sicher / r.n >= ZIEL_ZUFALL && !(SCHNELL && c.sicher <= 1)) verstoesse.push(`Zufall ${len} Ziffern: ${id} ${c.sicher}/${r.n}`);
}
const cl = CODE_LOG.reduce((a, k) => ({ n: a.n + result.arten[k].n, s: a.s + result.arten[k].flagged.sicher }), { n: 0, s: 0 });
if (cl.s / cl.n >= ZIEL_CODE_LOG) verstoesse.push(`Code/Log: ${cl.s}/${cl.n} sicher gemeldet`);
for (const [art, r] of Object.entries(result.kontext)) {
  if (r.flagged.sicher || (FRAGEN.includes(art) && r.flagged.unsicher)) verstoesse.push(`Kontext ${art}: ${r.flagged.sicher} sicher / ${r.flagged.unsicher} unsicher gemeldet`);
}
for (const u of umg) if (u.got !== u.want) verstoesse.push(`Grenzfall ${u.id}: erwartet ${u.want}, erhalten ${u.got}`);
if (tq.sicher !== tq.n) verstoesse.push(`Testwerte sicher ${tq.sicher}/${tq.n}`);
if (tq.ok !== tq.n) verstoesse.push(`Trefferquote ${tq.ok}/${tq.n}, fehlend: ${tq.fehlend.join(', ')}`);
result.ziel = { zufall: ZIEL_ZUFALL, codeLog: ZIEL_CODE_LOG, codeLogRate: cl.s / cl.n, erreicht: verstoesse.length === 0, verstoesse };

if (JSON_OUT) { console.log(JSON.stringify({ result, typeTotals }, null, 1)); }
else {
  const rate = (k, n) => (k === 0 ? '0' : (k / n).toExponential(1));
  console.log(`Fehlalarm-Messung (${SCHNELL ? 'schnell' : 'voll'}, alle Pakete aktiv)\n`);
  console.log('Reine Zufallsziffern (je Laenge ' + N_ZUFALL + ' Werte): Laenge | sicher | unsicher | Typen sicher');
  for (const [len, r] of Object.entries(result.zufall)) {
    const ts = Object.entries(r.types).filter(([, c]) => c.sicher).map(([id, c]) => `${id} ${c.sicher}`).join(', ');
    console.log(`  ${String(len).padStart(2)} | ${rate(r.flagged.sicher, r.n).padStart(7)} | ${rate(r.flagged.unsicher, r.n).padStart(7)} | ${ts || '-'}`);
  }
  console.log('\nKorpus-Arten (je ' + N_ART + ' Proben): Art | sicher | unsicher | Typen');
  for (const [art, r] of Object.entries(result.arten)) {
    const ts = Object.entries(r.types).map(([id, c]) => `${id} ${c.sicher}/${c.unsicher}`).join(', ');
    console.log(`  ${(art + (INFO.includes(art) ? '*' : '')).padEnd(15)} | ${rate(r.flagged.sicher, r.n).padStart(7)} | ${rate(r.flagged.unsicher, r.n).padStart(7)} | ${ts || '-'}`);
  }
  const byPack = {};
  for (const [id, c] of Object.entries(typeTotals)) {
    const p = byPack[PACK_OF[id]] || (byPack[PACK_OF[id]] = { sicher: 0, unsicher: 0 });
    p.sicher += c.sicher; p.unsicher += c.unsicher;
  }
  console.log('\nFunde je Paket (sicher/unsicher): ' + Object.entries(byPack).map(([p, c]) => `${p} ${c.sicher}/${c.unsicher}`).join(', '));
  console.log('  * nur Information, kein Zielwert');
  console.log('\nKontext-Risiken (je ' + N_ART + ' Proben, einzeln, nur Paket context): Art | sicher | unsicher');
  for (const [art, r] of Object.entries(result.kontext)) console.log(`  ${art.padEnd(17)} | ${String(r.flagged.sicher).padStart(6)} | ${String(r.flagged.unsicher).padStart(8)}`);
  console.log('\nGrenzfaelle: ' + umg.map((u) => `${u.id} ${u.got}${u.got === u.want ? '' : ' (erwartet ' + u.want + ')'}`).join(', '));
  console.log(`\nTrefferquote Testwerte: ${tq.ok}/${tq.n} (davon sicher ${tq.sicher})${tq.fehlend.length ? ' fehlend: ' + tq.fehlend.join(', ') : ''}`);
  console.log(`Code/Log sicher gemeldet: ${cl.s}/${cl.n}`);
  console.log(verstoesse.length ? '\nZIELWERTE NICHT ERREICHT:\n- ' + verstoesse.join('\n- ') : '\nZielwerte erreicht.');
}
if (verstoesse.length) process.exitCode = 1;
