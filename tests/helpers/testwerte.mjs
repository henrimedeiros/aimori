// Gemeinsame Testwerte (Treffer/Nicht-Treffer je Datentyp) fuer tests/engine.test.mjs
// und die Trefferquote in scripts/fehlalarm.mjs.
import { load } from './load.mjs';

const DLX = load();

// Deterministische synthetische Zeichenfolge (kein echter Schluessel).
export const rnd = (n, abc = 'aB3dE5gH7jK9mN2pQ4sT6vW8yZ') => Array.from({ length: n }, (_, i) => abc[(i * 7 + 3) % abc.length]).join('');

// Alphabete fuer erfundene Schluessel (nur zur Laufzeit zusammengesetzt, Auflage 9).
export const HEX = '0123456789abcdef';
export const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const AGE = 'QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// Erfundenes JWT mit gueltiger Struktur (Kopf mit alg, Nutzdaten als Objekt).
export const JWT = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub: 'demo-user', iat: 1700000000 }) + '.' + rnd(43);
export const UUID = '3f2a9c1e-7b4d-4e8f-9a6b-2c5d8e1f0a7b';

export function luhnComplete(body) {
  for (let c = 0; c < 10; c++) if (DLX.algo.luhn(body + c)) return body + c;
  throw new Error('no luhn digit');
}


// [Datentyp, Text mit Treffer, Text ohne Treffer]
export const CASES = [
  ['ch_ahv', 'AHV-Nr. 756.1234.5678.97', 'AHV-Nr. 756.1234.5678.98'],
  ['ch_vvk', 'Versichertenkarte ' + luhnComplete('8075600000000000001'), 'Versichertenkarte 80756000000000000010' + ''],
  ['ch_uid', 'Firma CHE-100.155.212 eingetragen', 'Firma CHE-100.155.213 eingetragen'],
  ['ch_mwst', 'MWST-Nr. CHE-100.155.212 MWST', 'MWST-Nr. CHE-100.155.213 MWST'],
  ['ch_tel', 'Ruf an: 079 000 00 00', 'Ruf an: 079 000 00'],
  ['phone_e164', 'Call +44 20 7946 0000 today', 'Call +44 12 today'],
  ['de_idnr', 'Steuer-ID: 36 574 261 809', '36 574 261 809 ohne Bezug'],
  ['de_ust', 'USt-IdNr. DE136695976', 'USt-IdNr. DE136695977'],
  ['de_rvnr', 'RVNR 15 070649 C 103', 'RVNR 15 070649 C 104'],
  ['de_kvnr', 'KVNR A000500015', 'Artikel A000500015'],
  ['de_pa', 'Personalausweis L898902C36', 'Personalausweis L898902C37'],
  ['at_svnr', 'SVNR 1237 010180', 'SVNR 1237 010181'],
  ['at_uid', 'UID ATU13585627', 'UID ATU13585628'],
  ['fr_nir', 'NIR 2 95 10 99 126 111 93', 'NIR 2 95 10 99 126 111 94'],
  ['fr_tva', 'TVA FR 40 303 265 045', 'TVA FR 41 303 265 045'],
  ['it_cf', 'codice fiscale RCCMNL83S18D969H', 'codice fiscale RCCMNL83S18D969A'],
  ['it_iva', 'partita IVA 00743110157', 'Bestellung 00743110157'],
  ['be_nn', 'INSZ 85.07.30-033.28', 'INSZ 85.07.30-033.29'],
  ['be_vat', 'BTW BE 0403.019.261', 'BTW BE 0403.019.262'],
  ['nl_bsn', 'BSN 1112.22.333', 'Bestelling 111222333'],
  ['nl_btw', 'BTW NL004495445B01', 'BTW NL004495446B01'],
  ['us_ssn', 'SSN: 123-45-6789', 'Order 123-45-6789'],
  ['br_cpf', 'CPF 111.444.777-35', 'CPF 111.444.777-36'],
  ['br_cnpj', 'CNPJ 11.222.333/0001-81', 'CNPJ 11.222.333/0001-82'],
  ['br_tel', 'Ligue (21) 2345-6789', 'Ligue (20) 2345-6789'],
  ['mrz_td3', 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10', 'L898902C36UTO7408122F1204159ZE184226B<<<<<11'],
  ['mrz_td1', 'I<UTOD231458907<<<<<<<<<<<<<<<', 'I<UTOD231458906<<<<<<<<<<<<<<<'],
  ['iban', 'IBAN CH93 0076 2011 6238 5295 7 bitte', 'IBAN CH93 0076 2011 6238 5295 8 bitte'],
  ['cc_visa', 'Karte 4242 4242 4242 4242', 'Karte 4242 4242 4242 4241'],
  ['cc_mc', 'Karte 5555555555554444', 'Karte 5555555555554445'],
  ['cc_amex', 'Karte 378282246310005', 'Karte 378282246310006'],
  ['cc_cvv', 'CVV: 123', 'Version 123'],
  ['email', 'Kontakt max.muster@example.com', 'Kontakt max.muster@localhost'],
  ['birthdate', 'geboren am 01.02.1980', 'geboren am 31.02.1980'],
  // Paket context (erfundene Personen): Postadresse sicher nur als Teil einer Kombi, Rest nur mit Personenbezug.
  ['postal_address', 'Max Mustermann, geb. 01.02.1980, Musterstrasse 12, 8000 Zürich', 'Musterstrasse 12 ist gesperrt'],
  ['identity_combo', 'Max Mustermann, geb. 01.02.1980, Musterstrasse 12, 8000 Zürich', 'Max Mustermann, geb. 01.02.1980'],
  ['art9_health', 'Herr Max Mustermann hat Diabetes.', 'Was ist Diabetes?'],
  ['hr_record', 'Frau Erika Mustermann erhält die Kündigung.', 'Wie schreibe ich eine Kündigung?'],
  ['art9_belief', 'Herr Max Mustermann ist Gewerkschaftsmitglied.', 'Wie funktioniert eine Gewerkschaft?'],
  // Tabelle mit Personendaten ohne Einzelnummern: Kopf Vorname/Nachname/Geburtsdatum, 10 Zeilen; 9 Zeilen nicht (Design-Review 16.10.2026).
  ['mass_table', ['Vorname;Nachname;Geburtsdatum'].concat(Array.from({ length: 10 }, (_, i) => 'Anna' + i + ';Muster' + i + ';0' + (i % 9 + 1) + '.03.1980')).join('\n'),
    ['Vorname;Nachname;Geburtsdatum'].concat(Array.from({ length: 9 }, (_, i) => 'Anna' + i + ';Muster' + i + ';0' + (i % 9 + 1) + '.03.1980')).join('\n')],
  ['mass_list', Array.from({ length: 10 }, (_, i) => 'kunde' + i + '@example.com').join('\n'), Array.from({ length: 9 }, (_, i) => 'kunde' + i + '@example.com').join('\n')],
  // Dokumentierte AWS-Beispielwerte gelten als Platzhalter (nicht melden).
  ['aws_akid', 'key ' + 'AKIA' + rnd(16, B32), 'key ' + 'AKIA' + 'IOSFODNN7EXAMPLE'],
  ['aws_secret', 'aws_secret_access_key = ' + rnd(40, B64), 'aws_secret_access_key = ' + 'wJalrXUtnFEMI/K7MDENG/' + 'bPxRfiCYEXAMPLEKEY'],
  ['azure_storage', 'DefaultEndpointsProtocol=https;AccountName=example;AccountKey=' + rnd(86) + '==', 'DefaultEndpointsProtocol=https;AccountName=example;AccountKey=abc'],
  ['azure_secret', 'secret ' + 'abc8Q~' + rnd(34), 'secret abc8Q~short'],
  ['azure_sas', 'https://example.blob.core.windows.net/c?sv=2024-01-01&ss=b&sig=' + rnd(30), 'https://example.com/?sv=1'],
  ['gcp_apikey', 'key ' + 'AIza' + rnd(35), 'key AIza' + rnd(10)],
  ['gcp_sa', '{"type": "service_account", "project_id": "demo", "private_key": "x"}', '{"type": "user"}'],
  ['google_oauth', 'GOCSPX-' + rnd(28), 'GOCSPX-' + rnd(5)],
  ['github_pat', 'token ' + 'ghp_' + rnd(36), 'token ghp_' + rnd(10)],
  ['github_fg', 'github_pat_' + rnd(22) + '_' + rnd(59), 'github_pat_' + rnd(5)],
  ['gitlab_pat', 'glpat-' + rnd(20), 'glpat-' + rnd(5)],
  ['slack_token', 'xoxb-' + rnd(24), 'xoxb-12'],
  ['slack_webhook', 'https://hooks.slack.com/services/T0000/B0000/' + rnd(24), 'https://hooks.slack.com/services/'],
  ['teams_webhook', 'https://example.webhook.office.com/webhookb2/' + rnd(50), 'https://example.webhook.office.com/x'],
  ['stripe_key', 'sk_' + 'test_' + rnd(24), 'pk_test_' + rnd(24)],
  ['openai_key', 'sk-' + 'proj-' + rnd(20) + 'T3BlbkFJ' + rnd(20), 'sk-' + rnd(10)],
  ['anthropic_key', 'sk-' + 'ant-api03-' + rnd(90), 'sk-ant-' + rnd(10)],
  ['sendgrid', 'SG.' + rnd(22) + '.' + rnd(43), 'SG.' + rnd(5)],
  ['jwt', 'Bearer ' + JWT, 'Bearer eyJ' + rnd(20) + '.eyJ' + rnd(20) + '.' + rnd(20)],
  ['pem_private', '-----BEGIN ' + 'RSA PRI' + 'VATE KEY-----\nMIIx', '-----BEGIN ' + 'PUBLIC KEY-----'],
  ['conn_db', 'postgres://app:' + rnd(12) + '@db.example.com/app', 'postgres://db.example.com/app'],
  ['conn_ado', 'Server=db.example.com;Database=x;User Id=u;Password=' + rnd(12), 'Server=db.example.com;Database=x'],
  ['cfg_password', 'password = ' + rnd(12), 'password = changeme'],
  ['basic_auth_url', 'https://admin:' + rnd(10) + '@example.com/x', 'https://example.com/x'],
  ['ipv4', 'Server 8.8.8.8 antwortet', 'Doku-Netz 192.0.2.10, privat 10.0.0.1, Version 1.2.3.4.5'],
  // Nur in eingefuegtem Code (Design-Review Code und Bilder 16.10.2026); Nicht-Treffer ebenfalls als Code.
  ['internal_host', 'const api = "http://10.20.30.40:8080/v1";\nconst db = "db01.corp";', 'const v = "10.0.1";\nconst h = "api.example.com";'],
  ['entropy_secret', 'const k = "q8Zt3LmX9vR2pK7wN4cY6bH1sJ5dF0gA";\nconst n = 1;', 'const id = "550e8400-e29b-41d4-a716-446655440000";\nconst ok = true;'],
  ['eu_vat_generic', 'VAT: XI123456789', 'ESTABLISHMENT XI123456789'],
  // Geheimnisse in Code/Konfiguration (Design-Review 14.10.2026); alle Werte erfunden.
  ['azure_sb', 'Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=' + rnd(43, B64) + '=',
    'Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKeyName=Root;SharedAccessKey=<key>'],
  ['discord_webhook', 'https://discord.com/api/webhooks/' + '123456789012345678/' + rnd(68), 'https://discord.com/api/webhooks/123'],
  ['groq_key', 'gsk_' + rnd(52), 'gsk_' + 'x'.repeat(52)],
  ['perplexity_key', 'pplx-' + rnd(48), 'pplx-' + rnd(10)],
  ['xai_key', 'xai-' + rnd(80), 'xai-' + rnd(20)],
  ['mailchimp_key', rnd(32, HEX) + '-us12', '0'.repeat(32) + '-us12'],
  ['mailgun_key', 'key-' + rnd(32, HEX), 'key-' + '0'.repeat(32)],
  ['brevo_key', 'xkeysib-' + rnd(64, HEX) + '-' + rnd(16), 'xkeysib-' + rnd(10, HEX)],
  ['pypi_token', 'pypi-' + 'AgEIcHlwaS5vcmc' + rnd(60), 'pypi-' + rnd(20)],
  ['docker_pat', 'dckr_pat_' + rnd(27), 'dckr_pat_' + rnd(5)],
  ['shopify_token', 'shpat_' + rnd(32, HEX), 'shpat_' + 'a'.repeat(32)],
  ['square_token', 'sq0atp-' + rnd(22), 'sq0atp-' + rnd(5)],
  ['do_token', 'dop_v1_' + rnd(64, HEX), 'dop_v1_' + '0'.repeat(64)],
  ['atlassian_token', 'ATATT3' + rnd(186), 'ATATT3' + rnd(20)],
  ['databricks_token', 'dapi' + rnd(32, HEX), 'dapi' + rnd(10, HEX)],
  ['linear_key', 'lin_api_' + rnd(40), 'lin_api_' + rnd(10)],
  ['notion_token', 'ntn_' + '12345678901' + rnd(35), 'ntn_' + rnd(10)],
  ['postman_key', 'PMAK-' + rnd(24, HEX) + '-' + rnd(34, HEX), 'PMAK-' + rnd(10, HEX)],
  ['grafana_token', 'glsa_' + rnd(32) + '_' + rnd(8, HEX), 'glsa_' + rnd(10)],
  ['newrelic_key', 'NRAK-' + rnd(27, B32), 'NRAK-' + rnd(10, B32)],
  ['sentry_token', 'sntryu_' + rnd(64, HEX), 'sntryu_' + rnd(10, HEX)],
  ['telegram_bot', 'bot 123456789:AA' + rnd(33), 'bot 123456789:AA' + rnd(10)],
  ['alibaba_key', 'LTAI' + rnd(20), 'LTAI' + rnd(5)],
  ['age_key', 'AGE-SECRET-KEY-1' + rnd(58, AGE), 'AGE-SECRET-KEY-1' + rnd(10, AGE)],
  ['vault_token', 'hvs.' + rnd(95), 'hvs.' + rnd(10)],
  ['terraform_token', rnd(14) + '.atlasv1.' + rnd(64), 'x.atlasv1.' + rnd(10)],
  ['doppler_token', 'dp.pt.' + rnd(43), 'dp.pt.' + rnd(10)],
  ['pulumi_token', 'pul-' + rnd(40, HEX), 'pul-' + rnd(10, HEX)],
  ['cloudflare_ca', 'v1.0-' + rnd(24, HEX) + '-' + rnd(146, HEX), 'v1.0-' + rnd(24, HEX)],
  ['mapbox_secret', 'sk.eyJ' + rnd(60) + '.' + rnd(22), 'pk.eyJ' + rnd(60) + '.' + rnd(22)],
  ['putty_key', 'PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none\nPrivate-Lines: 1\n' + rnd(44, B64) + '\nPrivate-MAC: ' + rnd(64, HEX), 'PuTTY-User-Key-File'],
  ['conn_jdbc', 'jdbc:sqlserver://db.example.com:1433;databaseName=app;user=app;password=' + rnd(14), 'jdbc:sqlserver://db.example.com:1433;user=app;password=changeme'],
  ['conn_redis', 'cache.example.com:6380,password=' + rnd(20) + ',ssl=True', 'cache.example.com:6380,password=<password>,ssl=True'],
  ['env_secret', 'DB_PASSWORD=' + rnd(14), 'DB_PASSWORD=changeme'],
  // Vertraulichkeits-Vermerke und Purview-Labels (Paket marker).
  ['conf_marker', 'Klassifizierung: Vertraulich', 'Bitte behandeln Sie das vertraulich.'],
  ['conf_label', 'MSIP_Label_' + UUID + '_Name=Confidential', 'MSIP_Label_' + UUID + '_Name=General'],
];

// CEP ist standardmaessig aus (Klasse tief) und braucht die Regel br_cep.
export const CEP_CASE = ['br_cep', 'CEP: 01310-100', 'Teil 01310-100'];

// Treffer-Texte fuer die Trefferquote: [Datentyp, Text].
export const POSITIVE = CASES.concat([CEP_CASE]).map(([id, pos]) => [id, pos]);
