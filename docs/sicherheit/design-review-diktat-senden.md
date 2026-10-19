# Design-Review: Diktat mit automatischem Senden (17.10.2026)

Vorhaben: Diktierter Text wird vor dem Senden geprüft, auch wenn die KI-Seite nach dem Diktat selbst sendet. Keine Änderung am Erweiterungscode (der bestehende Sende-Schutz in `extension/content/content.js` greift bereits unabhängig von `isTrusted`), nur neuer E2E-Schritt `diktatsenden` in `scripts/e2e/e2e.mjs` und Doku. Kein Mikrofon, keine Aufnahme, keine neuen Rechte, `manifest.json` unverändert.

Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN**.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Nur öffentliche Beispiel-IBAN, erfundener Text, als Konstante | `DIKTAT_IBAN`, `DIKTAT_TEXT`, `DIKTAT_SAUBER` in `scripts/e2e/e2e.mjs` |
| 2 | Schreiben und Senden ohne Pause im selben Task, ohne `input`-Ereignis; Feldtyp wie beim Vorbild | ein `Runtime.evaluate`-Ausdruck je Fall (`diktatSendet`); ProseMirror/tiptap/`.ql-editor` contenteditable, Copilot `textarea` |
| 3 | Mindestens eine Attrappe mit eigenem Capture-Listener auf `window` | Gemini: `DIKTAT_SEITEN.gemini.capture`; content.js registriert bei `document_start` im Capture-Modus und ruft `stopImmediatePropagation` (`stop()`) |
| 4 | Nachweis über Sende-Zähler der Attrappe plus `netzWache`, nicht über `defaultPrevented` | Zähler = Anzahl `SENT:` im Protokoll der Attrappe; Netzwerk-Sperrtest über den ganzen Schritt |
| 5 | Alle Wege einzeln, Negativtest, `pointerdown`+`click` nur eine Meldung | Wege `click`, `requestSubmit`, `enter`, `pointer`; sauberes Diktat genau einmal gesendet; Zählung der Meldungs-Frames |
| 6 | Kein Wert in Meldung, Konsole, `chrome.storage` (local/session), DOM-Attributen | eigene Prüfpunkte; Testausgaben nennen nur Typ und Zähler |
| 7 | Bei Korrektur in content.js: Manifest unverändert, Bypass nur isoliert, kein `isTrusted`-Bypass | nicht zutreffend – keine Korrektur nötig (E2E grün ohne Code-Änderung) |
| 8 | Bestehende E2E-Zusicherungen nicht lockern, Wegwerf-Profil in `finally` löschen | keine bestehende Zusicherung geändert; bestehendes `finally` des Ablaufs löscht das Profil |
| 9 | Doku nennt Grenzen: `fetch`/WebSocket ohne Ereignis, `form.submit()`, geschlossene Shadow-DOMs/fremde iframes | `docs/sprache-und-diktat.md`, Abschnitt „Grenzen“ |
| 10 | Website-Satz nur als Vorschlag in `docs/`, kein Vollschutz-Versprechen | `docs/sprache-und-diktat.md`, Abschnitt „Website-Satz (Vorschlag, nicht veröffentlicht)“ |

Gegenprobe: Mit einer Mutation in content.js (ungeprüfte Ereignisse durchlassen) wird der Schritt rot (15 Prüfpunkte FAIL); ohne Mutation 30/30 OK.

Restrisiken (Sicherheits-Review): interner Sende-Aufruf ohne DOM-Ereignis (mittel), geänderte Seitenstruktur (mittel), `form.submit()` (tief, ein Main-World-Hook bräuchte ein eigenes Design-Review), Test-IBAN in Testausgaben (tief, Ausgaben nennen nur Typ/Zähler).
