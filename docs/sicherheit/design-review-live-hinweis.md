# Design-Review: Live-Hinweis beim Tippen und Senden nach Tippen

Urteil Sicherheits-Review vor dem Code (13.10.2026): **FREIGEGEBEN MIT AUFLAGEN**. Die Auflagen B1–B22 aus dem [Design-Review MVP](design-review-mvp.md) gelten unverändert weiter; der Warn-Dialog vor dem Senden bleibt ein erweiterungseigenes iframe.

Kernaussagen: Ein Hinweis im Seiten-DOM (geschlossener Shadow Root) statt iframe ist in Ordnung, weil er nur Datentyp-Namen und Anzahl zeigt und die Seite den Text ohnehin kennt. Die Seite kann ihn verstecken, entfernen oder fälschen – das schadet nicht, solange allein die Prüfung beim Senden entscheidet.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| A1 | Übernommene MVP-Commits inhaltlich gleich, jeder einzeln durch die Pflicht-Prüfung | 7 Commits einzeln nachgespielt, Baum gleich dem MVP-Zweig |
| A2 | Host ohne sprechende Klassen/IDs/data-Attribute, Inhalt `all: initial`, Stil nur inline, kein Fokus, sendet nie | `extension/content/content.js` (`showLive`); E2E prüft: Host hat nur `style` |
| A3 | „Jetzt schwärzen“ nur bei `isTrusted` **und** `composedPath()[0]` = eigener Knopf; `pointerdown`/`mousedown` mit `preventDefault` | `content.js` (`showLive`); Test `tests/content.test.mjs` |
| A4 | Beim Klick neu scannen, keine gespeicherten Positionen; Composer noch verbunden; Funde nur lokal in der Funktion | `content.js` (`redactLive`, `liveSummary`); Test „scannt neu“ |
| A5 | Kein Wert in console, DOM, Attributen, `title`/`aria-label`, Storage; Text aus fester Liste von Typnamen | `content.js` (nur `DLX.i18n.typeName` + Anzahl); Tests und E2E prüfen Hinweistext ohne Wert |
| A6 | Kein Scan während IME-Komposition; Zeitbudget/Längenlimit → Hinweis weglassen, nie „sauber“; Limits der Sende-Prüfung unverändert; Timer bei Navigation geräumt | `content.js` (`composing`, `liveSummary`, `pagehide`); Test „IME“ |
| A7 | Fehler im Live-Pfad ändern die Sende-Prüfung nie, mit Test | `content.js` (`liveCheck` mit try/catch, getrennter Pfad); Test „Live-Pfad kaputt“ |
| A8 | Neue Adapter-Selektoren erweitern nur; Enter/submit/Einfügen greifen auch ohne Senden-Knopf; Tests ohne Knopf, mit falschem Knopf, Composer ausserhalb form; Senden-Wort de/en/fr/pt; keine `scripting`-Berechtigung, keine `host_permissions` | `extension/content/adapters.js`; Tests in `tests/content.test.mjs`; offene Tabs: Doku „neu laden“ |
| A9 | E2E: Wegwerf-Profil im Temp-Ordner, danach gelöscht; DevTools nur 127.0.0.1; `--no-proxy-server`, `--no-first-run`, `--disable-sync`, `--disable-background-networking`, `--disable-component-update`; nur chatgpt.com → 127.0.0.1, sonst `~NOTFOUND` | `scripts/e2e/e2e.mjs` |
| A10 | E2E-TLS: selbst signiertes Zertifikat nur im Temp-Ordner, nie im Windows-Zertifikatspeicher; `--ignore-certificate-errors` nur im Wegwerf-Profil; Attrappe nur 127.0.0.1, Host-Prüfung, zufälliger Port; Browser sicher beendet; nur synthetische Testwerte | `scripts/e2e/e2e.mjs`, `scripts/e2e/fake-site.mjs` |
| A11 | Fake-DOM im vm: nur eigener Code, keine neue Abhängigkeit | `tests/helpers/fakedom.mjs` |
| A12 | Doku: Live-Hinweis ist nur Komfort, geschützt wird beim Senden | `docs/installation.md` |

Restrisiken (vom Review benannt): Erweiterung an der Host-Element-Existenz erkennbar (tief, hingenommen wie beim Dialog); gefälschter Hinweis (tief, Sende-Prüfung entscheidet); veraltete Selektoren (mittel, Rückfälle Enter/submit und Popup-Status „nicht aktiv“); Schwärzen an falscher Stelle (tief, A4).
