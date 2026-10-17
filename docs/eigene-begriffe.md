# Eigene Begriffe

Kundennamen, Projekt-Codenamen, interne Domains oder Mitarbeiterkürzel haben kein festes Format – die Erweiterung erkennt sie nur, wenn man sie ihr nennt. Dafür gibt es zwei Listen, die **gleichzeitig** wirken:

- **Richtlinie `customTerms`** (Organisation, per GPO/Intune/Registry): gesperrt, Benutzer sehen nur die Anzahl.
- **Lokale Liste** in den Einstellungen (Einzelnutzer): ergänzt die Liste der Organisation, kann sie nie abschwächen.

Beide enthalten **nur gesalzene Prüfsummen**, nie den Klartext. Ein Treffer erscheint als Datentyp **„Eigener Begriff“** (`custom_term`, Kategorie Firmendaten) mit denselben Wegen wie alle anderen Datentypen: Warnleiste, Schwärzen, Platzhalter `[CUSTOM_TERM_1]` ([Platzhalter](platzhalter.md)). Standardaktion ist `warn`; per `rules` z. B. `"custom_term": "redact"` oder `"block"`.

Das ältere Firmen-Wörterbuch `dictionary` (1–3 Wörter, ohne Umlaut-Normalisierung) ist der **Vorgänger** und wirkt weiter, wenn es gesetzt ist. Neue Listen bitte mit `customTerms` anlegen.

## Wie verglichen wird
Begriff und Text werden mit derselben Funktion normalisiert (`extension/engine/dictionary.js`, `words()`):

1. unsichtbare Formatzeichen (weiches Trennzeichen, Nullbreiten-Leerzeichen, ZWJ/ZWNJ, BOM) entfernen – sie trennen nicht,
2. Unicode NFKC (Vollbreite, Ligaturen wie „ﬁ“), Kleinbuchstaben,
3. `ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`, danach Akzente entfernen (`é→e`),
4. Wörter = zusammenhängende Buchstaben/Ziffern; Leerzeichen, Bindestriche, Punkte, `@`, `_` und alle anderen Zeichen trennen.

Ein Begriff sind 1–5 Wörter mit je einem Leerzeichen verbunden. Damit treffen sich zum Beispiel `Projekt-Zeder`, `projekt zeder` und `PROJEKT  ZEDER`; `Müller Bau AG` trifft `MUELLER-Bau AG`; die interne Domain `intern.example.com` trifft auch in `max@intern.example.com`. Verglichen werden **nur ganze Wörter**: `Zeder` trifft nicht in `Zederholz`, `XKB` nicht in `XKBX`. Zusammengeschriebene Varianten (`ProjektZeder`) sind ein anderes Wort und brauchen einen eigenen Eintrag.

Prüfsumme: `hex(SHA-256(UTF-8(salt + normalisierter Begriff)))`, `salt` = genau 64 Hex-Zeichen (kleingeschrieben). Regeln für Einträge: mindestens 3 Zeichen (ohne Leerzeichen), höchstens 5 Wörter und 100 Zeichen – Werkzeug und Einstellungsseite verwerfen anderes gleich.

## Liste der Organisation erstellen
1. Klartextliste anlegen, eine Zeile je Begriff (`#` = Kommentar), z. B. `begriffe.txt`:
   ```text
   # erfundene Beispiele
   Projekt Zeder
   Ostwind Logistik AG
   intern.example.com
   XKB
   ```
2. Prüfsummen erzeugen (lokal, ohne Netz; Node.js ab 20):
   ```powershell
   node scripts\begriffe-hashen.mjs .\begriffe.txt --out .\begriffe-policy.json
   ```
   Ausgabe: `{ "customTerms": { "salt": "…", "hashes": [ … ] } }`, sortiert und ohne Doppelte. Verworfene Zeilen meldet das Werkzeug nur mit Zeilennummer. Begriffe nimmt es nur aus einer Datei oder über `-` (stdin), nie als Argument (Shell-Verlauf). Eine vorhandene `--out`-Datei überschreibt es nur mit `--force`.
3. **Ergänzen:** immer die ganze Klartextliste neu hashen und dabei das bisherige Salz weiterverwenden: `--salt <salt aus der Richtlinie>`. Ohne `--salt` entsteht ein neues Zufallssalz – dann sind **alle** bisherigen Prüfsummen ungültig und die ganze Liste muss neu verteilt werden.
4. Klartextliste **nicht** neben der Richtlinie ablegen (nicht in GPO-Freigaben, Intune-Skripten oder Tickets), ein Salz je Organisation.

Beispiel einer vollständigen Richtlinie mit `customTerms`: `enterprise/example-policy.json` (erfundene Begriffe wie oben, Salz nur für das Beispiel).

## Verteilen
- **Gruppenrichtlinie (ADMX):** Richtlinie „Eigene Begriffe“: Salz als Text, Prüfsummen als Liste (ein Registry-Wert je Eintrag). Siehe [GPO](deployment/gpo.md).
- **Intune:** ADMX-Import oder Skript wie unten, siehe [Intune](deployment/intune.md).
- **PowerShell / RMM** (Registry, siehe [Registry-Skripte](deployment/registry-skripte.md)) – die erzeugte Datei ist selbst eine gültige Richtlinien-JSON und lässt sich direkt oder zusammen mit der übrigen Richtlinie schreiben:
  ```powershell
  # Teil-Richtlinie nur mit den eigenen Begriffen (als Administrator, Edge und Chrome)
  .\Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson .\begriffe-policy.json -PlanOnly
  .\Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson .\begriffe-policy.json

  # oder in die bestehende Richtlinie einfügen
  $p = Get-Content -Raw -Encoding UTF8 .\policy.json | ConvertFrom-Json
  $t = Get-Content -Raw -Encoding UTF8 .\begriffe-policy.json | ConvertFrom-Json
  $p | Add-Member -NotePropertyName customTerms -NotePropertyValue $t.customTerms -Force
  $p | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 .\policy.json
  ```
  Registry-Ziel (Edge): `HKLM\Software\Policies\Microsoft\Edge\3rdparty\extensions\<ID>\policy\customTerms` mit `salt` (REG_SZ) und dem Unterschlüssel `hashes` (Werte `1`, `2`, … je Prüfsumme); Chrome analog unter `Google\Chrome`.

Grösse: 20 000 Prüfsummen sind rund 1,3 MB in der Registry. Getestet sind Validierung, ADMX-Erzeugung und Erkennung mit 20 000 Einträgen; der Weg GPO → Browser mit 20 000 Einträgen ist noch nicht auf einem verwalteten Gerät gemessen – bei sehr grossen Listen zuerst auf einem Testgerät prüfen (`edge://policy`).

## Lokale Liste (Einstellungen)
Unter **Einstellungen → Eigene Begriffe** Begriffe eintippen (einer pro Zeile) und „Hinzufügen“. Die Einstellungsseite hasht sie sofort mit einem eigenen Zufallssalz dieses Geräts; gespeichert werden nur Salz und Prüfsummen (`chrome.storage.local`, höchstens 1 000). Das Feld wird danach geleert, die Begriffe lassen sich nicht mehr anzeigen – nur die Anzahl und „Eigene Begriffe löschen“ (zweiter Klick). Das Textfeld hat Rechtschreibprüfung und Autovervollständigung abgeschaltet, damit der Browser den Text nirgends hinschickt. Ändern kann die Liste nur die Einstellungsseite selbst, nie eine Webseite oder die Richtlinie.

## Leistung
Jedes Wort-n-Gramm (1–5 Wörter) des Textes wird je Liste einmal gehasht; das Salz ist genau ein SHA-256-Block, sein Zwischenstand wird je Liste einmal vorberechnet. Gemessen (Node 24, Entwickler-PC, Richtlinie 20 000 + lokale Liste 1 000, alle Pakete, `tests/begriffe.test.mjs`): **50 000 Zeichen ≈ 35 ms, 190 000 Zeichen ≈ 135 ms** pro Prüfung; der Live-Hinweis prüft erst nach einer Tipppause. Das gemeinsame Zeitbudget von 150 ms je Prüfung gilt weiter: auf langsamen Geräten werden sehr lange Texte als „nicht prüfbar“ gemeldet (wie bisher), nie still durchgelassen.

## Grenzen und Restrisiken
- **Kein Geheimnisschutz:** Das Salz ist für Benutzer lesbar (Registry, Erweiterungsspeicher). Kurze oder erratbare Begriffe (Kürzel, bekannte Firmennamen) lassen sich mit Namenslisten zurückrechnen. Die Prüfsummen schützen vor beiläufigem Lesen der Liste, nicht vor gezieltem Durchprobieren. Keine geheimen Begriffe aufnehmen, deren blosse Existenz vertraulich ist.
- **Fehlalarme:** Kurze Kürzel und Namen, die auch normale Wörter sind, melden auch harmlose Texte – deshalb ist `warn` der Standard.
- **Verfremdung:** Absichtlich abgeänderte Schreibweisen (Tippfehler, Zeichen aus anderen Schriften wie kyrillisches „а“) erkennt die Erweiterung nicht; sie hilft gegen Versehen, nicht gegen Absicht.
- Die Statistik zählt Treffer nur als Tageszahl der Kategorie „Firmendaten“, nie welcher Begriff oder welche Prüfsumme getroffen hat.

Sicherheit: [Design-Review Eigene Begriffe](sicherheit/design-review-eigene-begriffe.md).
