# Hinweise zu Drittquellen

Fremder Code steckt nur in der Texterkennung für Bilder (seit 14.10.2026, [Design-Review Bilder](docs/sicherheit/design-review-bilder.md)). Sie wird nicht eingecheckt, sondern mit `npm ci --ignore-scripts` und `node scripts/build-ocr.mjs` aus exakt gepinnten Paketen nach `extension/vendor/ocr/` kopiert (Prüfsummen in `extension/vendor/ocr/PINS.json`) und so mit der Erweiterung ausgeliefert:

| Komponente | Lizenz | Enthalten |
|---|---|---|
| tesseract.js 7.0.0 (github.com/naptha/tesseract.js) | Apache-2.0 | `worker.min.js` |
| tesseract.js-core 7.0.0 (github.com/naptha/tesseract.js-core): Tesseract OCR (Apache-2.0), Leptonica (BSD-2-Clause), libpng (libpng-Lizenz), libjpeg (IJG), libwebp (BSD-3-Clause), zlib (zlib-Lizenz) | Apache-2.0 und genannte | `tesseract-core-simd-lstm.wasm.js` |
| tessdata `4.0.0_best_int` deu/eng/fra/ita/por über @tesseract.js-data 1.0.0 | Daten Apache-2.0 (Paket MIT) | `lang/<code>.js` |

Seit 16.10.2026 zusätzlich die lokale KI-Erkennung ([Design-Review KI](docs/sicherheit/design-review-ki.md)); ebenfalls nicht eingecheckt, sondern mit `node scripts/build-ki.mjs` nach `extension/vendor/ki/` gelegt (Prüfsummen in `extension/vendor/ki/PINS.json`, Lizenztexte daneben):

| Komponente | Lizenz | Enthalten |
|---|---|---|
| onnxruntime-web 1.30.0 (github.com/microsoft/onnxruntime) | MIT | `ort.webgpu.bundle.min.mjs`, `ort-wasm-simd-threaded.asyncify.wasm` (als `daten/wasm-*.js`) |
| @huggingface/tokenizers 0.2.0 (github.com/huggingface/tokenizers.js) | Apache-2.0 | `tokenizers.min.mjs` |
| Modell bardsai/eu-pii-anonimization-multilang, Commit ce742cd6 (Basis XLM-RoBERTa) | Apache-2.0 (XLM-RoBERTa: MIT) | aus `onnx/model_quantized.onnx` und `tokenizer.json` bearbeitet (Apache-2.0 Abschnitt 4 b, seit 16.10.2026): Vokabular auf 80 000 Teilwörter lateinischer Schrift gekürzt, übrige Gewichte unverändert; Vermerk in `LICENSE-modell.txt` (als `daten/model-*.js`, `daten/tokenizer-*.js`) |

Seit 16.10.2026 liefert die Erweiterung die Schriften der Marke AImori lokal mit ([Design-Review Marke](docs/sicherheit/design-review-aimori-16-10.md)); eingecheckt unter `extension/fonts/` (nur Untergruppen latin und latin-ext, Prüfsummen und npm-Integrität in `extension/fonts/PINS.json`, Lizenztexte daneben), keine Abhängigkeit in `package.json`, kein Abruf von fremden Servern:

| Komponente | Lizenz | Enthalten |
|---|---|---|
| Space Grotesk (github.com/floriankarsten/space-grotesk) über @fontsource-variable/space-grotesk 5.3.0 | SIL Open Font License 1.1 | `space-grotesk-latin-wght-normal.woff2`, `space-grotesk-latin-ext-wght-normal.woff2`, `space-grotesk-OFL.txt` |
| Geist (github.com/vercel/geist-font) über @fontsource-variable/geist 5.3.0 | SIL Open Font License 1.1 | `geist-latin-wght-normal.woff2`, `geist-latin-ext-wght-normal.woff2`, `geist-OFL.txt` |

Die übrigen Pakete in `package-lock.json` (Abhängigkeiten von tesseract.js für Node, Hilfspakete von onnxruntime-web) werden nicht ausgeliefert. Die Lizenztexte der ausgelieferten Komponenten erzeugen die Build-Skripte in `extension/vendor/ocr/` und `extension/vendor/ki/`; das Store-Paket enthält zusätzlich die Projektlizenz als `LICENSE.txt`. Folgende Quellen wurden nur als Information genutzt:

| Quelle | Lizenz | Nutzung |
|---|---|---|
| gitleaks (github.com/gitleaks/gitleaks) | MIT | Liste der Anbieter und Formate von Zugangsschlüsseln als Orientierung; Muster selbst nach den Anbieter-Dokumentationen geschrieben |
| ibantools (github.com/Simplify/ibantools) | MIT OR MPL-2.0 | Tabelle der IBAN-Längen je Land (Fakten; verbindlich ist die SWIFT IBAN Registry) |
| python-stdnum (github.com/arthurdejong/python-stdnum) | LGPL-2.1 | nur öffentliche Beispielwerte aus der Dokumentation als Testdaten und amtliche Quellenverweise; kein Code übernommen |
| CyberDrain Check (github.com/CyberDrain/Check) | AGPL-3.0 | nur Konzept/Gliederung (Richtlinien-Schema, Rollout-Ordner, Doku-Aufbau); kein Code und kein Text übernommen |

trufflehog (AGPL-3.0) wurde bewusst nicht verwendet.

Bei jedem Abhängigkeits-Update erneut prüfen (Auflage B21 des Design-Reviews).
