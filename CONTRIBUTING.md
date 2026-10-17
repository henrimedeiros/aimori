# Mitmachen

Danke, dass Sie die Erkennung verbessern wollen. Beiträge zu **Erkennungsmustern** laufen über Pull-Requests auf `muster/katalog.json`; alles Weitere (Code, Oberfläche, Doku) bitte zuerst als Issue besprechen.

## Muster beitragen – in fünf Schritten
1. **Prüfen, ob es den Datentyp schon gibt:** [docs/datentypen.md](docs/datentypen.md). Doppelte Muster lehnt die Prüfung ab (`doppelt_zu_<id>`).
2. **Eintrag in `muster/katalog.json` ergänzen** – Format und Felder: [docs/muster-mitmachen.md](docs/muster-mitmachen.md). Id mit Präfix `cm_`, `version` erhöhen.
3. **Mindestens 3 Positiv- und 3 Negativ-Beispiele**, alle **synthetisch**: erfundene Werte, offizielle Beispiel- oder Testnummern, generierte Werte. Nie echte Personen-, Kunden-, Firmen- oder Arbeitgeberdaten, nie echte Schlüssel. Domains nur `example.com/.org/.net`, `.test`, `.invalid` (oder der Dienst-Host, der im Muster selbst steht), IP-Adressen nur aus `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`.
4. **Lokal prüfen** (Node.js ab 20, ohne Netz, ohne Installation):
   ```
   node scripts/muster.mjs pruefen
   ```
   Die Ausgabe nennt nur Ids, Zahlen und feste Fehlercodes – nie Ihre Testwerte.
5. **Pull-Request öffnen** und die Pflicht-Haken der Vorlage abhaken. Ändern Sie nur `muster/katalog.json`.

## Was automatisch geprüft wird
Die CI (`.github/workflows/muster.yml`) prüft Ihren Katalog mit dem Prüfer aus dem **Basis-Commit** – ein PR kann den Prüfer nicht verändern:
- **Schema** (`muster/katalog.schema.json`) und Pflichtfelder,
- **ReDoS-Sicherheit:** nur begrenzte Quantoren `{n,m}` bis 64, kein `*`, `+`, `{n,}`, keine Rückverweise, Lookarounds oder benannten Gruppen, keine Alternation in wiederholten Gruppen, Grenze für verschachtelte und benachbarte Wiederholungen, Trefferlänge 3–256; dazu ein **Lasttest** mit 100 000 Zeichen aus den eigenen Zeichen des Musters (je Eingabe höchstens 100 ms),
- **Tests:** jedes Positiv-Beispiel wird erkannt, kein Negativ-Beispiel,
- **Fehlalarm-Rate** auf dem bestehenden Korpus (`scripts/fehlalarm.mjs`, über 240 000 harmlose Proben: Zufallsziffern, Code, Logs, Prosa): kein einziger sicherer Treffer erlaubt,
- **Doppelte** Muster (gleiche Regex oder Fund an derselben Stelle wie ein eingebauter Datentyp),
- **Lizenz:** nur Apache-2.0, MIT, BSD-2-Clause oder BSD-3-Clause; synthetische Testdaten.

PRs, die `muster/schluessel/`, `muster/katalog.sig`, `.github/`, `scripts/`, `CODEOWNERS` oder die Muster-Engine ändern, bricht die CI ab – das machen nur Maintainer.

## Nach dem Merge
Eine Maintainerin oder ein Maintainer prüft jedes Muster von Hand, **signiert** den Katalog und baut das Paket (`node scripts/muster.mjs bauen`). Neue Muster erreichen Nutzerinnen und Nutzer **nur mit dem nächsten Erweiterungs-Update** – die Erweiterung lädt nie etwas nach.

## Lizenz der Beiträge
**Muster:** Mit einem Pull-Request auf `muster/katalog.json` stellen Sie Ihren Beitrag unter die im Feld `lizenz` genannte Lizenz (Standard **Apache-2.0**) und bestätigen, dass Sie dazu berechtigt sind. Übernehmen Sie keine Muster aus Projekten mit anderen Lizenzen (z. B. GPL/AGPL), damit der Katalog frei weiterverwendbar bleibt.

**Code, Oberfläche, Doku:** Beiträge stehen unter der Lizenz des Projekts, der [GNU AGPL v3](LICENSE). Mit dem Pull-Request bestätigen Sie, dass Sie den Beitrag selbst geschrieben haben oder ihn unter dieser Lizenz einbringen dürfen.

## Sicherheitslücken
Bitte nicht als Issue, sondern vertraulich melden: [SECURITY.md](SECURITY.md).
