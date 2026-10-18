// Erzeugt ADMX/ADML (en-US, de-DE) fuer Chrome und Edge aus
// extension/managed_schema.json. Registry-Ziel je Browser:
//   HKLM\Software\Policies\Google\Chrome\3rdparty\extensions\<ID>\policy
//   HKLM\Software\Policies\Microsoft\Edge\3rdparty\extensions\<ID>\policy
// ID: die Erweiterungs-ID im Chrome Web Store (STORE_ID). Fuer die entpackte Entwicklungsfassung oder ein eigenes
// signiertes Paket: --id <id> (Entwicklungs-ID aus dem oeffentlichen Schluessel im Manifest: extensionId()).
// Produktname aus extension/branding.js. Alle Texte werden XML-escaped (B19).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'enterprise', 'admx');

export const STORE_ID = 'lefajbhockjgdhaohnacgaggfepianjh';

export function extensionId(manifest) {
  const der = Buffer.from(manifest.key, 'base64');
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 32).replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}

function productName() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(EXT, 'branding.js'), 'utf8'), ctx);
  return ctx.DLX.branding.productName;
}

// Gueltige IDs der KI-Seiten-Liste fuer den Erklaertext (ADMX kann kein Muster erzwingen).
function aiIds() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(EXT, 'common', 'aisites.js'), 'utf8'), ctx);
  return Array.from(ctx.DLX.aisites.IDS).join(', ');
}
const AI_IDS = aiIds();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Deutsche Texte je Schluessel (Titel, Beschreibung); Englisch kommt aus dem Schema.
const DE = {
  branding: ['Branding', 'Whitelabel-Darstellung im Popup, in den Einstellungen und im Warn-Dialog.'],
  'branding.productName': ['Produktname', 'Name anstelle des Standard-Produktnamens (1-40 Zeichen).'],
  'branding.companyName': ['Firmenname', 'Organisation, die als verwaltende Firma angezeigt wird (max. 80 Zeichen).'],
  'branding.logo': ['Logo', 'Logo als data:-URI (data:image/png;base64,... oder data:image/svg+xml;base64,...), max. 100 KB. URLs sind nicht moeglich, weil die Erweiterung keinen Netzwerkzugriff hat.'],
  'branding.primaryColor': ['Primaerfarbe', 'Hex-Farbe #rrggbb fuer Kopfzeilen und Knoepfe.'],
  'branding.accentColor': ['Akzentfarbe', 'Hex-Farbe #rrggbb fuer Hervorhebungen.'],
  'branding.supportUrl': ['Support-Link', 'https-Link zur internen Support-Seite (wird nur auf Klick geoeffnet).'],
  'branding.supportText': ['Support-Text', 'Kurzer Support-Hinweis im Dialog (max. 200 Zeichen).'],
  'branding.aiNoticeText': ['Hinweistext KI-Seiten', 'Text auf nicht freigegebenen KI-Seiten (aiSiteMode), z. B. "Bitte nutzen Sie unseren Firmen-Copilot." Max. 200 Zeichen, nur als Text angezeigt.'],
  'branding.aiNoticeUrl': ['Link KI-Seiten-Hinweis', 'https-Link zum freigegebenen KI-Tool (ohne Benutzername/Passwort in der URL, max. 2000 Zeichen). Wird nur auf Klick geoeffnet.'],
  'branding.aiNoticeLinkText': ['Knopftext KI-Seiten-Hinweis', 'Text des Link-Knopfs (max. 60 Zeichen). Standard: Freigegebenes KI-Tool oeffnen.'],
  language: ['Sprache', 'Sprache der Oberflaeche. auto = Browsersprache.'],
  countryPacks: ['Laenderpakete', 'Laender- und Regionspakete der Erkennung (CH, DE, AT, FR, IT, BE, NL, US, BR, LI, ES, PT, LU, SE, DK, NO, FI, IS, IE, GB, PL, CZ, SK, HU, RO, BG, HR, SI, GR, CY, MT, EE, LT, LV, CA, MX, AR, CL, CO, IN, CN, JP, KR, SG, AU, NZ, ZA, TR, IL, AE, SA, NG, EU). Gesetzt hat diese Richtlinie immer Vorrang und schaltet die automatische Auswahl ab. Standard: automatisch (Zeitzone und Sprachregion, nur lokal).'],
  autoCountryPacks: ['Laenderpakete automatisch waehlen', 'true: Laenderpakete folgen der lokalen Zeitzone und den Sprachregionen (kein Netzwerk, kein Standortzugriff), Benutzer koennen nicht auf manuell wechseln. false: keine automatische Auswahl, Benutzer waehlen die Pakete selbst. Wird ignoriert, wenn Laenderpakete (countryPacks) gesetzt ist. Standard: automatisch, Benutzer duerfen aendern.'],
  globalPacks: ['Globale Pakete', 'Globale Erkennungspakete (finance, secrets, contact, travel, marker = Vertraulichkeits-Vermerke und Vertraulichkeitsbezeichnungen, context = Kontext-Risiken: Identitaets-Kombi, Gesundheit/Personal/Gesinnung einer Person, Kundenlisten, community = Gemeinschafts-Muster aus dem signierten Katalog der Erweiterung). Standard: alle.'],
  rules: ['Regeln je Datentyp', 'Aktion je Datentyp-ID (siehe docs/datentypen.md): off, warn, redact oder block. Wertname = Datentyp-ID, Wert = Aktion.'],
  allowUserOverride: ['"Trotzdem senden" erlauben', 'Bei false koennen Benutzer erkannte Daten nicht trotzdem senden oder einfuegen (nur schwaerzen oder abbrechen). Standard: true.'],
  allowNotSensitive: ['"Kein sensibler Wert" erlauben', 'Bei false koennen Benutzer erkannte Werte nicht als "kein sensibler Wert" markieren; die lokale Liste wird geloescht. Wirkt nur zusammen mit "Trotzdem senden" erlauben. Standard: true.'],
  allowPlaceholders: ['Platzhalter erlauben', 'Bei false koennen Benutzer erkannte Werte nicht durch Platzhalter wie [IBAN_1] ersetzen und KI-Antworten nicht mit echten Werten anzeigen; die Zuordnung im Arbeitsspeicher wird verworfen. Die KI-Seite erfaehrt Art und Anzahl der ersetzten Werte. Standard: true.'],
  imageScan: ['Bilder pruefen', 'Bei true werden eingefuegte, abgelegte oder hochgeladene PNG-, JPEG- und WebP-Bilder (z. B. Screenshots) lokal per Texterkennung gelesen und wie Text geprueft; die KI-Seite erhaelt das Bild erst nach der Pruefung (Original, geschwaerzte Kopie oder nichts). Nicht rechtzeitig pruefbare oder zu grosse Bilder zeigen eine Meldung statt still durchzugehen. Bei false gelten Bilder wie andere Dateien (blockUncheckedFiles). Standard: true.'],
  competenceRecord: ['KI-Kompetenz-Nachweis', 'Bei true erklaert die Erweiterung jede Warnung und zaehlt lokal je Datentyp-Gruppe und Monat, wie viele Erklaerungen gesehen und wie oft Werte geschwaerzt, das Senden abgebrochen oder trotzdem gesendet wurde (nur Zahlen, 13 Monate, verlaesst das Geraet nie). Benutzer koennen eine Selbstauskunft drucken. Bei false wird nichts gezaehlt und die lokalen Zaehler werden geloescht. Standard: true (Benutzer duerfen abschalten).'],
  detection: ['Erkennung', 'ki = Regeln plus lokales KI-Modell fuer Namen, Firmen, Adressen und Gesundheitsangaben (laeuft auf dem Geraet, nichts wird gesendet; bei Fehlern nur Regeln); regeln = nur Regeln. Die Regeln gelten immer. Standard: ki.'],
  uncertainFindings: ['Unsichere Funde', 'Funde ohne Kontextwort oder mit mehrdeutigem Format (z. B. Telefonnummern, unformatierte Kartennummern): hint = nur dezenter Hinweis beim Tippen, haelt das Senden nie an; warn = Dialog hoechstens mit Warnen; enforce = Regeln gelten wie fuer sichere Funde. Standard: hint.'],
  allowedSites: ['Erlaubte KI-Seiten', 'Welche der unterstuetzten KI-Seiten genutzt werden duerfen (chatgpt, claude, gemini, copilot, m365copilot = Microsoft 365 Copilot). Eingaben auf den anderen unterstuetzten Seiten werden gesperrt. Standard: alle.'],
  blockWhenInactive: ['Sperren, wenn Schutz inaktiv', 'Wird das Eingabefeld einer unterstuetzten Seite nicht erkannt (Seitenumbau), Senden und Einfuegen sperren. Standard: false.'],
  blockUncheckedFiles: ['Ungepruefte Dateien sperren', 'Dateien ausser PNG-, JPEG- und WebP-Bildern kann diese Version nicht pruefen (Bilder: siehe imageScan; bei true haben nicht pruefbare Bilder nur Abbrechen). Bei true werden Datei-Uploads, -Ablagen und eingefuegte Dateien auf den KI-Seiten gesperrt. Standard: false.'],
  answerCheck: ['KI-Antworten pruefen', 'off = KI-Antworten werden nicht geprueft; hint = die letzte Antwort auf den unterstuetzten KI-Seiten wird lokal mit Regeln und Katalog geprueft; heikle Daten (Schluessel, Personendaten ...) werden dezent unterstrichen und in einer Hinweis-Leiste genannt (nur Typ und Anzahl, vor und nach dem Kopieren). Kopieren wird nie gesperrt, nichts wird gesendet, gespeichert oder gezaehlt. Ein ungueltiger Wert gilt als hint. Standard: hint.'],
  sensitiveSources: ['Vertrauliche Quellen (Zwischenablage)', 'Hostnamen vertraulicher Quellen, z. B. bank.example.com oder *.hr.example.com (nur https, ohne Pfad und Port, hoechstens ein fuehrendes *., mindestens zwei Teile, keine KI-Seiten, keine IP-Adressen). Dort kopierter Text erhaelt ein fluechtiges Merkmal (nur gesalzene Pruefsumme, 30 Minuten, nur im Arbeitsspeicher des Browsers, kein Inhalt). Wird derselbe Text in eine KI-Seite eingefuegt, erscheint eine deutliche Warnung (siehe Einfuegen aus vertraulichen Quellen). Benutzer muessen den Zugriff auf diese Seiten einmal in den Einstellungen der Erweiterung erlauben (optionale Host-Rechte; verwaltete Installationen erhalten sie nicht vorab). Per Richtlinie gesetzt, koennen Benutzer keine Quellen ergaenzen oder entfernen. Max. 100 Eintraege. Standard: leer.'],
  sensitiveSourceAction: ['Einfuegen aus vertraulichen Quellen', 'warn = deutliche Warnung, Benutzer koennen verwerfen oder trotzdem einfuegen (nur mit allowUserOverride); block = Einfuegen in KI-Seiten wird gestoppt. Ein ungueltiger Wert in der Richtlinie gilt als block. Standard: warn.'],
  hiddenInstructionScan: ['Versteckte Anweisungen pruefen', 'Bei true werden eingefuegter Text (auch HTML) und hochgeladene Textdokumente (.txt, .md, .csv, .tsv, .json, .xml, .html, .log, hoechstens 2 MB) auf den KI-Seiten lokal auf Hinweise auf versteckte Anweisungen geprueft: unsichtbare Zeichen (Zero-Width, Bidi-Steuerzeichen, Unicode-Tag-Zeichen; Emoji-, Flaggen-, RTL- und indische Schriften sowie BOM ausgenommen), versteckter Text in eingefuegtem HTML und typische Umgehungssaetze in 6 Sprachen. Nur Heuristik, nicht jede Manipulation wird gefunden. Die Meldung nennt Art und Anzahl, nie Ausschnitte; nichts wird gespeichert. Standard: true.'],
  hiddenInstructionAction: ['Aktion bei versteckten Anweisungen', 'warn = Meldung, Benutzer koennen verwerfen oder fortfahren (nur mit allowUserOverride); block = Einfuegen bzw. Hochladen wird gestoppt. Text oder Dokumente ueber den Grenzen (2 MB, Zeitbudget) gelten als Fund. Ungueltiger Wert in der Richtlinie gilt als block. Standard: warn.'],
  voiceMode: ['Sprachmodus auf KI-Seiten', 'Im Sprachmodus (ChatGPT Voice, Gemini Live, Copilot-Sprache, Claude-Sprachmodus) geht Gesprochenes ohne Text im Eingabefeld direkt an die KI und kann nicht geprueft werden. Diktat ins Eingabefeld wird unabhaengig davon wie getippter Text geprueft. allow = keine Meldung; warn = Meldung beim Druck auf den Sprachmodus-Knopf, Benutzer koennen ihn einmal je Seitenaufruf trotzdem starten (nur mit allowUserOverride, sonst wie block); block = der Knopf wird gestoppt. Erkannt ueber feste Selektoren je Seite: nach Seitenumbauten geaenderte Knoepfe, Tastenkuerzel sowie Desktop- und Handy-Apps sind nicht abgedeckt (docs/sprache-und-diktat.md). Ungueltiger Wert gilt als block. Standard: warn.'],
  documentFingerprints: ['Fingerabdruecke von Firmendokumenten', 'Erkennt, wenn groessere Teile vertraulicher Firmendokumente auf KI-Seiten eingefuegt, gesendet oder als Textdokument hochgeladen werden. Erzeugen mit scripts/dokumente-fingerabdruck.mjs aus den Dokumenten (lokal, ohne Netz): nur gesalzene, auf 32 Bit gekuerzte Werte von SHA-256(Salz + Zeilenumbruch + 8 normalisierte Woerter), ausgeduennt, sortiert, Base64; kein Klartext, keine Dateinamen, keine Reihenfolge. Salz und Werte sind fuer lokale Benutzer lesbar: ein vermuteter Text laesst sich bestaetigen, darum keine Dokumente aufnehmen, deren Wortlaut selbst geheim ist. Kein DLP-Ersatz: Umformulieren, Uebersetzen oder Bilder umgehen es. Ein ungueltiges Feld verwirft die ganze Richtlinie. Die Meldung nennt nur die Art, nie Dokument oder Abschnitt. Hoechstens 100000 Werte (Weg ueber GPO/Intune geprueft bis 50000).'],
  'documentFingerprints.salt': ['Salz', 'Genau 64 Hex-Zeichen (32 Zufallsbytes). Ein neues Salz macht alle Werte ungueltig.'],
  'documentFingerprints.shingle': ['Woerter je Fingerabdruck', '5-16, Standard 8. Muss zum Werkzeug passen.'],
  'documentFingerprints.sample': ['Ausduennung', '1-64, Standard 4: nur durch diese Zahl teilbare Werte bleiben. Muss zum Werkzeug passen.'],
  'documentFingerprints.minMatches': ['Mindestzahl Treffer', '2-50, Standard 4: verschiedene getroffene Werte, ab denen ein Text als Teil eines Firmendokuments gilt (mit den Standardwerten etwa 30-40 Woerter am Stueck).'],
  'documentFingerprints.action': ['Aktion', 'warn (Standard) = Meldung, weiter nur mit allowUserOverride; block = Einfuegen, Senden oder Hochladen wird gestoppt.'],
  'documentFingerprints.data': ['Fingerabdruck-Daten', 'Base64-Stuecke aus dem Werkzeug (je hoechstens 8192 Zeichen, hoechstens 200 Stuecke), in der ausgegebenen Reihenfolge.'],
  copySidebarHint: ['Hinweis beim Kopieren (KI-Seitenleisten)', 'Bei true erscheint beim Kopieren von Text mit sensiblen Daten auf einer beliebigen https-Seite ein dezenter Hinweis, dass KI-Seitenleisten und KI-Erweiterungen (z. B. Copilot in Edge, Gemini in Chrome, Claude in Chrome) nicht geprueft werden. Wirkt erst, wenn der Benutzer in den Einstellungen den optionalen Zugriff auf alle https-Seiten erteilt hat; eine Richtlinie kann diesen Zugriff nicht erteilen. Der markierte Text wird lokal geprueft und verworfen, nichts wird gespeichert oder gesendet. Nicht abgedeckt: http-Seiten, iframes, Kopieren in anderen Programmen. Bei false wird der Zugriff zurueckgegeben. Standard: true.'],
  formGuardSites: ['Formularwache: Seiten', 'Hostnamen der Seiten, deren Formulare beim Absenden geprueft werden, z. B. portal.example.com oder *.hr.example.com (nur https, kein Pfad/Port, hoechstens ein fuehrendes *., mindestens zwei Labels, keine KI-Seiten, keine IP-Adressen). Geprueft werden Textfelder, Textbereiche und bearbeitbare Bereiche des Formulars (nicht Passwort-, Datei- oder versteckte Felder) lokal mit derselben Erkennung wie auf den KI-Seiten, egal ob ein Mensch oder ein KI-Agent sie ausgefuellt hat. Bei Fund wird das Absenden gestoppt und ein eigenes Fenster der Erweiterung fragt Nicht senden / Senden einmal erlauben (nur mit allowUserOverride). Nicht abgedeckt: Seiten, die Daten per Skript statt per Formular senden, form.submit(), versteckte Felder. Benutzer muessen den Zugriff einmal in den Einstellungen erlauben. Per Richtlinie gesetzt koennen Benutzer keine Seiten aendern. Hoechstens 20 Eintraege. Standard: leer.'],
  aiSiteMode: ['KI-Seiten-Kontrolle', 'Bekannte KI-Seiten (siehe docs/ki-seiten-liste.md), die nicht in den freigegebenen KI-Seiten stehen: off = keine Kontrolle; hint = Hinweis-Leiste mit Text und Link aus dem Branding; block = die Seite wird durch eine Sperrseite ersetzt. Die Sperrseite ist nur eine Ueberlagerung; fuer eine harte Sperre zusaetzlich die Browser-Richtlinie URLBlocklist nutzen. Ausserhalb der unterstuetzten KI-Seiten muessen Benutzer den Zugriff einmal in den Einstellungen der Erweiterung erlauben (optionale Host-Rechte). Ist irgendein KI-Seiten-Feld per Richtlinie gesetzt, gelten lokale Einstellungen dazu nicht. Standard: off.'],
  allowedAiSites: ['Freigegebene KI-Seiten', 'IDs freigegebener KI-Seiten aus der Liste (z. B. m365copilot, chatgpt). Dort weder Hinweis noch Sperre. Unbekannte IDs werden ignoriert. Max. 500 Eintraege.'],
  blockedAiSites: ['Gesperrte KI-Seiten', 'IDs von KI-Seiten, die immer gesperrt sind, solange aiSiteMode nicht off ist, auch im Hinweis-Modus. Hat Vorrang vor den freigegebenen KI-Seiten. Unbekannte IDs werden ignoriert. Max. 500 Eintraege.'],
  suggestedAiSite: ['Vorgeschlagene freigegebene KI', 'ID der freigegebenen KI-Seite, auf die Benutzer gelenkt werden, z. B. m365copilot. Gilt als freigegeben. Auf nicht freigegebenen KI-Seiten (KI-Seiten-Kontrolle hint = warnen oder block = sperren) zeigt der Hinweis bzw. die Sperrseite einen Knopf "Zu <Name> wechseln", der nur auf Klick die Startseite dieser KI aus der eingebauten Liste oeffnet. Link KI-Seiten-Hinweis aus dem Branding hat Vorrang. Unbekannte IDs und IDs in den gesperrten KI-Seiten werden ignoriert. Wirkt nur als Richtlinie; ohne Richtlinie keine Funktion. Gueltige IDs: ' + AI_IDS + '.'],
  accountRules: ['Regeln je Konto', 'Unterschiedliche Regeln fuer Firmen- und Privatkonten derselben KI-Seite, erkannt nur aus sichtbaren Seitensignalen (Workspace-Name oder Kennzeichen im Kontobereich, Host). Je Seite: Workspace-Namen, Kennzeichen, Stufe fuer Firmenkonto, Privatkonto und nicht erkanntes Konto (normal, allow, hint, block). Nicht erkannt = strengste Stufe. Ungueltige Seiteneintraege fallen auf normal zurueck. Seite oder Benutzer koennen den Kontobereich faelschen: hint statt allow, Workspace-Namen statt Kennzeichen bevorzugen. Ist irgendeine Richtlinie gesetzt, gelten lokale Konto-Regeln nicht. Siehe docs/konto-regeln.md.'],
  'accountRules.chatgpt.workspaces': ['ChatGPT: Workspace-Namen', 'Namen des Firmen-Arbeitsbereichs, wie sie im Kontobereich der Seite stehen (ganzer Name, max. 20, je 1-80 Zeichen).'],
  'accountRules.chatgpt.markers': ['ChatGPT: Kennzeichen', 'Optionale sichtbare Kennzeichen fuer Firmenkonto: plan (plan/shield hoechstens hint).'],
  'accountRules.chatgpt.business': ['ChatGPT: Firmenkonto', 'Stufe fuer erkanntes Firmenkonto: normal, allow (nur mit Workspace-Namen oder host), hint, block.'],
  'accountRules.chatgpt.personal': ['ChatGPT: Privatkonto', 'Stufe fuer Privatkonto: normal, hint oder block.'],
  'accountRules.chatgpt.unknown': ['ChatGPT: Konto nicht erkannt', 'Stufe ohne sichtbaren Kontobereich; es gilt die strengste der drei Stufen.'],
  'accountRules.claude.workspaces': ['Claude: Workspace-Namen', 'Namen des Firmen-Arbeitsbereichs, wie sie im Kontobereich der Seite stehen (ganzer Name, max. 20, je 1-80 Zeichen).'],
  'accountRules.claude.markers': ['Claude: Kennzeichen', 'Optionale sichtbare Kennzeichen fuer Firmenkonto: plan (plan/shield hoechstens hint).'],
  'accountRules.claude.business': ['Claude: Firmenkonto', 'Stufe fuer erkanntes Firmenkonto: normal, allow (nur mit Workspace-Namen oder host), hint, block.'],
  'accountRules.claude.personal': ['Claude: Privatkonto', 'Stufe fuer Privatkonto: normal, hint oder block.'],
  'accountRules.claude.unknown': ['Claude: Konto nicht erkannt', 'Stufe ohne sichtbaren Kontobereich; es gilt die strengste der drei Stufen.'],
  'accountRules.copilot.workspaces': ['Microsoft Copilot (copilot.com): Workspace-Namen', 'Namen des Firmen-Arbeitsbereichs, wie sie im Kontobereich der Seite stehen (ganzer Name, max. 20, je 1-80 Zeichen).'],
  'accountRules.copilot.markers': ['Microsoft Copilot (copilot.com): Kennzeichen', 'Optionale sichtbare Kennzeichen fuer Firmenkonto: shield (plan/shield hoechstens hint).'],
  'accountRules.copilot.business': ['Microsoft Copilot (copilot.com): Firmenkonto', 'Stufe fuer erkanntes Firmenkonto: normal, allow (nur mit Workspace-Namen oder host), hint, block.'],
  'accountRules.copilot.personal': ['Microsoft Copilot (copilot.com): Privatkonto', 'Stufe fuer Privatkonto: normal, hint oder block.'],
  'accountRules.copilot.unknown': ['Microsoft Copilot (copilot.com): Konto nicht erkannt', 'Stufe ohne sichtbaren Kontobereich; es gilt die strengste der drei Stufen.'],
  'accountRules.m365copilot.workspaces': ['Microsoft 365 Copilot: Workspace-Namen', 'Namen des Firmen-Arbeitsbereichs, wie sie im Kontobereich der Seite stehen (ganzer Name, max. 20, je 1-80 Zeichen).'],
  'accountRules.m365copilot.markers': ['Microsoft 365 Copilot: Kennzeichen', 'Optionale sichtbare Kennzeichen fuer Firmenkonto: host, shield (plan/shield hoechstens hint).'],
  'accountRules.m365copilot.business': ['Microsoft 365 Copilot: Firmenkonto', 'Stufe fuer erkanntes Firmenkonto: normal, allow (nur mit Workspace-Namen oder host), hint, block.'],
  'accountRules.m365copilot.personal': ['Microsoft 365 Copilot: Privatkonto', 'Stufe fuer Privatkonto: normal, hint oder block.'],
  'accountRules.m365copilot.unknown': ['Microsoft 365 Copilot: Konto nicht erkannt', 'Stufe ohne sichtbaren Kontobereich; es gilt die strengste der drei Stufen.'],
  dictionary: ['Firmen-Woerterbuch', 'Firmenbegriffe als SHA-256-Pruefsummen: Hex(SHA-256(Salz + normalisierter Begriff)). Schuetzt nur vor beilaeufigem Lesen.'],
  'dictionary.salt': ['Salz', 'Firmeneigenes Salz (max. 128 Zeichen).'],
  'dictionary.hashes': ['Pruefsummen', 'Bis zu 20000 SHA-256-Hexwerte.'],
  customTerms: ['Eigene Begriffe', 'Eigene Begriffe (Kundennamen, Projekt-Codenamen, interne Domains, Kuerzel) nur als gesalzene SHA-256-Pruefsummen, nie im Klartext: Hex(SHA-256(Salz + normalisierter Begriff)). Erzeugen mit scripts/begriffe-hashen.mjs. Normalisierung: Kleinbuchstaben, Umlaute als ae/oe/ue/ss, Akzente entfernt; Leerzeichen, Bindestriche, Punkte und andere Trennzeichen trennen Woerter; 1-5 Woerter, nur ganze Woerter. Das Salz ist fuer Benutzer lesbar: schuetzt nur vor beilaeufigem Lesen. Datentyp custom_term (Regeln).'],
  'customTerms.salt': ['Salz', 'Genau 64 Hex-Zeichen (32 Zufallsbytes), eines je Organisation. Ein neues Salz macht alle Pruefsummen ungueltig.'],
  'customTerms.hashes': ['Pruefsummen', 'Bis zu 20000 SHA-256-Hexwerte.'],
  massListMin: ['Schwelle Kundenliste', 'Mindestzahl verschiedener Eintraege (Mailadressen, Telefonnummern, IBANs oder Zeilen einer Tabelle mit Vor-/Nachname-Spalte), ab der ein Text als Kundenliste/Export gilt (Datentyp mass_list, Paket context). Gleiche Werte zaehlen einmal. Erlaubt 3-1000, Standard 10; Werte ausserhalb bleiben beim Standard.'],
  identityMinParts: ['Identitaet: noetige Teile', 'Ab wie vielen Teilen Name + Geburtsdatum als Identitaet gelten (Datentyp identity_combo, Paket context): 2 = Name und Geburtsdatum, 3 = dazu Adresse, Telefon, Mail oder Ausweisnummer (Standard), 4 = dazu zwei davon. Erlaubt 2-4; Werte ausserhalb bleiben beim Standard.'],
  tableScan: ['Tabellen-Erkennung', 'Bei true (Standard) gelten eingefuegte oder hochgeladene Tabellen (TSV/CSV, Markdown, HTML, JSON, XLSX) mit vielen Personenzeilen als Massenleck, auch ohne einzelne Nummern (Spaltenkoepfe und Wertformen; Datentypen mass_list und mass_table).'],
  tableMinRows: ['Tabellen: Mindestzahl Zeilen', 'Ab so vielen Datenzeilen gilt eine Tabelle mit Personendaten als Massenleck. Erlaubt 3-1000, Standard 10; Werte ausserhalb bleiben beim Standard.'],
  tableMinColumns: ['Tabellen: Mindestzahl heikler Spalten', 'So viele heikle Spalten (Name, E-Mail, Telefon, Geburtsdatum, Adresse, Lohn, Diagnose ...) braucht eine Tabelle, mindestens eine davon identifizierend. Erlaubt 1-10, Standard 2.'],
  tableRedaction: ['Tabellen: Schwaerzen', 'columns (Standard) = nur die Zellen der heiklen Spalten ersetzen; rows = zusaetzlich nach Kopf und 3 Zeilen kuerzen (auch dort heikle Zellen geschwaerzt).'],
  deobfuscation: ['Verschleierte Daten erkennen', 'Bei true (Standard) prueft die Erweiterung auch Varianten des Textes: unsichtbare Zeichen, Vollbreite/Doppelgaenger, Trennzeichen zwischen Ziffern, ausgeschriebene Ziffern, rueckwaerts, Base64/Hex/URL-Kodierung sowie ueber mehrere Nachrichten verteilte Teile (nur fluechtig im Speicher).'],
  allowRephrase: ['Sicher umformulieren erlauben', 'Bei true (Standard) bietet die Meldung den Knopf "Sicher umformulieren": heikle Details werden lokal durch allgemeine Beschreibungen ersetzt, die Frage bleibt gleich; Vorschau im Eingabefeld, Rueckgaengig moeglich.'],
  competenceHideSensitive: ['KI-Kompetenz-Nachweis: sensible Gruppen immer ausblenden', 'Bei true zeigt der Nachweis die Gruppen Gesundheit, Personendaten und nationale ID nie (Benutzer koennen sie nicht einblenden). Zahlen je Person zu Gesundheit oder Gesinnung koennten sonst eine Mitarbeiterueberwachung ermoeglichen. Standard: false (Benutzer entscheiden).'],
  customPatterns: ['Eigene Erkennungsmuster', 'Eigene regulaere Ausdruecke der Organisation, gemeldet als Datentyp "Eigenes Muster (Organisation)" (das Muster selbst wird nie angezeigt). Nur per Richtlinie. Max. 50 Eintraege, je Zeile ein JSON-Objekt: id (org_ + 2-40 Zeichen a-z 0-9 _), regex (JavaScript, max. 300 Zeichen, nur begrenzte Quantoren {n,m} bis 64, kein * + {n,}, keine Rueckverweise/Lookarounds, Trefferlaenge 3-256), flags ("" oder "i"), category (Standard firma), context (max. 20 Woerter), requireContext (true/false), action (warn, redact, block; Standard warn). Ein ungueltiger Eintrag verwirft die ganze Liste. Siehe docs/muster-mitmachen.md.'],
  labelNames: ['Eigene Label-Namen', 'Namen der eigenen Vertraulichkeitsbezeichnungen (z. B. Microsoft-Purview-Labels), die als Text in kopierten Dokumenten stehen; gemeldet als Datentyp conf_label (Paket marker). Hier gehoeren nur Label-Namen hinein, nie Kunden- oder Projektnamen - dafuer customTerms (Pruefsummen). Klartext, nur per Richtlinie (Benutzer koennen es nicht setzen), wird nirgends angezeigt. Vergleich ohne Gross/Klein, nur ganze Woerter. Eingebaute Vermerke (Vertraulich, Streng vertraulich, Intern, Confidential ...) brauchen keinen Eintrag. Max. 50 Namen mit 2-64 Zeichen (Buchstaben, Ziffern, Leerzeichen . - _ ( ) & \\ /); ein ungueltiger Eintrag verwirft die ganze Liste.'],
  complianceReport: ['Nachweis-Bericht', 'Bei true (Standard) kann jede Person einen lokalen Bericht nur mit Zahlen oeffnen (Treffer nach Datentyp, KI-Seite und Aktion, aktive Regeln) samt Zuordnung zu Gesetzen und Normen, ihn drucken oder als HTML-Datei herunterladen. Die Erweiterung legt nie selbst Dateien ab. Exportierte Dateien nur mit eigenen Werkzeugen einsammeln, mit scripts/bericht-sammeln.mjs zusammenzaehlen, die einzelnen Dateien danach loeschen, die Zahlen nur als Nachweis verwenden (nicht zur Leistungs- oder Verhaltenskontrolle, Art. 26 ArGV 3) und die Mitarbeitenden vorher informieren (Art. 19 revDSG) und anhoeren (Art. 48 ArG). Bei false zeigt die Berichtsseite nur einen Hinweis.'],
  complianceFrameworks: ['Nachweis-Bericht: Vorlagen', 'Zuordnungen im Bericht, fuer Benutzer fest: revdsg (Schweiz revDSG), dsgvo (EU-DSGVO), hipaa (USA HIPAA), euaiact (EU AI Act Art. 4), iso27001 (ISO/IEC 27001:2022 Anhang A). Ein unbekannter Wert verwirft die Liste (Standard: alle).'],
  trainingAmpel: ['Training-Ampel', 'Bei true (Standard) zeigt das Symbol der Erweiterung auf bekannten KI-Seiten, ob Eingaben standardmaessig zum Training der Modelle genutzt werden (gruen = nein, gelb = teils oder unklar, rot = ja), mit der Kontoart aus accountRules; das Popup erklaert es und fuehrt zur Opt-out-Einstellung des Anbieters. Die Angaben sind mitgeliefert (Herstellerquelle und Stand je Seite), es wird nichts nachgeladen. Bei false keine Ampel und kein Abschnitt im Popup.'],
  complianceReportDays: ['Nachweis-Bericht: Zeitraum in Tagen', 'Zeitraum des Berichts, fuer Benutzer fest: 7, 30 oder 90 Tage. Andere Werte bleiben beim Standard 30.'],
  reportingUrl: ['Berichts-URL (reserviert)', 'Reserviert fuer einen spaeteren Berichts-Endpunkt (z. B. CIPP). Diese Version nutzt den Wert nicht und hat keinen Netzwerkzugriff.'],
};

export const BROWSERS = [
  { id: 'chrome', ns: 'Dlx.Policies.Chrome', prefix: 'dlxchrome', reg: 'Software\\Policies\\Google\\Chrome\\3rdparty\\extensions', label: 'Google Chrome' },
  { id: 'edge', ns: 'Dlx.Policies.Edge', prefix: 'dlxedge', reg: 'Software\\Policies\\Microsoft\\Edge\\3rdparty\\extensions', label: 'Microsoft Edge' },
];

// Wandelt das Schema in Richtlinien mit Elementen um. ADMX-Namen und -ids nur aus
// Schema-Schluesseln nach festem Muster (Design-Review Mandanten, Auflage 8).
// Vorgabe im GPO-Dialog fuer Ganzzahlen = Standard aus extension/common/policy.js defaults()
// (Test tests/kontext-richtlinie.test.mjs vergleicht beide; Auflage Pflicht-Pruefung 14.10.2026).
export const DECIMAL_DEFAULT = { massListMin: 10, identityMinParts: 3, complianceReportDays: 30, tableMinRows: 10, tableMinColumns: 2 };
// Verschachtelte Ganzzahlen (documentFingerprints): Standard aus extension/engine/fingerabdruck.js DEFAULTS
// (Test tests/fingerabdruck.test.mjs vergleicht beide).
export const NESTED_DECIMAL_DEFAULT = { 'documentFingerprints.shingle': 8, 'documentFingerprints.sample': 4, 'documentFingerprints.minMatches': 4 };

export function policiesFrom(schema) {
  const out = [];
  for (const [name, s] of Object.entries(schema.properties)) {
    const p = { name, title: s.title, desc: s.description + (name === 'suggestedAiSite' ? ' Valid IDs: ' + AI_IDS + '.' : ''), elements: [] };
    if (s.type === 'boolean') p.boolean = true;
    else if (s.type === 'string' && s.enum) p.elements.push({ kind: 'enum', id: name, sub: '', valueName: name, values: s.enum, label: s.title });
    else if (s.type === 'string') p.elements.push({ kind: 'text', id: name, sub: '', valueName: name, label: s.title });
    else if (s.type === 'integer' && !Number.isInteger(DECIMAL_DEFAULT[name])) throw new Error('missing default for ' + name);
    else if (s.type === 'integer') p.elements.push({ kind: 'decimal', id: name, sub: '', valueName: name, label: s.title, min: s.minimum, max: s.maximum, def: DECIMAL_DEFAULT[name] });
    else if (s.type === 'array') p.elements.push({ kind: 'list', id: name, sub: '\\' + name, label: s.title });
    else if (s.type === 'object' && s.patternProperties) p.elements.push({ kind: 'list', id: name, sub: '\\' + name, explicit: true, label: s.title });
    else if (s.type === 'object') {
      for (const [k, ks] of Object.entries(s.properties)) {
        // Verschachtelt (accountRules: je Seite ein Unterschluessel mit Feldern).
        if (ks.type === 'object') {
          for (const [kk, kks] of Object.entries(ks.properties)) {
            const id = `${name}_${k}_${kk}`, key = `${name}.${k}.${kk}`;
            if (kks.type === 'array') p.elements.push({ kind: 'list', id, sub: `\\${name}\\${k}\\${kk}`, label: kks.title, key });
            else if (kks.enum) p.elements.push({ kind: 'enum', id, sub: `\\${name}\\${k}`, valueName: kk, values: kks.enum, label: kks.title, key });
            else p.elements.push({ kind: 'text', id, sub: `\\${name}\\${k}`, valueName: kk, label: kks.title, key });
          }
          continue;
        }
        if (ks.type === 'array') p.elements.push({ kind: 'list', id: `${name}_${k}`, sub: `\\${name}\\${k}`, label: ks.title, key: `${name}.${k}` });
        else if (ks.type === 'integer') {
          const key = `${name}.${k}`;
          if (!Number.isInteger(NESTED_DECIMAL_DEFAULT[key])) throw new Error('missing default for ' + key);
          p.elements.push({ kind: 'decimal', id: `${name}_${k}`, sub: `\\${name}`, valueName: k, label: ks.title, min: ks.minimum, max: ks.maximum, def: NESTED_DECIMAL_DEFAULT[key], key });
        } else if (ks.enum) p.elements.push({ kind: 'enum', id: `${name}_${k}`, sub: `\\${name}`, valueName: k, values: ks.enum, label: ks.title, key: `${name}.${k}` });
        else p.elements.push({ kind: 'text', id: `${name}_${k}`, sub: `\\${name}`, valueName: k, label: ks.title, key: `${name}.${k}` });
      }
    } else throw new Error('unsupported schema type for ' + name);
    out.push(p);
  }
  for (const p of out) for (const n of [p.name, ...p.elements.map((e) => e.id)]) if (!/^[A-Za-z0-9_]+$/.test(n)) throw new Error('invalid ADMX name: ' + n);
  return out;
}

function admx(b, id, policies) {
  const key = `${b.reg}\\${id}\\policy`;
  const L = [];
  L.push('<?xml version="1.0" encoding="utf-8"?>');
  L.push('<policyDefinitions xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" revision="1.0" schemaVersion="1.0" xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions">');
  L.push(`  <policyNamespaces>\n    <target prefix="${b.prefix}" namespace="${b.ns}" />\n  </policyNamespaces>`);
  L.push('  <resources minRequiredRevision="1.0" />');
  L.push('  <supportedOn>\n    <definitions>\n      <definition name="SUPPORTED_MV3" displayName="$(string.SUPPORTED_MV3)" />\n    </definitions>\n  </supportedOn>');
  L.push(`  <categories>\n    <category name="dlx_root" displayName="$(string.cat_root)" />\n  </categories>`);
  L.push('  <policies>');
  for (const p of policies) {
    const pres = p.elements.length ? ` presentation="$(presentation.${p.name})"` : '';
    const vn = p.boolean ? ` valueName="${esc(p.name)}"` : '';
    L.push(`    <policy name="${esc(p.name)}" class="Machine" displayName="$(string.${p.name})" explainText="$(string.${p.name}_help)"${pres} key="${esc(key)}"${vn}>`);
    L.push('      <parentCategory ref="dlx_root" />');
    L.push('      <supportedOn ref="SUPPORTED_MV3" />');
    if (p.boolean) {
      L.push('      <enabledValue>\n        <decimal value="1" />\n      </enabledValue>\n      <disabledValue>\n        <decimal value="0" />\n      </disabledValue>');
    } else {
      L.push('      <elements>');
      for (const e of p.elements) {
        const k = esc(key + e.sub);
        if (e.kind === 'text') L.push(`        <text id="${e.id}" key="${k}" valueName="${esc(e.valueName)}" maxLength="150000" />`);
        else if (e.kind === 'decimal') L.push(`        <decimal id="${e.id}" key="${k}" valueName="${esc(e.valueName)}" minValue="${e.min}" maxValue="${e.max}" required="true" />`);
        else if (e.kind === 'list') L.push(`        <list id="${e.id}" key="${k}"${e.explicit ? ' explicitValue="true"' : ' valuePrefix=""'} />`);
        else if (e.kind === 'enum') {
          L.push(`        <enum id="${e.id}" key="${k}" valueName="${esc(e.valueName)}" required="true">`);
          for (const v of e.values) L.push(`          <item displayName="$(string.${e.id}_${v})">\n            <value>\n              <string>${esc(v)}</string>\n            </value>\n          </item>`);
          L.push('        </enum>');
        }
      }
      L.push('      </elements>');
    }
    L.push('    </policy>');
  }
  L.push('  </policies>');
  L.push('</policyDefinitions>');
  return L.join('\r\n') + '\r\n';
}

function adml(b, lang, policies, product) {
  const de = lang === 'de-DE';
  const S = [];
  const str = (id, v) => S.push(`      <string id="${id}">${esc(v)}</string>`);
  str('SUPPORTED_MV3', de ? `${b.label} mit Manifest-V3-Erweiterungen (ab Version 110)` : `${b.label} with Manifest V3 extensions (version 110 or later)`);
  str('cat_root', `${product} (${b.label})`);
  const P = [];
  for (const p of policies) {
    const [t, d] = de ? DE[p.name] : [p.title, p.desc];
    str(p.name, t);
    str(`${p.name}_help`, d);
    if (!p.elements.length) continue;
    P.push(`      <presentation id="${p.name}">`);
    for (const e of p.elements) {
      const label = esc(de && e.key ? DE[e.key][0] : de ? DE[p.name][0] : e.label);
      if (e.kind === 'text') P.push(`        <textBox refId="${e.id}">\n          <label>${label}</label>\n        </textBox>`);
      else if (e.kind === 'decimal') P.push(`        <decimalTextBox refId="${e.id}" defaultValue="${e.def}">${label}</decimalTextBox>`);
      else if (e.kind === 'list') P.push(`        <listBox refId="${e.id}">${label}</listBox>`);
      else if (e.kind === 'enum') {
        P.push(`        <dropdownList refId="${e.id}" noSort="true">${label}</dropdownList>`);
        for (const v of e.values) str(`${e.id}_${v}`, v);
      }
    }
    P.push('      </presentation>');
  }
  return ['<?xml version="1.0" encoding="utf-8"?>',
    '<policyDefinitionResources xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" revision="1.0" schemaVersion="1.0" xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions">',
    `  <displayName>${esc(product)}</displayName>`,
    `  <description>${esc(de ? 'Richtlinien der Browser-Erweiterung' : 'Browser extension policies')}</description>`,
    '  <resources>', '    <stringTable>', ...S, '    </stringTable>', '    <presentationTable>', ...P, '    </presentationTable>', '  </resources>',
    '</policyDefinitionResources>'].join('\r\n') + '\r\n';
}

// Liefert { relativer Pfad: Inhalt }.
export function build(idOverride) {
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  const id = idOverride || STORE_ID;
  if (!/^[a-p]{32}$/.test(id)) throw new Error('invalid extension id');
  const product = productName();
  const policies = policiesFrom(schema);
  for (const p of policies) {
    if (!DE[p.name]) throw new Error('missing German text: ' + p.name);
    for (const e of p.elements) if (e.key && !DE[e.key]) throw new Error('missing German text: ' + e.key);
  }
  const files = {};
  for (const b of BROWSERS) {
    files[`dlx-${b.id}.admx`] = admx(b, id, policies);
    files[`en-US/dlx-${b.id}.adml`] = adml(b, 'en-US', policies, product);
    files[`de-DE/dlx-${b.id}.adml`] = adml(b, 'de-DE', policies, product);
  }
  return { id, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--id');
  const { id, files } = build(i > 0 ? process.argv[i + 1] : undefined);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
    fs.writeFileSync(path.join(OUT, rel), content);
  }
  console.log(`ADMX/ADML geschrieben fuer Erweiterungs-ID ${id}`);
}
