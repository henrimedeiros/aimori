# Bekannte KI-Seiten

Automatisch erzeugt aus `extension/common/aisites.js` mit `npm run build` – nicht von Hand ändern. Stand der Liste: 2026-10-14.

Die IDs gelten für die Richtlinien `allowedAiSites` und `blockedAiSites` (siehe `docs/ki-seiten.md`). «Anbieter-Sitz» ist das Land des Firmensitzes laut öffentlichen Angaben – keine Aussage darüber, wo Daten gespeichert oder verarbeitet werden.

| ID | Name | Kategorie | Anbieter-Sitz | Hosts |
|---|---|---|---|---|
| `chatgpt` | ChatGPT | Chat | US | `chatgpt.com`, `chat.openai.com` |
| `claude` | Claude | Chat | US | `claude.ai` |
| `gemini` | Gemini | Chat | US | `gemini.google.com` |
| `copilot` | Microsoft Copilot | Chat | US | `copilot.microsoft.com`, `copilot.com` |
| `m365copilot` | Microsoft 365 Copilot | Chat | US | `copilot.cloud.microsoft`, `m365.cloud.microsoft` |
| `perplexity` | Perplexity | Suche | US | `perplexity.ai`, `www.perplexity.ai` |
| `mistral` | Mistral Le Chat | Chat | FR | `chat.mistral.ai` |
| `deepseek` | DeepSeek | Chat | CN | `chat.deepseek.com` |
| `grok` | Grok | Chat | US | `grok.com` |
| `poe` | Poe | Mehrere Modelle | US | `poe.com` |
| `characterai` | Character.AI | Begleiter | US | `character.ai` |
| `you` | You.com | Suche | US | `you.com` |
| `huggingchat` | HuggingChat | Chat | US | `huggingface.co/chat` |
| `metaai` | Meta AI | Chat | US | `meta.ai`, `www.meta.ai` |
| `qwen` | Qwen Chat | Chat | CN | `chat.qwen.ai` |
| `kimi` | Kimi | Chat | CN | `kimi.com`, `www.kimi.com`, `kimi.moonshot.cn` |
| `zai` | Z.ai (GLM) | Chat | CN | `chat.z.ai`, `chatglm.cn` |
| `doubao` | Doubao | Chat | CN | `www.doubao.com` |
| `ernie` | ERNIE Bot (Yiyan) | Chat | CN | `yiyan.baidu.com` |
| `pi` | Pi | Begleiter | US | `pi.ai` |
| `duckai` | Duck.ai | Chat | US | `duck.ai` |
| `aistudio` | Google AI Studio | Code | US | `aistudio.google.com` |
| `notebooklm` | NotebookLM | Schreiben | US | `notebooklm.google.com` |
| `jules` | Jules | Code | US | `jules.google.com` |
| `githubcopilot` | GitHub Copilot Chat | Code | US | `github.com/copilot` |
| `phind` | Phind | Code | US | `phind.com`, `www.phind.com` |
| `v0` | v0 | Code | US | `v0.dev`, `v0.app` |
| `bolt` | Bolt | Code | US | `bolt.new` |
| `lovable` | Lovable | Code | SE | `lovable.dev` |
| `replit` | Replit | Code | US | `replit.com` |
| `genspark` | Genspark | Suche | US | `www.genspark.ai`, `genspark.ai` |
| `manus` | Manus | Chat | SG | `manus.im` |
| `felo` | Felo | Suche | JP | `felo.ai` |
| `openrouter` | OpenRouter Chat | Mehrere Modelle | US | `openrouter.ai` |
| `lmarena` | LMArena | Mehrere Modelle | US | `lmarena.ai` |
| `deepl` | DeepL | Übersetzung | DE | `www.deepl.com`, `deepl.com` |
| `jasper` | Jasper | Schreiben | US | `app.jasper.ai` |
| `copyai` | Copy.ai | Schreiben | US | `app.copy.ai` |
| `writesonic` | Writesonic | Schreiben | US | `app.writesonic.com` |
| `gamma` | Gamma | Präsentation | US | `gamma.app` |
| `midjourney` | Midjourney | Bild | US | `www.midjourney.com`, `midjourney.com` |
| `firefly` | Adobe Firefly | Bild | US | `firefly.adobe.com` |
| `designer` | Microsoft Designer | Bild | US | `designer.microsoft.com` |
| `leonardo` | Leonardo.Ai | Bild | AU | `app.leonardo.ai` |
| `ideogram` | Ideogram | Bild | CA | `ideogram.ai` |
| `dreamstudio` | DreamStudio | Bild | GB | `dreamstudio.ai` |
| `sora` | Sora | Video | US | `sora.chatgpt.com`, `sora.com` |
| `runway` | Runway | Video | US | `app.runwayml.com` |
| `heygen` | HeyGen | Video | US | `app.heygen.com` |
| `synthesia` | Synthesia | Video | GB | `app.synthesia.io` |
| `suno` | Suno | Audio | US | `suno.com` |
| `elevenlabs` | ElevenLabs | Audio | US | `elevenlabs.io` |

Summe: 52 KI-Seiten, 66 Hosts.

## Harte Sperre mit der Browser-Richtlinie URLBlocklist

Die Sperrseite der Erweiterung ist eine Überlagerung. Eine harte Sperre gibt es nur mit der Browser-Richtlinie `URLBlocklist` (Edge und Chrome). Beispiel mit allen Hosts der Liste – vor dem Einsatz die freigegebenen Tools entfernen:

```json
{
  "URLBlocklist": [
    "chatgpt.com",
    "chat.openai.com",
    "claude.ai",
    "gemini.google.com",
    "copilot.microsoft.com",
    "copilot.com",
    "copilot.cloud.microsoft",
    "m365.cloud.microsoft",
    "perplexity.ai",
    "www.perplexity.ai",
    "chat.mistral.ai",
    "chat.deepseek.com",
    "grok.com",
    "poe.com",
    "character.ai",
    "you.com",
    "huggingface.co/chat",
    "meta.ai",
    "www.meta.ai",
    "chat.qwen.ai",
    "kimi.com",
    "www.kimi.com",
    "kimi.moonshot.cn",
    "chat.z.ai",
    "chatglm.cn",
    "www.doubao.com",
    "yiyan.baidu.com",
    "pi.ai",
    "duck.ai",
    "aistudio.google.com",
    "notebooklm.google.com",
    "jules.google.com",
    "github.com/copilot",
    "phind.com",
    "www.phind.com",
    "v0.dev",
    "v0.app",
    "bolt.new",
    "lovable.dev",
    "replit.com",
    "www.genspark.ai",
    "genspark.ai",
    "manus.im",
    "felo.ai",
    "openrouter.ai",
    "lmarena.ai",
    "www.deepl.com",
    "deepl.com",
    "app.jasper.ai",
    "app.copy.ai",
    "app.writesonic.com",
    "gamma.app",
    "www.midjourney.com",
    "midjourney.com",
    "firefly.adobe.com",
    "designer.microsoft.com",
    "app.leonardo.ai",
    "ideogram.ai",
    "dreamstudio.ai",
    "sora.chatgpt.com",
    "sora.com",
    "app.runwayml.com",
    "app.heygen.com",
    "app.synthesia.io",
    "suno.com",
    "elevenlabs.io"
  ]
}
```
