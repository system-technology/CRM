# Verificación — Cobro de mensajes de servicio de WhatsApp desde el 2026-10-01

**Consultado:** 2026-10-07
**Dispara esta investigación:** punto 1 de la §13 de
[`docs/04-integraciones/01-whatsapp-cloud-api.md`](../04-integraciones/01-whatsapp-cloud-api.md),
marcado `[S]`.
**No se tocó** ese documento ni `ESTADO.md`. Si lo de aquí obliga a corregirlos, lo coordina el
propietario.

---

## Respuesta corta

**Es cierto, y la fecha es la que circula: 2026-10-01.** Encontré una página oficial de Meta —
distinta de la página general de precios— que lo confirma en primera persona: desde esa fecha los
*mensajes de servicio* (respuestas de forma libre dentro de la ventana de 24 h) y las plantillas
`UTILITY` enviadas dentro de esa misma ventana dejan de ser gratis y se facturan por mensaje, a la
tarifa de `UTILITY`/`AUTHENTICATION` del mercado del destinatario. La franquicia de **1.000
mensajes de servicio gratis por número de negocio y por mes** está confirmada con fuerza por
consenso de fuentes secundarias independientes, pero **no logré hacer que la herramienta de
verificación citara ese párrafo exacto de la página oficial**, pese a varios intentos — lo explico
abajo, es un hallazgo en sí mismo. La página general de precios de Meta, mientras tanto, **sigue sin
reflejar el cambio**: es la contradicción oficial que el agente `whatsapp` detectó, y aquí se
confirma que es real, no un error suyo.

---

## Hallazgos

| Hallazgo | Fuente | Fecha de la fuente | Confianza |
|---|---|---|---|
| Existe una página oficial de Meta, separada de la página general de precios, titulada **"Upcoming pricing updates for Meta Business Agent, service and utility messages"**, en `developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages` | Meta for Developers (fuente primaria) | Consultada 2026-10-07; sin fecha de publicación visible en la página | **Alta** |
| Esa página dice literalmente: **"Effective October 1, 2026, Meta will charge on a per-message basis for service messages"** | Misma página, cita literal obtenida | Consultada 2026-10-07 | **Alta** |
| La misma página confirma que **las plantillas `UTILITY` entregadas dentro de la ventana de 24 h** ("Free in 24-hour customer service window") **dejan de serlo desde el 2026-10-01** | Misma página | Consultada 2026-10-07 | **Alta** |
| **Lo que sigue gratis, según la misma página**: la ventana de entrada gratuita de 72 h ("Free in 72-hour free entry point window"), y todo lo que el cliente envía | Misma página | Consultada 2026-10-07 | **Alta** |
| **Definición oficial de "mensaje de servicio"**: *"Service messages are any non-template message not powered by the Meta Business Agent Platform, and can be powered by a 3rd-party AI solution or people like customer service representatives."* Se cobra **por mensaje entregado**, no por conversación | Misma página | Consultada 2026-10-07 | **Alta** |
| La página general de precios (`.../whatsapp/pricing`) **sigue describiendo los mensajes de servicio como gratuitos** ("Service conversations are now free for all businesses", vigente desde 2024-11-01) y su rate card dice estar vigente desde **2026-07-01**, sin incorporar el cambio de octubre | Meta for Developers, página general de precios | Consultada 2026-10-07 | **Alta** |
| El **changelog oficial** (`.../whatsapp/changelog`) **no tiene ninguna entrada** sobre este cambio; su entrada más reciente es de **2026-05-12** | Meta for Developers, changelog | Consultada 2026-10-07 | **Alta** |
| **Franquicia de 1.000 mensajes de servicio gratis por número de negocio y por mes, sin acumulación, reinicio mensual, cobro desde el mensaje 1.001** | **Consenso unánime de al menos diez fuentes secundarias independientes** (360dialog, Courier, ycloud, Zenvia, PickyAssist, chakrahq, techweez, convexinteractive, respond.io, sendpulse, dragapp, wawcd), todas citando la misma página oficial anterior | Artículos entre 2026-09-16 y 2026-09-28 | **Media-alta** (coherencia total entre competidores que normalmente difieren en matices; pero no pude citar la frase exacta desde la página oficial — ver abajo) |
| Requisito de **medio de pago registrado antes del 2026-09-30**, o Meta deja de entregar mensajes de servicio desde el 2026-10-01 | Solo fuentes secundarias (360dialog, otras); **no aparece** en las dos transcripciones que obtuve de la página oficial | Artículos de septiembre 2026 | **Baja-media** — no confirmado en fuente primaria |
| El cargo por mensaje de servicio es **único por mensaje** (no se duplica si además hay IA de por medio), y las plantillas `MARKETING` **no** cambian con esta actualización | Página oficial + Courier | Consultada 2026-10-07 | **Alta** |
| Cambio relacionado, distinto y **no confundir**: desde **2026-08-01** Meta cobra **por token** ($2.00 USD / 1M tokens) los mensajes generados por la **"Meta Business Agent Platform"** — un producto de IA de Meta, separado de que una agencia use su propio agente o asesor humano | Página oficial | Consultada 2026-10-07 | **Alta** |
| Cambios de precios de IA adicionales en 2026, sin relación directa con el tráfico de ViajaPro: cargo a "AI Providers" por mensajes en Brasil desde **2026-02-16**, exención en UE/EEE desde **2026-05-13** | Changelog oficial | Consultado 2026-10-07 | **Alta** |
| Tarifas por categoría para Colombia (`UTILITY`/`AUTHENTICATION` ≈ USD 0,0008–0,00092; `MARKETING` ≈ USD 0,0125–0,0144) | **Solo agregadores terciarios** (ominiflow, whautomate, wha.tools, formbeep) — **no** BSPs de primer nivel, y **discrepan entre sí** en la segunda cifra decimal | Artículos de 2026, sin fecha de página precisa | **Baja** — ver sección siguiente |

---

## Sobre la franquicia de 1.000 mensajes: por qué queda en confianza media-alta y no en "verificado"

Intenté extraer literalmente, de la página oficial
`developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages`,
el párrafo que menciona la franquicia de 1.000 mensajes. El resultado fue **inconsistente entre
intentos**:

- Una búsqueda indexada por el buscador, apuntando a esa misma URL, devolvió el texto: *"For each
  business phone number, Meta provides 1,000 free service messages each month... Meta only charges
  as of the 1,001st service message for each phone number"*, atribuido explícitamente a esa página.
- Dos lecturas directas de esa misma página, con la herramienta de obtención de contenido, **no
  encontraron ese párrafo** en el contenido que lograron extraer, aunque sí confirmaron el resto
  (fecha, definición de mensaje de servicio, fin de la gratuidad de `UTILITY` en ventana).

No puedo determinar si la página cambió entre consultas, si el párrafo está en una tabla o
elemento que la herramienta de lectura no renderiza bien, o si el buscador indexó una versión en
caché. **Es una limitación de la verificación, no una corrección del hallazgo**: dado que más de
diez fuentes secundarias independientes y competidoras entre sí citan exactamente la misma cifra
(1.000, por número, por mes, sin acumulación), y todas remiten a la misma URL oficial, trato la
cifra como **probable y operativamente utilizable**, pero no como un hecho citado verbatim de
fuente primaria de mi propia mano. Recomiendo que alguien con acceso de navegador normal (no esta
herramienta) abra esa URL y capture una captura de pantalla del párrafo exacto — cinco minutos que
cierran la única brecha real de esta verificación.

---

## Las preguntas del encargo, una por una

### 1. ¿Es cierto, y desde cuándo?

**Sí, y es el 2026-10-01**, confirmado en fuente primaria de Meta (la página dedicada a este
cambio, no la página general de precios). La página general de precios **no está actualizada**:
sigue mostrando la regla anterior (servicio gratis desde 2024-11-01) y su rate card dice ser
vigente desde 2026-07-01. El changelog oficial tampoco tiene entrada. **Las tres páginas oficiales
de Meta se contradicen entre sí**, igual que ya ocurría con el plazo de reintento de webhooks
documentado en el §3.3 del documento de integración. Mi lectura: Meta publicó primero la página de
anuncio del cambio (dirigida a BSPs y socios, con meses de antelación) y todavía no propagó el
cambio a la documentación general de referencia ni al changelog — es un patrón de Meta ya
observado por este proyecto (ver la discrepancia de v26.0 vs v25.0 en el mismo documento de
integración).

### 2. Los números concretos

| Dato | Valor | Unidad | Periodo | Confianza |
|---|---|---|---|---|
| Franquicia gratis | 1.000 mensajes de servicio | **Por número de teléfono de negocio** (no por WABA, no por portafolio) | Mensual, se reinicia, no acumula | Media-alta (ver arriba) |
| Tarifa del excedente | **La misma que `UTILITY`/`AUTHENTICATION`** del mercado del destinatario, sin escalones por volumen | Por mensaje entregado | — | Alta (confirmado en fuente primaria: "charged... aligned to... utility and authentication rates by market") |
| Tarifa `UTILITY`/`AUTHENTICATION` en Colombia | Cifras reportadas entre **USD 0,0008 y USD 0,00092** por mensaje | Por mensaje | — | **Baja.** Solo agregadores terciarios, con cifras que no coinciden entre sí en el segundo decimal. **No encontré el rate card oficial con el valor exacto**: está en un CSV/PDF descargable que mi herramienta de lectura no pudo abrir |
| Tarifa `MARKETING` en Colombia | Cifras reportadas entre **USD 0,0125 y USD 0,0144** | Por mensaje | — | **Baja**, mismo motivo. No afecta el tráfico de servicio, que es el que importa aquí |

**No pude verificar el valor exacto en pesos colombianos (COP) contra el rate card oficial de
Meta.** La página oficial ofrece el rate card de Colombia como archivo CSV/PDF descargable
("Rates(CSV) | Volume tiers(CSV) | Rates and Volume tiers(PDF)"), pero no como tabla en la página
misma, y mi herramienta no pudo descargar ni abrir esos archivos. **Pendiente**: alguien con
navegador descarga el CSV de COP desde esa sección y lo deja en el repositorio o cita el número
exacto.

También intenté `business.whatsapp.com/products/platform-pricing`, que debería tener una
calculadora interactiva por país. Esa URL **redirige (301) a `whatsappbusiness.com/es-la/...`**,
un dominio que no pude confirmar que sea propiedad de Meta. Por prudencia, no lo consulté ni lo
cito como fuente. Si alguien del equipo reconoce ese dominio como legítimo, puede retomar la
verificación desde ahí.

### 3. ¿Las plantillas `UTILITY` en ventana abierta siguen siendo gratis?

**No, desde el 2026-10-01 ya no.** Confirmado en fuente primaria, cita literal: la página oficial
lista "Utility templates in 24-hour customer service window" como "Free" hasta esa fecha, con el
cambio entrando en vigor junto con el de mensajes de servicio. Esto **invalida directamente** la vía
que el documento de integración describe como "gratuita" para confirmaciones dentro de ventana —
hay que corregirlo (lo dejo anotado para el propietario; no lo toco yo).

### 4. ¿Qué cuenta como "mensaje de servicio"?

**Cada mensaje individual, no una conversación ni un lote.** Cita literal de fuente primaria:
*"Service messages are any non-template message not powered by the Meta Business Agent Platform,
and can be powered by a 3rd-party AI solution or people like customer service representatives."*
Se cuenta y se cobra **por mensaje entregado** (`delivered`), no por conversación ni por sesión.

**Para calibrar el ejemplo del encargo:** tres asesores, veinte conversaciones diarias cada uno, con
un promedio conservador de solo 3 mensajes de respuesta por conversación, ya son **180
mensajes/día** → **~5.400 mensajes/mes** contando solo días hábiles. Eso es **más de cinco veces** la
franquicia de 1.000. Con la IA de `ingeniero-ia` interviniendo (cada confirmación, cada
reformulación, cada mensaje de seguimiento cuenta aparte), el múltiplo sube, no baja. **La
franquicia de 1.000 es generosa para una agencia muy pequeña y arranca el cobro muy pronto para
cualquier agencia con actividad real.**

Importante no confundirlo con el cambio de **Meta Business Agent Platform** (cobro por token,
desde 2026-08-01): ese es un producto de IA propio de Meta, separado. **ViajaPro no usa ese
producto** — usamos Claude por fuera de la plataforma de Meta — así que los mensajes que envíen
nuestros asesores o nuestra capa de IA caen en la categoría "mensaje de servicio" normal, facturada
por mensaje a tarifa `UTILITY`, no por token. Confirmar esto es relevante porque un lector
apresurado podría mezclar ambos cambios.

### 5. ¿Hay más cambios de precio vigentes o anunciados que no se hayan visto?

Sí, aunque de impacto menor para ViajaPro hoy:

- **2026-08-01**: cobro por token de los mensajes generados por "Meta Business Agent Platform" — no
  aplica mientras no usemos ese producto de Meta.
- **2026-02-16**: cargo a "AI Providers" por mensajes no-plantilla entregados a usuarios en Brasil.
- **2026-05-13**: exención de ese cargo para mercados UE/EEE (Brasil sigue cobrado). No aplica a
  Colombia directamente, pero es la misma familia de cambios: Meta está reestructurando el cobro de
  todo lo que no sea plantilla clásica, en varias direcciones a la vez.
- El rate card general dice estar "vigente desde 2026-07-01" y Meta publica actualizaciones
  trimestrales (1 enero, 1 abril, 1 julio, 1 octubre) — el de **2026-10-01 corresponde exactamente a
  ese calendario trimestral**, así que no es un cambio fuera de ciclo ni sorpresivo desde la óptica
  de Meta, aunque para nosotros haya llegado sin previo aviso porque no monitoreábamos esa página
  específica.

---

## Lo que NO se pudo verificar

- **La cita literal exacta de la franquicia de 1.000 mensajes** directamente desde la página
  oficial (ver explicación arriba). Corroborado por consenso fuerte de fuentes secundarias, pero no
  por mi propia lectura directa confirmada dos veces.
- **El valor exacto en USD o COP de la tarifa `UTILITY`/`AUTHENTICATION` para Colombia**, contra el
  rate card oficial descargable. Solo tengo cifras de agregadores terciarios que no coinciden entre
  sí en el segundo decimal.
- **El requisito de medio de pago registrado antes del 2026-09-30** como condición para seguir
  recibiendo mensajes de servicio. Solo en fuentes secundarias, ausente en lo que pude extraer de la
  página oficial.
- **Si `business.whatsapp.com` redirige legítimamente a `whatsappbusiness.com`** o si es una señal
  de typosquatting / migración de dominio que vale la pena que alguien revise manualmente antes de
  usarlo como fuente en el futuro.
- Fecha de publicación u última modificación de la página oficial del cambio: no es visible en el
  contenido que pude extraer.

---

## Implicación para ViajaPro

**El modelo de negocio no queda invalidado, pero el costo variable por agencia cambia de orden de
magnitud exactamente donde el encargo temía: en el tráfico de mensajes de servicio, que es la
inmensa mayoría de lo que circula por el inbox.**

Puntos concretos para quien decida el modelo de cobro:

1. **La franquicia de 1.000/número/mes se agota rápido.** Con el ejemplo conservador de arriba
   (tres asesores, veinte conversaciones/día, tres mensajes por conversación), una sola agencia
   activa la supera en la primera semana del mes. El costo deja de ser "ruido" y pasa a ser una
   línea real del unit economics del plan de entrada.
2. **La vía que parecía gratuita para confirmaciones — plantilla `UTILITY` dentro de ventana
   abierta — ya no lo es.** Si el diseño de producto o el argumento comercial se apoyaba en "las
   confirmaciones dentro de la ventana de 24 h no cuestan nada", eso ya no es cierto desde hace seis
   días.
3. **El costo es por número de WhatsApp de la agencia, no por tenant ni por portafolio.** Una
   agencia con varios números (varios asesores con líneas distintas, o varias sedes) multiplica la
   franquicia, pero también multiplica la exposición: cada número lleva su propio contador de 1.000.
   Esto hace que el diseño ya documentado en el §7.4 del documento de integración —registrar
   `channel_id`, `billing_category`, `billed_month`, `recipient_country` y `delivered_at` en cada
   mensaje saliente desde la primera migración— sea más urgente, no menos: sin esos datos, nadie
   puede calcular cuánto le cuesta Meta a ViajaPro por agencia, y ese número hoy es mayor de lo que
   se asumía hace una semana.
4. **No se puede fijar el precio final sin la tarifa exacta de Colombia en COP contra el rate card
   oficial.** Las cifras que corren hoy (centésimas de centavo de dólar por mensaje) son bajas en
   términos absolutos, pero con miles de mensajes por agencia al mes dejan de ser insignificantes.
   Antes de comprometer un precio de plan de entrada, alguien debe bajar el CSV oficial de COP —
   cinco minutos con un navegador normal, tarea que mi herramienta no pudo completar.
5. **No cambia** la arquitectura ni el diseño de datos que el documento de integración ya exige: el
   esquema estaba bien pensado para este escenario antes incluso de confirmarlo. Lo que cambia es la
   urgencia de implementarlo y la seriedad con la que se debe tratar como bloqueante para decidir el
   modelo de cobro, no como una tarea de "Fase 3" aplazable.

No me corresponde proponer precios ni plan de cobro. Sí corresponde decir con claridad: **el
supuesto de que los mensajes de servicio son gratis ya no es sostenible para ningún cálculo de
unit economics a partir de hoy**, y el propietario debería tratar el punto 1 de la §13 del
documento de integración como confirmado, no como pendiente, al momento de decidir el modelo de
cobro.
