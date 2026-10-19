# Sprachen

Stand 17.10.2026. Die Erweiterung gibt es in denselben sechs Sprachen wie die Website: Deutsch, Englisch, Französisch, Italienisch, Spanisch und Portugiesisch (Brasilien). Übersetzt sind alle Texte: Warnleiste, Dialoge, Live-Hinweise, Popup, Einstellungen, Fehlermeldungen, Datentyp-Namen, KI-Kompetenz-Nachweis und Nachweis-Bericht, dazu Manifest-Name/-Beschreibung, ADML und Store-Texte.

## Welche Sprache gilt

1. Richtlinie `language` (Admin) – feste Sprache für alle.
2. Einstellung des Benutzers (Einstellungen → Übersicht → Sprache).
3. Browsersprache (`auto`): `fr-CH` → Französisch, `pt-PT` und `pt-BR` → Portugiesisch (Brasilien).
4. Sonst Englisch.

Unbekannte oder ungültige Werte fallen still auf Englisch zurück. Fehlt in einer Sprache ein Text, erscheint der englische (der Test `tests/sprachen.test.mjs` lässt das nicht zu).

## Aufbau

- Einzige Textquelle: `extension/_locales/<ordner>/messages.json` im Chrome-Format (`en`, `de`, `fr`, `it`, `es`, `pt_BR`). Dieselben Dateien liefern über `chrome.i18n` Name und Beschreibung im Manifest.
- `extension/common/i18n.js` lädt die Datei der aufgelösten Sprache und Englisch aus dem eigenen Paket (`chrome.runtime.getURL`, keine Berechtigung, kein Netz). Content Scripts bekommen nur ihre Texte (Datentyp- und Kategorienamen, Kopier-Hinweis) vom Service Worker; fehlen sie, gilt ein eingebauter englischer Mindestsatz – Schwärzen und Stoppen warten nie auf Texte.
- Schlüssel: Oberfläche wie bisher, `type_<id>` = Datentyp-Namen, `rep_*` = Nachweis-Bericht. Platzhalter `{product}`, `{company}`, `{n}` … bleiben in jeder Sprache gleich; `$` ist verboten (Chrome-Platzhaltersyntax).
- Senden-Knöpfe auf KI-Seiten: feste aria-labels der sechs Sprachen (exakter Vergleich) in `extension/content/adapters.js`, dazu der bisherige Rückfall über Enter und `type="submit"`.

## Neue Sprache hinzufügen

1. `extension/_locales/<ordner>/messages.json` mit allen Schlüsseln von `en` anlegen (gleiche Reihenfolge, gleiche Platzhalter).
2. Kürzel in `LOCALES` (`extension/common/i18n.js`), `LANGS` (`extension/common/policy.js`) und `language.enum` (`extension/managed_schema.json`) ergänzen – die feste Liste verlangt das Design-Review (Auflage 2); `npm test` meldet jede fehlende Stelle.
3. Für Gruppenrichtlinien `enterprise/admx-texte/<locale>.json` anlegen (Aufbau wie `fr-FR.json`), dann `npm run build`.

## Rollout-Hinweise für Admins

- ADMX/ADML: `enterprise/admx/` mit `en-US`, `de-DE`, `fr-FR`, `it-IT`, `es-ES`, `pt-BR`. Im Central Store alle Sprachordner mitkopieren; die Verwaltungskonsole zeigt die Sprache des Admin-Rechners ([Gruppenrichtlinie](deployment/gpo.md)). Intune nimmt je ADMX eine ADML, am besten `en-US` ([Intune](deployment/intune.md)).
- Richtlinienwerte und Registry-Schlüssel sind in allen Sprachen gleich; nur die Anzeigetexte ändern sich. Bestehende Richtlinien bleiben gültig.
- Wer eine Sprache für alle festlegen will: Richtlinie `language` (z. B. `fr`). Ohne Richtlinie folgt die Erweiterung der Browsersprache.
- Store-Texte je Sprache (nur Entwurf, nicht eingereicht): [docs/store/](store/).

## Grenzen

- Übersetzungen ohne externe Dienste erstellt und sicherheitsrelevante Texte rückübersetzt geprüft; eine Durchsicht durch Muttersprachler steht aus (Design-Review Sprachen, Restrisiko).
- Portugiesisch nur brasilianisch; Benutzer mit `pt-PT` sehen brasilianische Formulierungen.
- Erkennungsregeln (Datentypen, Kontextwörter) sind von der Oberflächensprache unabhängig.
