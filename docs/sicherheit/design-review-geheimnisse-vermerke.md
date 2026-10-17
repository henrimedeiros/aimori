# Design-Review: Geheimnisse in Code/Konfiguration und Vertraulichkeits-Vermerke

Stand: 14.10.2026 · Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN** · ohne neue Rechte, ohne Netz, ohne Abhängigkeiten.

Vorhaben: Paket `secrets` erweitern (.env-Zeilen, Verbindungs-Strings, ganzer Block privater Schlüssel, JWT mit Strukturprüfung, Passwörter in Konfiguration, weitere Anbieter-Schlüssel nach gitleaks-Formaten mit Entropie-Prüfung, Platzhalter-Ausschluss), neues globales Paket `marker` (Vertraulichkeits-Vermerke `conf_marker`, Purview-Labels `conf_label`), neue Richtlinie `labelNames`, Fehlalarm-Messung um Code/Konfiguration und Fliesstext mit Vermerk-Wörtern erweitert.

Antworten auf die Fragen: `labelNames` im Klartext ist in Ordnung (Label-Namen stehen sichtbar auf jedem Dokument; Kunden-/Projektnamen gehören zu `customTerms` mit Hash). Der ganze Block eines privaten Schlüssels als Fund ist richtig.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | `labelNames` nur aus der verwalteten Richtlinie; Benutzerwerte verwerfen; Namen nie in Popup, Meldung, Konsole, Fehlermeldung oder Fund | `policy.js` `validate`: mit `user` → `unknown:labelNames`; Fund trägt nur `conf_label` und Position; Fehler nennen nur den Schlüssel. Test `tests/helpers/geheimnisse-faelle.mjs` (läuft in `engine.test.mjs`) |
| 2 | ADMX/ADML-Hinweis: nur Label-Namen, keine Kunden- oder Projektnamen (dafür `customTerms`) | Texte in `managed_schema.json` (en) und `scripts/build-admx.mjs` (de) |
| 3 | Privater Schlüssel fail-closed: ohne END bzw. über 12000 Zeichen ab BEGIN bis Grenze/Textende; PuTTY bis `Private-MAC`; Überlappungen vor dem Schwärzen zusammenführen | `packs-secrets.js` `pem_private`, `putty_key`; Engine behält bei Überlappung den längeren Fund. Tests |
| 4 | Muster aus der Richtlinie einmal je Richtlinien-Änderung bauen, alles escapen, NFC, ohne Gross/Klein, Wortgrenzen, Teile ≤ 50 Namen, ungültig → ganzes Feld verwerfen | `packs-marker.js` `DLX.markers.compile` (aufgerufen in `engineConfig`, das nur bei Richtlinien-Änderung läuft), Teile zu 50, `validate` verwirft das ganze Feld; Grenzen nach Auflage der Pflicht-Prüfung (14.10.2026): höchstens 50 Namen zu 2–64 Zeichen, nur Buchstaben, Ziffern und `. - _ ( ) & \ /` (keine Regex-Syntax) |
| 5 | JWT: Längengrenze vor dem Dekodieren (≤ 8 KB je Teil), base64url sauber, Dekodieren und `JSON.parse` in try/catch, Inhalt nicht halten/protokollieren | `jwtOk` in `packs-secrets.js` (eigener Dekodierer ohne `atob`, Ergebnis nur als true/false) |
| 6 | Platzhalter nur, wenn der *ganze* Wert ein Platzhalter ist | `PLACEHOLDER` verankert (`^…$`); dokumentierte AWS-Beispielwerte als exakte Liste; Test „echter Schlüssel mit example im Wert wird gemeldet“ |
| 7 | ReDoS-Tests je neuem Muster mit > 100k Zeichen Fast-Treffern, Zeitbudget 150 ms | `tests/helpers/geheimnisse-faelle.mjs` „ReDoS“ |
| 8 | gitleaks-Formate selbst formulieren, MIT-Hinweis, nichts aus trufflehog | Muster selbst geschrieben; `THIRD_PARTY_NOTICES.md` nennt gitleaks (MIT) |
| 9 | Nur erfundene Testwerte, zur Laufzeit zusammengesetzt, keine Kunden-/Firmenbegriffe, Korpus im Repo | `tests/helpers/testwerte.mjs`, `scripts/fehlalarm.mjs` |
| 10 | Einzelwörter nur in Vermerk-Stellung, mit Fliesstext-Korpus belegt; MSIP-Metadaten ohne GUID/Namen im Fund; Hinweis für Admins (Paket standardmässig an) | `packs-marker.js`; Korpus-Arten `prosa_vermerk`, `konfig`; `docs/einstellungen.md` Abschnitt „Neu“ |
| 11 | Vorher/Nachher-Zahlen je Korpus-Art nennen; bei Verschlechterung Muster verengen, nie Ziel senken | `docs/fehlalarme.md`, Commit-Text |

Restrisiken: weniger Funde durch Platzhalter-, Entropie- und Strukturfilter (mittel; Entropie nur als Untergrenze gegen Füllwerte wie `xxxx`); Zeitbudget bei präparierten Texten (mittel; Auflagen 3, 4, 7); Admins tragen Kundennamen in `labelNames` ein (tief); mehr Warnungen durch das neue Paket (tief; Aktion `warn`, abschaltbar).
