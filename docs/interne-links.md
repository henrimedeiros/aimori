# Interne Links

Links auf SharePoint-Seiten, OneDrive-Ordner der Firma, das Intranet oder interne Server verraten, wie eine Organisation aufgebaut ist (Server-, Team- und Projektnamen) – und ein Freigabelink öffnet oft sogar die Datei selbst. Die Erweiterung erkennt solche Links im Prompt **lokal** als Datentyp **„Interner Link“** (`internal_link`, Gruppe Technik): Warnleiste mit eigener Erklärung, Schwärzen oder Platzhalter `[INTERNAL_LINK_1]` ([Platzhalter](platzhalter.md)). Standardaktion ist `warn`; per `rules` z. B. `"internal_link": "redact"`, `"block"` oder `"off"`.

Geprüft wird nur der Text im Browser. Es gibt keine Netzanfrage, keine DNS-Abfrage und keinen Linkaufruf; gespeichert wird nur Typ und Lage eines Funds, nie der Link.

## Was als intern gilt
Gesucht werden Links mit `http://`, `https://`, `ftp://` oder `file://` sowie SharePoint-Links ohne Schema (`firma.sharepoint.com/sites/…`). Der Host ist der Teil nach dem letzten `@` (Benutzername und Port zählen nicht). Intern ist ein Link, wenn sein Host

| Fall | Beispiele (erfunden) |
|---|---|
| ein SharePoint-/OneDrive-Firmenhost ist: `<firma>.sharepoint.com`, `<firma>-my.sharepoint.com`, ebenso `.sharepoint.us`, `.sharepoint.de`, `.sharepoint.cn` (nicht `www`) | `https://contoso.sharepoint.com/sites/Projekt`, `https://contoso-my.sharepoint.com/personal/…` |
| mit `intranet.` oder `intra.` beginnt | `https://intranet.example.com/hr` |
| keinen Punkt hat (ausser `localhost`) | `http://wiki/Seite`, `http://srv-file01:8080/` |
| auf eine reservierte bzw. privat genutzte Endung endet: `.local`, `.localdomain`, `.lan`, `.internal`, `.intranet`, `.intra`, `.corp`, `.home`, `.private`, `.home.arpa` | `https://fs.corp/`, `https://nas.home.arpa/` |
| oder eine seiner übergeordneten Domains in der Richtlinie `internalDomains` steht | `https://wiki.team.intern-example.net/` bei Eintrag `intern-example.net` |

`file:`-Links ohne Host oder mit Laufwerk (`file:///C:/…`) gelten immer als intern. Nicht als intern gelten: `www.sharepoint.com`, Hosts wie `contoso.sharepoint.com.example.org` (SharePoint nur am Ende des Hosts), `localhost`, IP-Adressen (dafür gibt es die Typen „Interner Hostname oder interne Adresse“ und „Öffentliche IPv4-Adresse“), `.int`, `.test`, `.example`, `.invalid` und alle Links mit öffentlicher Endung, die nicht in `internalDomains` stehen. OneDrive privat (`onedrive.live.com`, `1drv.ms`) ist kein Firmenlink.

Der Fund ist der ganze Link inklusive Pfad, Query, Fragment und Benutzername – nur eine überzählige schliessende Klammer am Ende gehört nicht dazu; Satzzeichen am Ende werden im Zweifel mitgeschwärzt.

## Richtlinie `internalDomains`
Eigene Domains (z. B. die Domain des Intranets oder der Dateiserver) kennt die Erweiterung nur, wenn die Organisation sie nennt. Die Richtlinie enthält **nur gesalzene Prüfsummen**, nie den Klartext, und wirkt nur aus der verwalteten Richtlinie (GPO/Intune/Registry), nicht als Benutzereinstellung:

```json
{ "internalDomains": { "salt": "<64 Hex-Zeichen>", "hashes": ["<64 Hex-Zeichen>", "…"] } }
```

- Prüfsumme: `hex(SHA-256(UTF-8(salt + domain)))`, alles klein. `domain` wird vorher normalisiert: unsichtbare und Bidi-Zeichen entfernt, Unicode NFKC, Kleinbuchstaben, internationale Namen als Punycode (`bücher.example` → `xn--bcher-kva.example`), ohne Punkt am Ende.
- Ein Eintrag trifft den Host selbst und alle Subdomains (geprüft werden höchstens 10 übergeordnete Domains je Host, mindestens zwei Labels).
- `salt`: genau 64 Hex-Zeichen, klein, **eigenes Salz** – nicht dasselbe wie bei `customTerms`, sonst wird das Feld verworfen. `hashes`: höchstens 5 000 Einträge, Duplikate werden entfernt. Ein ungültiger Wert verwirft das ganze Feld; Meldungen und der Bericht nennen nur den Schlüssel, nie Werte.

Erstellen mit demselben Werkzeug wie für eigene Begriffe (läuft nur lokal):

```text
node scripts/begriffe-hashen.mjs domains.txt --domains --out internalDomains.json
```

`domains.txt` enthält eine Domain je Zeile (`#` = Kommentar). Das Werkzeug verwirft Einträge mit nur einem Label (`server`), bekannte öffentliche Endungen (`co.uk`, `com.br`, …) und IP-Adressen und meldet nur Zeilennummern, nie den Klartext. Mit `--salt <64 hex>` lässt sich eine bestehende Liste ergänzen.

**Schutzgrenze:** Das Salz ist für Benutzer lesbar, und interne Domainnamen sind meist erratbar. Die Prüfsummen schützen nur vor beiläufigem Lesen der Richtlinie, nicht vor einem Wörterbuchangriff. Wer eine Domain wirklich geheim halten muss, darf sie nicht in eine Client-Richtlinie schreiben.

## Grenzen
- Ohne Schema erkannt werden nur SharePoint-Links. `wiki.corp/seite`, `intranet/seite` oder UNC-Pfade (`\\server\freigabe`) ohne `http(s)://` bzw. `file://` sind keine internen Links in diesem Sinn; UNC-Pfade meldet höchstens der Typ „Interner Hostname / UNC-Pfad“ des Weltpakets (Klasse tief, standardmässig aus).
- Firmenhosts mit öffentlicher Endung (z. B. `wiki.example.com`) erkennt die Erweiterung nur über `internalDomains`.
- Internationale Namen mit vertauschten Schriftzeichen (Homographen) ergeben andere Prüfsummen und gelten dann nicht als intern.
- Mehr als 500 Links in einem Text oder Zeitüberschreitung: der Text gilt als „nicht prüfbar“ (wie bei allen Datentypen), nie als „kein Fund“.

## Vorschlag für die Website (nicht veröffentlicht)
> **Interne Links bleiben intern.** AImori erkennt SharePoint- und OneDrive-Links Ihrer Firma, Intranet-Adressen und interne Server direkt im Browser, bevor ein Prompt die KI erreicht – und ersetzt sie auf Wunsch durch einen Platzhalter. Eigene Firmendomains hinterlegen Sie per Richtlinie, nur als gesalzene Prüfsummen. Nichts verlässt das Gerät.

Design-Review: [sicherheit/design-review-interne-links.md](sicherheit/design-review-interne-links.md).
