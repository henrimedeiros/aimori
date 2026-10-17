# Design-Review: Leiste mit dynamischer Hoehe und neues Knopf-Design (15.10.2026)

Urteil Sicherheits-Review vom 15.10.2026: **FREIGEGEBEN MIT AUFLAGEN**. Vorhaben: der
Meldungs-Frame misst sein Layout und meldet nur eine Zahl (Hoehe) ueber den Service Worker an
das Content Script; Vollbild-Karte scrollt innen mit fester Knopfzeile; neues Knopf-Design;
"Mehr erfahren" ganz rechts. Erkennung und Entscheidungslogik unveraendert.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | SW prueft Absender strikt: eigene ID, URL genau ui/dialog.html ohne Query/Hash, Tab, gebundene frameId, documentId; Popup nie | background.js `size`: `sender.url === OWN_ORIGIN + '/ui/dialog.html'` (feste Herkunft; getURL liefert wegen use_dynamic_url eine andere Adresse), `p.frameId === sender.frameId` (ungebunden = verworfen), `p.frameDoc` (beim ersten hello gemerkt), kein Popup, nur Layout bar; sonst still `null` |
| 2 | nur ueber onMessage, kein onMessageExternal/externally_connectable, kein postMessage an die Seite | nur im bestehenden `onMessage`; dialog.js nutzt nur `chrome.runtime.sendMessage`; Quelltext-Test |
| 3 | h Ganzzahl 56..240, sonst verworfen; im Content Script passt sie nicht ins Fenster -> Rueckfall | SW und Content Script pruefen `Number.isInteger`, 56..240; passt die Leiste nicht ueber/unter das Feld: Sende-Meldungen ins Rueckfall-Popupfenster, Live-Hinweis weg |
| 4 | Nonce nur vom SW; veraltete Nonce verworfen; nur frameId 0 bzw. documentId | SW setzt die Nonce der gebundenen Meldung, Ziel `{documentId}` bzw. `{frameId: 0}`; Content Script vergleicht mit der Nonce der angezeigten Meldung |
| 5 | jede echte Groessenaenderung startet die 400-ms-Sperre neu; gleiche Werte ignoriert; max. 10 je Sekunde; kein Pingpong | Content Script ignoriert gleiche Hoehe, meldet `moved` -> nudge -> Frame sperrt 400 ms; SW hoechstens 10 `size` je Sekunde und Meldung; Frame misst mit `Math.ceil`, die Hoehe wirkt nicht auf die Breite, sendet nur bei Aenderung |
| 6 | Wache nach jeder Aenderung voll, Pruefpunkte ueber allen Knopfzeilen und der Knopfzeile im Vollbild | `resizeBar` ruft `hostIntact()` sofort; Pruefpunkte jetzt als Raster ueber alle Zeilen der Leiste, im Vollbild zusaetzlich die Knopfzeile unten |
| 7 | Startfokus nie auf "Trotzdem", Tastatur gesperrt | unveraendert: Leiste nimmt keinen Fokus, Vollbild fokussiert die sichere Aktion; Sperre gilt fuer jeden click (auch Tastatur) |
| 8 | "Mehr erfahren" navigiert den Frame nicht, keine Entscheidung, wissen.html nicht neu in web_accessible_resources | unveraendert `target=_blank rel=noopener noreferrer` (neuer Tab, kein Klick-Handler, keine Nachricht); Manifest unveraendert |
| 9 | nur CSS, keine externen Schriften/Bilder, CSP unveraendert, "Trotzdem" gleich gross, Kontrast AA | nur ui.css mit Systemschrift und Tokens; Trotzdem Zweitstil gleiche Hoehe |
| 10 | Tests: fremder Absender, Popup, falsche frameId, h 55/241/1.5/"80", veraltete Nonce, Spam, schmale Breiten, lange Sprachen, sticky Vollbild, Ueberdeckung | Unit-Tests in tests/background.test.mjs, tests/content.test.mjs, tests/dialog.test.mjs; E2E-Schritt `leiste` 800x600 bis 1920x1080 auf 4 Attrappen, FR/PT |

Restrisiken: Belaestigung durch staendiges Groessenaendern (fail-closed, Rate-Limit);
Seite kann die Hoehe lesen (wie bisher); Ueberdeckung wird durch die Wache abgefangen.

## Zusaetzlich (Isolation gegen Seiten-CSS, in derselben Aenderung)
- Meldungs-Host bekommt zuerst `all: initial !important` inline, danach die festen Werte. Damit
  kann Seiten-CSS auch nicht gesetzte Eigenschaften (max-height, zoom, scale, rotate,
  mix-blend-mode, Rand) am Host nicht veraendern; der Inhalt liegt weiter im erweiterungseigenen
  iframe in der closed Shadow Root (Seiten-CSS erreicht ihn nicht).
- E2E-Schritt `leiste` legt auf ChatGPT und Claude feindliches CSS auf `html > div` und `iframe`:
  Meldung bleibt vollstaendig. Mutationsprobe ohne `all: initial`: Meldung verschwindet (Wache
  bricht fail-closed ab), Test rot.
- Fund beim Testen: `chrome.runtime.getURL()` liefert im Service Worker wegen `use_dynamic_url`
  eine andere Adresse als `sender.url` des Frames; deshalb Vergleich gegen `OWN_ORIGIN` (Test in
  tests/background.test.mjs).
