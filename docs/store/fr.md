# AImori – Store-Beschreibung (FR, Entwurf)

Kurzbeschreibung (max. 132 Zeichen):
Le gardien de vos prompts IA : AImori repère localement les données sensibles avant leur envoi aux sites d’IA.

Beschreibung:

AImori est le gardien de vos prompts IA. Avant que votre message ne parte vers ChatGPT, Claude, Gemini ou Copilot, l’extension le vérifie directement sur votre appareil et vous avertit si elle y trouve des données sensibles.

Ce que fait AImori
• Vérifie vos saisies avant l’envoi, ainsi que le texte que vous collez.
• Vous laisse le choix : caviarder, remplacer par des espaces réservés, annuler ou envoyer quand même.
• Explique à chaque avertissement pourquoi la donnée est sensible.
• Vérifie aussi les captures d’écran grâce à une reconnaissance de texte locale.
• Signale les indices d’instructions cachées dans un texte collé.

Ce qui est détecté
• IBAN, numéros de carte et autres données financières, avec contrôle des chiffres de validation.
• Numéros de sécurité sociale, numéros fiscaux et pièces d’identité, grâce à des paquets par pays.
• Mots de passe, clés API, jetons et chaînes de connexion.
• Adresses e-mail, numéros de téléphone, dates de naissance.
• Vos propres termes (noms de clients, noms de code de projets), enregistrés uniquement sous forme de sommes de contrôle salées.

Confidentialité : tout reste sur votre appareil
• Toutes les vérifications ont lieu localement dans votre navigateur.
• Pas de serveur, pas de compte, pas de télémétrie, aucun accès au réseau.
• Seuls des compteurs journaliers sont conservés (90 jours), jamais vos textes.

Pour les entreprises
• Configuration centralisée par stratégie de groupe (GPO, modèles ADMX) ou avec Intune.
• Règles par type de données (avertir, caviarder seulement, bloquer), sites d’IA autorisés et personnalisation à vos couleurs.

Bon à savoir
• Dans Microsoft Edge, Microsoft bloque les extensions sur copilot.microsoft.com : AImori ne peut pas y protéger Copilot. Dans Chrome, Copilot est protégé.
• Ne sont pas vérifiés : les panneaux latéraux IA du navigateur, les extensions IA et les applications IA de bureau.
• AImori est une aide contre les erreurs d’inattention ; il ne remplace pas une solution de prévention des fuites de données (DLP).
