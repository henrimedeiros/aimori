# Design-Review Warnleiste anpassbar (17.10.2026)

Urteil Sicherheits-Review vor dem Bauen: **FREIGEGEBEN MIT AUFLAGEN**. Grundlage war die Beschreibung des Vorhabens (Richtlinien `barTheme` und `barCompact`, nur Darstellung, keine neuen Rechte, kein Netz, keine Abhängigkeiten).

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Nur feste Strings (`typeof` + Liste, kein Objekt-Lookup); alles andere = `auto`; im Frame nur feste Klassen, nie Werte in `style`/CSS | `common/policy.js` (`BAR_THEMES`, `BAR_COMPACT`), `ui/dialog.js` (Klasse `dlx-kompakt`, `data-theme` nur `hell`/`dunkel`), `tests/warnleiste.test.mjs` (u. a. `__proto__`, `Dark`, Zahlen, Objekte) |
| 2 | Richtlinie im Background durchsetzen, auch gegen geänderte `dlx.settings`; Auswahl auf der Einstellungsseite nur Anzeige | `policy.effective` (verwaltet schlägt lokal, sperrt auch bei ungültigem Wert), `tests/background.test.mjs` („Richtlinie schlägt den gespeicherten Wert“) |
| 3 | Info-Antwort nur mit `theme` und `compact`, nur an den Nonce-gebundenen Leisten-Frame; kein Content Script erhält die Werte | `background.js` (`hello`-Antwort, `cfg`-Antwort löscht `barTheme`/`barCompact`), Test „nur in der Frame-Antwort“ |
| 4 | Grösse doppelt prüfen (SW und Content Script): ganzzahlig, 44–240, nur Frame mit Nonce, gedrosselt | `background.js` (`SIZE_MIN = 44`), `content/content.js` (`BAR_H_MIN = 44`); Tests 43, 44, 240, 241, `NaN`, `"50"`, 1.5, 44.5 |
| 5 | Kompakt schwächt die Warnung nicht: Kernsatz, Fundart, alle Knöpfe bleiben; Erklärung nicht nur im `title`; Knöpfe ≥ 30 px; E2E bei 44 px | `ui/ui.css` (`.dlx-kompakt` blendet nichts aus: Erklärung bleibt im Text, bei Platzmangel gekürzt, vollständig für Screenreader und im `title`; „Mehr erfahren“ bleibt), `tests/dialog.test.mjs`, E2E-Schritt `warnleiste` (44 px, Knopfhöhe ≥ 30, alles im Bild) |
| 6 | Kontrast AA in hell und dunkel, auch wenn das erzwungene Thema nicht zur Seite passt | Leistenfarben unverändert aus `ui/tokens-erweiterung.css` (`tests/design.test.mjs`); E2E misst Textkontrast im Frame je Fall (≥ 4,5:1) |
| 7 | Schema und ADMX/ADML nur Enum mit genau drei Werten, gleicher Registry-Pfad | `managed_schema.json`, `npm run build`, `tests/warnleiste.test.mjs` |
| 8 | Screenshots nur Attrappe ohne Netz, erfundener Text bzw. offizielle Test-IBAN; vor dem Commit angesehen | `docs/screenshots/aimori/warnleiste/` (E2E-Attrappe, angesehen 17.10.2026) |
| 9 | Website-Sätze nur Vorschlag, nichts veröffentlichen | [Warnleiste anpassen](../warnleiste-darstellung.md), Abschnitt „Vorschlag für die Website“ |
| 10 | Sicherheits-Review beim Commit bleibt | Git-Hook |

## Restrisiken (aus dem Review)

| Risiko | Schwere | Gegenmassnahme |
|---|---|---|
| Kompakte Leiste (44 px) wird leichter übersehen | tief | Auflage 5; Standard `auto`; Admins sperren per `barCompact: off` |
| Seite ahmt die Leiste optisch nach | tief | unverändert: Entscheidungen nur im Erweiterungs-Frame |
| Falscher Richtlinienwert wird still zu `auto` | tief | Einstellungsseite zeigt „Ungültiger Wert in der Richtlinie, Standard aktiv“ (nur der Schlüssel, nie der Wert; `state.barInvalid`) |
