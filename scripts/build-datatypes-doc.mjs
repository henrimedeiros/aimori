// Erzeugt docs/datentypen.md aus den Erkennungs-Paketen (eine Quelle der Wahrheit).
// Aufruf: node scripts/build-datatypes-doc.mjs (Teil von npm run build)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, ROOT } from '../tests/helpers/load.mjs';

// Pruefverfahren je Datentyp (Quelle: offizielle Spezifikation bzw. Modul-Doku).
const CHECK = {
  ch_ahv: 'EAN-13 Modulo 10', ch_vvk: 'Luhn', ch_uid: 'Mod 11 (Gewichte 5,4,3,2,7,6,5,4; BFS)', ch_mwst: 'Mod 11 wie UID',
  ch_tel: 'Länge (E.164)', de_idnr: 'ISO 7064 MOD 11,10 + Ziffernregel', de_ust: 'ISO 7064 MOD 11,10', de_rvnr: 'gewichtete Quersumme Mod 10 (DRV)',
  de_kvnr: 'Gewichte 1-2, Quersumme Mod 10 (§ 290 SGB V)', de_pa: 'ICAO 7-3-1', at_svnr: 'Mod 11 (Gewichte 3,7,9,0,5,8,4,2,1,6)',
  at_uid: 'Luhn-Variante (6 − Rest) Mod 10', fr_nir: '97 − (Zahl mod 97), Korsika 2A/2B', fr_tva: '(12 + 3 × (SIREN mod 97)) mod 97',
  it_cf: 'Tabellen gerade/ungerade Stellen, Mod 26', it_iva: 'Luhn + Amtscode', be_nn: '97 − (Zahl mod 97), ab 2000 mit 2 davor',
  be_vat: '97 − (8 Ziffern mod 97)', nl_bsn: '11-Proef', nl_btw: '11-Proef oder ISO 7064 MOD 97-10', us_ssn: 'nur Formatregeln',
  mrz_td3: 'ICAO 7-3-1 (Dokument, Geburt, Ablauf, Gesamt)', mrz_td1: 'ICAO 7-3-1 (Dokumentnummer)', iban: 'Länge je Land + ISO 7064 MOD 97-10',
  cc_visa: 'IIN 4 + Länge + Luhn', cc_mc: 'IIN 51–55/2221–2720 + Luhn', cc_amex: 'IIN 34/37 + Luhn', cc_cvv: 'Schlüsselwort im Muster',
  eu_vat_generic: 'Länder-Validator aller EU-Staaten, sonst Kontextwort', ipv4: 'nur öffentliche Adressen', birthdate: 'Schlüsselwort + gültiges Datum',
  cfg_password: 'ganzer Wert kein Platzhalter, ≥ 4 verschiedene Zeichen, ohne Anführungszeichen keine Code-Verweise', phone_e164: '8–15 Ziffern',
  // Geheimnisse/Vermerke (Design-Review 14.10.2026)
  env_secret: 'Name mit Geheimnis-Wort + Wertprüfung wie cfg_password (ohne Pfade, URLs, Längen/Zeiten)', jwt: 'Kopf JSON mit alg, Nutzdaten JSON-Objekt',
  pem_private: 'ganzer Block bis END (ohne END bis 12000 Zeichen)', putty_key: 'ganze Datei bis Private-MAC (ohne bis 12000 Zeichen)',
  conn_db: 'Passwort kein Platzhalter', conn_jdbc: 'Passwort kein Platzhalter', conn_ado: 'Passwort kein Platzhalter', conn_redis: 'Passwort kein Platzhalter', basic_auth_url: 'Passwort kein Platzhalter',
  conf_marker: 'Wendung überall; Einzelwort nur nach Schlüssel (z. B. Klassifizierung:), allein auf der Zeile oder in GROSSBUCHSTABEN', conf_label: 'Purview-Metadaten (nicht öffentlich/allgemein) + Richtlinie labelNames',
  // Phase 2/3 (extension/engine/packs-world.js)
  ch_esr: 'Mod 10 rekursiv (SIX)', at_tin: 'Luhn', fr_nif: 'letzte 3 = erste 10 mod 511', fr_siren: 'Luhn', es_dni: 'Mod 23 → Buchstabe', es_nie: 'Mod 23 → Buchstabe (X/Y/Z = 0/1/2)',
  es_cif: 'Luhn → Ziffer oder Buchstabe', es_nss: 'Mod 97', es_vat: 'DNI/NIE/CIF je nach Form', pt_nif: 'Mod 11 (Gewichte 9..2)', pt_cc: 'Luhn über A=10..Z=35',
  pt_niss: 'Gewichte 29..2, 9 − Rest mod 10', pt_vat: 'Mod 11 wie NIF', lu_matricule: 'Datum + Luhn + Verhoeff', lu_tva: 'erste 6 mod 89', se_pnr: 'Datum + Luhn', se_org: 'Luhn',
  se_vat: 'Luhn + 01', dk_cpr: 'nur Datum (Mod 11 seit 2007 nicht garantiert)', dk_cvr: 'Mod 11 (2,7,6,5,4,3,2,1)', dk_vat: 'Mod 11 wie CVR', no_fnr: 'Datum + zwei Mod-11-Ziffern',
  no_orgnr: 'Mod 11 (3,2,7,6,5,4,3,2)', fi_hetu: 'Datum + Mod 31 → Zeichen', fi_alv: 'Mod 11 (7,9,10,5,8,4,2)', fi_vat: 'Mod 11 wie Y-tunnus', is_kt: 'Datum + Mod 11',
  ie_pps: 'Mod 23 → Buchstabe', ie_vat: 'Mod 23 (neues und altes Format)', gb_nino: 'Präfixregeln (HMRC)', gb_nhs: 'Mod 11 (10..2)', gb_utr: 'Mod 11, Prüfziffer vorne',
  gb_vat: 'Mod 97 bzw. 9755', gb_sort: 'nur Format (Vocalink-Tabellen lizenziert)', pl_pesel: 'Datum + Gewichte 1,3,7,9', pl_nip: 'Mod 11 (6,5,7,2,3,4,5,6,7)', pl_vat: 'Mod 11 wie NIP',
  pl_regon: 'Mod 11 (9/14 Stellen)', cz_rc: 'Datum + Mod 11', cz_dic: 'Mod 11 bzw. Rodné číslo', sk_rc: 'Datum + Mod 11', sk_dph: 'Zahl mod 11 = 0', hu_tax: 'Mod 11 (1..9)',
  hu_taj: 'Gewichte 3,7 mod 10', hu_vat: 'Gewichte 9,7,3,1 mod 10', ro_cnp: 'Datum + Mod 11 (279146358279)', ro_cui: 'Mod 11 (753217532)', ro_vat: 'Mod 11 wie CUI',
  bg_egn: 'Datum + Mod 11', bg_vat: 'Mod 11 (9 Stellen) bzw. EGN/Ausländer/Sonstige', hr_oib: 'ISO 7064 MOD 11,10', hr_vat: 'ISO 7064 MOD 11,10', si_emso: 'Datum + Mod 11',
  si_ddv: 'Mod 11 (8..2)', gr_amka: 'Datum + Luhn', gr_afm: 'Gewichte 2^8..2 mod 11', cy_vat: 'Tabelle + mod 26 → Buchstabe', mt_vat: 'Mod 37', ee_ik: 'Datum + Mod 11 zweistufig',
  ee_kmkr: 'Gewichte 3,7,1 mod 10', lt_ak: 'Datum + Mod 11 zweistufig', lt_pvm: 'Mod 11 zweistufig', lv_pk: 'Datum + Mod 11 (ab 2017 ohne Datum)', lv_pvn: 'Mod 11 bzw. Personas kods',
  us_ein: 'gültige IRS-Präfixe', us_itin: 'Gruppenregeln (IRS)', us_aba: 'Gewichte 3,7,1 mod 10 + Präfix', us_mbi: 'Zeichenregeln (CMS)', ca_sin: 'Luhn', ca_bn: 'Luhn', ca_ohip: 'Luhn',
  br_cns: 'Gewichte 15..1 mod 11', mx_curp: 'Datum + Mod 10 (Gewichte 18..2)', mx_rfc: 'Datum + Mod 11 (alte RFC nur mit Kontext)', ar_cuit: 'Mod 11 (5,4,3,2,7,6,5,4,3,2)',
  cl_rut: 'Mod 11 (2..7), K = 10', co_nit: 'Mod 11 (Primzahl-Gewichte)', in_aadhaar: 'Verhoeff', in_pan: 'Struktur (Inhaberart)', in_gstin: 'Luhn mod 36',
  cn_ric: 'Datum + ISO 7064 MOD 11-2', cn_uscc: 'Mod 31 (GB 32100)', jp_mynum: 'Mod 11', jp_cn: 'Mod 9, Prüfziffer vorne', kr_rrn: 'Datum (+ Mod 11, seit 2020 nicht garantiert)',
  kr_brn: 'Gewichte 1,3,7,1,3,7,1,3,5 mod 10', sg_nric: 'Gewichte 2..7 + Buchstabentabelle', sg_uen: 'Gewichte + Buchstabentabelle', au_tfn: 'Mod 11', au_medicare: 'Gewichte 1,3,7,9 mod 10',
  au_abn: 'Mod 89', nz_ird: 'Mod 11 zweistufig + Bereich', nz_nhi: 'Mod 11 (altes Format)', za_id: 'Datum + Luhn', za_tin: 'Luhn', tr_tckn: 'zwei Prüfziffern (Summenregeln)',
  tr_vkn: 'Mod 10 (GIB-Verfahren)', il_tz: 'Luhn', ae_eid: 'Luhn', sa_nid: 'Luhn', ehic: 'Luhn', cc_disc: 'IIN 6011/644–649/65 + Luhn', cc_diners: 'IIN 300–305/3095/36/38/39 + Luhn',
  cc_jcb: 'IIN 3528–3589 + Luhn', cc_cup: 'IIN 62 + Luhn', cc_maestro: 'IIN 5018/5020/5038/5893/6304/6759/6761–6763 + Luhn', lei: 'ISO 7064 MOD 97-10',
  btc_legacy: 'Base58Check (doppeltes SHA-256)', btc_bech32: 'Bech32/Bech32m (BIP-173/350)', eth_addr: 'Format (EIP-55 ohne Keccak nicht geprüft)', ipv6: 'nur globale Unicast-Adressen',
  mac: 'EUI-48, einheitliches Trennzeichen',
  // Paket context (docs/kontext-risiken.md)
  postal_address: 'Strasse + Hausnummer + PLZ + Ort; allein nur unsicher, sicher als Teil einer Identitäts-Kombi',
  identity_combo: 'abgeleitet: Name + Geburtsdatum + Adresse/Telefon/Mail/Ausweis im Umkreis (Richtlinie identityMinParts)',
  art9_health: 'abgeleitet: Wortliste/ICD-10 nur mit Personenbezug im selben Absatz', hr_record: 'abgeleitet: Wortliste nur mit Personenbezug im selben Absatz',
  art9_belief: 'abgeleitet: Wortliste nur mit Personenbezug im selben Absatz', mass_list: 'abgeleitet: verschiedene Einträge ≥ Richtlinie massListMin (Standard 10)',
};

export function render() {
  const DLX = load();
  const L = ['# Datentypen', '',
    'Automatisch erzeugt aus `extension/engine/*` mit `npm run build` – nicht von Hand ändern.', '',
    'Standardaktion: Schutzklasse hoch/mittel → `warn`, tief → `off`. Änderbar je Datentyp per Richtlinie `rules` (`off`, `warn`, `redact`, `block`) bzw. in den Einstellungen, sofern nicht verwaltet. Das Firmen-Wörterbuch hat die ID `dictionary`, interne Links (SharePoint/OneDrive, Intranet, Hosts ohne öffentliche Endung, Richtlinie `internalDomains`) haben die ID `internal_link` (Standard `warn`, siehe [interne-links.md](interne-links.md)).', '',
    '| ID | Datentyp | Paket | Kategorie | Schutzklasse | Prüfung | nur mit Kontextwort |', '|---|---|---|---|---|---|---|'];
  for (const d of DLX.engine.allDetectors()) {
    const ctx = d.needsCtx ? (d.ctxUnless ? 'ja (ausser mit Länderpräfix)' : 'ja') : '';
    L.push(`| \`${d.id}\` | ${d.name.de} | ${d.pack} | ${d.cat} | ${d.cls} | ${CHECK[d.id] || (d.valid && d.pack === 'secrets' ? 'Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen' : 'Format (Anbieter-Präfix/Struktur)')} | ${ctx} |`);
  }
  L.push('', `Summe: ${DLX.engine.allDetectors().length} Datentypen in ${Object.keys(DLX.packs).length} Paketen.`, '',
    'Welche Länderpakete aktiv sind, wählt die Erweiterung automatisch nach Zeitzone und Sprachregion (nur lokal, siehe `docs/einstellungen.md`); Richtlinie und Benutzer können das überschreiben. ' +
    'Quellen der Prüfverfahren: siehe `docs/datentypen-quellen.md`.', '');
  // Laenderliste: je Paket Land und Anzahl Datentypen.
  L.push('## Länderliste', '', '| Paket | Land / Region | Datentypen |', '|---|---|---|');
  let dn = null;
  try { dn = new Intl.DisplayNames(['de'], { type: 'region' }); } catch (e) { /* Kuerzel bleiben */ }
  const GLOBAL_NAME = { finance: 'weltweit: Finanzen', secrets: 'weltweit: Zugangsdaten und Technik', contact: 'weltweit: Kontakt', travel: 'weltweit: Reisedokumente', marker: 'weltweit: Vertraulichkeits-Vermerke', context: 'weltweit: Kontext-Risiken (Identität, Art. 9, Personal, Listen)', community: 'weltweit: Gemeinschafts-Muster (signierter Katalog, docs/muster-mitmachen.md)', EU: 'EU-weit' };
  for (const p of Object.values(DLX.packs)) {
    const name = GLOBAL_NAME[p.id] || (dn ? dn.of(p.id) : p.id);
    L.push(`| ${p.id} | ${name} | ${p.detectors.length} |`);
  }
  L.push('', 'Nicht als eigener Datentyp umgesetzt (Katalog weltweit, Stand 14.10.2026): `it_vat` (abgedeckt durch `it_iva`), Seed-Phrasen (`crypto_seed`, braucht die BIP-39-Wortliste als gepinnte Datei, Folgeschritt), ' +
    'Namen werden nie allein gemeldet, nur als Teil von `identity_combo` bzw. als Personenbezug für `art9_health`, `hr_record`, `art9_belief` (Paket context, `docs/kontext-risiken.md`); Ethnie, Sexualleben, Biometrie, Strafdaten und Sozialhilfe sind noch nicht umgesetzt. ' +
    'Neue Kartenarten (Discover, Diners, JCB, UnionPay, Maestro) melden nur mit dem Markennamen in der Nähe, damit zufällige Zahlen nicht als Karte gelten.', '');
  return L.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'docs', 'datentypen.md'), render());
  console.log('docs/datentypen.md geschrieben');
}
