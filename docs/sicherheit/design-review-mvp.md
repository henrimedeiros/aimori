# Design-Review MVP (zweites Review, vor dem Code)

Stand: 2026-10-13 · Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN**. Die Auflagen A1–A35 aus dem Konzept-Review gelten weiter; hier die neuen Auflagen B1–B22 und wo sie umgesetzt sind.

| # | Auflage (Kurzfassung) | Umsetzung |
|---|---|---|
| B1 | Dialog-iframe in closed Shadow Root, MutationObserver: entfernt/versteckt/verschoben/transparent → immer „Abbrechen“ | `extension/content/content.js` (`showDialog`, `watchHost`) |
| B2 | Nonce nicht in der iframe-URL, 128 Bit, max. 120 s; Dialog meldet sich per `sender.tab`/`sender.frameId` | `extension/background.js` (`pending`, `hello`) |
| B3 | Entscheidungen nur von `/ui/dialog.html` der eigenen Herkunft; Content Script meldet nur Funde; Haken auch im Service Worker geprüft | `extension/background.js` (`fromDialog`, `decide`) |
| B4 | iframe meldet sich nicht in 1,5 s → Popup-Fenster (`chrome.windows.create`), bis dahin blockiert | `content.js` (`FALLBACK_MS`), `background.js` (`fallback`) |
| B5 | Offene Anfragen nur im Speicher bzw. `storage.session` (Standard-Zugriffsstufe), nur Typ-IDs/Anzahl; Zustand weg → Abbrechen | `background.js` |
| B6 | keine `host_permissions` | `extension/manifest.json`, Test `tests/manifest.test.mjs` |
| B7 | Test verbietet Netz-/Eval-/HTML-Injektions-APIs und `console.*` im Erweiterungscode | `tests/quelltext.test.mjs` |
| B8 | Logo nur `<img src>` (data:-URI), CSP `img-src 'self' data:`, `frame-ancestors` nur die 4 Herkünfte, Support-Link nur https mit `noopener noreferrer` | `manifest.json`, `extension/common/dom.js`, `ui/dialog.js` |
| B9 | Listener auf `window` in der Capture-Phase bei `document_start`, `composedPath()` | `content.js` |
| B10 | IME/`isComposing` ignorieren, Ctrl/Cmd+Enter, `beforeinput` (Paste/Drop) prüfen; Adapter ohne Senden-Selektor = „Schutz nicht aktiv“ | `content.js`, `content/adapters.js` |
| B11 | Schwärzen über `execCommand('insertText')`, danach normale Prüfung beim nächsten Senden | `content.js` (`replaceComposerText`) |
| B12 | „Trotzdem senden“: Prüfsumme genormter Text + Tab, einmalig, 30 s, nur im Content-Script-Speicher | `content.js` (`bypass`) |
| B13 | Zeitbudget 150 ms je Prüfung → „nicht prüfbar“, Wörterbuch max. 20 000 Hashes, Fenster 1–3 Wörter | `extension/engine/engine.js`, `engine/dictionary.js` |
| B14 | Richtlinie fail-closed laden, `storage.onChanged`, Nutzerwerte überschreiben nie Richtlinienwerte (auch im Service Worker) | `extension/common/policy.js`, `background.js` |
| B15 | `allowedSites` nur Teilmenge der 4 Seiten (nicht freigegebene werden gesperrt, nie neue Seiten); `allowUserOverride=false` blendet „trotzdem“ aus | `policy.js`, `content.js`, `ui/dialog.js` |
| B16 | Nur Tageszähler, keine Zeitstempel je Ereignis; Zähler nie an Content Scripts | `extension/common/stats.js`, `background.js` |
| B17 | `*.pem`/`*.crx` in `.gitignore`, Test: kein privater Schlüssel im Repo | `.gitignore`, `tests/quelltext.test.mjs` |
| B18 | Forcelist nur anhängen, Remove nur eigene ID, `.reg`-Sicherung, `-WhatIf`, Admin-Prüfung, JSON-Validierung gegen Schema, kein `-ExecutionPolicy Bypass` | `enterprise/*.ps1` |
| B19 | ADMX: XML-Escaping, XML-Parse-Test, Abgleich mit `managed_schema.json` | `scripts/build-admx.mjs`, `tests/admx.test.mjs` |
| B20 | Nur offizielle und synthetische Testwerte, Beispiel-Firma `example.com` | `tests/`, `enterprise/example-policy.json` |
| B21 | AGPL-Vorbild: keine Texte wörtlich, nur Gliederung | ganze Doku, `LIESMICH.md` |
| B22 | Eigenes Review vor Store-Upload, Netzwerkcode (`reportingUrl`, Lizenz) und CIPP | offen (Folgeaufträge) |

## Restrisiken (vom Review genannt)

- **hoch:** Wer DevTools hat oder die Erweiterung abschalten kann, umgeht den Schutz → Forcelist und `DeveloperToolsAvailability` per Richtlinie (siehe `docs/deployment/gpo.md`).
- **hoch:** Desktop-/Handy-Apps, andere KI-Seiten, Dateien/Texterkennung, umschriebene Daten werden nicht erfasst → „Schutz vor Versehen, kein DLP“; `blockUncheckedFiles` empfehlen.
- **mittel:** Seitenumbau legt Adapter lahm → Badge, `blockWhenInactive`, Adapter-Prüfung je Seite (manuell, siehe `docs/installation.md`).
- **mittel:** Salz des Wörterbuchs ist lesbar → keine geheimen Begriffe aufnehmen.
- **tief:** Unsichtbar-Machen des Dialogs (Clickjacking) → B1, Haken als zweite Handlung.
- **tief:** `all_frames: false` → Eingaben in iframes ungeschützt.
