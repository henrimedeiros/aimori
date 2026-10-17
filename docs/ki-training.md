# Training-Ampel: Nutzt die KI meine Eingaben zum Training?

Stand: 16.10.2026 · Richtlinie `trainingAmpel` · Liste: [KI-Training je Seite (erzeugt)](ki-training-liste.md) · Design-Review: [Training-Ampel](sicherheit/design-review-training-ampel.md)

Viele KI-Dienste verwenden Eingaben von Gratis- und Einzelkonten standardmässig, um ihre Modelle weiter zu trainieren. Firmenkonten (Team, Enterprise) sind meist ausgenommen. Die Training-Ampel zeigt das **auf einen Blick** für jede bekannte KI-Seite.

## Was die Ampel zeigt

Auf einer bekannten KI-Seite bekommt das Symbol der Erweiterung in der Symbolleiste einen farbigen Punkt:

| Farbe | Bedeutung |
|---|---|
| Rot | Die Seite nutzt Eingaben **standardmässig** zum Training (oft abschaltbar). Das ist die Voreinstellung des Anbieters, nicht Ihre eigene Einstellung. |
| Gelb | Teils oder unklar: hängt von Abo, Region, Einstellungen oder öffentlichen Inhalten ab, oder der Anbieter sagt es nicht eindeutig. Auch jede Angabe, die älter als 12 Monate oder unvollständig ist. |
| Grün | Laut **ausdrücklicher Herstellerangabe** kein Training für genau diese Kontoart. |

Ein Klick auf das Symbol öffnet das Popup. Die KI-Seite des aktiven Tabs wird automatisch erkannt (Pill „automatisch erkannt“), es muss nichts gewählt werden. Nur auf Wunsch („Andere KI-Seite prüfen“, ohne erkannte Seite der leise Knopf „KI-Training einer Seite prüfen“) erscheint ein eigenes Auswahlfeld mit allen Seiten der Liste (Monogramm je Dienst, per Tastatur bedienbar: Pfeiltasten, Pos1/Ende, Enter, Esc, Anfangsbuchstaben tippen). Bilder: [hell](screenshots/aimori/auswahl/auswahl-hell.png), [dunkel](screenshots/aimori/auswahl/auswahl-dunkel.png), erkannte Seite [hell](screenshots/aimori/auswahl/erkannt-hell.png), [dunkel](screenshots/aimori/auswahl/erkannt-dunkel.png). Das Popup ist bewusst schlank (seit 17.10.2026): es nennt die Seite, erklärt die Farbe in einem Satz und bietet den Knopf **„Opt-out-Einstellung öffnen“** – er öffnet die Einstellungsseite des Anbieters in einem neuen Tab. Die Ampel zeigt immer die Voreinstellung laut Anbieter: Ihre eigene Einstellung im Konto kann die Erweiterung nicht sehen. Haben Sie das Training abgeschaltet, gilt Ihre Einstellung, auch wenn die Ampel rot bleibt. Deshalb zeigt sie nie „erledigt“. Ist kein sicherer Link zur Einstellung bekannt, fehlt der Knopf. Stand-Datum und „laut Herstellerangabe, ohne Gewähr“ stehen als Tooltip am Ampel-Satz; die Quellen stehen in der [Liste](ki-training-liste.md). Mit **„Andere KI-Seite prüfen“** lässt sich jede Seite der Liste nachschlagen, auch wenn gerade keine KI-Seite offen ist.

## Kontoart (Firmenkonten)

- Ohne Konto-Regel gilt die Angabe für **Privatkonten** (Gratis, Plus, Pro …).
- Hat die Firma für eine Seite [Regeln je Konto](konto-regeln.md) (`accountRules`) hinterlegt, bewertet die Ampel nach der dort erkannten Kontoart: Firmenkonto → Angabe „Firma“, Privatkonto → „Privat“, nicht erkannt → der **strengere** der beiden Werte. Erkannt wird die Kontoart nur auf den unterstützten Seiten (ChatGPT, Claude, Gemini, Copilot, Microsoft 365 Copilot), genau wie bei den Konto-Regeln; Namen werden nie gelesen oder weitergegeben.
- Hat eine Seite keine Firmenvariante, gilt für ein erkanntes Firmenkonto „unklar“ (gelb).

## Woher die Angaben stammen

Die Angaben sind **mit der Erweiterung ausgeliefert** (`extension/common/training.js`) und ändern sich nur mit einem Update. Die Erweiterung lädt nichts nach. Je Seite gibt es: Wert für Privat- und Firmenkonten (`ja`, `nein`, `teils`, `unbekannt`), Link zur Opt-out-Einstellung (falls sicher bekannt), Herstellerquelle und Stand-Datum. Quellen sind ausschliesslich Seiten der Anbieter (Datenschutzerklärung, Hilfe-Center). Links sind nur `https` und nur auf Hosts der Seite oder ausdrücklich genannte Hosts desselben Anbieters erlaubt; ein Test prüft das.

Die Angaben sind eine Momentaufnahme. Anbieter ändern ihre Regeln; deshalb wird jede Angabe nach 12 Monaten automatisch gelb, bis sie bei einem Release neu geprüft wird. Pflege: Eintrag in `training.js` ändern, Stand-Datum setzen, `npm run build` (erzeugt [die Liste](ki-training-liste.md)), `npm test`.

## Rechte und Datenschutz

Für die Ampel braucht die Erweiterung zwei Rechte ohne Installationswarnung:

- `declarativeContent`: Die Erweiterung übergibt dem Browser einmal feste Regeln („auf diesem Host dieses Symbol“). Den Abgleich mit der Adresse macht der Browser selbst; die Erweiterung erfährt nicht, welche Seiten besucht werden.
- `activeTab`: Nur wenn jemand auf das Symbol klickt, sieht das Popup die Adresse des aktiven Tabs. Es behält davon nur, welche KI-Seite der Liste es ist – die Adresse wird weder gespeichert noch weitergegeben noch protokolliert. Code in die Seite einschleusen oder sie abfotografieren tut die Erweiterung nicht (ein Quelltext-Test verbietet `executeScript` und `captureVisibleTab`).

Gespeichert wird nur, solange der Browser läuft (`storage.session`), welche Kontoart (Firma/Privat/unbekannt) ein Tab auf einer Seite mit Konto-Regel hat – ohne Adresse, beim Schliessen des Tabs gelöscht. Es gibt keinen Netzwerkzugriff und keine Protokolle.

## Für Unternehmen

| Richtlinie | Wirkung |
|---|---|
| `trainingAmpel` (ja/nein, Standard ja) | `false` schaltet Ampel-Symbol und Popup-Abschnitt ab. Nur per Richtlinie (Intune, GPO/ADMX, Registry), Benutzer können es nicht ändern. |
| `accountRules` | Bestimmt zusätzlich, ob die Ampel für Firmen- oder Privatkonten bewertet ([Regeln je Konto](konto-regeln.md)). |

Firefox und Safari kennen `declarativeContent` nicht; dort gibt es nur das Popup.
