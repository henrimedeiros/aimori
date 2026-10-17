# Design-Review: Regeln je Konto (14.10.2026)

Urteil Sicherheits-Review vor dem Bauen: **FREIGEGEBEN MIT AUFLAGEN**. Anlass (14.10.2026): „Regeln je Konto“ (Firmen- und Privatkonto derselben KI unterschiedlich behandeln). Keine neuen Rechte, keine Host-Rechte, keine Abhängigkeiten, kein Netz.

Antworten auf die Fragen: `allow` vertretbar, aber eng begrenzt (Auflagen 1–3); nur sichtbare Elemente zählen, weil die Arbeitsbereich-Auswahl alle Arbeitsbereiche im DOM führt (Auflagen 4–6); ungültiger Eintrag fällt auf `normal` zurück, nicht `block`.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | `allow` nur bei `business`; `personal`/`unknown` mindestens `hint`, sonst Eintrag ungültig | `extension/common/policy.js` `accountRule`; `tests/konto.test.mjs` |
| 2 | `business: allow` nur mit Workspace-Namen (Ausnahme Kennzeichen `host`); Erkennung nur über `plan`/`shield` höchstens `hint` | `policy.js` `accountRule`, `accountLevel`; Tests |
| 3 | `rules`-Sperren bleiben in jeder Stufe `block` (Test je Stufe × harte Sperre); lokaler Wert nur ohne Richtlinie, mit Richtlinie gar nicht gelesen | `policy.js` `accountFindings`, `effective`; `tests/konto.test.mjs`, `tests/content.test.mjs` |
| 4 | Nur sichtbar: `checkVisibility({checkOpacity, checkVisibilityCSS})`, Rechtecke > 0, kein Vorfahre mit `aria-hidden`/`hidden`/`inert` | `extension/content/account.js` `usable`; Unit + E2E (`versteckt`, `durchsichtig`) |
| 5 | Menüs/Listen/Dialoge/`[popover]` ausgeschlossen, nur aktiver Arbeitsbereich | `account.js` `NOT_IN`; Unit + E2E (`privat`: Firmenname nur in versteckter Auswahlliste) |
| 6 | Composer, `[contenteditable]`, `textarea`, `input`, Verlauf per `closest` und `querySelector` ausgeschlossen; nur Top-Frame | `account.js` `NOT_NEAR`, `detect` (Top-Frame); Unit |
| 7 | NFKC, Cf-Zeichen entfernen, Leerraum, Kleinschreibung; nur Ganztext-Vergleich | `policy.js` `normName`; Unit (Zero-Width/Bidi, kein Teilstring) |
| 8 | `host` nur exakt `location.hostname` | `account.js` `SIGNALS.m365copilot.hosts`; Unit (ähnlicher Host abgewiesen) |
| 9 | Unbekannte Seiten verworfen und gemeldet; höchstens 4 Seiten, 20 Namen à 1–80 Zeichen, feste Listen; Fehler nennen nur Seite/Feld/Index | `policy.js` `validate`/`accountRule` (unbekannter Schlüssel als `?`); Unit |
| 10 | `account` nur vom eigenen Content Script im Top-Frame, nur Enum, nicht in Zählern/Speicher/Logs | `background.js` (`fromContent`, `ACCOUNTS`; nur in der offenen Meldung); `tests/background.test.mjs` |
| 11 | Kein Zwischenspeichern, bei jeder Prüfung neu | `content.js` `accountState` in `check`/`liveCheck` |
| 12 | E2E auf der Attrappe: Firma, Privat mit Name nur in versteckter Liste, nicht erkannt, `aria-hidden`/`opacity:0`; Unit: Zero-Width, Composer/Verlauf, `plan`+`allow` ungültig | `scripts/e2e/e2e.mjs` Schritt `konten`, `scripts/e2e/fake-site.mjs` (`?konto=`); `tests/konto.test.mjs` |
| 13 | Quelltext-Wächter: Kontoerkennung ohne `innerHTML`, `value`, `cookie`, Speicher, `fetch`, Mail-Muster; Gemini ausgeschlossen | `tests/konto.test.mjs` (Quelltext-Wächter) |
| 14 | Doku: Fälschbarkeit, gleichnamige Firma, `hint` statt `allow`, Namen statt Kennzeichen, Rückfall auf `normal` | `docs/konto-regeln.md` |

Pflicht-Prüfung beim ersten Commit (14.10.2026, MIT AUFLAGEN): (P1) Workspace-Namen und Plan-Kennzeichen nur aus dem Arbeitsbereich-Wechsler, nie aus dem Profil-Knopf mit frei wählbarem Anzeigenamen – `account.js` `SIGNALS.*.workspace`, Test „Anzeigename im Profil-Knopf … kein Firmenkonto“; (P2) Doku-Beispiel nennt das Restrisiko und empfiehlt `hint` statt `allow` ausser bei `host` – `docs/konto-regeln.md`.

Restrisiken laut Review: DOM-Fälschung (mittel, begrenzt durch 1–3), Unprüfbares bleibt in Stufe `block` nur Warnung (mittel, später eigene Option), gleichnamige fremde Firma (tief), Selektoren nicht live geprüft (tief, fail-safe), Admin-Tippfehler → `normal` (tief).
