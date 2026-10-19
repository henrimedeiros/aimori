# Dokumentation

Browser-Erweiterung (Manifest V3) für Edge und Chrome, mit demselben Code auch für Firefox ([Firefox-Paket gebaut, noch nicht im Store](firefox.md)), die Eingaben an KI-Seiten **lokal auf dem Gerät** auf sensible Daten prüft, bevor sie gesendet werden. Kein Server, kein Konto, keine Telemetrie, kein Netzwerkzugriff.

Gliederung angelehnt an die Doku von CyberDrain Check (nur Aufbau übernommen, eigene Texte):

| Bereich | Seite |
|---|---|
| Über das Produkt | [Was es tut und was nicht](ueber.md) |
| Installation | [Entpackt laden, prüfen](installation.md) · [Firefox: Paket, Unterschiede, Handtest-Plan](firefox.md) |
| Einstellungen | [Alle Richtlinien-Schlüssel](einstellungen.md) · [Warnleiste anpassen (hell, dunkel, kompakt)](warnleiste-darstellung.md) |
| Sprachen | [Sechs Sprachen, Sprachwahl, neue Sprache, Rollout](sprachen.md) · [Store-Texte (Entwurf)](store/de.md) |
| Kontext-Risiken | [Identität, Gesundheit, Personal, Kundenlisten](kontext-risiken.md) |
| Branding | [Whitelabel](branding.md) |
| Für Unternehmen und MSPs | [Rollout je Kunde mit eigenem Logo (Intune, GPO)](fuer-unternehmen.md) |
| Deployment | [Gruppenrichtlinie (ADMX)](deployment/gpo.md) · [Intune](deployment/intune.md) · [Registry-Skripte und Entfernen](deployment/registry-skripte.md) · [Firefox (policies.json)](deployment/firefox.md) |
| Datentypen | [Liste (erzeugt)](datentypen.md) · [Quellen der Prüfverfahren](datentypen-quellen.md) |
| Statistik | [Lokale Zähler](statistik.md) |
| Fehlalarme | [Messung, Zielwerte, Stufen](fehlalarme.md) |
| Platzhalter | [Platzhalter statt Schwärzen, Antwort mit echten Werten](platzhalter.md) |
| Eigene Begriffe | [Kundennamen, Codenamen, interne Domains schützen](eigene-begriffe.md) |
| Interne Links | [SharePoint-, OneDrive- und Intranet-Links erkennen, Richtlinie internalDomains](interne-links.md) |
| Firmendokumente | [Fingerabdrücke: kopierte Teile vertraulicher Dokumente erkennen](dokument-fingerabdruecke.md) |
| Tabellen und Verschleierung | [Tabellen mit Personendaten, verschleierte Daten, „Sicher umformulieren“](tabellen-verschleierung-umformen.md) |
| Sprache und Diktat | [Diktat wird geprüft, Sprachmodus melden oder sperren](sprache-und-diktat.md) |
| Bildschirm teilen | [Warnung und Verdecken, wenn ein KI-Chat mit Treffern in Meet, Teams oder Zoom geteilt wird](bildschirm-teilen.md) |
| Muster mitmachen | [Gemeinschafts-Katalog (signiert, per Pull-Request) und eigene Muster per Richtlinie](muster-mitmachen.md) · [Beitragen](../CONTRIBUTING.md) |
| KI-Kompetenz | [Erklärungen je Warnung, Nachweis nach Art. 4 EU AI Act](ki-kompetenz.md) |
| Nachweise für Gesetze | [Bericht nur mit Zahlen, Zuordnung revDSG, DSGVO, HIPAA, EU AI Act, ISO 27001](compliance/README.md) |
| Erlaubte KI-Tools | [Hinweis oder Sperre auf nicht freigegebenen KI-Seiten](ki-seiten.md) · [Liste bekannter KI-Seiten (erzeugt)](ki-seiten-liste.md) · [Training-Ampel](ki-training.md) · [KI-Training je Seite (erzeugt)](ki-training-liste.md) |
| Regeln je Konto | [Firmen- und Privatkonto derselben KI unterschiedlich behandeln](konto-regeln.md) |
| KI-Antworten und Zwischenablage | [Heikle Daten in KI-Antworten markieren, Einfügen aus vertraulichen Quellen warnen](antworten-und-zwischenablage.md) |
| KI-Agenten | [Machbarkeit je Agent, Hinweis auf versteckte Anweisungen](ki-agenten.md) |
| Veröffentlichung | [Chrome Web Store: Paket, Eintrag, Datenschutz-Angaben](store/chrome-web-store.md) · [Datenschutzerklärung](../PRIVACY.md) · [Sicherheitslücken melden](../SECURITY.md) |
| Bilder prüfen | [Screenshots per lokaler Texterkennung prüfen und schwärzen](bilder.md) |
| Lokale KI-Erkennung | [Namen, Firmen, Adressen, Gesundheit per lokalem Modell (Prototyp, Messwerte)](ki-erkennung.md) |
| Fehlerbehebung | [Häufige Fragen, Testen](fehlerbehebung.md) |
| Sicherheit | [Design-Review MVP](sicherheit/design-review-mvp.md) · [Design-Review Live-Hinweis](sicherheit/design-review-live-hinweis.md) · [Design-Review Platzhalter](sicherheit/design-review-platzhalter.md) · [Design-Review Eigene Begriffe](sicherheit/design-review-eigene-begriffe.md) · [Design-Review Interne Links](sicherheit/design-review-interne-links.md) · [Design-Review KI-Kompetenz](sicherheit/design-review-kompetenz.md) · [Design-Review KI-Seiten](sicherheit/design-review-ki-seiten.md) · [Design-Review Regeln je Konto](sicherheit/design-review-konto-regeln.md) · [Design-Review Bilder](sicherheit/design-review-bilder.md) · [Design-Review Mandanten-Vorlagen](sicherheit/design-review-mandanten.md) · [Design-Review KI-Erkennung](sicherheit/design-review-ki.md) · [Design-Review Code und Bilder](sicherheit/design-review-code-bilder.md) · [Design-Review Muster mitmachen](sicherheit/design-review-muster.md) · [Design-Review KI-Antworten und Zwischenablage](sicherheit/design-review-antwort-zwischenablage.md) · [Design-Review Training-Ampel](sicherheit/design-review-training-ampel.md) · [Design-Review KI-Agenten](sicherheit/design-review-ki-agenten.md) · [Design-Review Diktat und Fingerabdrücke](sicherheit/design-review-diktat-fingerabdruck.md) · [Design-Review Diktat-Senden](sicherheit/design-review-diktat-senden.md) · [Design-Review Tabellen/Verschleierung/Umformen](sicherheit/design-review-tabellen-verschleierung-umformen.md) · [Design-Review Firefox-Paket](sicherheit/design-review-firefox-17-10.md) |

Der Produktname ist austauschbar: er steht nur in `extension/branding.js` und `extension/_locales/*/messages.json`; Firmen setzen ihn per Richtlinie `branding.productName`.
