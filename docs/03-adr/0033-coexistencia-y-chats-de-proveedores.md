# ADR-0033 — Número de la agencia en coexistencia o número separado, y chats de proveedores (Ley 1581)

- **Estado:** Propuesto (borrador, 2026-11-21). **No aceptado:** decide el propietario.
- **Fecha:** 2026-11-21
- **Decide:** Propietario del producto
- **Consultados:** `investigador` (redacta, con la verificación en Meta del 2026-11-21) y
  `auditor-seguridad` (una vuelta: ver «Auditoría de seguridad» al final). Pendiente: `arquitecto`
  y `whatsapp` cuando se abra la implementación; revisión jurídica antes de producción
  (`docs/05-seguridad/02-proteccion-de-datos.md`, §7).
- **Amplía:** [ADR-0002](0002-whatsapp-cloud-api.md). No lo supersede: seguimos en Cloud API
  directo como Tech Provider; esto decide **cómo** entra el número de una agencia que ya usa la app
  WhatsApp Business.
- **Tareas:** T-338 (este ADR), T-337 (verificación), T-080 (Tech Provider).

---

## Contexto

La agencia piloto (JD Tours, Colombia) atiende **clientes y proveedores** desde **un solo número**
en la app WhatsApp Business de su celular, y trabaja todo desde el teléfono. Su dueño pregunta si al
conectar ese número al CRM pierde la app.

Lo verificado en la documentación de Meta el 2026-11-21
([investigación](../_investigacion/2026-11-20-coexistencia-whatsapp-business-app.md)):

1. **La migración clásica** (borrar la cuenta de la app y registrar el número en Cloud API) **le
   quita la app y el historial**.
2. **La coexistencia** mantiene el número en la app y en Cloud API a la vez. Está disponible para
   Colombia (no figura en ninguna exclusión de Meta). Exige que **nosotros** seamos Tech Provider
   (T-080) y usemos Embedded Signup v4 (`featureType: whatsapp_business_app_onboarding`) o v5.
3. Con coexistencia, **todo chat individual del número** llega a nuestro webhook: mensajes entrantes,
   lo que el dueño escribe desde el celular (`smb_message_echoes`), hasta **180 días de historial**
   si se pide en las primeras 24 h, y la **libreta de contactos** (`smb_app_state_sync`). Los grupos
   no llegan.
4. **No hay forma documentada de excluir chats.** Las palancas son de todo o nada: el dueño puede
   negarse a compartir el historial, y nosotros podemos no pedir historial ni contactos. Los
   mensajes nuevos de todos los chats 1:1 llegan igual.
5. Otros costes: el CRM se desconecta si el celular pasa **~14 días** sin abrir la app; **20 msg/s**
   fijos; las **etiquetas** de WhatsApp Business no se sincronizan; se desactivan difusiones, mensajes
   temporales y «ver una vez»; el contacto puede llegar **sin teléfono** (solo un ID por negocio).

Esto choca con la Ley 1581 de 2012 de dos maneras distintas:

- **Proveedores.** Detrás de cada hotel, mayorista u operador hay **personas naturales** (nombre,
  teléfono, lo que escriben). Son datos personales. La agencia es responsable; ViajaPro es encargado
  ([protección de datos](../05-seguridad/02-proteccion-de-datos.md) §2). La comunicación con
  proveedores tiene relación con el negocio, pero la finalidad declarada del CRM hoy es la atención a
  clientes.
- **Chats personales del dueño** (familia, amigos). No tienen **ninguna** finalidad comercial. Si
  entran al CRM, tratamos datos de terceros sin finalidad ni autorización, y pueden incluir datos
  sensibles.

No es asesoría jurídica: es la lectura del equipo, pendiente de abogado.

## Opciones consideradas

### A — Coexistencia en el número actual, guardando todo

Se conecta el número tal cual; todo lo que llega se guarda (cifrado, ADR-0015), con historial.

- **Gana:** cero fricción para el dueño y sus clientes; el CRM ve el 100 % del tráfico real.
- **Cuesta:** guardamos chats de proveedores y personales sin finalidad declarada; 180 días de
  historial de terceros que nunca aceptaron nada; incompatible con minimización (§4 de protección
  de datos).
- **Cierra:** poder decir, honestamente, que el CRM solo guarda lo de clientes.

### B — Coexistencia con salvaguardas: lista de exclusión antes de guardar, sin historial por defecto, aviso de privacidad

Se conecta por coexistencia, pero:

1. **Lista de exclusión por agencia** (configurable por la agencia, R12): números e IDs de usuario
   (BSUID) de proveedores y contactos personales. **No se filtra en el borde:** por ADR-0008 §4 el
   webhook guarda la carga bruta sellada en la tabla global de recepciones **antes** de responder 200
   y antes de saber de qué agencia es. Lo que llegue de o hacia un excluido se persiste sellado en
   ese staging sin agencia, **nunca entra a tablas de negocio**, y al clasificarlo en el trabajador se
   anula su contenido (motivo `EXCLUIDO`, vía `anular_payload`; `purgar_payloads` como respaldo). El
   filtro corre antes de registrar el mensaje, crear el contacto, descargar media, escribir el outbox
   o emitir el evento en vivo; en los ecos se filtra por el **destinatario** (`to`/`to_user_id`), y
   por BSUID cuando no llega teléfono. Ni teléfono ni BSUID van a logs ni a trazas; el contador es
   agregado por agencia, nunca por contacto.
2. **Sin historial ni libreta por defecto.** No se llama a la sincronización de historial ni de
   contactos salvo que el dueño lo pida expresamente; si lo pide, pasa por el mismo filtro.
3. **Aviso de privacidad y política de tratamiento de la agencia** actualizados (responsable: la
   agencia) y contrato de encargo firmado antes del primer dato real.
4. **Recomendación operativa al dueño:** pasar sus chats personales a un número personal.

- **Gana:** el dueño no cambia de número ni de app; los clientes no notan nada; reduce mucho lo
  que guardamos de proveedores y personales.
- **Cuesta:** **el filtro es nuestro, no de Meta**: el dato ya cruzó a nuestro servidor (y por
  Meta) y queda sellado en staging hasta anularse. Un proveedor nuevo entra hasta que alguien lo
  marca, y **marcarlo tarde no borra lo ya guardado**: hace falta una supresión real de lo anterior
  (mensajes, S3, outbox). La propia lista es PII (teléfonos de familiares): cifrada o en HMAC,
  editable solo por dueño o administrador y con cada cambio auditado, para que un asesor no pueda
  excluir a un cliente y ocultar conversaciones. Si el mensaje llega sin teléfono, el
  filtro tiene que funcionar también por BSUID. Hay que construir la lista, el filtro y su prueba.
  El número de la agencia queda expuesto a bloqueos de calidad por lo que salga del CRM, y un bloqueo
  corta también a los proveedores.
- **Cierra:** el historial previo. Meta solo deja pedirlo **en las primeras 24 h** tras conectar; si
  no se pide, no hay forma de recuperarlo para esa conexión. Lo demás se puede abrir después.

### C — Número separado solo para el CRM

Una línea nueva, registrada por Embedded Signup normal (o también en coexistencia si se quiere usar
la app con ella). El número actual sigue en la app para proveedores y personal; los clientes pasan
poco a poco al nuevo (aviso, enlace `wa.me`, QR en el material).

- **Gana:** el CRM solo ve lo de clientes por construcción: la mejor posición en la Ley 1581, sin
  filtro que mantener. Sin plazo de 14 días (si es número solo de API). Un bloqueo de calidad no toca
  la línea de proveedores.
- **Cuesta:** cambia el número que conocen los clientes; durante meses seguirán escribiendo al viejo,
  y eso **no** entra al CRM: el piloto mediría una fracción del tráfico real. Si el número nuevo es
  solo de API, el dueño solo lo puede usar desde el CRM (la web móvil tiene que estar a la altura,
  Eje F). Una línea más que pagar.
- **Cierra:** nada.

### D — Migración clásica del número actual a Cloud API

- **Descartada:** quita la app del celular y borra el historial. Es exactamente lo que el dueño teme.

## Decisión

**Pendiente del propietario.** No se acepta en este PR.

**Recomendación de quien redacta (inferencia, no decisión):** **B para el piloto**, con estas
condiciones previas, y **C como salida** si alguna falla:

- La lista de exclusión y el filtro en el trabajador existen y tienen prueba de punta a punta antes
  de conectar el número real: un entrante y un eco excluidos no dejan filas de negocio, ni media, ni
  outbox, ni log.
- El vínculo número–agencia de Embedded Signup se deriva de la sesión, del canje del `code` y de la
  comprobación en Graph, nunca del cuerpo de la petición (ya exigido en `04-integraciones` §2.3).
- **Sin historial ni libreta en el piloto** (no suscribir `history` ni `smb_app_state_sync`;
  recomendación de `auditor-seguridad`).
- JD Tours actualiza su aviso de privacidad y firma el contrato de encargo.
- El dueño acepta mover sus chats personales fuera del número.
- La elegibilidad del número se confirma en la prueba real (T-337 pendiente; T-080).

Por qué B y no C: el valor del piloto es ver el tráfico **real** de la agencia sin cambiar sus
hábitos; con un número nuevo, la mayor parte de los clientes seguiría escribiendo al viejo. Por qué B
y no A: A guarda datos de terceros sin finalidad, y eso no se arregla después.

Lo que el propietario tiene que decidir:

1. B, C (o A) para JD Tours.
2. Si se pide el historial de 180 días (solo se puede en las primeras 24 h). `auditor-seguridad`
   pide «no» en el piloto: pedirlo «por si acaso» va contra la minimización.
3. Si la exclusión se aplica descartando (recomendado) o guardando aparte con otro régimen.
4. Quién habla con el dueño de JD Tours sobre el aviso de privacidad y sus chats personales.

## Consecuencias

### Positivas
- El dueño no pierde la app (B o C) y lo sabe antes de conectar.
- Queda escrito qué datos de terceros entran y por qué, antes de que entren.

### Negativas
- **B** añade trabajo antes del piloto (lista, filtro en el webhook, prueba, aviso) y un filtro que
  depende de que la agencia marque bien a sus proveedores. El dato excluido ya pasó por Meta y por
  nuestro borde.
- **B** expone el número principal de la agencia a los límites y la calidad de Cloud API, y a la
  desconexión tras ~14 días de inactividad del celular (hay que avisar antes).
- **C** reduce lo que el piloto puede medir y obliga a una migración de clientes que no controlamos.
- Con coexistencia, las etiquetas de WhatsApp Business no pasan al CRM: la agencia las rehace.
- Cualquier coexistencia obliga a aceptar contactos sin teléfono (BSUID), un cambio en `inbox`/`crm`.

### Qué habría que cambiar para revertir
- De B a C: abrir el número nuevo y, cuando convenga, desconectar el viejo desde la app (Ajustes >
  Cuenta > Plataforma Business > Desconectar). El número no se pierde; los datos ya guardados siguen
  la política de retención.
- De C a B: conectar el número viejo por coexistencia; sin historial si ya pasaron las 24 h.

## Cuándo revisar esta decisión

- Si Meta publica una forma de excluir chats o contactos en la coexistencia.
- Si el abogado concluye que el tratamiento de chats de proveedores necesita otra base o lo prohíbe.
- Si en el piloto el filtro deja pasar proveedores con frecuencia (más de uno por semana sin marcar).
- Si el dueño no saca sus chats personales del número: el piloto pasa a C.
- Si Meta cambia el plazo de inactividad o los requisitos (revisión trimestral, ADR-0002).

---

## Auditoría de seguridad

Una vuelta, 2026-11-21 (R13). Revisó también `registrar-recepcion.ts` y `procesar-change.ts`.

**Veredicto:** **B aceptable con cambios** (incorporados arriba). **C aceptable** si el número es
solo de API; si va en coexistencia, hereda todo lo de B. De acuerdo con la recomendación (B para el
piloto, C como salida) si se cumplen los bloqueantes.

**Qué datos entran:** en A, entrantes y ecos de todos los chats 1:1 (clientes, proveedores, familia,
posibles menores y datos de salud), 180 días de historial con media de 14 días y la libreta
completa. En B llegan los mismos entrantes y ecos; el filtro solo decide qué se conserva; historial
y libreta no llegan si no se piden. En C solo API, clientes y algún proveedor o conocido que escriba
al número nuevo.

**Bloqueantes antes de conectar un número real:**
1. **[CRÍTICO]** Vínculo número–agencia en Embedded Signup derivado de la sesión, del canje del
   `code` y de la comprobación en Graph; nunca de `waba_id`/`phone_number_id` del cuerpo.
2. **[ALTO]** El filtro en el trabajador, con prueba de punta a punta (sin filas, media, outbox ni
   log para un excluido), y el texto de §B.1 corregido (hecho en esta versión).
3. Sin historial ni libreta en el piloto (decisión 2 cerrada en «no» por minimización).
4. Contrato de encargo y aviso de privacidad; el dueño saca sus chats personales del número.

**Aislamiento entre agencias:** índices de contacto y de exclusión únicos por `(tenant_id, bsuid)`,
nunca globales; tablas nuevas con `tenant_id`, RLS forzada y `WITH CHECK`, fuera de
`excepciones_rls`. Ecos, historial y contactos se enrutan solo por el directorio con
`metadata.phone_number_id`; `account_update` no trae ese campo y nunca debe resolver la agencia por
`entry.id` ni por el contenido. Hoy el código clasifica todo campo distinto de `messages` como
`CAMPO_NO_SOPORTADO` y anula su contenido: mantenerlo.

**A la cola (no bloquea la prueba controlada):** supresión retroactiva al marcar tarde (sí bloquea
producción); cifrado o HMAC de la lista; que `PARTNER_REMOVED` y `ACCOUNT_OFFBOARDED` revoquen el
canal (reconectar con otro socio tarda 15 min); marcar como excluido desde el primer mensaje;
revisión jurídica de la base de tratamiento de proveedores.
