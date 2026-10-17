# Design-Review: Länderpakete weltweit (Phase 2/3)

Urteil Sicherheits-Review vor dem Code (14.10.2026): **FREIGEGEBEN MIT AUFLAGEN**. Die Auflagen B1–B22 aus dem [Design-Review MVP](design-review-mvp.md) und L1–L7 aus dem [Design-Review Länderpakete](design-review-laenderpakete.md) gelten weiter.

Vorhaben: die übrigen Datentypen des Katalogs (Phasen 2 und 3) als Erkennungsregeln einbauen – neue Länderpakete, Ergänzungen bestehender Pakete, automatische Länderwahl für alle neuen Länder. Keine neuen Rechte, kein Netz, keine Telemetrie, keine neue Abhängigkeit; Prüfziffer-Algorithmen selbst implementiert.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| W1 | Keine neuen `permissions`/`host_permissions`/`matches`; `packs-world.js` nicht in `web_accessible_resources`; kein `eval`/`new Function`/`fetch`; im Manifest ändert sich nur die Skriptliste | `extension/manifest.json` (eine Zeile in `content_scripts.js`); `tests/manifest.test.mjs`, `tests/quelltext.test.mjs`, `npm run check` |
| W2 | Regeln nur fest im Code; Richtlinien wählen nur Pakete aus | Muster nur in `extension/engine/packs-world.js`; `countryPacks` bleibt eine Enum-Liste (`managed_schema.json`) |
| W3 | Lasttest: 1 MB Zufallstext, Ziffern, Hex mit Doppelpunkten, Seed-Wörter, alle Pakete aktiv; Zeitbudget überschritten → „nicht vollständig geprüft“, nie still „sauber“ | `tests/welt.test.mjs` („Lasttest …“): 1 MB → `unscannable`, 200 KB je Art im Budget oder `unscannable` |
| W4 | Treffer nie speichern oder ausgeben; Test je neuem Paket | Funde tragen nur `id, cat, start, end, action, sure`; Test „Ergebnis enthaelt keine Werte, nichts landet in der Konsole“ (ein Typ je Paket, Konsole überwacht) |
| W5 | Nur offizielle oder erfundene Testwerte; Token zur Laufzeit zusammensetzen; Krypto nur aus Spezifikations-Testvektoren | `tests/helpers/testwerte-welt.mjs` (Quellen im Kopf, erfundene markiert, Token aus Teilen, BIP-173/350 und Base58-Beispiel) |
| W6 | Quelle je Algorithmus im Code; kein Code/keine Tabellen aus python-stdnum; BIP-39-Liste nur gepinnt mit Prüfsumme | Kommentar je Prüfverfahren in `packs-world.js`, Liste in `docs/datentypen-quellen.md`; Seed-Phrasen **nicht** umgesetzt (Wortliste fehlt) → Folgeschritt |
| W7 | SHA-256 nur für die Base58Check-Prüfsumme, so benannt; NIST-Vektoren leer, „abc“, 448 Bit | vorhandene Funktion `sha256Words` aus `dictionary.js` wiederverwendet (kein zweites SHA-256); Kommentar „nicht für Sicherheitszwecke“; Test „Hilfsalgorithmen …“ |
| W8 | Kontextabgleich nach NFKC ohne Gross-/Kleinschreibung; CJK-Kontextwörter mit 2 Zeichen erlaubt; Klasse tief (Hostnamen/UNC, MAC, IPv6, DUNS, Sortcode) standardmässig aus; Fehlalarm vorher/nachher als Zahlen | `extension/engine/core.js` (`hasContext` mit `normalize('NFKC')`); CJK-Wörter wie 身份证, 個人番号; Test „Klasse tief …“; Messung siehe unten |
| W9 | Ungültige Richtlinienwerte → Standardpakete, nie „keine Pakete“; alte Werte gültig; Zeitzone/Sprache nur lokal | `policy.js` unverändert in der Prüflogik, nur Listen erweitert; Tests `tests/laender.test.mjs`, `tests/brasilien.test.mjs` (alte Werte), `tests/background.test.mjs` (nichts gespeichert) |
| W10 | Seed-Phrase nur Kontext plus ≥ 12 Wörter aus der Liste, Folge nie anzeigen | nicht umgesetzt (siehe W6) |
| W11 | Beispiele in `wissen.html`/Doku erfunden oder maskiert | keine Beispielwerte in `wissen.html`; Doku nennt nur amtliche Musterwerte |
| W12 | Keine Veröffentlichung ohne Freigabe der Maintainer | nichts veröffentlicht |
| W13 | Art.-9-Stichworte und Namens-/Adress-Heuristik bleiben draussen | nicht umgesetzt, Grund in `docs/datentypen.md` |

Fehlalarm-Messung `node scripts/fehlalarm.mjs` (100 000 Zufallszahlen je Länge, 20 000 Proben je Korpus-Art), alle Pakete aktiv, Standardregeln:

| Messgrösse | vorher | nachher |
|---|---|---|
| Zufallsziffern, sicher / unsicher gemeldet | 0 / 19 683 | 0 / 19 683 |
| Korpus-Arten (Code, Logs, Texte, Nummern …), sicher / unsicher | 389 / 9 068 | 389 / 9 068 |
| Trefferquote Testwerte | 61 / 61 | 194 / 194 |
| Zielwerte erreicht | ja | ja |

Erste Messung nach dem Bau war schlechter (CN-Nummern ohne Kontext, Kontextwörter als Teilwörter wie „nit“ in „unit“ oder „ato“ in „stato“, neue Kartenarten). Behoben: CN nur mit Kontextwort, Kontextwörter mit Trennzeichen (`'NIT '`, `'NIT:'`), neue Kartenarten nur mit dem Markennamen.
