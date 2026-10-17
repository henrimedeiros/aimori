# AImori

**Der Wächter für deine KI-Prompts.** Browser-Erweiterung (Manifest V3, Chrome und Edge), die Eingaben an KI-Seiten **lokal auf dem Gerät** auf sensible Daten prüft, bevor sie gesendet werden – mit Whitelabel und zentraler Verwaltung per GPO und Intune. Kein Server, kein Konto, keine Telemetrie, kein Netzwerkzugriff. Open Source unter der [GNU AGPL v3](LICENSE).

English: [README.md](README.md)

Marke: **AImori** („AI“ gross, „mori“ klein), Signet Helm-Schild. Technische Kennungen (Erweiterungs-ID, Richtlinien-/Registry-Schlüssel, `dlx-*`) sind neutral und bleiben bei einem Namenswechsel gleich.

## Schnellstart
- Laden: `edge://extensions` bzw. `chrome://extensions` → Entwicklermodus → „Entpackte Erweiterung laden“ → Ordner `extension` ([Installation](docs/installation.md)). Texterkennung und lokale KI vorher bauen: `npm ci --ignore-scripts`, `node scripts/build-ocr.mjs`, `node scripts/build-ki.mjs`.
- Testen: `npm test` (Node ≥ 20) · `npm run check` · `npm run build` (ADMX/ADML und erzeugte Doku neu erzeugen).
- Store-Paket: `node scripts/pack-store.mjs` (baut, prüft und schreibt `dist/aimori-<version>-chrome.zip`), Ablauf in [docs/store/chrome-web-store.md](docs/store/chrome-web-store.md).
- Firmen-Rollout: [GPO/ADMX](docs/deployment/gpo.md) · [Intune](docs/deployment/intune.md) · [Registry-Skripte](docs/deployment/registry-skripte.md) · Beispiel `enterprise/example-policy.json`.
- Doku-Übersicht: [docs/README.md](docs/README.md).

## Aufbau
| Ordner | Inhalt |
|---|---|
| `extension/` | Erweiterung: `manifest.json`, `managed_schema.json`, `branding.js` (einzige Stelle mit dem Namen im Code), `engine/` (Erkennung, Pakete), `common/` (Richtlinie, Texte, Zähler), `content/` (Content Script, Seitenadapter), `ui/` (Dialog, Popup, Einstellungen), `_locales/` (en, de, fr, it, pt, es) |
| `enterprise/` | ADMX/ADML (Edge, Chrome; en-US, de-DE), PowerShell Deploy/Detect/Remove, Beispiel-Richtlinien |
| `muster/` | Signierter Gemeinschafts-Katalog für Erkennungsmuster |
| `scripts/` | ADMX- und Doku-Erzeuger, Prüfskript, Icon-Erzeuger, Store-Paket, E2E-Prüfung in Edge |
| `tests/` | Unit-Tests (node:test) |
| `docs/` | Doku; Sicherheits-Reviews je Funktion unter `docs/sicherheit/` |

Interner Code-Name ist neutral (`dlx`): Speicher-Schlüssel `dlx.*`, ADMX-Dateien `dlx-*.admx`, Richtlinien-Schlüssel ohne Produktnamen. Namenswechsel: `extension/branding.js` + `extension/_locales/*/messages.json`, dann `npm run build`.

## Vorbild CyberDrain Check und Unterschiede
Aufbau von Richtlinien (`managed_schema.json`), Whitelabel-Objekt, Rollout-Ordner (ADMX, Deploy-/Detect-/Remove-Skripte) und Doku-Gliederung sind am Konzept von [CyberDrain Check](https://github.com/CyberDrain/Check) bzw. [docs.check.tech](https://docs.check.tech/) orientiert. Es wurde **kein Code und kein Text** übernommen – nur die Gliederung und das Konzept.

| | Check | AImori |
|---|---|---|
| Zweck | Phishing-Schutz für Microsoft-365-Anmeldeseiten | Datenleck-Schutz bei Eingaben an KI-Seiten |
| Netzwerk | Regel-Updates per URL, optional CIPP-Meldungen und Webhook | keinerlei Netzwerkzugriff; `reportingUrl` nur reserviert |
| Rechte | breite Seitenrechte (alle Seiten prüfen) | Content Scripts auf festen KI-Seiten; weitere Seiten nur als optionale Rechte nach Zustimmung |
| Protokoll | Aktivitäts-Log | nur Tageszähler (Seite, Kategorie, Entscheidung), 90 Tage |
| Logo | per URL | nur als data:-URI (kein Netz) |
| Erkennung | Regeln für Phishing-Merkmale | über 200 Datentypen mit Prüfziffern, Länderpakete, Kontext-Risiken, lokale KI, Texterkennung in Bildern, eigene Begriffe nur als gesalzene Prüfsummen ([docs/eigene-begriffe.md](docs/eigene-begriffe.md)) |

## Grenzen (bewusst)
Kein Server, keine Telemetrie, kein Desktop-Agent. Nicht geschützt: Desktop- und Handy-Apps der KI-Anbieter, andere Browser, nicht unterstützte KI-Seiten, gezielt verschleierte Daten. Getippter Text kann von der KI-Seite schon vor dem Senden gelesen werden (Entwürfe). Einordnung: Hilfsmittel gegen Versehen, kein DLP. Sicherheits-Auflagen und Restrisiken: [docs/sicherheit/design-review-mvp.md](docs/sicherheit/design-review-mvp.md).

## Mitmachen, Sicherheit, Datenschutz
- Beiträge: [CONTRIBUTING.md](CONTRIBUTING.md)
- Sicherheitslücken melden: [SECURITY.md](SECURITY.md)
- Datenschutz: [PRIVACY.md](PRIVACY.md)

## Lizenz
Copyright (C) 2026 Die AImori-Autorinnen und -Autoren. Lizenziert unter der GNU Affero General Public License, Version 3 ([LICENSE](LICENSE)). Mitgelieferte Fremdkomponenten behalten ihre eigenen Lizenzen: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
