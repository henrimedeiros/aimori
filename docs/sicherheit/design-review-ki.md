# Design-Review lokale KI-Erkennung (16.10.2026)

Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN** (vor dem Bauen, Prototyp). Vorhaben: Modell `bardsai/eu-pii-anonimization-multilang` (Apache-2.0, INT8-ONNX) im Paket mitliefern und mit onnxruntime-web 1.30.0 (MIT) und @huggingface/tokenizers 0.2.0 (Apache-2.0) im Offscreen-Dokument ausführen; Regeln bleiben, die KI ergänzt Namen, Firmen, Adressen, Gesundheit und Art.-9-Kategorien. Annahmen des Reviews: nur lokal als ungepackte Erweiterung, keine neuen Berechtigungen (bestätigt: `permissions` unverändert, Offscreen-Grund `WORKERS` wie bisher).

| Nr | Auflage (gekürzt) | Umsetzung |
|---|---|---|
| 1 | Beide Pakete exakt pinnen, Lockfile mit `integrity`; Tarballs ohne Install-Skripte und Netz-Hosts; Herausgeber des Tokenizers prüfen | `package.json` ohne `^`/`~`, `package-lock.json`; geprüft 16.10.2026: onnxruntime-web/-common nur `prepare` (Entwicklung), tokenizers keine Skripte; Netz-Hosts im ORT-Bündel nur ein Doku-Link (web.dev), im Tokenizer keine; tokenizers ist ein Paket der Hugging-Face-Organisation (Repo huggingface/tokenizers.js). protobufjs hat ein `postinstall`, das `--ignore-scripts` nie ausführt |
| 2 | protobufjs ≥ 7.2.5; `npm audit --omit=dev`, `npm ls protobufjs` sauber | protobufjs 7.6.6, `npm audit --omit=dev`: 0 Befunde |
| 3 | Nur `.onnx` und `tokenizer.json` laden; nie `*.bin/*.pt/*.pkl`, kein `trust_remote_code`, kein Token | `scripts/build-ki.mjs` lädt nur die zwei in `PINS.json` gepinnten Dateien (Test `tests/ki.test.mjs`); Labels einmalig aus `config.json` (JSON) in `PINS.json` übernommen |
| 4 | Keine eigene Konvertierung | fertiges `onnx/model_quantized.onnx` am gepinnten Commit |
| 5 | Nur HTTPS, Weiterleitungen nur `*.huggingface.co`/`*.hf.co`, Grössengrenze | `build-ki.mjs`: `okHost`, `MAX_BYTES` 350 MB, Abbruch sonst |
| 6 | SHA-256 vor jeder Weiterverarbeitung, ORT-WASM gegen `PINS.json`, base64-Stücke zurückdekodieren und erneut prüfen | `build-ki.mjs` (`download`, `produce`, `decodeBack`, `verify`, `verifyOut`) |
| 7 | Lizenztexte unter `extension/vendor/ki/` | `LICENSE-onnxruntime-web.txt`, `LICENSE-tokenizers.txt`, `LICENSE-modell.txt` (vom Build erzeugt), `THIRD_PARTY_NOTICES.md` |
| 8 | Gebündelte ORT-Variante, kein `import()`, kein `wasmPaths`, `numThreads 1`, `proxy:false`; Modul-Worker statisch importieren; WebGPU nur mit gepinnter passender WASM | `ui/ki-worker.mjs` importiert `ort.webgpu.bundle.min.mjs` statisch; WASM `ort-wasm-simd-threaded.asyncify.wasm` (passt zum WebGPU-Bündel) gepinnt; `ui/ki-lauf.mjs` setzt Threads/Proxy |
| 9 | Stücke einzeln in vorallokierten Puffer, Strings freigeben, Modellbytes nach Session freigeben; Spitze messen, Ziel < ca. 1 GB, sonst nur WASM oder kleineres Modell | Lade-Worker `ui/ki-lader.js` (wird nach dem Laden beendet, Hauptthread 820 MB → 0 MB); gemessen: Spitze beim Laden ca. 1.6 GB, danach ca. 1.05 GB (WASM). Ziel 1 GB beim Laden nicht erreicht → Standard **nur WASM** (`kiGpu = false`), kleineres Modell als Folgeschritt in [Lokale KI-Erkennung](../ki-erkennung.md) |
| 10 | Kein Laufzeit-Hash nötig | Integrität über das Paket; Längenprüfung je Teil im Lade-Worker |
| 11 | ORT-Log nur Fehler, `catch` gibt nur Fehlerart weiter | `logLevel 'error'`, `logSeverityLevel 3`; Worker/Offscreen melden nur `init`/`run`/`fail` |
| 12 | SW nimmt nur vom eigenen Content Script (Top-Frame, 4 KI-Seiten), `string` ≤ 4000 Zeichen; kein `externally_connectable` | `background.js` `handleKi` + `fromContent`; Tests `tests/background.test.mjs`, `tests/ki.test.mjs` |
| 13 | Offscreen nur mit Zielmarke vom Service Worker | `ui/ki.js`: `target 'dlx-ki'`, `sender.url === background.js`, kein `sender.tab` |
| 14 | Je Tab eine Anfrage, neuere ersetzt ältere; global ≤ 4; Zeitgrenze, danach Worker neu, Rückfall Regeln | `background.js` (`kiTab`, `KI_QUEUE_MAX`, `KI_RUN_MS` 3 s, beim ersten Laden `KI_LOAD_MS`), Content Script mit Sequenznummer |
| 15 | Lange Texte in überlappenden Fenstern, Ungeprüftes als „KI nur teilweise“ | `ui/ki-lauf.mjs` (510 Token, 64 Überlappung); über 4000 Zeichen dezenter Eintrag `ki_partial` im Live-Hinweis |
| 16 | Antwort im Content Script prüfen (Positivliste, Grenzen, Konfidenz) | `engine/ki.js` `valid()` in Content Script und Service Worker |
| 17 | Leerlauf mit OCR abstimmen | `background.js` `docIdle()` (OCR 60 s, KI 10 min, schliesst nur, wenn beides ruht); Modell im Offscreen nach 10 min ohne Prüfung entladen |
| 18 | Regeln laufen immer, KI entschärft nie | `engine/ki.js` `merge()`: KI-Funde, die Regel-Funde überlappen, fallen weg |
| 19 | Rückfall sichtbar, höchstens ein neuer Versuch je Sitzung, Status abfragbar | `kiStatus` in `storage.session` (nur Zustand/Ausführung/Fehlerzahl), Popup „Lokale KI: …“; nach 2 Fehlern keine Ladeversuche bis Browser-Neustart |
| 20 | Richtlinie nur Positivliste, ungültig = Standard, Admin vor Benutzer | `common/policy.js` `DETECTION`, `managed_schema.json`, ADMX `detection` |
| 21 | Quelltext-Test für eigene KI-Dateien (ORT-Bündel ausgenommen), CSP unverändert | `tests/ki.test.mjs` |
| 22 | CDP-Netzwerktest auch mit WASM und im Fehlerpfad; `PINS.json` ohne URL | E2E-Schritt `ki` (`scripts/e2e/e2e.mjs`): Netzwerk-Wache auf allen Zielen, WASM und WebGPU, beschädigtes Stück; Test `PINS.json` ohne URL |
| 23 | Nur synthetische Testdaten, Messungen nur Zahlen | `tests/helpers/ki-korpus.mjs` (erfundene Namen/Firmen), `scripts/ki-messung.mjs` |
| 24 | Nichts veröffentlichen, Markenname nur über Branding | keine Veröffentlichung; Texte ohne Produktnamen |

Restrisiken laut Review: Fehlende Erkennung (mittel, Regeln bleiben, Hinweis „Hilfe, keine Garantie“), Speicher/CPU (mittel, gemessen, siehe oben), bösartiges Modell oder ORT-Parser-Fehler (tief), Lieferkette (tief), Nachrichtenflut eines kompromittierten Renderers (tief), WebGPU ohne passende WASM (tief, Test beider Pfade).

## Design-Review Vokabular kürzen (16.10.2026)

Vorhaben: Einbettungs-Matrix des gepinnten INT8-Modells auf die Teilwörter lateinischer Schrift kürzen (eigene Konvertierung = neue Lieferkette, Auflage 4 oben). Urteil Sicherheits-Review: **freigegeben mit Auflagen**. Umsetzung:

| Nr. | Auflage | Umsetzung |
|---|---|---|
| V1 | Parser mit Grenzprüfung (Varint ≤ 10 Bytes, Längen im Puffer, Tiefe begrenzt), unbekannte Wire-Typen, `external_data`, `data_location`, `float_data`/`int32_data` brechen ab; nur die eine Tensor-Nachricht ersetzen, Rest byte-gleich | `scripts/lib/ki-konvert.mjs` (`fields`, `inspect`, `shrinkModel`, `selfCheck`); `tests/ki-konvert.test.mjs` |
| V2 | Matrix genau von einem `Gather` (Achse 0) benutzt, Quantisierung skalar, keine weitere Stelle mit der Vokabelgrösse | `inspect()`; Test mit Skala je Zeile, zweitem Nutzer, Shape-Konstante |
| V3 | Tokenizer: Normalizer, Vorstufe, Post-Processor, Decoder gleich; `unk_id`/Sondertoken umgerechnet; Grösse = Zeilen; `byte_fallback` → Byte-Token bleiben | `shrinkTokenizer()`, `selectVocab()` |
| V4 | Deterministisch (stabil sortiert, Gleichstand nach Id, feste Schlüsselreihenfolge), Prüfsumme der Auswahl-Konfiguration in `modell.erzeugt` | `selectVocab()`, `configHash()`; `scripts/build-ki.mjs` `verify()` bricht bei geänderter Konfiguration ohne neue Pins ab |
| V5 | Selbsttest: Sätze mit nur behaltenen Teilwörtern ergeben über die Abbildung dieselben Ids; behaltene Zeilen byte-gleich | `SELBSTTEST` in `scripts/build-ki.mjs`, `selfCheck()` |
| V6 | Qualitätsnachweis Original gegen gekürzt (DE/EN/FR/PT/IT/ES); weniger erkannte Personendaten = Abbruch | `node scripts/ki-messung.mjs [--original]`; Ergebnis in [Lokale KI-Erkennung](../ki-erkennung.md): gleiche Treffer je Typ und Sprache, keine neuen Fehlalarme |
| V7 | `.tmp` nicht im Paket, Positivliste der Paketdateien; fp32-Messdatei gelöscht | `verifyOut()` prüft `extension/vendor/ki/` gegen `PINS.json`; fp32 nur zur Messung in `.tmp`, gelöscht |
| V8 | Korpus nur erfunden | IT/ES-Sätze in `tests/helpers/ki-korpus.mjs` mit erfundenen Namen, Firmen, Orten |
| V9 | Lizenz: Bearbeitung vermerken | Apache-2.0 erlaubt Bearbeitung mit Vermerk (Abschnitt 4 b): `LICENSE-modell.txt` (erzeugt) und `THIRD_PARTY_NOTICES.md` |
| V10 | Normale Pflicht-Prüfung, Build-Skript und Pins vollständig im Diff | ein Commit mit Code, Pins, Tests und Doku |

Restrisiko laut Review: Namen in nicht-lateinischer Schrift (Kyrillisch, Griechisch, Arabisch, CJK) werden zu unbekannten Token und nicht mehr von der KI erkannt (Regeln gelten weiter) – in der Doku genannt; ein Fehler im eigenen Schreiber wird durch Selbsttest und Pins abgefangen.

## Prüfnachweis Commits (16.10.2026)

- Commit `8e36d73` (Teil 1/3, Commit-Text mit Zeile `Security: freigegeben`) enthält die Kern- und Schutzteile: `extension/engine/ki.js`, `extension/ui/ki.js`, `extension/ui/ki-worker.mjs`, `extension/ui/ki-lauf.mjs`, `extension/ui/ki-lader.js`, `extension/background.js` (Handler `ki`), `extension/content/content.js` (Sendeweg), `extension/manifest.json` (CSP unverändert), `scripts/build-ki.mjs`, `.gitignore`, `extension/vendor/ki/PINS.json`, `package.json`, `package-lock.json` und die Tests in `tests/background.test.mjs` und `tests/content.test.mjs`.
- Teil 2/3 bringt nur Richtlinie `detection`, Optionen-/Popup-Anzeige, `tests/ki.test.mjs` und Doku; kein neuer Datenfluss.
- `npm test` vor Teil 2/3: 566 Tests, 566 grün, 0 rot – darunter `tests/ki.test.mjs` (8) und `tests/laender.test.mjs`.
- Teil 3/3 (Tests und Messung, kein Erweiterungscode): `scripts/e2e/e2e.mjs` Schritt `ki` mit Netzwerk-Wache (Auflage 22), `scripts/ki-messung.mjs`, `tests/helpers/ki-korpus.mjs` (nur erfundene Daten, Auflage 23). Lauf 16.10.2026: E2E alle Schritte grün (Schritt `ki`: 20 Prüfungen, keine Anfrage ausser Erweiterung/Attrappen), Teil 2/3 als `d7075bc` mit `Security: freigegeben`.
