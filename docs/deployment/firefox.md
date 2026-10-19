# Deployment in Firefox (policies.json)

Firefox liest Firmen-Richtlinien aus `policies.json` (oder aus den gleichwertigen Firefox-Gruppenrichtlinien). Zwei Einträge genügen:

- **`ExtensionSettings`** installiert AImori fest (`force_installed`) von einer Adresse (`install_url`). Das geht nur mit einer **von Mozilla signierten XPI-Datei** – unsignierte Pakete installiert Firefox (ausser Developer Edition, Nightly, ESR mit abgeschalteter Signaturpflicht) nicht. Eine Signatur entsteht nur durch Einreichen bei Mozilla (öffentlich gelistet oder „unlisted“ zur Selbstverteilung); das ist noch nicht geschehen und braucht die Freigabe der Maintainer ([Firefox](../firefox.md)).
- **`3rdparty.Extensions["dlx-extension@aimori"]`** enthält die AImori-Richtlinie im **gleichen Format** wie für Edge und Chrome (`extension/managed_schema.json`, Beispiel `enterprise/example-policy.json`, alle Schlüssel in [Einstellungen](../einstellungen.md)). Firefox reicht sie als verwaltete Einstellungen (`storage.managed`) an die Erweiterung durch; AImori prüft sie mit demselben Code wie unter Chrome und verwirft ungültige Werte.

Beispiel (nur Platzhalter, erzeugt aus `enterprise/example-policy.json`): [`enterprise/firefox/policies.json`](../../enterprise/firefox/policies.json).

## policies.json erzeugen
```
node scripts/pack-firefox.mjs --policies <richtlinie.json> --install-url https://<eigener-server>/aimori-firefox.xpi > policies.json
```
`<richtlinie.json>` ist dieselbe Datei wie für Edge/Chrome (z. B. aus [Für Unternehmen](../fuer-unternehmen.md)). Die Adresse muss `https` sein. Vor dem Verteilen die Richtlinie wie gewohnt prüfen (`npm run check` bzw. Schema-Prüfung im Deploy-Skript).

## Verteilen
| Weg | Ablage |
|---|---|
| Windows (Datei) | `C:\Program Files\Mozilla Firefox\distribution\policies.json` (Ordner `distribution` anlegen; Schreibrecht nur Administratoren) |
| macOS | `/Applications/Firefox.app/Contents/Resources/distribution/policies.json` |
| Linux | `/etc/firefox/policies/policies.json` |
| Intune/GPO | Firefox-ADMX von Mozilla (github.com/mozilla/policy-templates) importieren; „Extensions → Extension Management“ (`ExtensionSettings`) mit dem JSON-Teil aus `ExtensionSettings`. Für `3rdparty` gibt es keine fertige ADMX-Einstellung: Datei-Weg nutzen oder die Registry-Struktur `HKLM\Software\Policies\Mozilla\Firefox\3rdparty\Extensions\dlx-extension@aimori\…` setzen – diesen Weg vor dem Rollout auf einem Testgerät prüfen. |

Prüfen auf dem Gerät: `about:policies` (aktive Richtlinien, Fehler), `about:addons` (AImori installiert, „Verwaltet von …“ in den Einstellungen der Erweiterung).

**Zugriff auf die KI-Seiten:** In Firefox ist der Zugriff auf Webseiten für Erweiterungen mit Manifest V3 eine Erlaubnis, die erteilt sein muss. Nach der Installation per Richtlinie prüfen, ob AImori kein „!“ am Symbol zeigt; sonst den Zugriff in `about:addons` → AImori → Berechtigungen erteilen (Handtest-Plan Punkt 2 in [Firefox](../firefox.md)).

## Entfernen
Eintrag aus `ExtensionSettings` und `3rdparty` entfernen (bzw. `installation_mode: "blocked"`), Firefox neu starten. Die lokalen Daten der Erweiterung löscht Firefox mit der Deinstallation.

## Transparenz
Wie bei Edge und Chrome: AImori zeigt „Verwaltet von <Firma>“, speichert und meldet keine Eingaben und hat keinen Netzwerkzugriff. Mitarbeitende vor der Einführung informieren (Art. 19 revDSG).
