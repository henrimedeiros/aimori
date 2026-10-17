# Installation (Entwicklungsfassung, entpackt)

Die Erweiterung ist noch in keinem Store. Für Tests und Pilot:

1. Repo holen, optional `npm test` (Node ≥ 21).
   **Bilder prüfen** braucht die gebündelte Texterkennung, die nicht im Repo liegt: `npm ci --ignore-scripts` (nur die exakt gepinnten Pakete aus `package-lock.json`, nie `npm install`, keine Install-Skripte), dann `node scripts/build-ocr.mjs` – kopiert genau sieben Dateien nach `extension/vendor/ocr/` und vergleicht sie mit `extension/vendor/ocr/PINS.json`. Ohne diesen Schritt meldet jedes Bild „Bild konnte nicht geprüft werden“ (siehe [Bilder prüfen](bilder.md)).
2. **Edge:** `edge://extensions` → „Entwicklermodus“ ein → „Entpackte Erweiterung laden“ → Ordner `extension` wählen.
   **Chrome:** `chrome://extensions` → „Entwicklermodus“ → „Entpackte Erweiterung laden“ → `extension`.
3. Die Erweiterungs-ID ist fest: `hfgcdbigpgpdoegkhfbbbnibnkpdjkbb` (aus dem öffentlichen Schlüssel `key` im Manifest). Auf diese ID beziehen sich ADMX, Registry-Skripte und Beispiele. Nach einer Store-Veröffentlichung gilt die Store-ID; dann `node scripts/build-admx.mjs --id <Store-ID>` ausführen.

## Prüfen (einmal je KI-Seite, von Hand)
Mit offiziellen Testwerten, nie mit echten Daten. Vorher **jeden schon offenen Tab der KI-Seite neu laden** (F5): Tabs, die vor dem Laden oder Aktualisieren der Erweiterung offen waren, haben noch kein Content Script und sind ungeschützt.
1. **Tippen + Enter:** `IBAN CH9300762011623852957` (SWIFT-Beispiel) von Hand tippen, nicht einfügen. Nach einer kurzen Tipp-Pause erscheint über dem Eingabefeld der Hinweis „IBAN … erkannt – wird vor dem Senden geprüft“ (ohne den Wert). Dann Enter → Dialog erscheint, nichts wird gesendet; „Schwärzen“ ersetzt die IBAN durch `[Finanzdaten]`.
2. **Tippen + Klick auf Senden:** dasselbe tippen und den Senden-Knopf der Seite anklicken → Dialog, nichts gesendet; „Abbrechen“ lässt den Text stehen.
3. **Live-Hinweis:** IBAN tippen, warten, „Jetzt schwärzen“ im Hinweis klicken → die IBAN wird im Feld durch `[Finanzdaten]` ersetzt, der Hinweis verschwindet. Wert wieder tippen und löschen → Hinweis verschwindet ebenfalls.
4. **Einfügen:** `AHV 756.1234.5678.97` (Beispiel der ZAS) einfügen → Einfügen wird gestoppt, Dialog.
5. **Neuladen:** Seite mit leerem Feld oder gespeichertem Entwurf neu laden → kein Dialog, solange nichts gesendet wird; Enter auf einem Entwurf mit Fund → Dialog.
6. **Bild:** Screenshot eines Textes mit `IBAN CH93 0076 2011 6238 5295 7` einfügen → „Bild wird lokal geprüft …“, dann „Bild angehalten: IBAN erkannt“; „Geschwärzte Kopie einfügen“ fügt `bild-geschwaerzt.png` mit schwarzem Balken über der IBAN ein.

Microsoft 365 Copilot (copilot.cloud.microsoft, m365.cloud.microsoft; Site-ID `m365copilot`) wie oben prüfen, nur mit einem eigenen Testkonto, nie mit einem Arbeitgeber- oder Kundenkonto. Auf copilot.cloud.microsoft wird jede Eingabe geprüft; auf m365.cloud.microsoft (ganze M365-Oberfläche) nur das Copilot-Chat-Feld, andere Felder bleiben unberührt – ausser die Seite ist per `allowedSites` gesperrt oder `blockWhenInactive` greift.

Der Live-Hinweis ist nur eine Komfort-Anzeige: Er zeigt nie Werte, sendet nichts und meldet nichts. Geschützt wird allein durch die Prüfung beim Senden – entfernt, versteckt oder fälscht eine Seite den Hinweis, ändert das an dieser Prüfung nichts.
- Popup der Erweiterung: zeigt Zähler; ein rotes „!“ am Symbol bedeutet „Schutz auf dieser Seite nicht aktiv“ (Eingabefeld oder Senden-Knopf nicht erkannt).

Automatisierte Prüfung ohne echte KI-Seite: `scripts/e2e/README.md`.

## Handtest (echte KI-Seiten, automatisiert)
Für Entwickler: prüft die Erweiterung auf **chatgpt.com, claude.ai, gemini.google.com und copilot.microsoft.com** in einem eigenen Edge-Profil, weil andere Browser-Automatisierungen einen Tab sperren, sobald der Dialog der Erweiterung darin ist. Grundlage: [Design-Review Handtest](sicherheit/design-review-handtest.md).

1. **Einmalig anmelden:** `node scripts/handtest/start.mjs` öffnet Edge sichtbar mit dem Profil `.handtest-profil/` (gitignoriert) und den vier Seiten, ohne DevTools und ohne Erweiterung. Auf den Seiten selbst mit **privaten** Konten anmelden, dann Edge schliessen. **Edge selbst nicht mit einem Konto anmelden, nie mit einem Firmenkonto**, kein Sync. Das Skript meldet nie an und liest keine Zugangsdaten. Die Erweiterung lädt erst `lauf.mjs` bei jedem Lauf (DevTools `Extensions.loadUnpacked`, weil Edge `--load-extension` ignoriert). Aus einer Arbeitskopie nutzt der Handtest das Profil des Projekt-Hauptordners.
2. **Lauf:** `node scripts/handtest/lauf.mjs` (Handtest-Edge muss geschlossen sein). Je Seite: Feld leeren, `IBAN CH9300762011623852957` Zeichen für Zeichen tippen, Live-Hinweis prüfen, Enter → Dialog → „Abbrechen“ → nichts gesendet; dann `AHV 756.1234.5678.97` plus den AWS-Beispielschlüssel aus der AWS-Doku (`AKIA…EXAMPLE`) → „Schwärzen“; dann „Hallo, nur ein Test.“ senden. Ausgabe: Tabelle Seite × Prüfung (OK/FEHLER/GESPERRT), Ausschnitt-Screenshots von Eingabefeld und Dialog in `.handtest-ergebnis/` (gitignoriert, bei jedem Lauf geleert, nach 7 Tagen gelöscht). Danach wird Edge geschlossen.
3. **Ohne Netz (Selbsttest des Skripts):** `node scripts/handtest/lauf.mjs --attrappe` – gleicher Ablauf gegen die lokalen Attrappen (`scripts/e2e/fake-site.mjs`), Wegwerf-Profil, nie das Handtest-Profil.

Regeln: DevTools nur über die Pipe zum eigenen Edge-Prozess (kein Netzwerk-Port) und nur während des Laufs; nur `lauf.mjs` als Ganzes nutzt sie, mit fester Liste erlaubter DevTools-Methoden – kein anderes Werkzeug verbindet sich per DevTools mit dem Handtest-Browser. Der echte Lauf startet nur, wenn `scripts/handtest` und `extension/` committet sind und der letzte Commit die Sicherheitsfreigabe trägt (`Security: freigegeben`). Nur die vier Seiten; `copilot.cloud.microsoft` und `m365.cloud.microsoft` werden nie angesteuert und erscheinen als „manuell, nicht automatisiert“. Nie Cookies, Speicher oder Antworten lesen; Testchats bleiben bei den Anbietern (bei Bedarf selbst löschen). Bricht „nicht gesendet“, endet der Lauf sofort für alle Seiten. Das Profil nicht in Sicherungen oder Cloud-Sync-Ordner legen.

**GESPERRT:** Edge lässt auf `copilot.microsoft.com` keine Erweiterungen laufen (beobachtet mit Edge 155 am 13.10.2026, fest eingebaut, per Richtlinie nicht aufhebbar). Der Lauf tippt dort nichts und warnt: AImori schützt diese Seite in Edge nicht. Seit Oktober 2026 leitet `copilot.microsoft.com` auf **copilot.com** um; dort läuft die Erweiterung auch in Edge (E2E-Attrappe 14.10.2026, Site-ID `copilot`, gleiche Selektoren). Der Handtest kennt copilot.com noch nicht (Folgeschritt); bis dahin von Hand prüfen. `www.copilot.com` ist bewusst nicht freigegeben.

## Update-Hinweis: neue Seiten = neue Rechte
Eine neue Seite im Manifest (zuletzt `https://copilot.com/*`, 14.10.2026) gilt für Chrome und Edge als Rechte-Erweiterung: Bei einer von Hand installierten Erweiterung kann der Browser sie beim Update deaktivieren, bis der Nutzer zustimmt. Per Richtlinie installierte Erweiterungen sind nicht betroffen. Deshalb neue Hosts immer in einem Release bündeln (Design-Review 14.10.2026 Auflage 17). Die Rechte `activeTab` und `declarativeContent` der [Training-Ampel](ki-training.md) (16.10.2026) zeigen keine Warnung und geben keinen dauerhaften Zugriff auf Seiten.

## Paket für den Chrome Web Store
`npm ci --ignore-scripts`, dann `node scripts/pack-store.mjs`. Das Skript baut ADMX/ADML, Datentypen-Doku, KI-Seiten, Texterkennung und lokale KI neu, läuft `npm run check` und alle Unit-Tests und schreibt danach `dist/aimori-<version>-chrome.zip` (gitignoriert) samt `.sha256`. Das ZIP hat `manifest.json` im Wurzelordner, **ohne** das Feld `key`, das der Store ablehnt. Versteckte Dateien, Schlüssel (`*.pem`, `*.key`), Pakete und Source-Maps sind nicht dabei. Nach dem Schreiben wird jede Datei zurückgelesen und mit der Quelle verglichen. Bei gleichem Stand entsteht ein gleiches ZIP (feste Zeitstempel). Grenze des Stores: 2 GB.

Ohne Schlüssel vergibt der Store eine **eigene ID**. Die ADMX-Pfade (`3rdparty\extensions\<ID>`) gelten aber für die Entwicklungs-ID, deshalb für Richtlinien `erweiterung.chrome.id` setzen ([Für Unternehmen](fuer-unternehmen.md)). Wer die Entwicklungs-ID behalten will, legt beim **ersten** Upload den privaten Schlüssel bei: `node scripts/pack-store.mjs --key-pem <pfad>`. Das Skript prüft, dass der Schlüssel zum Manifest passt, und schreibt `…-chrome-mit-schluessel.zip` mit `key.pem` im Wurzelordner. Dieses ZIP ist vertraulich: Nach dem Upload löschen und die ID im Dashboard kontrollieren. Diese Store-Funktion ist nicht offiziell dokumentiert (Stand 17.10.2026).

## Systemvoraussetzungen
Edge oder Chrome ab Version 110 (Manifest V3, `storage.session`, dynamische URLs für Web-Ressourcen). Getestet: Edge (Chromium) headless auf Windows 11, entpackt geladen.
