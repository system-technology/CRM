# Coexistencia: WhatsApp Business app + Cloud API en el mismo número

**Consultado:** 2026-11-20
**Pregunta:** si el número de JD Tours (en la app WhatsApp Business del celular) se integra al CRM, ¿el dueño pierde la app?

## Advertencia de método (leer primero)

`developers.facebook.com`, `docs.360dialog.com` y `www.infobip.com` **no resolvieron desde esta sesión** (la red está limitada a ciertos dominios). No se pudo abrir ninguna página de Meta. Lo que sigue proviene de **resúmenes del buscador web** que citan textualmente páginas oficiales de Meta (marcado «Meta, vía buscador») y de **terceros** (BSP y blogs, marcados «tercero»). Nada se leyó directamente en la fuente primaria. Para cerrar: permitir `developers.facebook.com` en la red de la sesión y repetir la lectura de las URLs de la sección «Fuentes».

## Resumen (para trasladar al dueño)

1. **Respuesta directa: no, no pierde la app, siempre que se conecte por «coexistencia».** El número sigue funcionando en su celular con WhatsApp Business y a la vez se conecta al CRM.
2. Lo que sí lo haría perder la app es el método antiguo (migrar el número a la API «a secas»): ahí se borra la cuenta de la app y se pierde el historial. No debemos usar ese camino con su número.
3. Con coexistencia el historial reciente (hasta unos 6 meses de chats individuales) se copia al CRM y lo que él escriba desde el celular también aparece en el CRM.
4. Limitaciones: los **grupos** no pasan al CRM, se desactivan en chats individuales los mensajes temporales y «ver una vez», y las listas de difusión dejan de poder crearse. Las llamadas siguen en el celular.
5. Hay que **abrir la app al menos cada ~13 días** (Meta/terceros dicen 13-14) o la conexión se corta.
6. **Privacidad:** todo chat del número (también proveedores y contactos personales) llegaría al CRM. No encontramos una forma oficial de excluir chats. Esto exige tratamiento bajo la Ley 1581 y, probablemente, un número separado para lo que no sea de clientes.
7. Colombia: ninguna fuente consultada la lista como excluida y las más recientes dicen que no quedan países excluidos, pero **no pudimos verificarlo en Meta**; se confirma haciendo la prueba real con su número.
8. Para ViajaPro: requiere ser **Tech Provider** y Embedded Signup con la opción de «onboarding de usuarios de la app Business»; hoy solo usamos el número de prueba, así que esto es trabajo pendiente.
9. Alternativa si falla o si el dueño prefiere separar: **segundo número** solo para el CRM.

## Detalle por punto

### 1. Modo tradicional (migrar a Cloud API)
- Meta (vía buscador): el número debe eliminarse de la app antes de registrarlo en Cloud API; «your existing messaging history will be lost, and you will be unable to use that number with the WhatsApp Business app». Fuente: página «Migrate an existing WhatsApp number to a business account». Fecha de la fuente: no visible. Confianza: media-alta.
- Terceros (Klaviyo, Respond.io): el historial no se transfiere y se borra al desactivar la app; los respaldos de WhatsApp solo restauran en otro teléfono. Tercero, coherente con Meta.
- Meta (vía buscador): si se hace por un socio con soporte de «business app number onboarding», se pueden usar ambos y el historial se conserva (es la coexistencia).

### 2. Coexistencia: oficial, disponibilidad, requisitos, activación
- **Oficial: sí.** Existe la página de Meta «Onboard WhatsApp Business app users» (actualizada, según el buscador, 2026-04-20). Confianza: alta en que existe; media en el detalle.
- **Requisitos (Meta, vía buscador):** app WhatsApp Business versión **2.24.17 o superior**; el integrador debe ser **Solution Partner o Tech Provider**; usar **Embedded Signup** con registro de sesión y `featureType: whatsapp_business_app_onboarding` en el objeto `extras`; evento de cierre `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. La cuenta de WhatsApp Business se convierte en una cuenta compatible y se comparte con el socio.
- **Solo app Business**, no WhatsApp personal (tercero).
- **Antigüedad mínima:** un tercero (360dialog) dice 7 días de uso activo en la app; **no apareció en ninguna fuente de Meta**. Sin verificar. Tampoco se verificó ningún mínimo de chats/contactos ni exigencia de verificación del negocio.
- **Colombia:** un tercero (Chakra) la marca «Full Coexistence Support» (sin fecha); otro, de fecha reciente, dice que Meta ya no lista países excluidos (noviembre 2026), y uno de mayo 2026 dice que se añadieron Nigeria y Sudáfrica (todos los países). Fuentes antiguas listaban exclusiones (lista truncada, no se vio si incluía Colombia). **Sin verificar en Meta.** Si el número no es elegible, el flujo de Embedded Signup muestra un error (tercero).
- **Embedded Signup v2:** una página de Meta advierte su deprecación el **2026-10-15** (ya pasó); hay que construir sobre **v4**. Verificar `featureType` en la documentación v4.
- **Flujo del dueño (tercero/Meta, parcial):** en el celular, abrir el flujo de Embedded Signup lanzado por el CRM, elegir el número de la app Business y confirmar (en la app aparece la vinculación; algunos terceros mencionan escanear un QR). El detalle exacto no se verificó.

### 3. Qué conserva y qué pierde el dueño
- **Conserva:** chats individuales, enviar/recibir, llamadas (solo en la app), catálogo, etiquetas y respuestas rápidas (terceros; el detalle por función no se pudo comprobar en Meta).
- **Limitado/perdido (terceros, ChatDaddy, DigitalToolbox, Dualhook):** mensajes temporales, «ver una vez» y ubicación en vivo se desactivan en chats individuales; listas de difusión: no se pueden crear nuevas y las existentes quedan de solo lectura; **grupos** se quedan en la app pero no se sincronizan con la API (cita atribuida a Meta: los grupos «are not available for WhatsApp Business app phone numbers»).
- **Dispositivos vinculados (Meta, vía buscador):** hasta 4 compañeros; todos se soportan salvo WhatsApp para Windows y WearOS. Al hacer el onboarding **todos los compañeros se desvinculan** y hay que revincular los soportados. Los mensajes enviados desde compañeros no soportados no disparan webhooks.
- **Plazo de apertura de la app:** contradicción entre fuentes. Terceros dicen «cada 13 días» (la cifra prudente), otros «unos 14 días» citando a Meta, y compañeros ~30 días. **Plazo exacto de Meta: sin verificar.** Planificar con 13.

### 4. Sincronización
- **Historial:** un solo envío por onboarding, hasta 6 meses (180 días) de chats individuales, en fases (día 0-1, 1-90, 90-180) según un tercero; evento `history` (tercero). Debe aceptarlo el dueño al conectar; si lo rechaza, llega un evento indicando que se declinó. Meta limita a una sincronización dentro de las 24 h del onboarding; si se pierde, **no hay reenvío garantizado**: el receptor debe persistir antes de que empiece.
- **Contactos:** evento `smb_app_state_sync` (alta/edición/borrado de contactos del teléfono). Tercero.
- **Ecos:** **sí.** Meta (vía buscador): «Each time a business sends a message with one of these apps, it triggers an smb_message_echoes webhook, which you must digest and display in the contact message thread history». Nombres de los tres eventos coinciden entre fuentes: `history`, `smb_app_state_sync`, `smb_message_echoes`.
- **Implicación para reportes:** los mensajes salientes desde el celular llegarán como ecos y no como envíos del CRM; hay que clasificarlos aparte (origen = app) para no mezclarlos con los enviados por API.

### 5. Envío por API, ventana, plantillas, precios
- **Ventana de 24 h (Meta, vía buscador):** aplica a mensajes enviados por Cloud API. Los mensajes enviados desde la app **no** están sujetos a la ventana y **no** crean ni extienden ventanas ni afectan precios de Cloud API. Si un cliente escribió justo antes del onboarding, solo se puede responder por API con plantilla.
- **Precios (Meta, vía buscador):** lo enviado desde la app sigue siendo gratis; lo enviado por Cloud API paga precio de Cloud API. Desde el **2025-07-01** Meta cobra **por mensaje** (categoría x mercado) y solo mensajes de empresa a usuario. Tarifas actuales de Colombia: **no verificadas**; leer la página de precios de Meta.
- **Throughput (tercero, Telnyx / InstantReply; atribuido a Meta):** fijo en **20 mensajes por segundo** por número con coexistencia. Sin verificar en Meta.
- **¿Sigue siendo «cuenta de app» a efectos de cobro?** No documentado en lo que pudimos leer. Lo documentado es la separación app gratis / API de pago.

### 6. Proveedores y contactos no-clientes
- No se encontró ningún mecanismo oficial para excluir chats: el buscador no devolvió nada sobre exclusión, y el diseño descrito (todos los mensajes enviados desde la app generan eco; el historial de chats individuales se sincroniza) implica que **toda conversación individual del número llega al webhook**. Esto es **inferencia**, no cita de Meta. Sin verificar.
- Privacidad (inferencia jurídica, no verificada contra normativa en esta consulta): el CRM trataría datos de proveedores y de contactos personales sin relación con el negocio, y el historial de hasta 6 meses. Habría que revisar la finalidad, la autorización y el aviso de privacidad (Ley 1581 de 2012) y decidir si se descartan en el CRM los chats de proveedores. Derivar a `auditor-seguridad` y `docs/05-seguridad/02-proteccion-de-datos.md`.

### 7. Riesgos y reversa
- **Desconectar (tercero, varias fuentes):** desde la app Business: Ajustes > Cuenta > Plataforma Business > Desconectar cuenta. Se dispara un evento de baja y el número queda de nuevo solo en la app. No se puede desregistrar por API un número en coexistencia. Esperar ~15 min antes de reconectar o cambiar de proveedor. Los compañeros se desvinculan.
- **Bloqueo por calidad:** aplican las reglas normales de calidad y límites de mensajes de la API; no se encontró una regla específica de coexistencia. Sin verificar.

### 8. Alternativa
- **Segundo número solo para el CRM** (línea nueva, registrada por Embedded Signup normal). Transición: el dueño mantiene el número actual en la app para proveedores y personal, y pasa los clientes poco a poco al número nuevo (aviso por la app, enlace `wa.me`, QR en el material). Es la opción más simple en privacidad (el CRM solo ve lo de clientes) y evita el plazo de 13 días, pero cambia el número de contacto y requiere migrar a los clientes. Recomendación (inferencia): decidir tras probar la elegibilidad real del número actual y tras la decisión sobre los chats de proveedores.

## Lo que NO se pudo verificar

- Lectura directa de cualquier página de Meta (`developers.facebook.com` no resuelve en esta sesión).
- Disponibilidad exacta en Colombia (+57) según Meta.
- Antigüedad mínima (7 días es de un tercero), mínimo de chats/contactos y exigencia de verificación del negocio.
- Plazo exacto de apertura de la app (13 vs. 14 días vs. 30 de compañeros).
- Rendimiento de 20 msg/s y tarifas vigentes de Colombia.
- Detalle por función del celular (catálogo, etiquetas, respuestas rápidas) y flujo exacto del QR.
- Si existe un modo de excluir chats, y normativa colombiana aplicable (no se consultó).
- Efecto de la deprecación de Embedded Signup v2 (2026-10-15) sobre `featureType` en v4.

## Implicación para ViajaPro

- La opción de coexistencia **es viable en principio**, pero exige ser Tech Provider y Embedded Signup v4 con el flujo de coexistencia; hoy solo usamos el número de prueba. No cambia nada en el código actual, pero el backlog debe incluir: manejar `smb_message_echoes`, `history` y `smb_app_state_sync`; marcar el origen (app vs. API) en `inbox` y `analytics`; persistir el historial al recibirlo (no hay reenvío).
- Decisión previa al piloto: probar elegibilidad del número real; resolver el tratamiento de proveedores (Ley 1581) o recomendar número separado. Esto toca ADR-0002 y requiere ADR si se adopta.
- Qué hacer ya: permitir `developers.facebook.com` en la red de la sesión y repetir la verificación de los puntos de arriba antes de comprometerse con el dueño.

## Fuentes

Fecha de consulta de todas: 2026-11-20. Solo se vieron como resúmenes del buscador, no se abrieron.

Meta (oficial):
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users (y versión `.md`, actualizada 2026-04-20 según el buscador)
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview

Terceros (corroboración, no autoritativos):
- https://docs.360dialog.com/docs/hub/embedded-signup/whatsapp-coexistence
- https://developers.telnyx.com/docs/messaging/whatsapp/coexistence
- https://www.infobip.com/docs/whatsapp/manage-integration/coexistence
- https://chakrahq.com/product/whatsapp/tools/whatsapp-coexistence-support/
- https://www.chatdaddy.tech/blog/whatsapp-coexistence-what-you-keep-and-lose
- https://dualhook.com/whatsapp-coexistence-limitations
- https://www.instantreply.co/blog/whatsapp-coexistence-what-actually-syncs-2026
- https://dev.to/wapgrowai/whatsapp-coexistence-for-developers-history-sync-message-echoes-and-contacts-without-breaking-1111
- https://respond.io/help/whatsapp/migrating-from-whatsapp-personal-or-whatsapp-business-app
