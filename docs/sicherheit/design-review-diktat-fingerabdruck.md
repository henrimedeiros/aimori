# Design-Review: Diktat/Sprachmodus und Fingerabdrücke von Firmendokumenten (16.10.2026)

Urteil des Sicherheits-Reviews vor dem Bau: **FREIGEGEBEN MIT AUFLAGEN** (18 Auflagen). Hier nur Ort und Art der Umsetzung. Bedienung und Grenzen: [Sprache und Diktat](../sprache-und-diktat.md), [Fingerabdrücke von Firmendokumenten](../dokument-fingerabdruecke.md).

## Teil A: Diktat und Sprachmodus

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 1 | 3-s-Takt: Länge/Prüfsumme nur in einer Variable, nie Speicher/Logs/Statistik; nicht bei verborgener Seite oder ohne Feld; Meldung nur bei geändertem Ergebnis | `content/content.js` `dictationCheck()` (`dictSig`), Live-Hinweis mit bestehender Signatur-Logik (`showLive`, `fresh`) | `tests/content.test.mjs` (Diktat ohne input-Ereignis, gleicher Text keine neue Meldung, `document.hidden`) |
| 2 | Senden-Prüfung unabhängig vom Takt, nie übersprungen, auch bei automatischem Senden | `content/content.js` `onSend()` unverändert, Skript-Klick auf den Senden-Knopf läuft durch dieselben Listener | `tests/content.test.mjs` (Diktat mit sofortigem Senden) |
| 3 | Capture-Listener ab `document_start` für `pointerdown`/`mousedown`/`touchstart`/`click`, `preventDefault` + `stopImmediatePropagation`, Abgleich über `composedPath()`, Tastatur über `click` | `content/content.js` `onVoice()` (dazu `pointerup`/`mouseup`/`touchend`), `content/adapters.js` `isVoiceButton(path)` | `tests/content.test.mjs` (Symbol im Knopf, Klick mit `detail: 0`) |
| 4 | `data-testid`/Struktur vor `aria-label`; Beschriftungen mindestens de/en/fr/it; UI-Stand festhalten | `content/adapters.js` `VOICE_*` (Stand 16.10.2026, Markenname „Gemini Live“ sprachunabhängig) | `tests/content.test.mjs` (Gemini Live), Doku-Tabelle |
| 5 | `warn` wie bestehendes `warn`: ohne `allowUserOverride` wie `block`; „einmal je Seite“ nur im Speicher | `content/content.js` `voiceOk`, `background.js` `ALLOWED.voice`, `common/policy.js` (`voiceMode` nur verwaltet, ungültig = `block`) | `tests/content.test.mjs`, `tests/fingerabdruck.test.mjs` (voiceMode), `tests/dialog.test.mjs` |
| 6 | Statistik nur Tageszahl; Meldungstext nie per `innerHTML` | `background.js` `count()` Kategorie `voice`, `ui/dialog.js` (Text über `h()`/`textContent`, wie alle Meldungen) | `tests/quelltext.test.mjs` (kein `innerHTML`) |
| 7 | Grenzen offen dokumentieren | [Sprache und Diktat](../sprache-und-diktat.md#grenzen-ehrlich) | – |

## Teil B: Fingerabdrücke

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 8 | ZIP: nur Methode 0/8, kein ZIP64, keine Verschlüsselung, genau ein `word/document.xml`, Anzahl-, Grössen- und Verhältnisgrenze, `maxOutputLength`, nichts auf die Platte | `scripts/dokumente-fingerabdruck.mjs` `docxDocumentXml()` (5 000 Einträge, 20 MB, Verhältnis 100, Grössenvergleich) | `tests/fingerabdruck.test.mjs` (Zip-Bombe, verschlüsselt, Methode 12, doppelt, Grösse) |
| 9 | Text nur aus `<w:t>` bzw. Textknoten, keine DTD, nur fünf Standard-Entitäten; HTML ohne `<script>`/`<style>` | `docxXmlText()`, `htmlText()` (dazu `&nbsp;` als Leerzeichen) | `tests/fingerabdruck.test.mjs` (DTD-Entität bleibt Text, Skript verworfen) |
| 10 | Node und Browser Bit für Bit gleich, eindeutige Verkettung, Testvektoren, gleiche Ausdünnung | gemeinsamer Code `extension/engine/fingerabdruck.js` (Werkzeug lädt ihn per `vm`), `SHA-256(salt[64] + "\n" + Schindel)` | `tests/fingerabdruck.test.mjs` (Testvektor gegen `node:crypto`, Normalisierung, Ausdünnung) |
| 11 | Nur verschiedene Treffer zählen; Zahlen-/Wiederholungs-Schindeln verwerfen; `--ausschluss` | `fingerabdruck.js` `usable()`, `scan()` (Set), Werkzeug `--ausschluss` | `tests/fingerabdruck.test.mjs` |
| 12 | Strenge Prüfung (Salz, Bereiche, Base64, Vielfaches von 4 Byte, sortiert/eindeutig, ≤ 100 000), sonst ganzer Block verworfen | `common/policy.js` `fpPolicy()`, `fpValues()`, nur verwaltet | `tests/fingerabdruck.test.mjs` (22 ungültige Fälle) |
| 13 | Synchron im eigenen SHA-256, Zeitbudget, Überschreitung = nicht prüfbar | `dictionary.js` `after32()` (Mittelzustand des Salzes), `fingerabdruck.js` 150 ms, `content.js` `check()`/`liveSummary()`/`checkDocs()` | `tests/fingerabdruck.test.mjs` (Zeitbudget, 190 000 Zeichen) |
| 14 | Werte, Positionen, Dokumenthinweise nie in Meldung/Statistik/Logs; Werkzeug: Dateinamen nur stderr, JSON nur Zahlen; Salz per `crypto.randomBytes(32)` | Ganztext-Fund `document_match` ohne Position (`WHOLE` in `content.js`, `background.js`, `dialog.js`), Werkzeug `main()` | `tests/fingerabdruck.test.mjs` (kein Klartext, keine Dateinamen), `tests/content.test.mjs` |
| 15 | Grösse über GPO/Intune prüfen, bis dahin Standard 50 000 | Werkzeug `--max` Standard 50 000, Erweiterung nimmt bis 100 000 an; GPO/Intune-Messung auf verwaltetem Gerät **offen** (in der Doku vermerkt) | [Grössengrenzen](../dokument-fingerabdruecke.md#grössengrenzen-der-richtlinie) |

## Allgemein

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 16 | Nur synthetische Testdaten | `tests/helpers/firmendokument.mjs` (erfundener Text) | – |
| 17 | Quelltext-Test zusätzlich `sendBeacon`, `EventSource`, `importScripts`, `getUserMedia`, `MediaRecorder` | `tests/quelltext.test.mjs` (`sendBeacon`, `EventSource`, dynamisches `importScripts` gab es schon; neu Mikrofon, Aufnahme, WebRTC), `tests/fingerabdruck.test.mjs` (Werkzeug nur `node:`-Module ohne Netz) | `tests/quelltext.test.mjs` |
| 18 | Pflicht-Prüfung, keine Veröffentlichung ohne Freigabe der Maintainer | nur Commits im Arbeitszweig, kein Store-Upload | – |

## Auflagen der Pflicht-Prüfung (Commit, 16.10.2026)

| Auflage | Umsetzung (Ort) | Beleg |
|---|---|---|
| Zeitbudget der Fingerabdrücke überschritten: strengere Aktion aus `warn` und `documentFingerprints.action`, nie zur Warnung abschwächen | `content/content.js` `check()` | `tests/content.test.mjs` (300 000 Wörter, `block` ohne Trotzdem) |
| Zu grosse oder unlesbare Textdokumente: Fingerabdruck-Aktion greift auch bei aktiver Prüfung auf versteckte Anweisungen | `content/content.js` `checkDocs()` (`fpOver`) | `tests/content.test.mjs` (3 MB, `block`) |
| Fingerabdruck-Treffer bleibt Sperre, wenn der Haupt-Scan zu lang ist; `document_match` bleibt neben „nicht prüfbar“ | `content/content.js` `check()` | `tests/content.test.mjs` (über 200 000 Zeichen) |
