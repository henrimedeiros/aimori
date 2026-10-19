# Datentypen

Automatisch erzeugt aus `extension/engine/*` mit `npm run build` – nicht von Hand ändern.

Standardaktion: Schutzklasse hoch/mittel → `warn`, tief → `off`. Änderbar je Datentyp per Richtlinie `rules` (`off`, `warn`, `redact`, `block`) bzw. in den Einstellungen, sofern nicht verwaltet. Das Firmen-Wörterbuch hat die ID `dictionary`, interne Links (SharePoint/OneDrive, Intranet, Hosts ohne öffentliche Endung, Richtlinie `internalDomains`) haben die ID `internal_link` (Standard `warn`, siehe [interne-links.md](interne-links.md)).

| ID | Datentyp | Paket | Kategorie | Schutzklasse | Prüfung | nur mit Kontextwort |
|---|---|---|---|---|---|---|
| `iban` | IBAN (Bankkonto) | finance | finanz | hoch | Länge je Land + ISO 7064 MOD 97-10 |  |
| `cc_visa` | Visa-Kartennummer | finance | finanz | hoch | IIN 4 + Länge + Luhn |  |
| `cc_mc` | Mastercard-Nummer | finance | finanz | hoch | IIN 51–55/2221–2720 + Luhn |  |
| `cc_amex` | American-Express-Nummer | finance | finanz | hoch | IIN 34/37 + Luhn |  |
| `cc_cvv` | Karten-Sicherheitscode (CVV/CVC) | finance | finanz | hoch | Schlüsselwort im Muster |  |
| `cc_disc` | Discover-Kartennummer | finance | finanz | hoch | IIN 6011/644–649/65 + Luhn | ja |
| `cc_diners` | Diners-Club-Kartennummer | finance | finanz | hoch | IIN 300–305/3095/36/38/39 + Luhn | ja |
| `cc_jcb` | JCB-Kartennummer | finance | finanz | hoch | IIN 3528–3589 + Luhn | ja |
| `cc_cup` | UnionPay-Kartennummer | finance | finanz | hoch | IIN 62 + Luhn | ja |
| `cc_maestro` | Maestro-Kartennummer | finance | finanz | hoch | IIN 5018/5020/5038/5893/6304/6759/6761–6763 + Luhn | ja |
| `bic` | BIC/SWIFT-Code | finance | finanz | tief | Format (Anbieter-Präfix/Struktur) | ja |
| `lei` | LEI | finance | firma | tief | ISO 7064 MOD 97-10 | ja (ausser mit Länderpräfix) |
| `duns` | DUNS-Nummer | finance | firma | tief | Format (Anbieter-Präfix/Struktur) | ja |
| `btc_legacy` | Bitcoin-Adresse (Legacy) | finance | finanz | mittel | Base58Check (doppeltes SHA-256) |  |
| `btc_bech32` | Bitcoin-Adresse (bech32) | finance | finanz | mittel | Bech32/Bech32m (BIP-173/350) |  |
| `eth_addr` | Ethereum-Adresse | finance | finanz | mittel | Format (EIP-55 ohne Keccak nicht geprüft) | ja |
| `email` | E-Mail-Adresse | contact | kontakt | mittel | Format (Anbieter-Präfix/Struktur) |  |
| `phone_e164` | Internationale Telefonnummer | contact | kontakt | mittel | 8–15 Ziffern |  |
| `birthdate` | Geburtsdatum | contact | kontakt | hoch | Schlüsselwort + gültiges Datum |  |
| `mrz_td3` | Maschinenlesbare Zone (Pass) | travel | reise | hoch | ICAO 7-3-1 (Dokument, Geburt, Ablauf, Gesamt) |  |
| `mrz_td1` | Maschinenlesbare Zone (Ausweis) | travel | reise | hoch | ICAO 7-3-1 (Dokumentnummer) |  |
| `aws_akid` | AWS-Zugriffsschlüssel-ID | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `aws_secret` | AWS-Geheimschlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `azure_storage` | Azure-Storage-/Cosmos-DB-Verbindungszeichenfolge | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `azure_sb` | Azure-Service-Bus-/Event-Hubs-Verbindung | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `azure_secret` | Entra-ID-Client-Geheimnis | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `azure_sas` | Azure-SAS-Signatur | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `gcp_apikey` | Google-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `gcp_sa` | Google-Dienstkonto-Schlüsseldatei | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `google_oauth` | Google-OAuth-Geheimnis | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `github_pat` | GitHub-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `github_fg` | GitHub-Token (fein granular) | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `gitlab_pat` | GitLab-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `slack_token` | Slack-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `slack_webhook` | Slack-Webhook-URL | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `teams_webhook` | Teams-/Logic-Apps-Webhook-URL | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `discord_webhook` | Discord-Webhook-URL | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `stripe_key` | Stripe-Geheimschlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `openai_key` | OpenAI-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `anthropic_key` | Anthropic-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `groq_key` | Groq-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `perplexity_key` | Perplexity-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `xai_key` | xAI-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `sendgrid` | SendGrid-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `mailchimp_key` | Mailchimp-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `mailgun_key` | Mailgun-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `brevo_key` | Brevo-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `pypi_token` | PyPI-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `docker_pat` | Docker-Hub-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `shopify_token` | Shopify-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `square_token` | Square-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `do_token` | DigitalOcean-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `atlassian_token` | Atlassian-API-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `databricks_token` | Databricks-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `linear_key` | Linear-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `notion_token` | Notion-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `postman_key` | Postman-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `grafana_token` | Grafana-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `newrelic_key` | New-Relic-API-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `sentry_token` | Sentry-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `telegram_bot` | Telegram-Bot-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `alibaba_key` | Alibaba-Cloud-Schlüssel-ID | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `age_key` | age-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `vault_token` | Vault-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `terraform_token` | Terraform-Cloud-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `doppler_token` | Doppler-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `pulumi_token` | Pulumi-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `cloudflare_ca` | Cloudflare-Origin-CA-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `mapbox_secret` | Mapbox-Geheimtoken | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `jwt` | JSON Web Token | secrets | technik | hoch | Kopf JSON mit alg, Nutzdaten JSON-Objekt |  |
| `pem_private` | Privater Schlüssel | secrets | technik | hoch | ganzer Block bis END (ohne END bis 12000 Zeichen) |  |
| `putty_key` | PuTTY-Schlüsseldatei | secrets | technik | hoch | ganze Datei bis Private-MAC (ohne bis 12000 Zeichen) |  |
| `conn_db` | Datenbank-Verbindung mit Passwort | secrets | technik | hoch | Passwort kein Platzhalter |  |
| `conn_jdbc` | JDBC-Verbindung mit Passwort | secrets | technik | hoch | Passwort kein Platzhalter |  |
| `conn_ado` | Verbindungszeichenfolge mit Passwort | secrets | technik | hoch | Passwort kein Platzhalter |  |
| `conn_redis` | Redis-Verbindung mit Passwort | secrets | technik | hoch | Passwort kein Platzhalter |  |
| `env_secret` | Geheimnis in .env-Datei | secrets | technik | hoch | Name mit Geheimnis-Wort + Wertprüfung wie cfg_password (ohne Pfade, URLs, Längen/Zeiten) |  |
| `cfg_password` | Passwort oder Geheimnis in Konfiguration | secrets | technik | hoch | ganzer Wert kein Platzhalter, ≥ 4 verschiedene Zeichen, ohne Anführungszeichen keine Code-Verweise |  |
| `basic_auth_url` | URL mit Zugangsdaten | secrets | technik | hoch | Passwort kein Platzhalter |  |
| `ipv4` | Öffentliche IPv4-Adresse | secrets | technik | mittel | nur öffentliche Adressen |  |
| `internal_host` | Interner Hostname oder interne Adresse | secrets | technik | mittel | Format (Anbieter-Präfix/Struktur) |  |
| `entropy_secret` | Zufällig wirkende Zeichenfolge im Code (möglicher Schlüssel) | secrets | technik | mittel | Format (Anbieter-Präfix/Struktur) + Entropie ≥ 3 Bit/Zeichen |  |
| `twilio` | Twilio-Schlüssel | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `hf_token` | Hugging-Face-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `npm_token` | npm-Token | secrets | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `ipv6` | Öffentliche IPv6-Adresse | secrets | technik | tief | nur globale Unicast-Adressen |  |
| `mac` | MAC-Adresse | secrets | technik | tief | EUI-48, einheitliches Trennzeichen |  |
| `hostname_int` | Interner Hostname / UNC-Pfad | secrets | technik | tief | Format (Anbieter-Präfix/Struktur) |  |
| `conf_marker` | Vertraulichkeits-Vermerk | marker | firma | mittel | Wendung überall; Einzelwort nur nach Schlüssel (z. B. Klassifizierung:), allein auf der Zeile oder in GROSSBUCHSTABEN |  |
| `conf_label` | Vertraulichkeitsbezeichnung (Purview oder eigener Label-Name) | marker | firma | mittel | Purview-Metadaten (nicht öffentlich/allgemein) + Richtlinie labelNames |  |
| `postal_address` | Postadresse | context | kontakt | mittel | Strasse + Hausnummer + PLZ + Ort; allein nur unsicher, sicher als Teil einer Identitäts-Kombi |  |
| `identity_combo` | Identität: Name + Geburtsdatum + Adresse/Telefon/Ausweis | context | person | hoch | abgeleitet: Name + Geburtsdatum + Adresse/Telefon/Mail/Ausweis im Umkreis (Richtlinie identityMinParts) |  |
| `art9_health` | Gesundheitsdaten zu einer Person (Diagnose, Medikament) | context | gesundheit | hoch | abgeleitet: Wortliste/ICD-10 nur mit Personenbezug im selben Absatz |  |
| `hr_record` | Personaldaten zu einer Person (Kündigung, Lohn, Beurteilung, Krankmeldung) | context | person | hoch | abgeleitet: Wortliste nur mit Personenbezug im selben Absatz |  |
| `art9_belief` | Religion, politische Ansicht oder Gewerkschaft einer Person | context | person | hoch | abgeleitet: Wortliste nur mit Personenbezug im selben Absatz |  |
| `mass_list` | Kundenliste/Export (viele Einträge) | context | person | hoch | abgeleitet: verschiedene Einträge ≥ Richtlinie massListMin (Standard 10) |  |
| `mass_table` | Tabellenspalte mit Personendaten | context | person | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `ch_ahv` | AHV-Nummer | CH | sozial | hoch | EAN-13 Modulo 10 |  |
| `ch_vvk` | Versichertenkarten-Nummer | CH | gesundheit | hoch | Luhn |  |
| `ch_uid` | Unternehmens-Identifikationsnummer (UID) | CH | firma | mittel | Mod 11 (Gewichte 5,4,3,2,7,6,5,4; BFS) |  |
| `ch_mwst` | MWST-Nummer | CH | firma | mittel | Mod 11 wie UID |  |
| `ch_tel` | Schweizer Telefonnummer | CH | kontakt | mittel | Länge (E.164) |  |
| `ch_pass` | Pass-/ID-Nummer (CH) | CH | reise | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `ch_esr` | QR-/ESR-Referenz (CH) | CH | finanz | tief | Mod 10 rekursiv (SIX) | ja |
| `de_idnr` | Steuer-Identifikationsnummer | DE | steuer | hoch | ISO 7064 MOD 11,10 + Ziffernregel | ja |
| `de_ust` | USt-IdNr. | DE | firma | mittel | ISO 7064 MOD 11,10 |  |
| `de_rvnr` | Sozialversicherungsnummer (DE) | DE | sozial | hoch | gewichtete Quersumme Mod 10 (DRV) |  |
| `de_kvnr` | Krankenversichertennummer | DE | gesundheit | hoch | Gewichte 1-2, Quersumme Mod 10 (§ 290 SGB V) | ja |
| `de_pa` | Ausweis-/Passnummer (DE) | DE | reise | hoch | ICAO 7-3-1 | ja |
| `de_stnr` | Steuernummer (DE) | DE | steuer | mittel | Format (Anbieter-Präfix/Struktur) | ja |
| `de_hrb` | Handelsregisternummer (DE) | DE | firma | tief | Format (Anbieter-Präfix/Struktur) |  |
| `at_svnr` | Sozialversicherungsnummer (AT) | AT | sozial | hoch | Mod 11 (Gewichte 3,7,9,0,5,8,4,2,1,6) | ja |
| `at_uid` | UID-Nummer (AT) | AT | firma | mittel | Luhn-Variante (6 − Rest) Mod 10 |  |
| `at_tin` | Steuernummer (AT) | AT | steuer | mittel | Luhn | ja |
| `fr_nir` | Sozialversicherungsnummer (FR) | FR | sozial | hoch | 97 − (Zahl mod 97), Korsika 2A/2B |  |
| `fr_tva` | USt-Nummer (FR) | FR | firma | mittel | (12 + 3 × (SIREN mod 97)) mod 97 |  |
| `fr_nif` | Steuernummer SPI (FR) | FR | steuer | hoch | letzte 3 = erste 10 mod 511 | ja |
| `fr_siren` | SIREN/SIRET (FR) | FR | firma | tief | Luhn | ja |
| `it_cf` | Codice fiscale (IT) | IT | steuer | hoch | Tabellen gerade/ungerade Stellen, Mod 26 |  |
| `it_iva` | Partita IVA (IT) | IT | firma | mittel | Luhn + Amtscode | ja (ausser mit Länderpräfix) |
| `be_nn` | Nationalregisternummer (BE) | BE | id-national | hoch | 97 − (Zahl mod 97), ab 2000 mit 2 davor |  |
| `be_vat` | USt-/Unternehmensnummer (BE) | BE | firma | mittel | 97 − (8 Ziffern mod 97) |  |
| `nl_bsn` | Bürgerservicenummer (NL) | NL | id-national | hoch | 11-Proef | ja |
| `nl_btw` | USt-Nummer (NL) | NL | firma | mittel | 11-Proef oder ISO 7064 MOD 97-10 |  |
| `us_ssn` | US-Sozialversicherungsnummer | US | sozial | hoch | nur Formatregeln | ja |
| `us_itin` | ITIN (US) | US | steuer | hoch | Gruppenregeln (IRS) | ja |
| `us_ein` | EIN (US) | US | firma | mittel | gültige IRS-Präfixe | ja |
| `us_aba` | Bankleitzahl ABA (US) | US | finanz | mittel | Gewichte 3,7,1 mod 10 + Präfix | ja |
| `us_mbi` | Medicare-Nummer MBI (US) | US | gesundheit | hoch | Zeichenregeln (CMS) | ja (ausser mit Länderpräfix) |
| `us_pass` | Passnummer (US) | US | reise | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `us_dl` | Führerscheinnummer (US) | US | reise | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `br_cpf` | CPF-Nummer (BR) | BR | steuer | hoch | Format (Anbieter-Präfix/Struktur) | ja (ausser mit Länderpräfix) |
| `br_cnpj` | CNPJ-Nummer (BR) | BR | firma | mittel | Format (Anbieter-Präfix/Struktur) | ja (ausser mit Länderpräfix) |
| `br_tel` | Brasilianische Telefonnummer | BR | kontakt | mittel | Format (Anbieter-Präfix/Struktur) |  |
| `br_cep` | Postleitzahl CEP (BR) | BR | kontakt | tief | Format (Anbieter-Präfix/Struktur) | ja |
| `br_cns` | Cartão Nacional de Saúde (BR) | BR | gesundheit | hoch | Gewichte 15..1 mod 11 | ja |
| `eu_vat_generic` | EU-USt-Nummer | EU | firma | mittel | Länder-Validator aller EU-Staaten, sonst Kontextwort |  |
| `ehic` | Europäische Krankenversicherungskarte (EKVK) | EU | gesundheit | hoch | Luhn | ja |
| `eu_dl` | Führerscheinnummer | EU | reise | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `li_peid` | Personenidentifikationsnummer (LI) | LI | id-national | mittel | Format (Anbieter-Präfix/Struktur) | ja |
| `es_dni` | DNI (ES) | ES | id-national | hoch | Mod 23 → Buchstabe |  |
| `es_nie` | NIE (ES) | ES | id-national | hoch | Mod 23 → Buchstabe (X/Y/Z = 0/1/2) |  |
| `es_cif` | CIF (ES) | ES | firma | mittel | Luhn → Ziffer oder Buchstabe | ja |
| `es_nss` | Sozialversicherungsnummer (ES) | ES | sozial | hoch | Mod 97 | ja |
| `es_vat` | USt-Nummer (ES) | ES | firma | mittel | DNI/NIE/CIF je nach Form |  |
| `pt_nif` | NIF (PT) | PT | steuer | hoch | Mod 11 (Gewichte 9..2) | ja |
| `pt_cc` | Cartão de Cidadão (PT) | PT | id-national | hoch | Luhn über A=10..Z=35 | ja |
| `pt_niss` | NISS (PT) | PT | sozial | hoch | Gewichte 29..2, 9 − Rest mod 10 | ja |
| `pt_vat` | USt-Nummer (PT) | PT | firma | mittel | Mod 11 wie NIF |  |
| `lu_matricule` | Matricule (LU) | LU | id-national | hoch | Datum + Luhn + Verhoeff | ja |
| `lu_tva` | USt-Nummer (LU) | LU | firma | mittel | erste 6 mod 89 |  |
| `se_pnr` | Personnummer (SE) | SE | id-national | hoch | Datum + Luhn | ja |
| `se_org` | Organisationsnummer (SE) | SE | firma | mittel | Luhn | ja |
| `se_vat` | USt-Nummer (SE) | SE | firma | mittel | Luhn + 01 |  |
| `dk_cpr` | CPR-Nummer (DK) | DK | id-national | hoch | nur Datum (Mod 11 seit 2007 nicht garantiert) | ja |
| `dk_cvr` | CVR-Nummer (DK) | DK | firma | mittel | Mod 11 (2,7,6,5,4,3,2,1) | ja |
| `dk_vat` | USt-Nummer (DK) | DK | firma | mittel | Mod 11 wie CVR |  |
| `no_fnr` | Fødselsnummer (NO) | NO | id-national | hoch | Datum + zwei Mod-11-Ziffern | ja |
| `no_orgnr` | Organisasjonsnummer (NO) | NO | firma | mittel | Mod 11 (3,2,7,6,5,4,3,2) | ja (ausser mit Länderpräfix) |
| `fi_hetu` | Henkilötunnus (FI) | FI | id-national | hoch | Datum + Mod 31 → Zeichen |  |
| `fi_alv` | Y-tunnus (FI) | FI | firma | mittel | Mod 11 (7,9,10,5,8,4,2) | ja |
| `fi_vat` | USt-Nummer (FI) | FI | firma | mittel | Mod 11 wie Y-tunnus |  |
| `is_kt` | Kennitala (IS) | IS | id-national | hoch | Datum + Mod 11 | ja |
| `ie_pps` | PPS-Nummer (IE) | IE | sozial | hoch | Mod 23 → Buchstabe | ja |
| `ie_vat` | USt-Nummer (IE) | IE | firma | mittel | Mod 23 (neues und altes Format) |  |
| `gb_nino` | National Insurance Number (UK) | GB | sozial | hoch | Präfixregeln (HMRC) | ja (ausser mit Länderpräfix) |
| `gb_nhs` | NHS-Nummer (UK) | GB | gesundheit | hoch | Mod 11 (10..2) | ja |
| `gb_utr` | Steuerreferenz UTR (UK) | GB | steuer | hoch | Mod 11, Prüfziffer vorne | ja |
| `gb_vat` | USt-Nummer (UK) | GB | firma | mittel | Mod 97 bzw. 9755 |  |
| `gb_crn` | Company Number (UK) | GB | firma | tief | Format (Anbieter-Präfix/Struktur) | ja |
| `gb_sort` | Sortcode + Kontonummer (UK) | GB | finanz | tief | nur Format (Vocalink-Tabellen lizenziert) |  |
| `gb_dl` | Führerscheinnummer (UK) | GB | reise | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `gb_pass` | Passnummer (UK) | GB | reise | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `pl_pesel` | PESEL (PL) | PL | id-national | hoch | Datum + Gewichte 1,3,7,9 | ja |
| `pl_nip` | NIP (PL) | PL | steuer | mittel | Mod 11 (6,5,7,2,3,4,5,6,7) | ja |
| `pl_vat` | USt-Nummer (PL) | PL | firma | mittel | Mod 11 wie NIP |  |
| `pl_regon` | REGON (PL) | PL | firma | tief | Mod 11 (9/14 Stellen) | ja |
| `cz_rc` | Rodné číslo (CZ) | CZ | id-national | hoch | Datum + Mod 11 | ja |
| `cz_dic` | USt-Nummer DIČ (CZ) | CZ | firma | mittel | Mod 11 bzw. Rodné číslo |  |
| `sk_rc` | Rodné číslo (SK) | SK | id-national | hoch | Datum + Mod 11 | ja |
| `sk_dph` | USt-Nummer IČ DPH (SK) | SK | firma | mittel | Zahl mod 11 = 0 |  |
| `hu_tax` | Adóazonosító jel (HU) | HU | steuer | hoch | Mod 11 (1..9) | ja |
| `hu_taj` | TAJ-Nummer (HU) | HU | gesundheit | hoch | Gewichte 3,7 mod 10 | ja |
| `hu_vat` | USt-Nummer (HU) | HU | firma | mittel | Gewichte 9,7,3,1 mod 10 |  |
| `ro_cnp` | CNP (RO) | RO | id-national | hoch | Datum + Mod 11 (279146358279) | ja |
| `ro_cui` | CUI/CIF (RO) | RO | firma | mittel | Mod 11 (753217532) | ja |
| `ro_vat` | USt-Nummer (RO) | RO | firma | mittel | Mod 11 wie CUI |  |
| `bg_egn` | EGN (BG) | BG | id-national | hoch | Datum + Mod 11 | ja |
| `bg_vat` | USt-Nummer (BG) | BG | firma | mittel | Mod 11 (9 Stellen) bzw. EGN/Ausländer/Sonstige |  |
| `hr_oib` | OIB (HR) | HR | id-national | hoch | ISO 7064 MOD 11,10 | ja |
| `hr_vat` | USt-Nummer (HR) | HR | firma | mittel | ISO 7064 MOD 11,10 |  |
| `si_emso` | EMŠO (SI) | SI | id-national | hoch | Datum + Mod 11 | ja |
| `si_ddv` | USt-Nummer (SI) | SI | firma | mittel | Mod 11 (8..2) |  |
| `gr_amka` | AMKA (GR) | GR | sozial | hoch | Datum + Luhn | ja |
| `gr_afm` | AFM (GR) | GR | steuer | mittel | Gewichte 2^8..2 mod 11 | ja (ausser mit Länderpräfix) |
| `cy_vat` | USt-/Steuernummer (CY) | CY | firma | mittel | Tabelle + mod 26 → Buchstabe | ja (ausser mit Länderpräfix) |
| `mt_id` | ID-Karte (MT) | MT | id-national | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `mt_vat` | USt-Nummer (MT) | MT | firma | mittel | Mod 37 |  |
| `ee_ik` | Isikukood (EE) | EE | id-national | hoch | Datum + Mod 11 zweistufig | ja |
| `ee_kmkr` | USt-Nummer (EE) | EE | firma | mittel | Gewichte 3,7,1 mod 10 |  |
| `lt_ak` | Asmens kodas (LT) | LT | id-national | hoch | Datum + Mod 11 zweistufig | ja |
| `lt_pvm` | USt-Nummer (LT) | LT | firma | mittel | Mod 11 zweistufig |  |
| `lv_pk` | Personas kods (LV) | LV | id-national | hoch | Datum + Mod 11 (ab 2017 ohne Datum) | ja |
| `lv_pvn` | USt-Nummer (LV) | LV | firma | mittel | Mod 11 bzw. Personas kods |  |
| `ca_sin` | SIN (CA) | CA | sozial | hoch | Luhn | ja |
| `ca_bn` | Business Number (CA) | CA | firma | mittel | Luhn | ja |
| `ca_ohip` | Gesundheitskarte OHIP (CA) | CA | gesundheit | hoch | Luhn | ja |
| `mx_curp` | CURP (MX) | MX | id-national | hoch | Datum + Mod 10 (Gewichte 18..2) |  |
| `mx_rfc` | RFC (MX) | MX | steuer | hoch | Datum + Mod 11 (alte RFC nur mit Kontext) |  |
| `ar_dni` | DNI (AR) | AR | id-national | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `ar_cuit` | CUIT/CUIL (AR) | AR | steuer | hoch | Mod 11 (5,4,3,2,7,6,5,4,3,2) | ja (ausser mit Länderpräfix) |
| `cl_rut` | RUT/RUN (CL) | CL | id-national | hoch | Mod 11 (2..7), K = 10 | ja (ausser mit Länderpräfix) |
| `co_nit` | NIT (CO) | CO | steuer | mittel | Mod 11 (Primzahl-Gewichte) | ja |
| `co_cc` | Cédula (CO) | CO | id-national | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `in_aadhaar` | Aadhaar-Nummer (IN) | IN | id-national | hoch | Verhoeff | ja |
| `in_pan` | PAN (IN) | IN | steuer | hoch | Struktur (Inhaberart) |  |
| `in_gstin` | GSTIN (IN) | IN | firma | mittel | Luhn mod 36 |  |
| `cn_ric` | Personalausweisnummer (CN) | CN | id-national | hoch | Datum + ISO 7064 MOD 11-2 | ja |
| `cn_uscc` | Sozialkreditcode USCC (CN) | CN | firma | mittel | Mod 31 (GB 32100) | ja |
| `jp_mynum` | My Number (JP) | JP | id-national | hoch | Mod 11 | ja |
| `jp_cn` | Firmennummer (JP) | JP | firma | tief | Mod 9, Prüfziffer vorne | ja |
| `kr_rrn` | Resident Registration Number (KR) | KR | id-national | hoch | Datum (+ Mod 11, seit 2020 nicht garantiert) | ja (ausser mit Länderpräfix) |
| `kr_brn` | Geschäftsnummer (KR) | KR | firma | tief | Gewichte 1,3,7,1,3,7,1,3,5 mod 10 | ja |
| `sg_nric` | NRIC/FIN (SG) | SG | id-national | hoch | Gewichte 2..7 + Buchstabentabelle |  |
| `sg_uen` | UEN (SG) | SG | firma | tief | Gewichte + Buchstabentabelle | ja |
| `au_tfn` | Tax File Number (AU) | AU | steuer | hoch | Mod 11 | ja |
| `au_medicare` | Medicare-Nummer (AU) | AU | gesundheit | hoch | Gewichte 1,3,7,9 mod 10 | ja |
| `au_abn` | ABN (AU) | AU | firma | tief | Mod 89 | ja |
| `nz_ird` | IRD-Nummer (NZ) | NZ | steuer | hoch | Mod 11 zweistufig + Bereich | ja |
| `nz_nhi` | NHI-Nummer (NZ) | NZ | gesundheit | hoch | Mod 11 (altes Format) | ja |
| `za_id` | ID-Nummer (ZA) | ZA | id-national | hoch | Datum + Luhn | ja |
| `za_tin` | Steuernummer (ZA) | ZA | steuer | hoch | Luhn | ja |
| `tr_tckn` | T.C. Kimlik No (TR) | TR | id-national | hoch | zwei Prüfziffern (Summenregeln) | ja |
| `tr_vkn` | Vergi Kimlik No (TR) | TR | steuer | mittel | Mod 10 (GIB-Verfahren) | ja |
| `il_tz` | Teudat Zehut (IL) | IL | id-national | hoch | Luhn | ja |
| `ae_eid` | Emirates ID (AE) | AE | id-national | hoch | Luhn | ja (ausser mit Länderpräfix) |
| `sa_nid` | National ID / Iqama (SA) | SA | id-national | hoch | Luhn | ja |
| `ng_nin` | NIN (NG) | NG | id-national | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `ng_bvn` | BVN (NG) | NG | finanz | hoch | Format (Anbieter-Präfix/Struktur) | ja |
| `cm_tailscale_key` | Tailscale-Schlüssel | community | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `cm_figma_token` | Figma-Zugangstoken | community | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |
| `cm_rubygems_key` | RubyGems-API-Schlüssel | community | technik | hoch | Format (Anbieter-Präfix/Struktur) |  |

Summe: 242 Datentypen in 60 Paketen.

Welche Länderpakete aktiv sind, wählt die Erweiterung automatisch nach Zeitzone und Sprachregion (nur lokal, siehe `docs/einstellungen.md`); Richtlinie und Benutzer können das überschreiben. Quellen der Prüfverfahren: siehe `docs/datentypen-quellen.md`.

## Länderliste

| Paket | Land / Region | Datentypen |
|---|---|---|
| finance | weltweit: Finanzen | 16 |
| contact | weltweit: Kontakt | 3 |
| travel | weltweit: Reisedokumente | 2 |
| secrets | weltweit: Zugangsdaten und Technik | 67 |
| marker | weltweit: Vertraulichkeits-Vermerke | 2 |
| context | weltweit: Kontext-Risiken (Identität, Art. 9, Personal, Listen) | 7 |
| CH | Schweiz | 7 |
| DE | Deutschland | 7 |
| AT | Österreich | 3 |
| FR | Frankreich | 4 |
| IT | Italien | 2 |
| BE | Belgien | 2 |
| NL | Niederlande | 2 |
| US | Vereinigte Staaten | 7 |
| BR | Brasilien | 5 |
| EU | EU-weit | 3 |
| LI | Liechtenstein | 1 |
| ES | Spanien | 5 |
| PT | Portugal | 4 |
| LU | Luxemburg | 2 |
| SE | Schweden | 3 |
| DK | Dänemark | 3 |
| NO | Norwegen | 2 |
| FI | Finnland | 3 |
| IS | Island | 1 |
| IE | Irland | 2 |
| GB | Vereinigtes Königreich | 8 |
| PL | Polen | 4 |
| CZ | Tschechien | 2 |
| SK | Slowakei | 2 |
| HU | Ungarn | 3 |
| RO | Rumänien | 3 |
| BG | Bulgarien | 2 |
| HR | Kroatien | 2 |
| SI | Slowenien | 2 |
| GR | Griechenland | 2 |
| CY | Zypern | 1 |
| MT | Malta | 2 |
| EE | Estland | 2 |
| LT | Litauen | 2 |
| LV | Lettland | 2 |
| CA | Kanada | 3 |
| MX | Mexiko | 2 |
| AR | Argentinien | 2 |
| CL | Chile | 1 |
| CO | Kolumbien | 2 |
| IN | Indien | 3 |
| CN | China | 2 |
| JP | Japan | 2 |
| KR | Südkorea | 2 |
| SG | Singapur | 2 |
| AU | Australien | 3 |
| NZ | Neuseeland | 2 |
| ZA | Südafrika | 2 |
| TR | Türkei | 2 |
| IL | Israel | 1 |
| AE | Vereinigte Arabische Emirate | 1 |
| SA | Saudi-Arabien | 1 |
| NG | Nigeria | 2 |
| community | weltweit: Gemeinschafts-Muster (signierter Katalog, docs/muster-mitmachen.md) | 3 |

Nicht als eigener Datentyp umgesetzt (Katalog weltweit, Stand 14.10.2026): `it_vat` (abgedeckt durch `it_iva`), Seed-Phrasen (`crypto_seed`, braucht die BIP-39-Wortliste als gepinnte Datei, Folgeschritt), Namen werden nie allein gemeldet, nur als Teil von `identity_combo` bzw. als Personenbezug für `art9_health`, `hr_record`, `art9_belief` (Paket context, `docs/kontext-risiken.md`); Ethnie, Sexualleben, Biometrie, Strafdaten und Sozialhilfe sind noch nicht umgesetzt. Neue Kartenarten (Discover, Diners, JCB, UnionPay, Maestro) melden nur mit dem Markennamen in der Nähe, damit zufällige Zahlen nicht als Karte gelten.
