# Design-Review: Länderpakete automatisch nach Ort

Urteil Sicherheits-Review vor dem Code (14.10.2026): **FREIGEGEBEN MIT AUFLAGEN**. Die Auflagen B1–B22 aus dem [Design-Review MVP](design-review-mvp.md) gelten unverändert weiter.

Kernaussagen: Das Land wird nur aus lokalen Signalen abgeleitet (Zeitzone, Regionsteil der Browsersprachen, Sprache als Rückfall). Kein Netzwerk, keine IP-Abfrage, keine Standort-API, keine neuen Rechte. Zeitzone, Sprachen und Gründe bleiben im Service Worker und auf den eigenen Erweiterungsseiten.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| L1 | Eingaben robust: Zeitzone nur Text ≤ 64 Zeichen, höchstens 20 Sprachen à ≤ 35 Zeichen, Zerlegen per `Intl.Locale` in try/catch, Nachschlagen nur über `Map`/`Object.hasOwn`, Ungültiges = kein Signal | `extension/common/policy.js` (`parseLocale`, `detectCountries`, `TZ` als `Map`); Test „robuste Eingaben“ in `tests/laender.test.mjs` |
| L2 | Schutz nie schwächer: ohne Zeitzone/Region genau das bisherige Verhalten nach Sprache; Automatik ändert nie globale Pakete; Ausnahme → bisheriges Verhalten | `policy.js` (`byLanguage`, try/catch); Tests „Zonen ohne Land“, „Ausnahme -> Sprache“, „globale Pakete bleiben“ |
| L3 | Ort nirgends ablegen: Zeitzone, Sprachen, Gründe, erkannte Länder nie in `chrome.storage`, Logs, Statistik; Content Script erhält nur die fertige cfg; Vorbelegung bei Richtlinie `false` erst beim Speichern | `background.js` (`localEnv` bei jeder Abfrage, `country` nur in der `state`-Antwort an Popup/Einstellungen); Tests „cfg fuer Content Scripts …“ (genaue Schlüsselliste) und „Reise wird nachgefuehrt, Ort wird nie gespeichert“ (`storage.local`/`session` leer) |
| L4 | Richtlinie streng: `autoCountryPacks` nur echter Boolean; `countryPacks` hat immer Vorrang; Benutzer-`countryMode` ausser `auto`/`manual` = `auto`; Schema und ADMX aus demselben Generator | `policy.js` (`validate`, `effective`); `managed_schema.json` → `scripts/build-admx.mjs`; Doku/ADML nennen den Vorrang; Tests „Richtlinie …“, `tests/admx.test.mjs`, `npm run check` |
| L5 | Rechte gleich: keine neuen `permissions`/`host_permissions`, keine Standort-API, kein `fetch` | `manifest.json` unverändert (geprüft von `scripts/check.mjs` und `tests/manifest.test.mjs`); neues Verbot „Standort-API“ in `tests/quelltext.test.mjs` |
| L6 | Anzeige nur über `textContent`, Ländernamen nur aus fester Tabelle | `extension/common/i18n.js` (`countryList`, Schlüssel `cn_*`, `why_*`), Ausgabe über `DLX.dom.h`; Test „Anzeige …“ |
| L7 | Testfälle: `__proto__` als Zeitzone, zu lange Eingaben, leeres/kaputtes `languages`, `Etc/UTC`, Busingen mit/ohne Region, Reise CH→US, Richtlinie mit falschem Typ | `tests/laender.test.mjs`, `tests/background.test.mjs`; E2E-Schritt `laender` in `scripts/e2e/e2e.mjs` |

Restrisiko (mittel): falsch eingestellte oder bewusst veränderte Zeitzone/Sprache → ein Länderpaket fehlt. Gegenmassnahme: globale Pakete bleiben, Rückfall nach L2, „Selbst wählen“, in Firmen `countryPacks` per Richtlinie.
