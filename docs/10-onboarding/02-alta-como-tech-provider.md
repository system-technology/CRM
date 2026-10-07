# Alta de ViajaPro como Tech Provider de Meta

**Documento para el propietario del producto.** Es la **tarea 1 del camino crítico**
([ADR-0002](../03-adr/0002-whatsapp-cloud-api.md)): nada con clientes reales puede lanzarse hasta que
esto termine. El desarrollo sí puede avanzar en paralelo, y aquí se explica desde qué momento exacto.

> **Lee primero el §0.** Dices que «el tema de Meta Business ya está resuelto». Hay tres cosas
> distintas que suenan igual. El §0 te dice en treinta segundos cuál tienes de verdad.

---

## Estado de verificación de este documento

Verificado contra documentación oficial de Meta el **2026-10-07**.

| Marca | Significado |
|---|---|
| **[V]** | Verificado en una página oficial de Meta el 2026-10-07, con enlace. |
| **[S]** | Verificado en fuentes secundarias consistentes (BSPs, guías de partners). Probable, no contractual. |
| **[?]** | No verificado. Hay que comprobarlo al llegar a ese paso. |

Todo lo marcado **[S]** y **[?]** está recogido en el [§8](#8-lo-que-no-pude-verificar).
Meta cambia este proceso varias veces al año. **Si la fecha de arriba tiene más de tres meses, no te
fíes de los plazos ni de los nombres de menú.**

---

## 0. Comprobación de 30 segundos: ¿cuál de las tres tienes?

Haz esto **antes de leer nada más**. Tres pestañas, tres pantallas.

### Pantalla 1 — ¿Tienes portafolio de negocio? *(10 segundos)*

Abre **`business.facebook.com/settings`**.

- **Si ves un nombre de empresa arriba a la izquierda y un menú lateral con «Usuarios», «Cuentas»,
  «Seguridad»** → tienes **portafolio de negocio**. Es la cosa nº 1.
- **Si te pide crear uno** → no tienes nada todavía. Empieza por el [§3, Bloque A](#bloque-a--la-base--1-día-hábil--bloquea-todo).

Anota el **ID del portafolio** (aparece en la URL como `business_id=...` o en «Información del
negocio»). Lo vamos a necesitar.

### Pantalla 2 — ¿Está verificado el negocio? *(10 segundos)*

Abre **`business.facebook.com/settings/security-center`** (menú: **Configuración del negocio →
Centro de seguridad**).

Busca la fila **«Verificación del negocio»**:

| Lo que ves | Lo que significa |
|---|---|
| **Verificada** / *Verified* | Cosa nº 2 hecha. Te ahorras días de espera. |
| **En revisión** / *Pending* | En curso. No toques nada más ahí: solo espera. |
| **No verificada** / **Empezar verificación** | No está hecha. Es lo que más tarda: empiézala hoy. |
| **Rechazada** / *Not verified* | Peor que no haberla hecho. Lee el [§7](#7-qué-puede-salir-mal). |

### Pantalla 3 — ¿Existe nuestra app? *(10 segundos)*

Abre **`developers.facebook.com/apps`**.

- **Si la lista está vacía** → la cosa nº 3 **no existe**. Es la que nadie puede hacer por nosotros
  y la que falta casi seguro.
- **Si hay una app**, entra y mira el menú lateral: debe existir **Casos de uso → WhatsApp**, y
  dentro, **Tech Provider onboarding**. Si ese apartado no aparece o está sin completar, falta la nº 3.

> **El resultado más probable:** tienes la 1, quizá la 2 (porque quien ha hecho publicidad o tiene
> una página acaba teniendo portafolio de negocio), y **no tienes la 3**. Eso no es malo: la 2 es
> precisamente la que más tarda.

---

## 1. Las tres cosas que se confunden

| # | Qué es | Quién la hace | Para qué sirve | ¿Bloquea el lanzamiento? |
|---|---|---|---|---|
| **1** | **Portafolio de negocio de la agencia** (Meta Business Manager) | **El cliente**, en 2 minutos, normalmente durante el Embedded Signup | Contiene el WhatsApp Business Account (WABA) y el número de la agencia | No |
| **2** | **Verificación del negocio de la agencia** ante Meta | **El cliente**, opcional | Le sube los límites de envío y le da nombre verificado. Sin verificar: entrantes ilimitadas, 250 iniciadas/24 h, 250 plantillas | **No.** Ver `01-requisitos-para-la-agencia.md` |
| **3** | **Nuestra app de Meta aprobada como Tech Provider** | **Nosotros. Solo nosotros.** | Es lo que nos deja conectar números de terceros con Embedded Signup | **Sí. Es el único bloqueo real.** |

Las tres existen a la vez y son independientes. **La nº 3 incluye su propia verificación de negocio
—la de *nuestra* empresa, no la del cliente—** y esa sí es obligatoria.

> **Que un cliente tenga la 1 y la 2 no nos adelanta nada.** Su verificación no se transfiere.
> Y al revés: cuando tengamos la 3, el cliente podrá conectarse **sin** tener la 2.

**No confundir con «Solution Partner».** Es un programa distinto y más duro: exige ser Meta Business
Partner, y es el modelo en el que el proveedor factura el consumo a Meta y lo repercute. **Nosotros
vamos por Tech Provider**, donde **cada cliente pone su propio medio de pago** en su cuenta de
WhatsApp Business. **[V]** — [Embedded Signup · Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/),
consultado 2026-10-07.

> ⚠️ **Discrepancia que hay que resolver antes de cerrar el modelo de negocio.**
> ADR-0002 dice «Nosotros facturamos a Meta el consumo y lo repercutimos». Eso describe el modelo
> **Solution Partner**, no el de **Tech Provider** que el mismo ADR elige. En Tech Provider paga el
> cliente directamente a Meta. **No cambies nada por tu cuenta**: avísanos y se resuelve con un ADR
> que supersede o aclare el 0002. No afecta a los pasos de esta guía.

---

## 2. Qué hace falta antes de empezar

### Obligatorio

- [ ] **Entidad legal constituida y vigente.** No se puede verificar un negocio que no está
      registrado. En Colombia: sociedad inscrita en Cámara de Comercio, con NIT. **[S]**
- [ ] **Dominio propio.** Hace falta en tres sitios distintos, por eso no es opcional: el formulario
      de verificación pide el sitio web; la revisión de la app exige una URL de política de
      privacidad pública; y Embedded Signup solo acepta **dominios con HTTPS válido** en «Allowed
      domains» y «Valid OAuth redirect URIs». **[V]** — [Embedded Signup · Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/).
- [ ] **Una web pública mínima** en ese dominio, con nombre legal, dirección, teléfono y correo
      **coherentes con los documentos**, más **política de privacidad** y **términos de servicio**
      accesibles sin iniciar sesión.
- [ ] **Correo corporativo en ese dominio** (`algo@tudominio.com`). Meta confirma tu vínculo con el
      negocio por correo, teléfono, SMS, WhatsApp o verificación de dominio; el corporativo es el que
      menos fricción da. **[S]**
- [ ] **Teléfono real de la empresa, no VoIP**, y que aparezca en los documentos o en la web. **[S]**
- [ ] **Cuenta personal de Facebook** con algo de antigüedad, que será administradora.
- [ ] **Documentos legales escaneados.** Lista exacta en el [§2.1](#21-documentos-colombia).

### No es obligatorio, aunque suele creerse que sí

- **Página de Facebook o Instagram de ViajaPro.** No hace falta para esto. (Para la agencia cliente
  sí ayuda, pero eso es el otro documento.) **[S]**
- **Insignia verde / Meta Verified.** Cosa distinta, de pago, irrelevante aquí.
- **RNT (Registro Nacional de Turismo).** Lo necesita la agencia, no nosotros: vendemos software,
  no viajes.
- **Que el cliente esté verificado.** Ver §1.

### ¿Hace falta página web propia? — Respuesta honesta

**Meta no publica «sitio web obligatorio» como requisito literal de la verificación del negocio**, y
de hecho ofrece confirmar la conexión por teléfono, SMS o correo en vez de por dominio. **[S]**

**Pero para un Tech Provider, en la práctica, sí.** Porque:

1. El formulario de verificación pide nombre, dirección, teléfono, correo **y sitio web**. **[S]**
2. La revisión de la app exige «basic settings such as an app icon, **privacy policy**, and app
   category». **[V]** — [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers).
3. Embedded Signup solo funciona sobre dominios HTTPS declarados en la app. **[V]**

**Conclusión operativa: trata el dominio y la web mínima como requisito previo bloqueante.**

Esto **no contradice** `01-requisitos-para-la-agencia.md` §«¿Y la página web?», donde decimos que la
agencia no necesita web: **allí hablamos del cliente, aquí de nosotros.** Son dos trámites distintos
con dos exigencias distintas. Conviene tenerlo claro para no dar la respuesta equivocada a un cliente.

### 2.1 Documentos (Colombia)

Meta acepta cinco tipos de documento. El mapeo práctico para Colombia: **[S]**

| Lo que Meta pide | Qué sirve en Colombia | Para probar |
|---|---|---|
| *Certificate / Articles of Incorporation* | **Certificado de existencia y representación legal** de Cámara de Comercio, expedido en los últimos 90 días | **Nombre legal** |
| *Business registration or license document* | El mismo certificado de Cámara de Comercio | Nombre legal + dirección |
| *Government issued business tax document* | **RUT actualizado** de la DIAN | Nombre legal + NIT |
| *Business bank statement* | **Extracto bancario** a nombre de la empresa, últimos 90 días | Dirección y/o teléfono |
| *Utility bill* | **Recibo de servicio público** a nombre de la empresa, últimos 90 días | Dirección y/o teléfono. **No sirve para el nombre legal** |

Prepara **dos o tres**: uno que pruebe el nombre legal y otro la dirección y el teléfono.

**Reglas de formato que tumban una solicitud por sí solas: [S]**

- PDF, PNG, JPG o JPEG. Máximo 10 MB por archivo.
- Página **completa y sin editar**: las cuatro esquinas visibles, nada recortado, nada tachado,
  **sin subrayados ni anotaciones añadidas**.
- Documento **vigente** y legible. Nada de fotos torcidas con el móvil.
- Un documento tributario **autoliquidado por ti no sirve**: tiene que haberlo emitido la autoridad.

---

## 3. La secuencia, con plazos

Los bloques van en orden. Dentro de un bloque los pasos son secuenciales; los bloques marcados como
solapables se pueden hacer a la vez.

### Bloque A — La base · 1 día hábil · **bloquea todo**

- [ ] **A1.** Crear cuenta de desarrollador: **`developers.facebook.com`** → botón **«Comenzar»** /
      *Get Started*, con tu cuenta personal de Facebook. *5 minutos.*
- [ ] **A2.** Crear el portafolio de negocio de ViajaPro: **`business.facebook.com`** →
      **«Crear cuenta»**. Nombre legal **exacto** al del certificado de Cámara de Comercio, incluidas
      abreviaturas (`S.A.S.`, con los puntos si el documento los lleva). *10 minutos.*
      → **Si el §0 dijo que ya lo tienes, sáltalo — pero comprueba que el nombre legal coincide
      carácter por carácter con el certificado.** Corregirlo ahora cuesta minutos; descubrirlo tras
      un rechazo cuesta semanas.
- [ ] **A3.** Activar **autenticación en dos pasos** del portafolio: **Configuración del negocio →
      Centro de seguridad → Requerir autenticación en dos pasos**. **[S]** *5 minutos.*
- [ ] **A4.** Dejar **dos administradores** del portafolio, no uno. Si se pierde el acceso a la única
      cuenta personal administradora, el negocio queda huérfano.
- [ ] **A5.** Confirmar que el correo corporativo y el teléfono de la empresa cargados coinciden con
      los de los documentos.

### Bloque B — Crear la app y encender el número de prueba · 1 día · **desbloquea todo el desarrollo**

> **Este es el bloque que importa para el calendario del proyecto.** En cuanto termine, el equipo
> técnico construye el inbox completo contra el número de prueba, sin esperar a ningún trámite.

- [ ] **B1.** **`developers.facebook.com/apps`** → **«Crear app»**.
      - Nombre: `ViajaPro`. **No pongas «WhatsApp» en el nombre**: Meta lo rechaza por marca. **[S]**
      - Correo de contacto: el corporativo.
      - **Tipo de app: «Negocio» / *Business*.** **[V]** — [Get started as a Solution Partner](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-solution-partners).
        🔴 **No elijas «Consumidor».** El *Embedded Signup Integration Helper* solo existe para apps
        de tipo Negocio **[V]**, y el tipo no se cambia después: habría que crear otra app de cero.
      - Conéctala al portafolio de negocio del paso A2.
      *15 minutos.*
- [ ] **B2.** Dentro de la app: **Casos de uso → WhatsApp → Configurar**. Al hacerlo, Meta crea
      automáticamente **una cuenta de WhatsApp Business de prueba y un número de prueba**. **[V]** —
      [About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform):
      > «When you get started with Cloud API, a test WhatsApp Business account and test business
      > phone number are automatically created for you.»

      *10 minutos.*
- [ ] **B3.** Añadir tu móvil como destinatario de prueba y enviarte el mensaje `hello_world` desde
      el panel. Si llega, el bloque está cerrado. *10 minutos.*
- [ ] **B4.** **Pásanos los datos del número de prueba** (ver [§6](#6-qué-nos-tienes-que-entregar)).
      **A partir de aquí el desarrollo arranca y deja de depender de ti.**

> **Qué permite el número de prueba:** mensajes gratuitos y sin medio de pago, con **límites
> relajados**. **[V]** — misma fuente: *«they have relaxed messaging limits and don't require a
> payment method on file in order to send template messages»*. La cifra que circula es **5 números
> destinatarios** con mensajes ilimitados hacia ellos **[S]** — no pude confirmarla literalmente en
> página oficial. Para nuestro desarrollo sobra.

### Bloque C — Verificación del negocio · **2-5 días hábiles [S]** · ⚠️ el cuello de botella

Se solapa con el bloque B. **Empiézala el mismo día que crees la app.**

- [ ] **C1.** Panel de la app → **Casos de uso → Personalizar** (icono de lápiz) → **Personalizar**
      en el caso de uso de WhatsApp → menú lateral **«Tech Provider onboarding»** →
      **«Iniciar verificación»** / *Start verification*. **[S]**
      *Ruta alternativa equivalente, por si Meta ha renombrado el menú:* **Configuración → Básica →
      Verificación → «Start Verification»**. **[V]** — [Business Verification para desarrolladores](https://developers.facebook.com/docs/development/release/business-verification).
- [ ] **C2.** Rellenar **nombre legal, dirección, teléfono, correo y sitio web**. **[S]**
      > 🔴 **Cópialos literalmente del certificado de Cámara de Comercio, con el documento abierto
      > delante.** El motivo de rechazo número uno es que el nombre legal o la dirección no coincidan
      > **exactamente**. **[S]** Tildes, puntos de `S.A.S.`, abreviaturas: tal cual aparecen.
- [ ] **C3.** Elegir el método de confirmación: correo, teléfono, SMS, WhatsApp o **verificación de
      dominio** (meta tag o registro DNS). **[S]** Si eliges dominio, **el registro DNS lo generamos
      nosotros: pídenoslo**.
- [ ] **C4.** Subir los documentos del [§2.1](#21-documentos-colombia) si Meta no encuentra el
      negocio en sus registros. **[S]**
- [ ] **C5.** Enviar y **no tocar nada más**. Meta responde por correo y por alerta de desarrollador.

> **Mientras esto esté «en revisión» no se puede enviar la app a revisión.** **[V]**
> > «Your business must be verified before you can start the app review process.»
> > — [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)

### Bloque D — Revisión de la app y acceso avanzado · revisión **~24 h [V]**, preparación de varios días

Requiere el bloque C aprobado. La **preparación** (D1-D3) se hace mientras C está en revisión: así,
el día que aprueben C, envías en una hora.

- [ ] **D1.** Completar los ajustes básicos de la app: **icono**, **categoría**, **URL de política de
      privacidad** y **URL de términos**. **[V]** La política de privacidad tiene que estar publicada
      y ser accesible sin iniciar sesión. **Las URL y el icono nos los pides a nosotros.**
- [ ] **D2.** Subir **dos vídeos separados, uno por permiso**. Meta es explícita: **[V]** —
      [WhatsApp app review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review):
      > «Do not submit a video that includes multiple permissions supporting different use cases.
      > You must submit a different video clip for each permission.»
      > «you cannot submit a screenshot, you must submit a screen recording.»

      - **`whatsapp_business_messaging`**: la app enviando un mensaje y el cliente de WhatsApp
        recibiéndolo.
      - **`whatsapp_business_management`**: la app **creando una plantilla de mensaje**.
      - **Los vídeos los grabamos nosotros** con el producto en marcha. Tú solo los subes. Pídenoslos
        en cuanto se apruebe la verificación del negocio.
- [ ] **D3.** Pegar la descripción escrita del uso de cada permiso. **Ambas cosas son obligatorias:**
      **[V]** *«Both written descriptions and screen recordings are required for each permission.»*
      **Los textos te los pasamos nosotros.**
- [ ] **D4.** Solicitar **acceso avanzado** (*Advanced access*) exactamente a estos permisos y a
      ninguno más:
      - `whatsapp_business_management` **[V]**
      - `whatsapp_business_messaging` **[V]**

      > 🔴 **No marques permisos «por si acaso».** Meta cita *«requesting unnecessary permissions»*
      > como motivo frecuente de rechazo. **[V]** Cada permiso de más es un rechazo regalado.
      > `business_management` aparece en nuestra documentación técnica de integración
      > (`docs/04-integraciones/01-whatsapp-cloud-api.md` §2.2) pero **no** en la guía de Tech
      > Provider de Meta. **Pregúntanos antes de marcarlo.** **[?]**
- [ ] **D5.** Enviar. **No lo dejes en borrador:** **[V]** *«Submissions in draft mode will not be
      reviewed.»* Es el error silencioso más caro: pasan días y nadie lo ha mirado.
- [ ] **D6.** Esperar. **[V]** *«The average turnaround time for App Review is about 24 hours.»*
      Fuentes secundarias hablan de varios días hábiles **[S]**: planifica con 5.

> **Sin esto no hay producto:** **[V]** *«You will not be able to onboard business customers until
> your app has been approved for advanced access for each of the permissions it requires.»*
> — [Embedded Signup · Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)

### Bloque E — Access Verification · **~5 días [V]** · **no bloquea el lanzamiento**

- [ ] **E1.** Llega por correo o aparece como formulario en el panel de la app. Es un cuestionario:
      hay que *«categorize and describe how the business uses other businesses' data to provide a
      service for those businesses»*. **[V]** — [Access Verification](https://developers.facebook.com/docs/development/release/access-verification).
      **El texto te lo redactamos nosotros.**
- [ ] **E2.** Esperar. **[V]** *«a decision will be made within approximately 5 days.»*

**Para qué sirve, en números. [V]** — [Embedded Signup · Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/):

> «By default, you can onboard up to 10 new business customers in a rolling 7-day window. If you
> complete Business Verification, App Review, and Access Verification, your limit is automatically
> increased to 200 new business customers in a rolling 7-day window.»

**10 clientes nuevos cada 7 días alcanzan de sobra para los primeros meses.** No retrases el
lanzamiento por este bloque. Para pasar de 200 por semana habría que solicitar ser **Meta Business
Partner**, que es otro trámite distinto. **[V]**

### Bloque F — Configuración técnica final · 1 día · **la hacemos contigo**

Requiere el bloque D aprobado. **Tú das el acceso y aprietas los botones; los valores los ponemos
nosotros.**

- [ ] **F1.** **Webhooks:** panel de la app → **WhatsApp → Configuración** → **Callback URL** y
      **Verify token**. **[V]**
      🔴 **Los dos valores te los damos nosotros. No los inventes.** El *verify token* es un secreto
      compartido que debe coincidir carácter por carácter con el de nuestro servidor; si no, Meta
      nunca activa la suscripción y no llega ni un mensaje.
- [ ] **F2.** Suscribir el webhook al campo **`account_update`**, además de los de mensajería. **[V]**
      Es requisito explícito de Embedded Signup.
- [ ] **F3.** **Facebook Login for Business** → *Client OAuth settings*: activar **Client OAuth
      login**, **Web OAuth login**, **Enforce HTTPS**, **Embedded Browser OAuth Login**, **Use Strict
      Mode for redirect URIs** y **Login with the JavaScript SDK**. **[V]**
- [ ] **F4.** Añadir nuestros dominios en **«Allowed domains»** y **«Valid OAuth redirect URIs»**.
      **[V]** Solo HTTPS. **Los dominios te los damos nosotros.**
- [ ] **F5.** Crear la configuración de Embedded Signup (plantilla de WhatsApp) y **copiar el
      Configuration ID**. **[V]** *«Capture your configuration ID, as you will need it in the next step.»*
- [ ] **F6.** Crear un **usuario del sistema**: **Configuración del negocio → Usuarios → Usuarios del
      sistema**. Añadirle nuestra app como activo con **«Desarrollar app»** activado y generar un
      **token** con los permisos de WhatsApp. **[V]**
- [ ] **F7.** Poner la app en **modo Activo / Live**.

---

## 4. Calendario: qué habilita cada hito

| Hito | Plazo | Se solapa con | Qué desbloquea |
|---|---|---|---|
| A · Portafolio + 2FA | 1 día | — | Poder crear la app |
| **B · App + número de prueba** | **1 día** | C | 🟢 **Todo el desarrollo del inbox. El proyecto deja de estar parado aquí.** |
| C · Verificación del negocio | **2-5 días hábiles [S]** | B, D1-D3 | Poder enviar la app a revisión |
| D · Revisión de app + acceso avanzado | ~24 h **[V]**, planifica 5 días | preparación de E | 🟢 **Conectar clientes reales. El lanzamiento.** |
| E · Access Verification | ~5 días **[V]** | operación real | Pasar de 10 a 200 clientes nuevos / 7 días |
| F · Configuración final | 1 día | — | Embedded Signup funcionando en producción |

**Camino crítico realista: A → B → C → D → F ≈ 2 a 3 semanas**, si no hay rechazos. **Un rechazo en C
suma de una a tres semanas.** ADR-0002 fija el umbral de alarma: **si la verificación supera las 8
semanas, se reabre la decisión y se evalúa un BSP como puente temporal.**

### Lo que el equipo construye con el número de prueba, sin esperar a nada

Desde que cierras el bloque B: endpoint de webhooks con validación de firma e idempotencia, bandeja
de entrada en vivo, envío de texto y de media, ventana de 24 horas, ciclo de vida de plantillas,
máquina de estados de los mensajes, manejo de los códigos de error de Meta y colas de reintento.
**Es prácticamente todo el inbox.**

Lo único que **no** se puede probar sin el bloque D es el **Embedded Signup real** contra un WABA de
un tercero. Eso se simula hasta entonces.

---

## 5. Qué nos tienes que pedir a nosotros

**No inventes ninguno de estos valores.** Si un campo del panel de Meta pide algo de esta lista,
páranos y pídelo. Un valor inventado aquí es una tarde entera de diagnóstico.

| Campo del panel de Meta | Paso | Quién lo da |
|---|---|---|
| **Callback URL** del webhook | F1 | **Nosotros** |
| **Verify token** del webhook | F1 | **Nosotros** (secreto compartido) |
| **URL de política de privacidad** | D1 | **Nosotros** |
| **URL de términos de servicio** | D1 | **Nosotros** |
| **URL de eliminación de datos** | D1 | **Nosotros** |
| **Allowed domains** y **Valid OAuth redirect URIs** | F4 | **Nosotros** |
| **Icono de la app** (1024×1024) | D1 | **Nosotros** (diseño) |
| **Vídeos de demostración** | D2 | **Nosotros** |
| **Textos de descripción de los permisos** | D3 | **Nosotros** |
| **Texto del formulario de Access Verification** | E1 | **Nosotros** |
| **Registro DNS o meta tag**, si verificas por dominio | C3 | **Nosotros** |

Lo que solo puedes aportar tú: documentos legales, nombre legal, dirección, teléfono, correo
corporativo, y **ser tú quien aprieta el botón** — Meta exige un administrador humano del negocio.

---

## 6. Qué nos tienes que entregar

Al cerrar cada bloque, pásanos lo suyo. Mira la columna «Secreto».

| Dato | Paso | ¿Secreto? | Qué es |
|---|---|---|---|
| **App ID** | B1 | No | Identificador público de la app |
| **App Secret** | B1 | 🔴 **SÍ — MÁXIMO** | Firma los webhooks. Quien lo tiene puede suplantar a Meta ante nosotros |
| **Business Portfolio ID** | A2 | No | Identificador del portafolio |
| **WABA ID de prueba** | B2 | No | Cuenta de WhatsApp Business de prueba |
| **Phone Number ID de prueba** | B2 | No | Número de prueba |
| **Configuration ID** de Embedded Signup | F5 | No | Identifica el flujo de alta |
| **Token del usuario del sistema** | F6 | 🔴 **SÍ — MÁXIMO** | Actúa en nombre de nuestra app sobre los WABA de **todos** los clientes |
| **Verify token del webhook** | F1 | 🔴 **SÍ** | Lo generamos nosotros; tú solo lo pegas en el panel |

### 🔴 Cómo entregar los secretos

**El App Secret y el token del usuario del sistema NO se pegan:**

- ❌ en un chat de WhatsApp, Slack, Teams ni en un correo
- ❌ en un ticket, una tarjeta de Jira o un comentario
- ❌ en el repositorio, ni siquiera en un archivo de ejemplo o en un comentario de código
- ❌ en una conversación con una IA, incluida esta
- ❌ en una captura de pantalla

**En este proyecto ya hemos tenido que rotar credenciales por esto. No es una advertencia teórica.**

**Qué hacer en su lugar:**

1. **Guárdalos en el gestor de contraseñas de la empresa** (1Password, Bitwarden o equivalente), en
   una bóveda compartida con el equipo técnico y **solo con él**.
2. Compártelos por **enlace de un solo uso** del propio gestor, nunca copiando y pegando el valor.
3. Nosotros los cargamos en el gestor de secretos del proveedor de despliegue. En local viven en
   `.env`, que **no está versionado**: el repositorio tiene un hook que bloquea el commit si un
   secreto se cuela, y ya ha disparado. **No lo desactives nadie.**
4. Las variables se llaman `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN` y
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. En `.env.example` están **vacías a propósito**. Que sigan así.

**Si crees que un secreto se expuso, aunque sea en una conversación que ya borraste:** dilo de
inmediato. Rotarlo cuesta diez minutos; no rotarlo puede costar el producto. El App Secret se rota en
**Configuración → Básica → Secreto de la app → Restablecer**, y el token del usuario del sistema se
regenera en Configuración del negocio.

---

## 7. Qué puede salir mal

### 🔴 En la verificación del negocio — lo caro

| Error | Coste |
|---|---|
| **Nombre legal que no coincide carácter por carácter con el certificado** | Motivo de rechazo nº 1 **[S]**. Días o semanas perdidas |
| Dirección distinta a la del documento | Rechazo |
| Documento recortado, con esquinas fuera, subrayado o anotado **[S]** | Rechazo |
| Documento vencido o expedido hace más de 90 días | Rechazo |
| Documento tributario autoliquidado en vez de emitido por la autoridad **[S]** | Rechazo |
| Teléfono VoIP, o que no aparece en ningún documento ni en la web **[S]** | Rechazo o retraso |
| Web que no existe, no carga, o con datos de contacto que no coinciden | Rechazo |
| **Reenviar el mismo día del rechazo** | El sistema lo marca como sospechoso. Corrige, **espera 24 h** y reenvía **[S]** |
| **Dos rechazos seguidos** | A partir del segundo conviene **apelar** desde el Centro de seguridad, no reenviar **[S]** |

> 🔴 **El error que te deja fuera semanas:** escribir el nombre legal «de memoria» en el paso A2 y
> enterarte tres semanas después. **Ten el certificado de Cámara de Comercio abierto delante mientras
> rellenas A2 y C2.** Es el consejo más rentable de todo el documento.

### 🔴 En la revisión de la app

| Error | Coste |
|---|---|
| **Pedir permisos que no necesitamos** — motivo citado por Meta **[V]** | Rechazo y ciclo nuevo |
| Un solo vídeo cubriendo varios permisos. Meta lo prohíbe literalmente **[V]** | Rechazo |
| Captura de pantalla en vez de grabación de pantalla **[V]** | Rechazo |
| Falta la descripción escrita de algún permiso **[V]** | Rechazo |
| **Dejarlo en borrador** creyendo que está enviado **[V]** | Días perdidos sin que nadie lo mire |
| Icono, categoría o política de privacidad sin poner **[V]** | Rechazo |
| Enviar antes de que la verificación del negocio esté aprobada **[V]** | Ni siquiera deja enviar |

### Otros que cuestan caro

- 🔴 **Tipo de app equivocado en B1.** Si eliges «Consumidor», el Embedded Signup Integration Helper
  no existe **[V]** y el tipo no se cambia. Hay que crear otra app desde cero y rehacer A2-B3.
- **«WhatsApp» en el nombre de la app.** Rechazo por marca. **[S]**
- **Un solo administrador del portafolio.** Si pierdes esa cuenta de Facebook, el negocio queda sin
  administrador y recuperarlo con soporte de Meta es lento e incierto.

---

## 8. Lo que no pude verificar

Todo lo marcado **[S]** o **[?]** arriba. Al llegar a cada paso, compruébalo en pantalla y avísanos
si no coincide: actualizamos el documento.

| Afirmación | Marca | Por qué |
|---|---|---|
| Plazo «2-5 días hábiles» de la verificación del negocio | **[S]** | Meta no publica un SLA. Cifra tomada de guías de BSPs coincidentes |
| Lista exacta de documentos aceptados y reglas de formato | **[S]** | El centro de ayuda oficial de Meta no se dejó leer de forma automatizada. Recogido de guías de partners coherentes entre sí |
| 2FA obligatoria en el portafolio para el programa Tech Provider | **[S]** | Citado por varios BSPs; no localizado verbatim en página oficial |
| Ruta de menú «Casos de uso → Personalizar → Tech Provider onboarding» | **[S]** | Meta renombra menús con frecuencia. Si no la encuentras, usa la ruta **[V]** de Configuración → Básica → Verificación |
| Límite de 5 destinatarios del número de prueba | **[S]** | Oficialmente solo consta «relaxed messaging limits» |
| Esperar 24 h antes de reenviar tras un rechazo; apelar al segundo | **[S]** | Práctica documentada por partners, no política publicada por Meta |
| Métodos de confirmación (correo, teléfono, SMS, WhatsApp, dominio) | **[S]** | Coherente entre fuentes, sin confirmación verbatim |
| Si hay que pedir `business_management` en la revisión de la app | **[?]** | Nuestra documentación técnica lo lista; la guía de Tech Provider de Meta solo nombra los dos de WhatsApp. **Consúltanos antes de marcarlo** |
| Quién factura a Meta el consumo (discrepancia con ADR-0002) | **[?]** | Requiere decisión del propietario y probablemente un ADR. Ver §1 |

---

## Fuentes

Todas consultadas el **2026-10-07**.

- [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)
- [Get started as a Solution Partner](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-solution-partners)
- [Embedded Signup · Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Embedded Signup · Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/)
- [WhatsApp app review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review)
- [About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)
- [Business Verification para desarrolladores](https://developers.facebook.com/docs/development/release/business-verification)
- [Access Verification](https://developers.facebook.com/docs/development/release/access-verification)

Secundarias, para lo marcado **[S]**: guías del programa Tech Provider de 360dialog, Infobip, Telnyx
y Twilio, y el centro de ayuda de Meta para empresas.

---

**Documentos relacionados:**
[ADR-0002 · WhatsApp Cloud API](../03-adr/0002-whatsapp-cloud-api.md) ·
[Integración WhatsApp Cloud API](../04-integraciones/01-whatsapp-cloud-api.md) ·
[Requisitos para la agencia](01-requisitos-para-la-agencia.md) ·
[Políticas de WhatsApp](../05-seguridad/03-politicas-whatsapp.md)
