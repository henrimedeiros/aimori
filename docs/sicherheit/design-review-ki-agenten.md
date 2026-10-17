# Design-Review: KI-Agenten – versteckte Anweisungen und Formularwache (16.10.2026)

Urteil des Sicherheits-Reviews vor dem Bau: **FREIGEGEBEN MIT AUFLAGEN** (15 Auflagen). Hier nur Ort und Art der Umsetzung. Machbarkeit und Grenzen: [KI-Agenten und KI-Browser](../ki-agenten.md).

## Teil A: Versteckte Anweisungen

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 1 | HTML nie ins Seiten-DOM, Stile selbst aus dem Text lesen (Inline, einfache `<style>`-Regeln, `hidden`, `<font color>`, `bgcolor`); `@import`/`url()` nur Text | `engine/injektion.js` `hiddenHtml()`: eigener Zerleger ohne DOMParser/DOM, `styleRules()` nur `tag`/`.klasse`/`#id` | `tests/versteckt.test.mjs` (HTML-Fälle, `@import`/`img` ohne Wirkung) |
| 2 | Keine Fehlalarme bei Emoji-ZWJ, indischen Schriften, Arabisch/Hebräisch/Persisch, BOM an Position 0, Flaggen-Tag-Sequenzen | `engine/injektion.js` `invisibleChars()` | `tests/versteckt.test.mjs` (je Fall ein Test) |
| 3 | NFKC, unsichtbare Zeichen raus, klein, Leerraum zusammen; nur lineare Muster; harte Grenzen Länge und Zeit, über der Grenze `block` = gesperrt, `warn` = Hinweis | `engine/injektion.js` `normalize()`, `PHRASES` ohne verschachtelte Quantoren, begrenzte Quantoren im Zerleger, `LIMITS` (2 Mio. Zeichen, 300 ms); `content/content.js` `injFindings()` (nicht prüfbar = Fund) | `tests/versteckt.test.mjs` (pathologische Eingaben, Zeitbudget) |
| 4 | Dialog nur Art und Anzahl, nie Ausschnitte | `content/content.js` Ganztext-Fund `hidden_instruction` ohne Position (`WHOLE`), `background.js` `WHOLE`, `ui/dialog.js` nicht schwärzbar | `tests/content.test.mjs`, `tests/dialog.test.mjs`, E2E `versteckt` |
| 5 | Uploads: Endung und MIME, strengere Regel; `.html` über denselben Zerleger; `block` verhindert wirklich (Einfügen, Ablegen, `input.files`); über 2 MB: `block` sperrt, `warn` Hinweis | `engine/injektion.js` `isDoc()` (Endung ODER MIME), `content/content.js` `checkDocs()`, Datei-Feld wird wie bei Bildern sofort geleert | `tests/versteckt.test.mjs`, E2E `versteckt` (2 MB mit `block`, Seite erhält nichts) |
| 6 | Richtlinie geht vor, Benutzer kann sie nicht lockern; Standard an/`warn`; ADMX und Doku nachgezogen | `common/policy.js` (`USER_KEYS`, ungültig verwaltet = `block`), `ui/options.js` (gesperrte Felder), `managed_schema.json`, `enterprise/admx/*` | `tests/background.test.mjs`, `tests/laender.test.mjs`, `tests/admx.test.mjs`, `docs/einstellungen.md` |

## Teil B: Formularwache

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 7 | Entscheid nur von der eigenen Fensterseite: `sender.id`, genaue `sender.url`, zufällige einmalige Nonce | `background.js` `formPage()` (URL == `ui/formwache.html?n=<Nonce>`, 128-Bit-Nonce, nach Entscheid gelöscht) | `tests/background.test.mjs`, E2E `formwache` (Fälschung aus anderer Erweiterungsseite) |
| 8 | Durchlass nur per `tabs.sendMessage` an denselben Tab, Frame 0, dasselbe Dokument; Nonce, einmalig, 30 s; kein `postMessage`, kein `externally_connectable` | `background.js` `formPage()`, `content/formwache.js` (Absender ohne Tab, Nonce der offenen Meldung) | `tests/formwache.test.mjs`, `tests/background.test.mjs` |
| 9 | SHA-256 über normierte Werte nur im Speicher; anderer Inhalt = neu prüfen; an den Service Worker nur `{t, items}` | `content/formwache.js` `hashOf()`, `background.js` `formMsg()` (genau diese Schlüssel, bekannte Typen) | `tests/formwache.test.mjs`, E2E (geänderter Inhalt) |
| 10 | Höchstens ein Fenster je Tab, Rate 1 je 3 s; weitere Absendeversuche bleiben gestoppt | `background.js` `formMsg()` (`busy`), `content/formwache.js` (busy verdrängt die offene Meldung nicht) | `tests/background.test.mjs`, `tests/formwache.test.mjs`, E2E |
| 11 | Alle `input` ausser `password`, `file`, `hidden`, `submit`, `button`; `textarea`, `contenteditable`, `<input form>`; Lücken dokumentiert | `content/formwache.js` `values()` (`form.elements`), Kopfkommentar | `tests/formwache.test.mjs` (Lücken-Test), `docs/ki-agenten.md` |
| 12 | Nur geprüfte Muster (`https`, kein `*`-Host, max. 20), `allFrames: false`, `matchOriginAsFallback: false`; Abgleich bei Start, Richtlinie, Entzug; fehlender Zugriff in den Optionen genannt | `background.js` `srcSyncNow()` (gleicher Riegel `srcOriginOk`, Rechte der Formularliste werden nicht als fremd zurückgegeben), `common/policy.js` (`MAX_FORM_SITES`), `ui/options.js` (`formsMissing`) | `tests/background.test.mjs`, E2E (Abmelden bei Listenänderung) |
| 13 | E2E: gefälschter Durchlass, Popup-Flut, geänderter Inhalt, Entzug | E2E `formwache`; Entzug per Unit-Test (in der Testkopie ist das Recht fest im Manifest und nicht entziehbar) | `scripts/e2e/e2e.mjs`, `tests/background.test.mjs` |

## Doku und Aussenwirkung

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 14 | Machbarkeitsbericht nur mit Primärquellen und Datum, Attrappen statt echter Konten/Daten, jede Aussage gekennzeichnet | `docs/ki-agenten.md` (laut Hersteller / Sekundärquelle / geprüft) | Quellenliste mit Abrufdatum |
| 15 | Keine Schutzversprechen („schützt vor KI-Agenten“, „erkennt Prompt-Injection“), nur „warnt bei Hinweisen auf …“; nichts veröffentlicht | Texte in `common/i18n.js`, `managed_schema.json`, `docs/ki-agenten.md` | Kein Store-/Webseiten-Text geändert |
