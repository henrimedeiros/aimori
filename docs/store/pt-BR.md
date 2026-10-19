# AImori – Store-Beschreibung (PT-BR, Entwurf)

Kurzbeschreibung (max. 132 Zeichen):
O guardião dos seus prompts de IA: verifica localmente se há dados sensíveis antes do envio para ChatGPT, Claude, Gemini e Copilot.

Beschreibung:

AImori é o guardião dos seus prompts de IA. A extensão verifica o que você digita ou cola em sites de IA em busca de dados sensíveis – antes que algo seja enviado. Tudo acontece localmente, no seu navegador.

O que o AImori faz
• Verifica as entradas no ChatGPT, Claude, Gemini, Microsoft Copilot e Microsoft 365 Copilot antes do envio.
• Mostra o que foi encontrado e explica por que o dado é sensível.
• Você decide: tarjar, substituir por marcadores, cancelar ou – se permitido – enviar mesmo assim.
• Verifica também capturas de tela coladas (PNG, JPEG, WebP) com reconhecimento de texto local.
• Avisa sobre indícios de instruções ocultas em textos colados.

O que é detectado
• Dados financeiros: IBAN, números de cartão de crédito, códigos de segurança
• Números de seguridade social, de identificação fiscal e de documentos de identidade de vários países
• Credenciais: senhas, chaves de API, tokens, chaves privadas
• Dados de contato, como e-mails e números de telefone
• Marcações de confidencialidade e termos próprios da sua organização (nomes de clientes, codinomes de projetos)
• Opcional: nomes, empresas, endereços e dados de saúde, com um modelo de IA que roda no próprio dispositivo

Privacidade: tudo fica no seu dispositivo
• Sem servidor, sem conta, sem telemetria, sem acesso à rede.
• Seus textos e detecções nunca são armazenados nem enviados.
• São guardadas apenas contagens diárias (90 dias) – nunca o conteúdo.
• Termos próprios são armazenados apenas como somas de verificação.

Para empresas
• Configuração centralizada por políticas via GPO (modelos ADMX) e Microsoft Intune.
• Regras por tipo de dado: avisar, só tarjar ou bloquear.
• Definição de sites de IA aprovados e bloqueados.
• White-label com nome, logotipo e cores próprios.
• Relatório local apenas com números, como apoio para documentar medidas de proteção de dados.

Observação sobre o Copilot
No Microsoft Edge, a Microsoft não permite que extensões funcionem em copilot.microsoft.com; lá o AImori não consegue proteger as entradas. No Google Chrome, o Copilot é protegido. Painéis laterais de IA no navegador e apps de IA para desktop não são verificados.

O AImori é uma ferramenta contra descuidos, não substitui uma solução completa de DLP.
