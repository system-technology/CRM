# Coexistencia: WhatsApp Business app + Cloud API en el mismo número

**Consultado:** 2026-11-20 (primera versión, sin acceso a Meta) · **verificado con Meta el 2026-11-21**
**Pregunta:** si el número de JD Tours (en la app WhatsApp Business del celular) se integra al CRM, ¿el dueño pierde la app?

## Método (leer primero)

- **Versión del 2026-11-20:** `developers.facebook.com` no resolvía desde la sesión. Todo salía de
  resúmenes del buscador y de terceros.
- **Esta versión (2026-11-21):** se leyeron **directamente** las páginas de Meta listadas en
  «Fuentes» (`developers.facebook.com`, su changelog, su blog y su índice `llms.txt`). La herramienta
  de lectura pasa la página por un modelo que resume y limita las citas a frases cortas: por eso las
  citas de abajo son breves o paráfrasis fieles. Donde dos lecturas de la misma página no coincidían
  se volvió a leer la versión `.md` de la página.
- **Etiquetas:** **[Meta]** leído hoy en una página oficial de Meta; **[Tercero]** BSP, blog o
  buscador; **[Inferencia]** conclusión nuestra. «**No documentado**» = no aparece en ninguna de las
  páginas de Meta leídas.
- **Marcas de cambio:** «**Cambió:**» indica qué difiere de la versión del 2026-11-20. Si no hay marca,
  lo previo se **confirmó**.
- El centro de ayuda de WhatsApp (`faq.whatsapp.com`) no devolvió ningún artículo útil (búsqueda sin
  resultados en ese dominio; el artículo probado dio «Page not found»). Todo lo de abajo es de la
  documentación para desarrolladores.

## Resumen (para trasladar al dueño)

1. **No pierde la app, si se conecta por coexistencia.** [Meta] El número sigue en WhatsApp Business
   en su celular; los chats individuales se reflejan en ambos lados. Lo que sí borra la app es el
   camino antiguo (eliminar la cuenta de la app y registrar el número en la API).
2. **Colombia:** [Meta] Colombia **nunca figuró** en la lista de países excluidos (blog de Meta del
   2025-03-19), y los países que sí estaban se fueron añadiendo (India en 2025-05, UE/Reino Unido y
   otros en 2025-10). La página actual no publica lista de países. [Inferencia] Está disponible para
   +57; la confirmación final es la prueba con el número real.
3. **Plazo:** [Meta] si el celular principal queda inactivo **aproximadamente 14 días**, Meta
   desconecta el número del CRM (`PRIMARY_INACTIVITY`); los dispositivos vinculados, ~30 días.
   [Inferencia] Al dueño: «abra la app al menos una vez por semana».
4. **Pierde en el celular:** mensajes temporales, «ver una vez» y ubicación en vivo en chats
   individuales; las listas de difusión quedan de solo lectura. **Conserva** grupos, llamadas,
   catálogo, etiquetas, respuestas rápidas y perfil, **pero nada de eso llega al CRM**.
5. **Al CRM llegan:** todos los chats individuales (también los que el dueño escribe desde el
   celular), hasta **180 días de historial** si lo autoriza al conectar, y sus **contactos**. **No
   llegan:** grupos ni **etiquetas** de WhatsApp Business.
6. **No hay forma oficial de dejar fuera chats de proveedores o personales.** No documentado. Todo
   chat individual del número entra al CRM. Esto pesa en la Ley 1581 (ver ADR-0033, Propuesto).
7. **Costo:** lo que el dueño envíe desde la app sigue siendo gratis; lo que salga del CRM paga
   tarifa de Cloud API (por mensaje, y desde el 2026-10-01 también el de servicio, con 1.000 gratis
   por número y mes).
8. **Requisito nuestro:** ser **Tech Provider** (T-080) y Embedded Signup **v4** (o v5). Hoy no
   cumplimos ninguno de los dos.
9. **Alternativa:** un **número nuevo** solo para el CRM. Sin plazo de 14 días, sin chats de
   proveedores en el CRM, pero cambia el número que conocen los clientes.

## Detalle por punto

### 1. Disponibilidad, Colombia y requisitos

| Dato | Lo verificado | Fuente |
|---|---|---|
| Existe y es oficial | [Meta] Lanzada en el changelog el **2025-02-11** («also called "Coexistence"»); anuncio en el blog de Meta el **2025-03-19**: permite usar «both the WhatsApp Business App and the Cloud API with the same phone number» | Changelog; blog 2025-03-19 |
| Países | [Meta] Blog 2025-03-19: despliegue global **excepto** India, Reino Unido, EEE, Turquía, Japón, Nigeria, Australia, Filipinas, Corea del Sur, Sudáfrica y Rusia. Changelog: India añadida el **2025-05-05**; Australia, Japón, Filipinas, Rusia, Corea del Sur, Turquía, EEE, UE y Reino Unido el **2025-10-23**. **Colombia no aparece en ninguna exclusión.** La página de onboarding vigente no lista países. Existe el error `3441042` («feature unavailable for phone numbers from this region») para regiones no soportadas | Blog; changelog; errores de Embedded Signup |
| Nigeria y Sudáfrica | [Tercero] Chakra dice que se añadieron en 2026; [Meta] no encontramos entrada en el changelog. No afecta a Colombia | — |
| Versión de la app | [Meta] WhatsApp Business **2.24.17 o superior**. Error `4563015`: «Update your WhatsApp Business App to the latest version» | Onboarding; errores |
| Quién puede conectar | [Meta] «You must already be a Solution Partner or Tech Provider». Error `2655111`: la app del socio no tiene acceso avanzado a los permisos de WhatsApp | Onboarding; implementación; errores |
| Embedded Signup | [Meta] Con **registro de sesión** (session logging). v2 y v3 **deprecadas el 2026-10-15**. **v4** (2025-10-08): `featureType: "whatsapp_business_app_onboarding"` en `extras`. **v5** (2026-10-20): la coexistencia viene **activada por defecto** y no lleva `featureType` (se desactiva con `enabled: false` en `features`). El `sessionInfoVersion: "3"` que citan muchas guías es de **v2**. El antiguo valor `coexistence` de `featureType` se retiró el 2025-05-29 | Versiones; onboarding; changelog |
| Antigüedad del número / mínimo de chats | **No documentado** como cifra. [Meta] Pero Meta aplica un criterio de actividad que no publica: error `3441045` (número no elegible por poca actividad en la app) y `3441077` («This number isn't eligible yet»: seguir usando la app y reintentar). [Tercero] 360dialog habla de 7 días; no está en Meta | Errores |
| Verificación del negocio de la agencia | **No documentada** como requisito de la coexistencia. [Meta] Sin verificar, la agencia arranca con el límite de mensajería más bajo (250) | Límites de mensajería |
| Otros bloqueos de elegibilidad (útiles para JD Tours) | [Meta] El número no puede estar: usado para **difusiones de negocio** en la app (`3441104`), en una cuenta que usa mensajes de marketing (`3441047`), conectado a **Meta Business Agent** (IA de Meta, `3441060`), con «Auto lists»/eventos automáticos activos (`3441061`), vinculado a una **página de Facebook** de otro portafolio (`2655123`, `3441150`), ya compartido con otro socio (`2655093`) o facturado por otro socio (`3441091`) | Errores |
| Ingreso sin cuenta de Facebook | [Meta] «WhatsApp Business app login» (beta): el dueño escribe su número y aprueba en la app (con QR). Exige app en modo Live y que Meta habilite la configuración | Business app login |

**Cambió:** Colombia pasa de «sin verificar» a «no excluida según Meta»; se precisa que v4 usa
`featureType` y v5 no; el `sessionInfoVersion` es de v2; aparece el criterio de actividad (errores
`3441045`/`3441077`) y la lista de bloqueos de elegibilidad, que antes no teníamos.

### 2. Qué conserva y qué pierde el dueño en el celular

[Meta] Tabla de la página de onboarding (columna «en la app» y columna «en Cloud API»):

| Función | En la app del celular | ¿Llega al CRM (Cloud API)? |
|---|---|---|
| Chats 1:1 | Igual; editar y borrar mensajes ya se refleja (changelog 2025-11-25) | **Sí**, en ambos sentidos; historial de 6 meses |
| Contactos | Igual | **Sí**, se sincronizan |
| Grupos | Igual | **No** (ni se sincronizan) |
| Mensajes temporales, «ver una vez», ubicación en vivo | **Se desactivan** en chats 1:1 | No |
| Listas de difusión | **Desactivadas**: las existentes quedan de solo lectura, no se crean nuevas | No |
| Llamadas de voz y video | Igual | No |
| Herramientas de negocio (catálogo, pedidos, estados) | Igual | No |
| Herramientas de mensajería (mensajes de marketing, saludo, ausencia, respuestas rápidas, **etiquetas**) | Igual | **No** |
| Perfil del negocio, Canales | Igual | No |

- **Dispositivos vinculados:** [Meta] hasta **4**; todos soportados salvo **WhatsApp para Windows**
  y **WearOS**. El onboarding **desvincula todos** y el dueño revincula los soportados. Lo que llega
  por un compañero no soportado no dispara el webhook `messages`.
- **Plazo de inactividad:** [Meta] motivos de desconexión del evento `PARTNER_REMOVED`:
  `PRIMARY_INACTIVITY` (dispositivo principal inactivo **aprox. 14 días**) y `COMPANION_INACTIVITY`
  (compañero inactivo **aprox. 30 días**). Meta no lo formula como «abrir la app cada N días», sino
  como motivo de desconexión.

**Cambió:** el plazo es **~14 días** según Meta (antes «13-14, planificar con 13»). Las etiquetas,
respuestas rápidas y catálogo **se conservan en la app pero no llegan al CRM** (antes se decía
«conserva», de terceros, sin el matiz). Grupos y llamadas: confirmados.

### 3. Sincronización

- **Plazo:** [Meta] hay **24 horas** desde el onboarding para sincronizar; si se pasan, la agencia
  tiene que desconectarse y repetir el flujo.
- **Contactos (paso 1):** [Meta] `POST …/smb_app_data` con `sync_type: smb_app_state_sync`. **Una
  sola vez.** Después llegan altas, ediciones (como `add`) y bajas por el webhook
  `smb_app_state_sync`. Cada contacto trae `full_name`, `first_name`, `phone_number` (**se omite si no
  está disponible**), `user_id` (BSUID), y `username` si lo tiene. **No trae etiquetas.**
- **Historial (paso 2):** [Meta] `sync_type: history`, **una sola vez**. Hasta **180 días** antes del
  onboarding, sin grupos. Llega por el webhook `history` en fases (0: día 0-1; 1: días 1-90; 2: días
  90-180; `progress: 100` = terminado). Los **identificadores de media solo para los últimos 14
  días**. Si el dueño no acepta compartir, llega un `history` con error `2593109`.
- **Ecos (paso 3):** [Meta] lo que el dueño envía desde la app o un compañero llega como
  `smb_message_echoes`: tipos `text`, `image`, `video`, `document`, y eventos `edit` y `revoke` con
  `original_message_id`. Las ediciones llegan hasta 15 min después; los borrados hasta 2 días.
  **Sí: los mensajes escritos desde el celular llegan al CRM.**
- **Identidad del contacto:** [Meta] los usuarios se identifican con IDs por negocio (`user_id`,
  `from_user_id`, `to_user_id`); **el teléfono puede venir vacío** y puede venir un `username`.
  [Inferencia] El CRM hoy identifica al contacto por teléfono: con coexistencia hay que aceptar
  contactos sin teléfono. Va a la cola de implementación, no a este documento.
- **Etiquetas de WhatsApp Business:** [Meta] **no se sincronizan** (tabla del punto 2: «labels»
  dentro de herramientas de mensajería, no soportadas en Cloud API; el webhook de contactos no las
  lleva). Las etiquetas del CRM (Eje A del roadmap) tendrán que crearse de nuevo.
- **Webhooks adicionales:** [Meta] `account_update`, `history`, `smb_app_state_sync`,
  `smb_message_echoes`.

**Cambió:** etiquetas, de «sin verificar» a **no se sincronizan**; la ventana es de 24 h con dos
llamadas que hace el integrador (no «un envío automático»); media solo de 14 días; el teléfono del
contacto puede faltar.

### 4. Excluir chats (proveedores, personales)

**No documentado.** Ninguna página de Meta leída ofrece filtrar por contacto o por chat.
[Meta] Lo que sí está: «All contacts with a WhatsApp number can be synchronized»; el historial cubre
todos los chats 1:1; cada envío desde la app genera un eco.

[Inferencia] Las únicas palancas son de todo o nada:
- El dueño puede **negarse a compartir el historial** al conectar (error `2593109`).
- Nosotros podemos **no llamar** a la sincronización de historial o de contactos (son llamadas que
  inicia el integrador).
- Pero los mensajes **nuevos**, entrantes y ecos, de **todos** los chats 1:1 llegan igual al webhook.
  Cualquier exclusión sería un filtro **nuestro**, después de recibir el dato.

**Cambió:** antes era «no encontramos»; ahora es «no documentado en las páginas oficiales, y el
diseño documentado implica que todo chat 1:1 entra».

### 5. Precios, ventana y límites

- **App vs. API:** [Meta] lo enviado desde la app «will continue to be free»; lo enviado por Cloud
  API, tarifa de Cloud API. Los mensajes de la app **no abren ni extienden** la ventana de 24 h. La
  ventana se abre solo cuando el usuario escribe a un negocio ya conectado; si escribió justo antes
  del onboarding, solo se le puede responder por API con plantilla.
- **Modelo:** [Meta] por mensaje desde el **2025-07-01**. Desde el **2026-10-01** se cobran los
  mensajes de servicio y las plantillas de utilidad dentro de la ventana; hay **1.000 mensajes de
  servicio gratis por número y por mes** (no acumulables). Esto **confirma en fuente primaria** la
  franquicia que `04-integraciones/01-whatsapp-cloud-api.md` (fila 1b del registro de supuestos)
  tenía como **[S]**.
- **Colombia:** [Meta] mercado **propio** en la tarjeta de tarifas; tarifas en **COP desde el
  2026-04-01**. **Las cifras no se pudieron leer**: están en CSV/PDF y en una tabla interactiva que la
  herramienta no extrae. Pendiente: descargarlas a mano.
- **Contradicción a vigilar:** [Meta] la página comercial `whatsappbusiness.com/products/platform-pricing`
  todavía dice que no se cobran los mensajes de servicio. La documentación para desarrolladores, más
  específica y con fecha, dice lo contrario. Manda la de desarrolladores.
- **Rendimiento:** [Meta] un número con coexistencia tiene «a fixed throughput of 20 mps».
- **Límites de mensajería:** [Meta] por **portafolio** (no por número): empiezan en **250**
  destinatarios únicos fuera de ventana en 24 h, suben a 2.000 al verificar el negocio o tras 2.000
  envíos de calidad en 30 días, y luego automáticamente. Nada específico de coexistencia.

**Cambió:** 20 mps y franquicia de 1.000 pasan de tercero a **[Meta]**; Colombia tiene tarjeta en
COP. Las cifras siguen sin leer.

### 6. Riesgos y reversa

- **Desconectar sin perder el número:** [Meta] no se puede usar la API de desregistro con un número
  en coexistencia. El dueño desconecta en la app: **Ajustes > Cuenta > Plataforma Business >
  Desconectar cuenta**. Nos llega `account_update` / `PARTNER_REMOVED` con `reason` e
  `initiated_by`. Para reconectar o cambiar de socio hay que **esperar 15 minutos** (errores
  `3441049`, `2655094`). [Inferencia] El número nunca sale de la app: desconectar solo corta el CRM.
- **Desconexiones involuntarias:** [Meta] cambiar de celular, reinstalar o re-registrar el número
  dispara `ACCOUNT_OFFBOARDED`. Al registrarse de nuevo la app ofrece reconectar (casilla marcada) y
  se reconecta en minutos (`ACCOUNT_RECONNECTED`), **sin** volver a sincronizar historial. Mientras
  tanto los envíos por API están suspendidos. Otros motivos de `PARTNER_REMOVED`: `CHANGE_NUMBER`,
  `BUSINESS_DOWNGRADE` (pasó el número a WhatsApp normal), `ACCOUNT_DISCONNECTED` (sanción o
  borrado), `USER_RE_REGISTERED`.
- **Error `131060`:** [Meta] esperado en el primer mensaje de un usuario o desde un compañero no
  soportado; se resuelve en segundos.
- **Calidad y bloqueos:** **no documentada** una regla propia de coexistencia; aplican los límites y
  la calidad de siempre, por portafolio. [Inferencia] Un bloqueo por calidad afectaría al número que
  la agencia usa para todo, también con proveedores: es un riesgo mayor que con un número dedicado.

### 7. Tech Provider (T-080) y conexión manual (T-279)

[Meta] Pasos de «Become a Tech Provider»:
1. App de Meta con el caso de uso WhatsApp y un portafolio de negocio conectado.
2. **Verificación del negocio** (de ViajaPro): «Your business must be verified before you can start
   the app review process». Además, sin verificación no hay acceso avanzado (página de niveles de
   acceso).
3. **Revisión de la app** con acceso avanzado a `whatsapp_business_messaging` y
   `whatsapp_business_management`: ícono, política de privacidad, categoría, **un video por
   permiso** (envío de un mensaje que se ve en WhatsApp; creación de una plantilla) y una descripción
   escrita por permiso. Pedir permisos de más es causa común de rechazo.
4. Embedded Signup (solo para Tech Provider o Solution Partner), webhooks, y cada cliente añade **su
   propio medio de pago** (el Tech Provider no tiene línea de crédito).

- **Plazos:** [Meta] «The average turnaround time for App Review is about 24 hours». **La duración
  de la verificación del negocio: no documentada** en las páginas leídas.
- **Tope de clientes antes de verificar:** no documentado.
- **T-279 (operar la WABA de una agencia con un token de usuario de sistema de esa agencia, sin ser
  Tech Provider):** **no documentado**. [Meta] Las rutas documentadas para acceder a la WABA de otro
  negocio son (a) Embedded Signup con token de negocio, solo para Tech Provider/Solution Partner, y
  (b) compartir la WABA con un portafolio verificado para usar Business Suite, que **no da acceso a la
  API**. Pedir permisos a usuarios sin rol en la app exige acceso avanzado, y este exige verificación
  del negocio. [Inferencia] La conexión manual sin Tech Provider no tiene respaldo documental; T-279
  sigue abierta.

## Lo que sigue sin verificar

- Cifras de las tarifas de Colombia (CSV/PDF de Meta).
- Umbral de actividad del número (`3441045`/`3441077`): solo se sabe que existe.
- Cuánto tarda la verificación del negocio de ViajaPro.
- Elegibilidad real del número de JD Tours: exige T-080 y la prueba con el número.
- Si JD Tours usa difusiones de negocio, Meta Business Agent o «Auto lists» en la app (bloquean la
  conexión): **preguntar al dueño**.
- Normativa: el análisis de la Ley 1581 del ADR-0033 no es asesoría jurídica.

## Implicación para ViajaPro

- Coexistencia **es viable para Colombia** según Meta, pero exige Tech Provider (T-080) y Embedded
  Signup v4/v5.
- Cola de implementación si se adopta (no se abre aquí): webhooks `history`, `smb_app_state_sync`,
  `smb_message_echoes` y `account_update`; marcar el origen app/API en `inbox` y `analytics`;
  persistir el historial al recibirlo (una sola vez, en 24 h); contactos sin teléfono (BSUID); pausar
  envíos ante `ACCOUNT_OFFBOARDED`; aviso al dueño antes del día 14 de inactividad.
- La decisión de producto está en [ADR-0033](../03-adr/0033-coexistencia-y-chats-de-proveedores.md)
  (Propuesto).

## Fuentes

Consultadas el **2026-11-21** (lectura directa), salvo indicación. Ninguna página de Meta mostraba
fecha de actualización.

Meta (oficial):
- Onboarding de usuarios de la app (coexistencia): https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users y https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users (y su `.md`)
- Changelog: https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog
- Blog, 2025-03-19: https://developers.facebook.com/blog/post/2025/03/19/introducing-api-solutions-for-whatsapp-business-users-launched/
- Versiones de Embedded Signup: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions.md
- Embedded Signup v4: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4.md
- Resumen de Embedded Signup: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview
- Implementación: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation.md
- Errores: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/errors.md
- Ingreso con la app Business (beta): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/whatsapp-business-app-login.md
- Reconectar clientes de coexistencia: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/reconnect-offboarded-coexistence-clients.md
- Webhook `smb_app_state_sync`: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync.md
- Webhook `smb_message_echoes`: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes.md
- Precios: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing (y su `.md`)
- Límites de mensajería: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits.md
- Ser Tech Provider: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers
- Onboarding como Tech Provider: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider.md
- Revisión de la app: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review.md
- Tipos de socio: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview.md
- Usuarios de sistema: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-system-users.md
- Tokens de acceso: https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens.md
- Niveles de acceso de la Graph API: https://developers.facebook.com/docs/graph-api/overview/access-levels/
- Verificación del negocio (sin plazo publicado): https://developers.facebook.com/docs/development/release/business-verification/
- Página comercial de precios (contradice a la de desarrolladores): https://whatsappbusiness.com/products/platform-pricing/
- Índice de la documentación: https://developers.facebook.com/documentation/business-messaging/whatsapp/llms.txt

Probadas sin resultado: `https://faq.whatsapp.com/1007979797379920` (Page not found) y
`https://www.facebook.com/business/help/2058515294227817` (solo devolvió el título).

Terceros (solo corroboración; consultados el 2026-11-20 o por buscador el 2026-11-21):
- https://docs.360dialog.com/docs/hub/embedded-signup/whatsapp-coexistence
- https://developers.telnyx.com/docs/messaging/whatsapp/coexistence
- https://www.infobip.com/docs/whatsapp/manage-integration/coexistence
- https://chakrahq.com/product/whatsapp/tools/whatsapp-coexistence-support/
- https://www.chatdaddy.tech/blog/whatsapp-coexistence-what-you-keep-and-lose
- https://dualhook.com/whatsapp-coexistence-limitations
- https://www.instantreply.co/blog/whatsapp-coexistence-what-actually-syncs-2026
- https://respond.io/help/whatsapp/migrating-from-whatsapp-personal-or-whatsapp-business-app
