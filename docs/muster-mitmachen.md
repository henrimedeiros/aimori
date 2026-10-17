# Muster mitmachen: Gemeinschafts-Katalog und eigene Muster

Neben den eingebauten Datentypen ([Liste](datentypen.md)) gibt es zwei Wege für zusätzliche Erkennungsmuster:

- **Gemeinschafts-Katalog** `muster/katalog.json` – Beiträge über Pull-Requests, geprüft, von Maintainern **signiert** und **mit der Erweiterung ausgeliefert** (Paket `community`, Standard an, per `globalPacks` abwählbar).
- **Eigene Muster per Richtlinie** `customPatterns` – nur für die eigene Organisation, nie geteilt.

In beiden Fällen gilt: **Die Erweiterung lädt nichts nach.** Kein Abruf, kein Update-Kanal für Muster. Neue Gemeinschafts-Muster kommen nur mit einem Erweiterungs-Update; Richtlinien-Muster kommen nur über die verwaltete Richtlinie (GPO, Intune, Registry). Geprüfte Texte werden nie gespeichert oder protokolliert – Treffer zählen wie alle Datentypen nur als Typ und Anzahl.

## Ablauf eines Beitrags

```
Pull-Request (nur muster/katalog.json)
  → CI: Prüfer aus dem Basis-Commit (Schema, ReDoS, Tests, Fehlalarme, Doppelte, Lizenz)
  → Review durch Maintainer
  → Merge → Maintainer signiert (Ed25519) → node scripts/muster.mjs bauen
  → extension/engine/packs-community.js → nächstes Erweiterungs-Update
```

Schritt-für-Schritt-Anleitung für Beitragende: [CONTRIBUTING.md](../CONTRIBUTING.md).

## Format eines Eintrags

Schema: `muster/katalog.schema.json`. Beispiel (erfundene Werte):

```json
{
  "id": "cm_beispiel_token",
  "name": { "de": "Beispiel-Token", "en": "Example token" },
  "cat": "technik",
  "cls": "hoch",
  "regex": "\\bbsp_[a-f0-9]{32}\\b",
  "flags": "",
  "validator": "keiner",
  "ohneKontextSicher": true,
  "lizenz": "Apache-2.0",
  "quelle": "eigene Arbeit nach der öffentlichen Formatbeschreibung",
  "tests": {
    "positiv": ["bsp_0123456789abcdef0123456789abcdef", "…", "…"],
    "negativ": ["bsp_kurz", "…", "…"]
  }
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | `cm_` + 2–40 Zeichen `a-z 0-9 _`, eindeutig; damit lässt sich der Typ per `rules` steuern (`"cm_beispiel_token": "block"`). |
| `name.de`, `name.en` | ja | Anzeigename, 1–60 druckbare Zeichen (keine Steuer-, Bidi- oder Nullbreiten-Zeichen). Anzeige nur als Text. |
| `cat` | ja | Kategorie: `person`, `finanz`, `sozial`, `gesundheit`, `firma`, `kontakt`, `steuer`, `technik`, `reise`, `id-national`. |
| `cls` | ja | Schutzklasse `hoch`/`mittel` (Standard `warn`) oder `tief` (Standard aus). |
| `regex` | ja | JavaScript-Regex-Quelle, höchstens 300 Zeichen (Regeln unten). |
| `flags` | nein | `""`, `"i"`, `"u"` oder `"iu"`. `g`, `m`, `s`, `y`, `d` setzt nur die Engine. |
| `validator` | nein | Prüfziffer aus fester Liste: `keiner`, `luhn`, `mod97`, `ean13`, `iso7064_11_10`. Kein Code im Katalog. |
| `ctx`, `needsCtx` | nein | Kontextwörter (höchstens 20 zu je 40 Zeichen); `needsCtx: true` meldet nur in ihrer Nähe. |
| `ohneKontextSicher` | nein | Ohne Prüfziffer gilt ein Treffer sonst nur als „unsicher“ (grauer Hinweis, nie Stopp) – ausser mit Kontextwort. `true` nur bei unverwechselbarem Präfix; die Fehlalarm-Prüfung entscheidet. |
| `lizenz` | ja | `Apache-2.0`, `MIT`, `BSD-2-Clause` oder `BSD-3-Clause`. |
| `quelle` | ja | Spezifikation oder „eigene Arbeit“, höchstens 200 Zeichen. |
| `tests.positiv`, `tests.negativ` | ja | je 3–30 **synthetische** Texte (höchstens 300 Zeichen). |

Ins Erweiterungs-Paket kommen nur die Laufzeitfelder (`id`, `name`, `cat`, `cls`, `regex`, `flags`, `validator`, `ctx`, `needsCtx`, `ohneKontextSicher`) – keine Testwerte, Lizenz- oder Quellenangaben.

## Regeln für reguläre Ausdrücke (ReDoS-Schutz)

Die Prüfung ist bewusst streng (`safeRegex` in `extension/engine/muster.js`, dieselbe Funktion für Katalog und Richtlinie):

- nur **begrenzte Quantoren**: `?`, `{n}`, `{n,m}` mit m ≤ 64; kein `*`, `+`, `{n,}`,
- keine Rückverweise (`\1`, `\k<…>`), keine Lookarounds (`(?=`, `(?!`, `(?<=`, `(?<!`), keine benannten Gruppen, keine Unicode-Eigenschaften `\p{…}`,
- keine Alternation (`|`) in einer Gruppe, die mehrfach wiederholt wird; innerhalb wiederholter Gruppen nur `?` als variabler Quantor (Gruppe höchstens 10-mal),
- Produkt aller Wiederholungs-Spielräume höchstens 1000 (begrenzt auch benachbarte, sich überlappende Quantoren),
- Trefferlänge mindestens 3 und höchstens 256 Zeichen.

Zusätzlich prüft die Engine Muster in Fenstern von 2048 Zeichen und kontrolliert das Zeitbudget (150 ms) zwischen den Fenstern; wird es überschritten, gilt der Text als „nicht prüfbar“ (wie bei allen Datentypen). Die Pipeline misst je Muster 100 000 Zeichen aus seinen eigenen Zeichen (höchstens 100 ms je Eingabe).

## Prüfpipeline

`node scripts/muster.mjs pruefen [--katalog <datei>] [--signatur] [--ohne-fehlalarm]` – lokal und in der CI, ohne Netz und ohne Abhängigkeiten. Ausgabe nur Zahlen und Fehlercodes wie `cm_x: regex_unbounded`, `cm_x: negativ_2_erkannt`, `cm_x: fehlalarm_14`, `cm_x: doppelt_zu_iban`, `cm_x: test_3_nicht_synthetisch`.

Fehlalarme misst `scripts/fehlalarm.mjs --katalog <datei>` auf dem bestehenden Korpus ([Fehlalarme](fehlalarme.md)): Zufallsziffern (6–24 Stellen), Code, Logs, Prosa, Listen – ein Gemeinschafts-Muster darf dort **keinen einzigen** sicheren Treffer haben.

Die CI (`.github/workflows/muster.yml`) holt Basis-Commit und PR ohne Anmeldung, startet den Prüfer **aus dem Basis-Commit** und liest aus dem PR nur `muster/katalog.json`. Ändert ein PR `muster/schluessel/`, `muster/katalog.sig`, `.github/`, `scripts/`, `CODEOWNERS` oder die Muster-Engine, bricht sie ab. Keine Fremd-Actions, keine Secrets, kein Cache, keine Artefakte.

## Signatur und Vertrauensanker

- Signiert wird `muster/katalog.json` (mit LF-Zeilenenden) mit **Ed25519**; die Signatur liegt in `muster/katalog.sig`, öffentliche Schlüssel in `muster/schluessel/*.pub`.
- **Vertraut** werden nur Schlüssel, deren SHA-256-Fingerabdruck fest in `scripts/muster.mjs` (`VERTRAUT`) steht – ein zusätzlich abgelegter `.pub` bewirkt nichts.
- `node scripts/muster.mjs bauen` erzeugt `extension/engine/packs-community.js` nur bei gültiger Signatur; `npm test` prüft Signatur und Übereinstimmung von Katalog und Paket.
- **Entwicklungsschlüssel** (`art: 'dev'`, 16.10.2026): Einweg-Schlüssel, dessen privater Teil nur im Speicher existierte und nie gespeichert wurde. Er gilt für Tests und Entwicklungs-Builds, **nie für `bauen --release`**. Für Katalog-Änderungen und Releases braucht es den Release-Schlüssel der Maintainer.

### Release-Schlüssel (nur Maintainer, eigenes Terminal)
1. `node scripts/muster.mjs schluessel <Ordner ausserhalb aller Repos> --name release` – fragt die Passphrase (mind. 12 Zeichen) ohne Echo ab; nie als Argument oder Umgebungsvariable. Ablage: `release.key` (PKCS#8, verschlüsselt mit scrypt + AES-256-GCM) und `release.pub`. Ordner innerhalb eines Git-Repos werden abgelehnt.
2. `release.pub` nach `muster/schluessel/` kopieren und den ausgegebenen Fingerabdruck mit `art: 'release'` in `VERTRAUT` eintragen (Erweiterungs-Update).
3. Nach jedem Merge: `node scripts/muster.mjs signieren --schluessel <pfad>/release.key`, dann `node scripts/muster.mjs bauen --release`.
4. Rotation: neuen Schlüssel erzeugen, Fingerabdruck ergänzen, alten nach einem Update entfernen.

KI-Agenten und Automatisierungen rufen `signieren` nie mit einem echten Schlüssel auf.

## Eigene Muster per Richtlinie

Richtlinie `customPatterns` (nur verwaltete Richtlinie, Benutzerwerte werden verworfen), höchstens 50 Einträge:

```json
"customPatterns": [
  { "id": "org_projektnummer", "regex": "PRJ-\\d{5}", "flags": "i", "category": "firma", "action": "redact" },
  { "id": "org_kundennummer", "regex": "KD\\d{6}", "context": ["Kunde", "Kundennummer"], "requireContext": true }
]
```

| Feld | Bedeutung |
|---|---|
| `id` | `org_` + 2–40 Zeichen `a-z 0-9 _`, eindeutig |
| `regex` | gleiche Regeln wie oben (`safeRegex`) |
| `flags` | `""` oder `"i"` |
| `category` | Kategorie wie oben, Standard `firma` |
| `context`, `requireContext` | Kontextwörter (höchstens 20 zu je 40 Zeichen); `true` = nur in ihrer Nähe |
| `action` | `warn` (Standard), `redact` oder `block` – nie schwächer als `warn` |

Ein ungültiger Eintrag verwirft das **ganze** Feld (Fehler nennt nur den Schlüssel `customPatterns`); die übrige Richtlinie gilt weiter. Treffer erscheinen als **„Eigenes Muster (Organisation)“** – Muster und Id werden nie angezeigt. In der Registry (GPO/ADMX) ist jeder Listeneintrag ein JSON-Objekt als Text.
