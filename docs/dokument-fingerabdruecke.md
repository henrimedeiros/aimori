# Fingerabdrücke von Firmendokumenten

Die Richtlinie `documentFingerprints` erkennt, wenn **grössere Teile vertraulicher Firmendokumente** auf einer KI-Seite eingefügt, gesendet (auch nach Diktat) oder als Textdokument hochgeladen werden. Die Erweiterung bekommt dafür keine Dokumente, sondern nur Fingerabdrücke: gesalzene, gekürzte Prüfwerte, aus denen sich der Text nicht zurückrechnen lässt.

Ein Treffer erscheint als Datentyp **„Teile eines Firmendokuments“** (`document_match`, Kategorie Firmendaten). Die Meldung nennt nur diese Art – nie welches Dokument, welcher Abschnitt oder welche Stelle. Standard ist `warn` (Meldung, weiter nur mit `allowUserOverride`), mit `"action": "block"` wird Einfügen, Senden oder Hochladen gestoppt. Geschwärzt werden kann ein solcher Fund nicht, weil keine Stelle genannt wird.

## Wie es funktioniert
1. Text wird wie bei den [eigenen Begriffen](eigene-begriffe.md) normalisiert: Kleinbuchstaben, Umlaute als `ae/oe/ue/ss`, Akzente weg, Satzzeichen und Zeilenumbrüche trennen Wörter.
2. Je 8 aufeinanderfolgende Wörter bilden eine Schindel (englisch *shingle*). Wert = erste 32 Bit von `SHA-256(salt + "\n" + Schindel)`.
3. Behalten werden nur Werte, die durch `sample` (Standard 4) teilbar sind – unabhängig davon, wo sie im Text stehen. Das macht die Liste viermal kleiner und trifft trotzdem jeden längeren Auszug.
4. Schindeln aus Zahlenkolonnen (mehr als die Hälfte Zahlen), mit weniger als 4 verschiedenen Wörtern oder mit sehr langen Zeichenfolgen (über 48 Zeichen, z. B. Schlüssel) werden verworfen.
5. Die Erweiterung rechnet beim Einfügen, Senden und bei hochgeladenen Textdokumenten (`.txt`, `.md`, `.csv`, `.tsv`, `.json`, `.xml`, `.html`, `.log`, bis 2 MB) dasselbe und zählt **verschiedene** Treffer. Ab `minMatches` (Standard 4) gilt der Text als Teil eines Firmendokuments – mit den Standardwerten etwa ab 30–40 Wörtern am Stück. Wiederholt jemand denselben kurzen Satz, zählt er nur einmal.

Werkzeug (`scripts/dokumente-fingerabdruck.mjs`) und Erweiterung nutzen denselben Code (`extension/engine/fingerabdruck.js`); ein Test mit festen Testvektoren stellt sicher, dass beide Bit für Bit gleich rechnen.

## Fingerabdrücke erzeugen (Administrator, lokal, ohne Netz)
Node.js ab 20, keine weiteren Pakete:
```powershell
node scripts\dokumente-fingerabdruck.mjs D:\Vertraulich\Strategie D:\Vertraulich\Vertraege.docx --out .\fingerabdruecke.json
```
- Eingabe: Dateien oder Ordner (rekursiv) mit `.txt`, `.md`, `.csv`, `.tsv`, `.log`, `.html`/`.htm` und `.docx`. PDF und andere Formate vorher als `.docx` oder Text speichern. Bei `.docx` liest das Werkzeug nur den Haupttext (`word/document.xml`) mit einem eigenen, begrenzten ZIP-Leser; nichts wird entpackt oder ausgeführt.
- `--ausschluss <datei|ordner>`: öffentliche Standardtexte (Mail-Disclaimer, Signaturen, AGB, Vorlagen), deren Fingerabdrücke entfernt werden – sonst melden auch harmlose Texte.
- `--salt <64 hex>`: bestehendes Salz weiterverwenden. Ohne `--salt` entsteht ein neues Zufallssalz, dann sind **alle** bisherigen Fingerabdrücke ungültig. Beim Ergänzen immer alle Dokumente neu einlesen.
- `--shingle` (5–16, Standard 8), `--sample` (1–64, Standard 4), `--min` (2–50, Standard 4), `--aktion warn|block`.
- `--max` (Standard 50 000, höchstens 100 000): Obergrenze der Werte. Wird sie überschritten, schlägt das Werkzeug ein grösseres `--sample` vor.
- Ausgabe: `{ "documentFingerprints": { "salt", "shingle", "sample", "minMatches", "action", "data": [Base64 …] } }`. In der Datei stehen nur Salz, Zahlen und die Werte – keine Dateinamen, kein Text, keine Reihenfolge der Dokumente. Dateinamen und Warnungen erscheinen nur in der Konsole. Eine vorhandene `--out`-Datei überschreibt es nur mit `--force`.

Faustregel Grösse: 1 Wert je etwa 4 Wörter Dokumenttext (mit `sample` 4). 50 000 Werte ≈ 200 000 Wörter ≈ 400 Seiten, rund 270 KB in der Richtlinie.

## Verteilen
- **Gruppenrichtlinie (ADMX):** „Fingerabdrücke von Firmendokumenten“: Salz, Zahlen und Aktion als Felder, `data` als Liste (ein Registry-Wert je Base64-Stück, in der ausgegebenen Reihenfolge). Siehe [GPO](deployment/gpo.md).
- **PowerShell / RMM / Intune-Skript:** Die erzeugte Datei ist selbst eine gültige Richtlinien-JSON:
  ```powershell
  .\Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson .\fingerabdruecke.json -PlanOnly
  .\Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson .\fingerabdruecke.json
  ```
  Registry-Ziel (Edge): `HKLM\Software\Policies\Microsoft\Edge\3rdparty\extensions\<ID>\policy\documentFingerprints` mit `salt` (REG_SZ), `shingle`/`sample`/`minMatches` (REG_DWORD), `action` (REG_SZ) und dem Unterschlüssel `data` (Werte `1`, `2`, … je Stück); Chrome analog unter `Google\Chrome`.
- Kontrolle: `edge://policy` bzw. `chrome://policy` zeigt die Richtlinie; ist ein Feld ungültig, verwirft die Erweiterung den ganzen Block und meldet ihn als ungültige Richtlinie (kein Teilimport).

### Grössengrenzen der Richtlinie
Die Erweiterung nimmt höchstens 100 000 Werte in höchstens 200 Stücken zu je 8 192 Zeichen an (rund 530 KB). Das Werkzeug bleibt standardmässig bei **50 000 Werten** (rund 270 KB, 34 Stücke), weil der Weg über GPO bzw. Intune mit grösseren Listen noch nicht auf einem verwalteten Gerät gemessen ist. Registry-Werte selbst sind klein (je Stück unter 8 KB); begrenzend sind Verteilweg und Richtlinien-Aktualisierung. Bei mehr als 50 000 Werten zuerst auf einem Testgerät prüfen (`edge://policy`, Zeit bis zur Übernahme) oder `--sample` erhöhen. Bei Intune ist der Weg über ein PowerShell-Skript (`Deploy-Policy.ps1`) für grosse Listen einfacher als einzelne OMA-URI-Einstellungen.

## Grenzen und Restrisiken
- **Kein DLP-Ersatz:** Umformulierte, übersetzte, zusammengefasste oder als Bild eingefügte Inhalte werden nicht erkannt. Die Funktion stoppt Versehen (ganze Absätze kopiert), nicht Absicht.
- **Bestätigungsangriff:** Salz und Werte sind für lokale Benutzer lesbar (`edge://policy`, Registry). Wer einen Text vermutet, kann prüfen, ob er in den Dokumenten steht. Nicht aufnehmen: Dokumente, deren blosser Wortlaut geheim ist (z. B. Übernahmepläne, deren Existenz niemand wissen darf).
- **Fehlalarme:** Standardsätze, die in vielen Dokumenten vorkommen, über `--ausschluss` entfernen; zufällige Übereinstimmungen sind dank 8-Wort-Schindeln und `minMatches` sehr selten (32-Bit-Werte: bei 100 000 Werten und einem langen Text rechnerisch unter 0,1 zufällige Einzeltreffer).
- **Hochgeladene Dateien:** Geprüft werden nur Textdokumente bis 2 MB. Word-, PDF- oder Excel-Dateien, die direkt auf die KI-Seite hochgeladen werden, liest die Erweiterung nicht; sie lassen sich mit `blockUncheckedFiles` ganz sperren.
- **Zeitbudget:** Sehr lange Texte, die auf langsamen Geräten nicht innerhalb des Zeitbudgets geprüft werden können, gelten als „nicht prüfbar“ und werden gemeldet, nie still durchgelassen.
- Die Statistik zählt Treffer nur als Tageszahl der Kategorie „Firmendaten“.

Sicherheit: [Design-Review Diktat und Fingerabdrücke](sicherheit/design-review-diktat-fingerabdruck.md).
