# Quellen der Prüfverfahren und Testwerte

Recherchestand 2026-10-13. Muster und Prüfungen sind selbst nach diesen öffentlichen Spezifikationen geschrieben; kein fremder Code übernommen.

| Verfahren | Quelle |
|---|---|
| Luhn (Karten, CH-Versichertenkarte, IT-USt) | ISO/IEC 7812-1 Anhang B |
| ISO 7064 MOD 97-10 (IBAN, NL-USt ab 2020, LEI) | SWIFT IBAN Registry; ISO 13616; ISO 17442 |
| IBAN-Längen je Land | SWIFT IBAN Registry (verbindlich); Tabelle nach ibantools (MIT OR MPL-2.0) |
| EAN-13 Mod 10 (AHV-Nummer) | GS1, ZAS |
| CH-UID Mod 11 | Bundesamt für Statistik (UID-Register) |
| ISO 7064 MOD 11,10 (DE-Steuer-ID, DE-USt) | ISO/IEC 7064; BZSt |
| DE-Rentenversicherungsnummer | Deutsche Rentenversicherung (Aufbau der Versicherungsnummer) |
| DE-Krankenversichertennummer | GKV-Spitzenverband, § 290 SGB V |
| ICAO 7-3-1 (MRZ, DE-Ausweis) | ICAO Doc 9303 Teil 3 |
| AT-SVNR, AT-UID | Dachverband der Sozialversicherungsträger; BMF |
| FR-NIR, FR-TVA | INSEE; DGFiP |
| IT Codice fiscale, Partita IVA | Agenzia delle Entrate |
| BE Nationalregister, BE-USt | Rijksregister / Registre national; FÖD Finanzen |
| NL BSN (11-Proef), BTW | Rijksoverheid; Belastingdienst |
| US-SSN (nur Formatregeln) | Social Security Administration |
| BR CPF, CNPJ (Mod 11; alphanumerischer CNPJ ab Juli 2026, Zeichenwert = ASCII − 48) | Receita Federal do Brasil; IN RFB 2.229/2024 |
| BR Telefon (Vorwahlen/DDD, mobil 9 Stellen mit 9) | Anatel, Plano de Numeração |
| BR CEP (nur Format, Kontextwort Pflicht, Standard aus) | Correios |
| Secret-Formate | Öffentliche Anbieter-Dokumentationen (AWS, Microsoft, Google, GitHub, GitLab, Slack, Stripe, OpenAI, Anthropic, SendGrid); Anbieterliste angelehnt an gitleaks (MIT) |
| SHA-256 | FIPS 180-4 (Testvektoren im Test) |
| **Phase 2/3 (Stand 14.10.2026, `packs-world.js`)** | |
| Verhoeff (IN Aadhaar, LU Matricule) | Verhoeff 1969; UIDAI Aadhaar-Spezifikation |
| ISO 7064 MOD 11-2 (CN Bürgernummer) | GB 11643-1999 |
| Mod 31 (CN USCC) | GB 32100-2015 |
| ES DNI/NIE/CIF/NSS | Real Decreto 1553/2005; Orden EHA/451/2008; TGSS |
| PT NIF/NISS/Cartão de Cidadão | Autoridade Tributária; Segurança Social; AMA (Validação do Número de Documento) |
| LU Matricule/TVA | CNS/RNPP; AED |
| SE, DK, NO, FI, IS | Skatteverket (SKV 704), Bolagsverket; CPR-Kontoret, Erhvervsstyrelsen; Skatteetaten, Brønnøysundregistrene; DVV, PRH; Þjóðskrá |
| IE PPS/USt | Revenue Commissioners |
| GB NINO/NHS/UTR/VAT/Führerschein | HMRC (NIM39110, VAT Notice); NHS Data Dictionary; DVLA |
| PL, CZ, SK, HU, RO, BG, HR, SI, GR, CY, MT, EE, LT, LV | MSWiA, GUS; Zákon 133/2000 Sb.; Finanční správa; NAV, NEAK; DEPABD, ANAF; GRAO, NRA; Porezna uprava; Zakon o CRP, FURS; IDIKA, AADE; Tax Department CY; CFR; EVS 585:2007, EMTA; VMI; PMLP, VID |
| US ITIN/EIN/ABA/MBI | IRS (ITIN-Gruppen, EIN-Präfixliste); ABA/Federal Reserve; CMS (MBI-Format) |
| CA SIN/BN/OHIP | ESDC; CRA; Ontario Ministry of Health |
| BR CNS | Ministério da Saúde (DATASUS) |
| MX CURP/RFC, AR CUIT, CL RUT, CO NIT | RENAPO; SAT; AFIP; SII; DIAN |
| IN PAN/GSTIN, JP My Number/Firmennummer, KR RRN/BRN, SG NRIC/UEN | Income Tax Department, CBIC; Kabinettsverordnung zur Individualnummer, NTA; MOIS, NTS; ICA, ACRA |
| AU TFN/Medicare/ABN, NZ IRD/NHI | ATO; Services Australia; ABR; Inland Revenue; Te Whatu Ora (HISO 10046) |
| ZA ID/TIN, TR TCKN/VKN, IL Teudat Zehut, AE Emirates ID, SA ID/Iqama, NG NIN/BVN | Home Affairs, SARS; Nüfus, GİB; Rashut HaOchlusin; ICP; Absher (öffentlich dokumentiert); NIMC, NIBSS |
| EHIC, EU-Führerschein | Beschluss S2 der Verwaltungskommission; Richtlinie 2006/126/EG |
| Bitcoin Base58Check / Bech32(m), Ethereum | Bitcoin-Wiki (Base58Check); BIP-173, BIP-350; EIP-55 (nicht geprüft) |
| IPv6, MAC | RFC 4291, RFC 3849 (Dokumentationspräfix); IEEE 802 EUI-48 |

## Testwerte in den Unit-Tests
Offiziell veröffentlichte Beispiele: AHV `756.1234.5678.97` (ZAS), IBAN-Beispiele der SWIFT IBAN Registry, Stripe-Testkarten, ICAO-Musterpass und -ausweis, AWS-Doku-Beispielschlüssel, Ofcom-Drama-Nummer, LEI-Beispiel der GLEIF, Receita-Federal-Beispiel für den alphanumerischen CNPJ `12.ABC.345/01DE-35`, die allgemein dokumentierten Beispielwerte CPF `111.444.777-35` und CNPJ `11.222.333/0001-81`. Für nationale Nummern ohne amtlichen Testwert: öffentliche Beispielwerte aus der python-stdnum-Dokumentation (nur als Testdaten, kein Code übernommen). Schlüssel-artige Werte werden im Test synthetisch zusammengesetzt.

Phase 2/3 (`tests/helpers/testwerte-welt.mjs`): amtliche Muster (FI-HETU `131052-308T`, CA-SIN `046 454 286`, CMS-MBI `1EG4-TE5-MK73`, DVLA-Musterführerschein, NZ-Testnummer `ZZZ0016`), Beispielwerte der python-stdnum-Dokumentation, Stripe-/Adyen-Testkarten, BIP-173/BIP-350-Testvektoren und die Base58-Beispieladresse des Bitcoin-Wikis. Typen ohne amtlichen Testwert (z. B. ES-NSS, PT-NISS, LU-Matricule, HU-Steuer/TAJ, GR-AFM, CA-OHIP, BR-CNS, KR-RRN, SA-ID, EHIC) haben erfundene, nach der Spezifikation gerechnete Werte (im Test markiert).
