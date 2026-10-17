# Design-Review: Handtest auf echten KI-Seiten

Urteil Sicherheits-Review vor dem Code (13.10.2026): **FREIGEGEBEN MIT AUFLAGEN**.

## Ausnahme von Auflage 7 (Live-Test 13.10.2026)

Seit 13.10.2026 darf ein Skript die echten KI-Seiten mit der Erweiterung durchtesten (andere Browser-Automatisierungen sperren einen Tab, sobald das iframe einer anderen Erweiterung darin ist). Die Ausnahme gilt **nur** für diese vier Hosts:

- `chatgpt.com`
- `claude.ai`
- `gemini.google.com`
- `copilot.microsoft.com`

Für alle anderen Seiten gilt [Auflage 7](design-review-live-test-13-10.md) unverändert: keine automatisierten Tests auf echten KI-Seiten. `copilot.cloud.microsoft` und `m365.cloud.microsoft` werden nie angesteuert (Firmen-Tenant) und in der Ausgabe als „manuell, nicht automatisiert“ geführt.

## Auflagen und Umsetzung

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Ausnahme mit Datum, Anlass und genau vier Hosts festhalten; Auflage 7 gilt sonst weiter | dieses Dokument |
| 2 | Kein Edge-Konto und kein Sync im Handtest-Profil; `--no-first-run`; Doku: „Edge nicht mit einem Konto anmelden, nie mit einem Firmenkonto“ | `scripts/handtest/seiten.mjs` (`--no-first-run`, `--disable-sync`), `docs/installation.md` (Handtest) |
| 3 | Feste Liste der vier Hosts, nur dorthin navigieren, `location.host` vor jedem Tippen und jedem Enter exakt prüfen, sonst ohne Eingabe abbrechen | `seiten.mjs` (`SEITEN`), `lauf.mjs` (`hostOk` vor `tippe`/`enter`); Test `tests/handtest.test.mjs` |
| 4 | Nur `--remote-debugging-port=0` und `--remote-debugging-address=127.0.0.1`, nie `--remote-allow-origins`; Port nie ausgeben; `finally` + Gesamt-Timeout 5 Min.; `Browser.close`, dann `taskkill` nur der selbst gestarteten PIDs; danach `DevToolsActivePort` löschen | `seiten.mjs` (`edgeArgs`), `lauf.mjs` (`ZEITLIMIT`, `finally`); Test |
| 5 | Nur Page-Targets der vier Hosts und das Dialog-Target der erwarteten Erweiterungs-ID; `Runtime.evaluate` nur mit konstanten Ausdrücken; kein `Fetch.*`, `Network.*`, `Storage.*`, kein `Page.navigate`; KI-Antworten nie lesen | `lauf.mjs` (Ausdrücke nur aus Konstanten, gelesen wird nur das Eingabefeld, der eigene Hinweis und der eigene Dialog); Test |
| 6 | Quelltext-Test: verbietet `--remote-allow-origins`, `Fetch.`, `Network.`, `Storage.`, `Page.navigate`, `*.cloud.microsoft` als Ziel, `document.cookie`, `localStorage`/`sessionStorage`; `--attrappe` nie mit dem dauerhaften Profil | `tests/handtest.test.mjs` |
| 7 | Nur `lauf.mjs` nutzt den Port; kein anderes Werkzeug verbindet sich per CDP mit dem Handtest-Browser; automatisierte Läufe starten nur `lauf.mjs` als Ganzes | `docs/installation.md` (Handtest) |
| 8 | Nur die offiziellen Testwerte und „Hallo, nur ein Test.“; ein Lauf pro Start, keine Wiederholungen | `seiten.mjs` (`TEXTE`); Test |
| 9 | Schlägt „nicht gesendet“ fehl, bricht der Lauf für alle Seiten sofort ab | `lauf.mjs` (`Abbruch`); zusätzlich: ohne Live-Hinweis kein Enter, ohne aktive Erweiterung kein Tippen |
| 10 | Screenshots nur Ausschnitte von Eingabefeld und Dialog; Ordner vor jedem Lauf geleert, TTL 7 Tage; nie in Git oder anderen Ablagen | `lauf.mjs` (`ausschnitt`), `seiten.mjs` (`aufraeumen`); `.gitignore` |
| 11 | Profil- und Ergebnisordner in `.gitignore`; Profil nicht in Sicherungen oder Cloud-Sync | `.gitignore`, `docs/installation.md` |
| 12 | Greift `--load-extension` nicht, wird die Erweiterung einmal von Hand entpackt ins Handtest-Profil; keine Umgehung über Richtlinien, Registry oder Feature-Flags | `seiten.mjs` (dauerhaftes Profil ohne Feature-Flag), `docs/installation.md` |

## Nachtrag 14.10.2026: Pipe statt Port, Erweiterung per DevTools

Befund: Edge 155 ignoriert `--load-extension` im dauerhaften Profil (Eintrag „Kommandozeile“, deaktiviert), die Erweiterung lief auf keiner Seite. Urteil Sicherheits-Review (14.10.2026): **FREIGEGEBEN MIT AUFLAGEN**. Zu Auflage 7: Pipe + Allowlist + nur geprüfter Stand, Ausnahme 14.10.2026 (der echte Lauf nur als `lauf.mjs` als Ganzes und nur mit geprüftem Stand).

| Nr. | Auflage 14.10. | Umsetzung |
|---|---|---|
| 1 | Edge mit festem Pfad, Argument-Array, ohne Shell; Kanäle 0–2 `ignore`, nur 3/4 Pipe; kein `--remote-debugging-port`, `--load-extension`, Feature-Flag mehr | `seiten.mjs` (`EDGE`, `edgeArgs`), `lauf.mjs` (`spawn`); Test |
| 2 | `--enable-unsafe-extension-debugging` nur in `lauf.mjs`, nur mit Handtest- oder Wegwerf-Profil | `lauf.mjs` (Profilprüfung vor dem Start); Test |
| 3 | Feste Erweiterungs-ID, `loadUnpacked` nur mit `realpath` von `<repo>/extension`; falsche ID → `Browser.close` + Abbruch | `seiten.mjs` (`ERWEITERUNG_ID`), `lauf.mjs` (`extPfad`, `run`); Test |
| 4 | `Extensions.uninstall` nur mit der festen ID, danach genau einmal `loadUnpacked` | `lauf.mjs` (`run`); Test |
| 5 | Methoden-Allowlist an einer Stelle; `createTarget` nur feste URLs; Anhängen nur an eigene Tabs und das exakte Dialog-Target | `lauf.mjs` (`ERLAUBT`, `cdp`, `verbinde`, `dialog`); Test |
| 6 | Profil im Hauptordner über `git rev-parse --git-common-dir`, gitignoriert, kein Link; Profil in Benutzung → Abbruch | `seiten.mjs` (`HAUPT`, `profilPruefen`), `lauf.mjs` (Edge beendet sofort → Abbruch) |
| 7 | Jeder echte Lauf nur mit geprüftem Stand (`scripts/handtest` committet, `Security:`-Zeile) | `lauf.mjs` (`gepruefterStand`); Test |
| 8 | Microsoft-365-/Login-Host: Tab sofort zu, kein Screenshot, kein `Runtime.evaluate`, nur Host melden | `seiten.mjs` (`stoppHost`), `lauf.mjs` (Host aus der Target-Liste); Test |
| 9 | Screenshots nur mit `clip` (Feld, Dialog oder feste Fläche 900×320), nie Vollbild | `lauf.mjs` (`ausschnitt`) |
| 10 | `Browser.close` über die Pipe, danach `taskkill /T /PID` nur des eigenen Prozesses | `lauf.mjs` (`finally`); Test (`/IM` verboten) |
| 11 | Ausgabe nur OK/FEHLER-Tabelle, keine Antworten, URLs, Ports | `lauf.mjs` (Tabelle, umgeleitet nur mit Host) |

Technik: Ist `__COMPAT_LAYER` gesetzt, startet `msedge.exe` sich neu und verliert die Pipe; `edgeEnv()` entfernt die Variable nur für Edge (gemessen 14.10.2026).

## Restrisiken

- **Mittel:** Ein anderer lokaler Prozess desselben Benutzers könnte während des Laufs (wenige Minuten) den CDP-Port nutzen. Derselbe Benutzer kann das Profil ohnehin lesen; Auflagen 4 und 7 begrenzen das Fenster.
- **Mittel:** Firmenkonto über implizite Edge- oder Windows-Anmeldung, vor allem bei Copilot. Auflagen 2 und 3: bei Umleitung wird nichts getippt.
- **Tief:** Automatisierte Eingaben können gegen Nutzungsbedingungen verstossen; nur manuell ausgelöste Einzelläufe.
- **Tief:** Versagt der Dialog, erreichen offizielle Dummy-Werte den Anbieter; Auflage 9 begrenzt das auf einen Vorfall.
- **Tief:** Testchats bleiben beim Anbieter; sie enthalten nur Testtext, bei Bedarf von Hand löschen.
