# AImori – Store-Beschreibung (IT, Entwurf)

Kurzbeschreibung (max. 132 Zeichen): Il guardiano dei suoi prompt per l’IA: controlla localmente i dati sensibili prima che arrivino ai siti di IA.

Beschreibung:

AImori è il guardiano dei suoi prompt per l’IA. L’estensione controlla ciò che lei scrive o incolla su ChatGPT, Claude, Gemini e Copilot alla ricerca di dati sensibili – prima dell’invio e direttamente sul suo dispositivo.

Cosa fa AImori
• Ferma l’invio quando trova dati sensibili e spiega perché un valore è delicato.
• Lei decide: oscurare, usare segnaposto, annullare o inviare comunque.
• Avvisa anche per screenshot incollati (riconoscimento del testo locale), istruzioni nascoste nei testi e dati delicati nelle risposte dell’IA.

Cosa viene rilevato
• IBAN, numeri di carta, chiavi API, token e password
• Numeri di previdenza sociale, fiscali e d’identità di molti paesi, ad es. numero AVS o codice fiscale
• Indirizzi e-mail, numeri di telefono, diciture di riservatezza ed elenchi di clienti
• Con l’IA locale facoltativa anche nomi, aziende, indirizzi e dati sanitari
• Termini propri come nomi di clienti o di progetti, salvati solo come somme di controllo

Privacy: tutto resta sul dispositivo
• Tutti i controlli avvengono localmente nel browser.
• Nessun server, nessun account, nessuna telemetria, nessun accesso alla rete.
• Vengono salvati solo le impostazioni e conteggi giornalieri – mai i suoi testi.

Per le aziende
• Gestione centralizzata con criteri tramite GPO (ADMX) e Intune.
• Regole per tipo di dato, siti di IA approvati o bloccati, regole diverse per account aziendali e personali.
• White label con logo, nome e colori propri.
• Rapporto locale con soli numeri sulle misure adottate (autodichiarazione, non consulenza legale).

Da sapere
• Microsoft Edge non consente alle estensioni di funzionare sulle pagine di Copilot (copilot.microsoft.com): lì AImori non può controllare gli input. In Google Chrome Copilot è protetto.
• Non vengono controllati i pannelli laterali di IA nel browser, le estensioni di IA, le app di IA per desktop e dispositivi mobili né la modalità vocale. AImori è un aiuto contro le distrazioni, non sostituisce una soluzione DLP.

Requisiti: Microsoft Edge o Google Chrome dalla versione 110.
