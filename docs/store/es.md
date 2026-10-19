# AImori – Store-Beschreibung (ES, Entwurf)

Kurzbeschreibung (max. 132 Zeichen):
El guardián de sus prompts de IA: revisa localmente si hay datos sensibles antes de enviarlos a ChatGPT, Claude, Gemini o Copilot.

Beschreibung:

AImori es el guardián de sus prompts de IA. La extensión revisa lo que usted escribe o pega en sitios de IA y le avisa antes de que datos sensibles salgan de su navegador.

Qué hace AImori
• Revisa las entradas en ChatGPT, Claude, Gemini y Copilot antes del envío.
• Si encuentra algo, detiene el envío y le deja elegir: enmascarar, sustituir por marcadores de posición, cancelar o enviar de todos modos.
• Explica en cada aviso por qué un dato es delicado.
• Opcional: revisa capturas de pantalla mediante reconocimiento de texto local, marca datos delicados en las respuestas de la IA y avisa de instrucciones ocultas en textos pegados.

Qué detecta
• Datos financieros: IBAN, números de tarjeta, códigos de seguridad.
• Credenciales: contraseñas, claves de API, tokens, claves privadas.
• Números de identificación, fiscales y de la seguridad social de muchos países, con paquetes por país.
• Datos de contacto, direcciones, datos de salud y listas de clientes.
• Términos propios de su organización, como nombres de clientes o de proyectos, guardados solo como sumas de verificación.
• Con la IA local opcional: nombres, empresas, direcciones y datos de salud.

Privacidad: todo se queda en su dispositivo
• Todas las revisiones se realizan localmente en el navegador.
• Sin servidor, sin cuenta, sin telemetría y sin acceso a la red.
• Sus textos y detecciones nunca se guardan ni se envían; solo se guardan recuentos diarios durante 90 días.

Para empresas
• Configuración centralizada mediante directivas de grupo (GPO/ADMX) e Intune.
• Reglas por tipo de dato, sitios de IA aprobados o bloqueados y personalización de marca con su propio logotipo.
• Informe local solo con cifras y su correspondencia con leyes y normas (nLPD, RGPD, Reglamento de IA de la UE, HIPAA, ISO/IEC 27001). Es una autodeclaración y no constituye asesoramiento jurídico.

Limitaciones
• Microsoft bloquea las extensiones en Copilot dentro de Microsoft Edge, por lo que AImori no puede proteger Copilot en Edge. En Google Chrome, Copilot está protegido.
• No se revisan los paneles laterales de IA del navegador, otras extensiones de IA ni las aplicaciones de escritorio y móviles.
• AImori es una ayuda contra los descuidos y no sustituye a una solución DLP.
