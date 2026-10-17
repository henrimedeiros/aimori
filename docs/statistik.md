# Statistik (lokale Zähler)

Gegenstück zu „Activity Logs“ anderer Erweiterungen – bewusst minimal:

- Gespeichert in `chrome.storage.local` unter `dlx.stats`: **nur Tageszahlen** je KI-Seite, Kategorie (z. B. Finanzdaten) und Entscheidung (geschwärzt, abgebrochen, trotzdem gesendet, blockiert, Datei-Hinweis, inaktiv, Seite gesperrt).
- Keine Zeitstempel einzelner Ereignisse, keine Texte, Ausschnitte, Hashes von Treffern oder Dateinamen. Ablauf nach 90 Tagen.
- Sichtbar im Popup (heute, 30 Tage) und in den Einstellungen (30 Tage je Kategorie); dort auch „Statistik zurücksetzen“.
- Aus diesen Zählern entsteht auf Wunsch der [Nachweis-Bericht für Gesetze und Normen](compliance/README.md) (nur Summen, Druck/PDF oder HTML-Datei, abschaltbar per Richtlinie `complianceReport`).
- Getrennt davon zählt der [KI-Kompetenz-Nachweis](ki-kompetenz.md) unter `dlx.kompetenz` nur Monatszahlen je Datentyp-Gruppe (gesehene Erklärungen, geschwärzt, nicht gesendet, trotzdem gesendet), 13 Monate, abschaltbar per Einstellung oder Richtlinie `competenceRecord`.
- Die Zähler verlassen das Gerät nie. Ein Feld `reportingUrl` ist im Schema für spätere Berichte (z. B. CIPP) reserviert; dafür braucht es eine neue Version mit eigenem Sicherheits-Review, feste Feldliste und Summen erst ab mehreren Geräten.
