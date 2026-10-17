# KI-Training je Seite

Automatisch erzeugt aus `extension/common/training.js` mit `npm run build` – nicht von Hand ändern. Stand der Angaben: 2026-10-16. Erklärung: [Training-Ampel](ki-training.md).

Angaben laut Herstellerquelle, ohne Gewähr. «Privat» = Gratis- und Einzelkonten, «Firma» = Team-/Enterprise-Konten; «–» = keine Firmenvariante.

| ID | Name | Privat | Firma | Opt-out-Einstellung | Quelle | Hinweis |
|---|---|---|---|---|---|---|
| `chatgpt` | ChatGPT | ja (Standard an) | nein | <https://chatgpt.com/#settings/DataControls> | <https://help.openai.com/en/articles/7730893-data-controls-faq> | Standard an, abschaltbar; Business/Enterprise trainiert nicht |
| `claude` | Claude | ja (Standard an) | nein | <https://claude.ai/settings/data-privacy-controls> | <https://www.anthropic.com/legal/privacy> | Seit 2025 standardmässig an, abschaltbar; Team/Enterprise nicht |
| `gemini` | Gemini | ja (Standard an) | nein | <https://myactivity.google.com/product/gemini> | <https://support.google.com/gemini/answer/13594961> | Mit gespeicherter Aktivität an; Workspace nicht |
| `copilot` | Microsoft Copilot | ja (Standard an) | – | – | <https://support.microsoft.com/en-us/topic/privacy-faq-for-microsoft-copilot-27b3a435-8dc9-4b55-9a4b-58eeb9647a7f> | Standard an, in den Copilot-Einstellungen abschaltbar |
| `m365copilot` | Microsoft 365 Copilot | unklar | nein | – | <https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-privacy> | Firmenkonten: kein Training der Basismodelle |
| `perplexity` | Perplexity | ja (Standard an) | nein | – | <https://www.perplexity.ai/hub/legal/privacy-policy> | Datennutzung standardmässig an; Enterprise nie |
| `mistral` | Mistral Le Chat | ja (Standard an) | nein | – | <https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models> | Gratis standardmässig an; Team/Enterprise nicht |
| `deepseek` | DeepSeek | ja (Standard an) | – | – | <https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html> | Standard an; Widerspruch nur EWR/UK/Schweiz |
| `grok` | Grok | ja (Standard an) | unklar | – | <https://x.ai/legal/faq> | Abschaltbar; Feedback wird trotzdem genutzt |
| `poe` | Poe | teils | – | – | <https://poe.com/privacy> | Bot-Anbieter dürfen Chats zum Training nutzen |
| `characterai` | Character.AI | ja (Standard an) | – | – | <https://policies.character.ai/privacy> | Training mit Chats; Widerspruch nur EWR/UK |
| `you` | You.com | unklar | teils | – | <https://home.you.com/support/zdr> | Kein Training nur für Team-Pläne beschrieben |
| `huggingchat` | HuggingChat | nein | – | – | <https://huggingface.co/chat/privacy> | Gespräche privat, nicht für Training |
| `metaai` | Meta AI | ja (Standard an) | – | – | <https://www.facebook.com/privacy/genai> | Gespräche verbessern die Modelle |
| `qwen` | Qwen Chat | unklar | – | – | <https://chat.qwen.ai/> | Keine klare Regel in den Bedingungen |
| `kimi` | Kimi | ja (Standard an) | – | – | <https://www.kimi.com/help/others/data-usage> | Standard an; Widerspruch nur per Antrag |
| `zai` | Z.ai (GLM) | unklar | unklar | – | <https://docs.z.ai/legal-agreement/privacy-policy> | Keine klare Regel auffindbar |
| `doubao` | Doubao | unklar | – | – | <https://www.doubao.com/> | Keine klare Regel auffindbar |
| `ernie` | ERNIE Bot (Yiyan) | unklar | – | – | <https://yiyan.baidu.com/> | Keine klare Regel auffindbar |
| `pi` | Pi | ja (Standard an) | – | – | <https://inflection.ai/notice-on-model-training> | Training mit Gesprächen, im Konto abschaltbar |
| `duckai` | Duck.ai | nein | – | – | <https://duckduckgo.com/duckduckgo-help-pages/duckai/ai-chat-privacy> | Kein Training, auch nicht bei Modellanbietern |
| `aistudio` | Google AI Studio | ja (Standard an) | nein | – | <https://ai.google.dev/gemini-api/terms> | Gratisnutzung trainiert, bezahlte Nutzung nicht |
| `notebooklm` | NotebookLM | teils | nein | – | <https://support.google.com/notebooklm/answer/16164461> | Nur bei Feedback; Workspace nie |
| `jules` | Jules | teils | unklar | – | <https://jules.google/docs/faq/> | Private Repos nie, öffentliche möglich |
| `githubcopilot` | GitHub Copilot Chat | ja (Standard an) | nein | <https://github.com/settings/copilot> | <https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement> | Free/Pro standardmässig an; Business/Enterprise nicht |
| `phind` | Phind | unklar | unklar | – | <https://www.phind.com/privacy> | Keine aktuelle Angabe |
| `v0` | v0 | ja (Standard an) | nein | – | <https://vercel.com/legal/privacy-notice> | Abschalten nur in Business/Enterprise |
| `bolt` | Bolt | teils | unklar | – | <https://stackblitz.com/privacy-policy> | Kein Training für Konten aus EWR/UK/Schweiz |
| `lovable` | Lovable | ja (Standard an) | nein | – | <https://docs.lovable.dev/features/business/data-opt-out> | Abschalten nur in Business/Enterprise |
| `replit` | Replit | teils | unklar | – | <https://replit.com/privacy-policy> | Öffentliche Apps ja, private nicht |
| `genspark` | Genspark | unklar | unklar | – | <https://www.genspark.ai/> | Keine klare Regel auffindbar |
| `manus` | Manus | unklar | unklar | – | <https://manus.im/privacy> | Nur de-identifizierte Daten genannt |
| `felo` | Felo | ja (Standard an) | unklar | – | <https://account.felo.ai/policies/privacy-policy> | Daten für KI-Entwicklung genutzt |
| `openrouter` | OpenRouter Chat | teils | teils | <https://openrouter.ai/settings/privacy> | <https://openrouter.ai/docs/guides/privacy/data-collection> | Je nach Einstellung trainieren die Modellanbieter |
| `lmarena` | LMArena | ja (Standard an) | – | – | <https://lmarena.ai/privacy-policy> | Gespräche gehen an Anbieter, teils öffentlich |
| `deepl` | DeepL | ja (Standard an) | nein | – | <https://www.deepl.com/en/privacy> | Gratis trainiert, Pro nicht |
| `jasper` | Jasper | nein | nein | – | <https://www.jasper.ai/legal/eula> | Kundeninhalte trainieren keine Modelle |
| `copyai` | Copy.ai | unklar | unklar | – | <https://www.copy.ai/privacy> | Keine klare Regel auffindbar |
| `writesonic` | Writesonic | teils | unklar | – | <https://writesonic.com/privacy> | Gratis-Stufe trainiert, Bezahlstufe unklar |
| `gamma` | Gamma | ja (Standard an) | nein | – | <https://help.gamma.app/en/articles/12281928-does-gamma-use-my-content-to-train-its-ai-features> | Einzelkonten an; Team/Business aus |
| `midjourney` | Midjourney | ja (Standard an) | – | – | <https://docs.midjourney.com/docs/terms-of-service> | Trainingslizenz in allen Stufen |
| `firefly` | Adobe Firefly | nein | nein | – | <https://www.adobe.com/ai/overview/firefly/gen-ai-approach.html> | Nie mit Nutzerinhalten trainiert |
| `designer` | Microsoft Designer | unklar | – | – | <https://support.microsoft.com/en-us/topic/frequently-asked-questions-about-microsoft-designer-9264654d-22f5-43ac-961d-b35851bbb93f> | Nur Verbesserung des Dienstes genannt |
| `leonardo` | Leonardo.Ai | teils | unklar | – | <https://leonardo.ai/privacy-policy/> | Gratis trainiert, private Bezahlinhalte nicht |
| `ideogram` | Ideogram | ja (Standard an) | – | – | <https://ideogram.ai/privacy-policy> | Prompts und Bilder trainieren |
| `dreamstudio` | DreamStudio | ja (Standard an) | – | – | <https://stability.ai/ds-pp> | Standard an, abschaltbar |
| `sora` | Sora | ja (Standard an) | nein | <https://privacy.openai.com/> | <https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/> | Eigene Einstellung, unabhängig von ChatGPT |
| `runway` | Runway | ja (Standard an) | unklar | – | <https://runwayml.com/privacy-policy> | Trainingslizenz an Ein- und Ausgaben |
| `heygen` | HeyGen | nein | nein | – | <https://www.heygen.com/en-au/faq> | Nutzerdaten nicht für Training |
| `synthesia` | Synthesia | nein | nein | – | <https://www.synthesia.io/ai-governance> | Kein Training mit Kundendaten |
| `suno` | Suno | ja (Standard an) | – | – | <https://suno.com/privacy> | Eingaben trainieren Modelle |
| `elevenlabs` | ElevenLabs | ja (Standard an) | nein | – | <https://help.elevenlabs.io/hc/en-us/articles/29952728805393-Is-my-data-used-to-improve-ElevenLabs-AI-models> | Standard an, abschaltbar; Enterprise nicht |

Summe: 52 Seiten. Ampel für Privatkonten: 27 rot, 19 gelb, 6 grün.
