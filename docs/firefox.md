# Firefox

AImori läuft mit **demselben Code** auch in Firefox (Manifest V3, ab Firefox 140 bzw. ESR 140). Stand 17.10.2026: Das Firefox-Paket wird gebaut und automatisch geprüft (addons-linter ohne Fehler, Unit-Tests). **Noch nicht in Firefox von Hand getestet und nicht bei Mozilla eingereicht** (kein AMO-Eintrag, keine Signatur). Design-Review: [Firefox-Paket](sicherheit/design-review-firefox-17-10.md).

## Paket bauen
```
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix tools/firefox-lint
node scripts/pack-firefox.mjs
```
Das Skript baut wie [das Chrome-Paket](installation.md#paket-für-den-chrome-web-store) alles neu (ADMX/ADML, Datentypen-Doku, KI-Seiten, Texterkennung, lokale KI), läuft `npm run check` und alle Unit-Tests und schreibt `dist/aimori-<version>-firefox.zip` samt `.sha256` (gitignoriert). Danach prüft **addons-linter** (die Engine von `web-ext lint`, exakt gepinnt in `tools/firefox-lint/`, offline) das ZIP; jeder Lint-Fehler bricht ab, Warnungen werden angezeigt.

Grenzen von addons.mozilla.org (AMO), die das Skript prüft: höchstens 200 MB je Paket (Stand: ca. 156 MB) und keine JavaScript-Datei über 4 MB – die AMO-Prüfung parst grössere Dateien nicht. Deshalb liegen die KI-Dateien in Stücken zu 2,5 MB Rohdaten (ca. 3,5 MB je Skriptdatei, [Lokale KI-Erkennung](ki-erkennung.md)).

### Was am Manifest anders ist
Das Firefox-Manifest wird beim Packen aus `extension/manifest.json` abgeleitet; ein neues Feld im Repo-Manifest bricht ab, bis es in `scripts/pack-firefox.mjs` bewertet ist. Rechte, Seiten, `web_accessible_resources` und die Inhaltsrichtlinie (CSP) sind höchstens so weit wie für Chrome; die CSP ist Byte für Byte gleich.

| Repo-Manifest (Chrome/Edge) | Firefox-Paket |
|---|---|
| `background.service_worker` | `background.scripts` (die Dateien aus `importScripts` in `background.js`, danach `background.js`) |
| Rechte `offscreen`, `declarativeContent` | entfernt – gibt es in Firefox nicht |
| `key`, `minimum_chrome_version` | entfernt |
| `use_dynamic_url` | entfernt – Firefox vergibt ohnehin je Installation eine zufällige Adresse |
| – | `browser_specific_settings.gecko`: `id` `dlx-extension@aimori`, `strict_min_version` `140.0`, `data_collection_permissions` `{"required": ["none"]}` |

### Kennung
Die Firefox-Kennung `dlx-extension@aimori` folgt dem technischen Namensraum `dlx`. **Nach der ersten Signatur durch Mozilla lässt sie sich nicht mehr ändern.** Vor einer Einreichung prüfen, ob eine Kennung unter der eigenen Domain (Form `name@domain`) besser ist, damit niemand den Namen besetzt. `data_collection_permissions: none` ist nur ehrlich, solange die Erweiterung keinen Netzwerkzugriff hat (`connect-src 'none'`); das Packskript bricht sonst ab.

## Unterschiede im Verhalten

| Bereich | Chrome/Edge | Firefox |
|---|---|---|
| Hintergrund | Service Worker | Hintergrundseite (Event Page); gleiche Dateien |
| Texterkennung und lokale KI | Offscreen-Dokument `ui/ocr.html` | dieselbe Seite als unsichtbares iframe in der Hintergrundseite; gleiche Nachrichten, gleiche CSP, gleiche Absenderprüfung |
| Zugriff auf die KI-Seiten | mit der Installation erteilt | **muss erteilt sein**; fehlt er, ist der Schutz aus. AImori zeigt dann „!“ am Symbol, einen Hinweis im Popup und in den Einstellungen den Knopf „Zugriff auf KI-Seiten erlauben“ |
| Training-Ampel | Symbol je KI-Seite (`declarativeContent`) | nur im Popup (Firefox kennt `declarativeContent` nicht) |
| Kopierwarnung ausserhalb der KI-Seiten | verfügbar | **aus** – Firefox liefert den Dokument-Lebenszyklus des Absenders nicht, ohne den die Prüfung nicht sicher ist |
| Firmen-Richtlinien | Registry/ADMX (`3rdparty\extensions\<ID>\policy`) | `policies.json` bzw. Firefox-Richtlinien (`3rdparty.Extensions`), siehe [Deployment Firefox](deployment/firefox.md) |
| Erweiterungs-Adresse | `chrome-extension://<ID>` | `moz-extension://<zufällige UUID>` je Installation |

Warnungen von addons-linter (0 Fehler, 8 Warnungen am 17.10.2026) und warum sie bleiben:
- `UNSUPPORTED_API offscreen.*` (3×): `background.js` nutzt das Offscreen-Dokument nur, wenn `chrome.offscreen` vorhanden ist; in Firefox den iframe-Weg.
- `DANGEROUS_EVAL` (3×) und `UNSAFE_VAR_ASSIGNMENT` (1×): in den gepinnten Fremdbibliotheken Tesseract (`vendor/ocr/worker.min.js`) und ONNX Runtime (`vendor/ki/ort.webgpu.bundle.min.mjs`). Die CSP erlaubt kein `eval` (nur `wasm-unsafe-eval`); bei einer Einreichung verlangt Mozilla dafür den Quellcode-Nachweis der Bibliotheken (Versionen und Prüfsummen in `vendor/*/PINS.json`).
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` (1×): Firefox für Android ist kein Ziel.

## Zum Testen laden (ohne Signatur)
1. Paket bauen (oben) oder direkt den Ordner verwenden: Für den Ordner `extension/` braucht Firefox das abgeleitete Manifest – darum das ZIP in einen leeren Ordner entpacken.
2. Firefox → `about:debugging#/runtime/this-firefox` → „Temporäres Add-on laden …“ → `manifest.json` im entpackten Ordner wählen. Das Add-on bleibt bis zum Neustart von Firefox geladen.
3. Dauerhaft ohne Signatur geht nur in Firefox Developer Edition, Nightly oder ESR mit `xpinstall.signatures.required = false`; normale Firefox-Versionen verlangen eine von Mozilla signierte Datei.

## Handtest-Plan (vor jeder Freigabe nach aussen)
Kein automatischer Firefox-Test im Repo (Firefox ist auf dem Build-Rechner nicht installiert). Diese Punkte von Hand in Firefox 140 ESR und der aktuellen Firefox-Version prüfen, auf Testkonten, nur mit offiziellen Testwerten (SWIFT-Test-IBAN `CH93 0076 2011 6238 5295 7`, Stripe-Testkarte `4242 4242 4242 4242`):

1. **Laden**: `about:debugging` → temporär laden; keine Fehler in „Untersuchen“ (Konsole der Hintergrundseite). Einstellungen und Popup öffnen ohne Fehler.
2. **Zugriff auf KI-Seiten** (Auflage 9): in `about:addons` → AImori → Berechtigungen den Zugriff auf die KI-Seiten entziehen → Symbol zeigt „!“, Popup zeigt „Schutz aus …“, Einstellungen zeigen den Knopf; Knopf klicken → Firefox fragt nach → erlauben → „!“ verschwindet, auf chatgpt.com wird eine Test-IBAN beim Senden gestoppt. Gleiches nach Installation per Richtlinie (unten) prüfen.
3. **Senden und Einfügen** auf chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com und Microsoft 365 Copilot: Test-IBAN tippen + Enter → Leiste mit Fund, Seite erhält nichts; „Schwärzen“; „Trotzdem senden“ nur mit Haken; Einfügen mit Fund wird geschwärzt eingefügt; sauberer Text geht durch.
4. **Live-Hinweis** nach der Tipp-Pause ohne Wert; „Jetzt schwärzen“ per Mausklick.
5. **Bilder prüfen**: Screenshot mit Test-IBAN einfügen → Prüfleiste, dann Fund-Leiste ohne Wert (Texterkennung im iframe der Hintergrundseite).
6. **Lokale KI**: Einstellungen → Status „lädt … %“, dann „aktiv“; Satz mit erfundenem Namen und Firma ohne Anrede → Live-Hinweis und Sende-Stopp. Nach einer Pause ohne Nutzung wird das iframe geschlossen und beim nächsten Prompt neu geladen.
7. **Einstellungen**: „Zugriff erlauben“ für die Liste der KI-Seiten (Modus Hinweis/Sperre), für vertrauliche Quellen und für Formular-Seiten – Firefox verlangt die Nutzeraktion direkt im Klick; wenn einer dieser Knöpfe nichts tut, notieren (bekannter Kandidat, siehe unten).
8. **Training-Ampel** nur im Popup: Claude wählen → rot mit Opt-out-Link.
9. **Richtlinie** per `policies.json` ([Deployment Firefox](deployment/firefox.md)): `about:policies` zeigt sie aktiv; Einstellungen zeigen „Verwaltet von …“, gesperrte Felder sind gesperrt, Firmenlogo erscheint.
10. **Netz**: Firefox-Werkzeuge → Netzwerkanalyse der Hintergrundseite und der KI-Seite: keine Anfrage der Erweiterung nach aussen.
11. **Neustart**: Firefox neu starten (bei dauerhaft geladener Fassung) → Schutz wieder aktiv, Zähler erhalten.

Bekannte Kandidaten für Abweichungen (im Handtest besonders prüfen):
- Die Knöpfe „Zugriff erlauben“ für die KI-Seiten-Liste, vertrauliche Quellen und Formular-Seiten ermitteln die fehlenden Seiten vor der Anfrage (`await`). Firefox nimmt `permissions.request` nur direkt aus der Klick-Behandlung an; falls die Anfrage ausbleibt, die Liste vorher berechnen (Folgeschritt). Der neue Knopf für die Content-Script-Seiten fragt ohne vorheriges `await`.
- WebGPU ist in Firefox erst teilweise verfügbar; die lokale KI fällt dann auf WASM zurück (langsamer, gleiche Treffer).
