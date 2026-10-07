# Auditoría de seguridad — ADR-0008, resolución de tenant en webhooks entrantes

- **Fecha:** 2026-10-07
- **Auditor:** `auditor-seguridad`
- **Objeto:** `docs/03-adr/0008-resolucion-de-tenant-en-webhooks-entrantes.md` (estado **Propuesto**)
- **Perímetro:** el ADR completo, contrastado contra ADR-0003, ADR-0007,
  `packages/database/prisma/policies/001-aislamiento-tenant.sql`,
  `packages/database/prisma/policies/002-rol-aplicacion.sql`,
  `packages/database/prisma/migrations/*/migration.sql`,
  `packages/database/tests/aislamiento.spec.ts`,
  `apps/api/src/shared/prisma/prisma.service.ts`,
  `packages/database/prisma/schema.prisma`,
  `docs/02-arquitectura/03-modelo-de-datos.md` §4 y `docs/05-seguridad/02-proteccion-de-datos.md`.
- **Hallazgos:** 3 críticos, 8 altos, 13 medios, 5 bajos.

---

## Veredicto

**No puede pasar a Aceptado tal como está. Puede pasar con los cambios enumerados al final.**

La decisión de fondo es correcta y no se discute: la opción A es la única que rompe el ciclo sin
mover el `tenant_id` a la petición, y el descarte de C y E está bien argumentado. Lo que falla no es
la dirección, es la especificación. Tres cosas quedaron fuera y **las tres dejan el sistema
funcionando con el aislamiento roto y sin producir ningún error**:

1. El `REVOKE` del que el ADR se declara consciente **se deshace solo**: `001-aislamiento-tenant.sql`
   §4 vuelve a conceder `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES` en cada migración de
   políticas. Ya se ha ejecutado dos veces en este repositorio. No es un olvido hipotético: es el
   comportamiento actual del aplicador.
2. La operación peligrosa **sí está al alcance de `viajapro_app`**, al revés de lo que afirma la
   sección de Consecuencias. `app.current_tenant` es un GUC que el propio rol fija: no es una
   frontera de seguridad, es una convención.
3. El alta verifica de qué tenant es la sesión, pero **no verifica de quién es el número**. Se puede
   reclamar un `phone_number_id` ajeno para el tenant propio. Es ADR-0003 §5 otra vez, trasplantado
   de `tenant_id` a `phone_number_id`.

El resto de los hallazgos son deuda de especificación: importante, corregible en el documento, sin
cambiar la decisión.

---

## Hallazgos

### [CRÍTICO] El `REVOKE` del directorio se revierte solo en cada migración de políticas

- **Dónde:** `packages/database/prisma/policies/001-aislamiento-tenant.sql:121-130`;
  `packages/database/prisma/policies/002-rol-aplicacion.sql:68`;
  `docs/03-adr/0008-resolucion-de-tenant-en-webhooks-entrantes.md:191-193` y `:359-361`.
- **Qué pasa:** el ADR identifica el riesgo como "un `REVOKE` olvidado en la migración". El riesgo
  real es peor: aunque el `REVOKE` se escriba correctamente, **`001-aislamiento-tenant.sql` §4
  vuelve a ejecutar `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO
  viajapro_app` cada vez que se regenera una migración de políticas**, y ese archivo se copia
  íntegro a cada migración (ya ocurrió en `20261007042204_politicas_rls` y en
  `20261007042518_rls_sin_contexto_cero_filas`). `ON ALL TABLES` incluye `enrutamiento_canales` y
  `recepciones_webhook`. `002-rol-aplicacion.sql:68` hace lo mismo y está documentado como
  "idempotente: se puede volver a ejecutar sin romper nada" — a partir de ADR-0008 esa frase es
  falsa.
- **Escenario:** el equipo implementa ADR-0008 con su `REVOKE`. Dos semanas después, `datos` corrige
  una política RLS y regenera la migración desde `001`. Esa migración concede de nuevo
  `INSERT/UPDATE` sobre `enrutamiento_canales` a `viajapro_app`. A partir de ese despliegue,
  cualquier ruta de la API con inyección SQL —o cualquier uso de
  `sinTenantPorqueEsPlataforma`— puede reasignar el número de la agencia A al tenant B. Ninguna
  prueba falla, ningún log lo dice, la aplicación arranca igual. Es exactamente el modo de fallo de
  `BYPASSRLS` que describe ADR-0007, con la misma firma: silencioso y total.
- **Corrección:** el `REVOKE` no puede vivir en una migración puntual. Debe ser **dirigido por
  datos, igual que la política RLS, y ejecutarse en el mismo bloque que el `GRANT`**:
  1. Crear una tabla declarativa de excepciones, poblada por migración:
     `excepciones_rls(tabla text primary key, motivo text not null, privilegios_app text[] not null)`.
     `enrutamiento_canales` entra con `privilegios_app = '{}'`; `recepciones_webhook` con
     `'{SELECT,INSERT,UPDATE}'` (ver el hallazgo ALTO sobre esa tabla, que propone reducirlo a nada).
  2. Reescribir `001-aislamiento-tenant.sql` §4 para que, **después** del `GRANT ... ON ALL TABLES`,
     recorra `excepciones_rls` y ejecute `REVOKE ALL ON <tabla> FROM viajapro_app` seguido del
     `GRANT` de exactamente los privilegios declarados. Así el re-otorgamiento y la revocación son
     el mismo mecanismo y no pueden desincronizarse.
  3. Hacer lo mismo al final de `002-rol-aplicacion.sql`, por el mismo motivo.
  4. Quitar el `ALTER DEFAULT PRIVILEGES` no sirve aquí: anularía la cobertura de tablas futuras,
     que es deseable. La solución es la declarativa de arriba.
  5. El ADR debe decir esto en §1, en lugar de "la migración **tiene que revocar explícitamente**".
- **Dueño:** `arquitecto` (texto del ADR), `datos` (implementación).
- **Verificación:** CONFIRMADO — el `GRANT ON ALL TABLES` está presente en las dos migraciones ya
  aplicadas, y `ON ALL TABLES` alcanzaría a `enrutamiento_canales` sin ninguna excepción.

---

### [CRÍTICO] `registrar_enrutamiento` sí está al alcance del rol de aplicación: la consecuencia positiva del ADR es falsa

- **Dónde:** `docs/03-adr/0008-...md:196-198` (la tabla de funciones) y `:343-344` ("la operación
  peligrosa […] no está al alcance del rol de la aplicación. No depende de que nadie recuerde nada").
- **Qué pasa:** para que el Embedded Signup funcione, `viajapro_app` necesita `EXECUTE` sobre
  `registrar_enrutamiento`. Esa función es `SECURITY DEFINER` y su única defensa es exigir
  `app.current_tenant` no vacío y rechazar filas de otro tenant. **`app.current_tenant` es un GUC que
  `viajapro_app` fija por sí mismo con `set_config`**, sin ninguna restricción: lo hace el
  interceptor en el camino legítimo, pero puede hacerlo cualquier sentencia. Una función
  `SECURITY DEFINER` no puede distinguir un GUC fijado desde un token de sesión verificado de uno
  fijado por una inyección SQL. La función reimplementa la *forma* de RLS sin su *garantía*: en RLS
  el motor compara contra la fila; aquí se compara contra un valor que el atacante controla.
- **Escenario:** una inyección SQL en cualquier endpoint de la API —o un bug que permita que un
  `tenant_id` llegue desde la petición— ejecuta
  `SELECT set_config('app.current_tenant','<uuid del atacante>',true); SELECT registrar_enrutamiento('<phone_number_id de la agencia A>', …, '<tenant del atacante>');`
  A partir del siguiente webhook, **todas las conversaciones de la agencia A entran en la bandeja del
  atacante**: nombres de clientes, itinerarios, pasaportes enviados por chat. RLS no interviene en
  ningún momento, porque los mensajes se escriben legítimamente bajo el tenant del atacante. El ADR
  describe esto como "la peor primitiva del sistema después de `BYPASSRLS`" y acto seguido la
  concede al rol que más superficie HTTP tiene.
- **Corrección:** separar el privilegio de ejecución por camino, que es lo único que un atacante con
  SQL arbitrario no puede falsear:
  1. `viajapro_app` **no recibe `EXECUTE` sobre `registrar_enrutamiento`**.
  2. Crear un rol de login dedicado `viajapro_altas`, usado **exclusivamente** por el caso de uso de
     Embedded Signup, con `EXECUTE` sobre `registrar_enrutamiento` y ningún otro privilegio que los
     mínimos del alta. La superficie HTTP que alcanza ese rol pasa de "toda la API" a "un endpoint".
  3. Crear `viajapro_webhook` para `apps/worker`, con `EXECUTE` sobre `resolver_enrutamiento` y sin
     `EXECUTE` sobre `registrar_enrutamiento`. El ADR no declara con qué rol corre el trabajador;
     debe hacerlo.
  4. Reescribir la frase de Consecuencias. La redacción correcta es: *"repuntar un número exige
     `EXECUTE` sobre `registrar_enrutamiento`, concedido únicamente al rol del camino de alta; el
     rol general de la aplicación no puede hacerlo. La comprobación de tenant dentro de la función
     es una comprobación de consistencia, no una frontera de seguridad: el GUC lo fija el cliente."*
- **Dueño:** `arquitecto` (ADR), `datos` (roles y `GRANT`), `backend` (dos orígenes de conexión).
- **Verificación:** PLAUSIBLE — no hay implementación todavía; el razonamiento se apoya en que
  `set_config('app.current_tenant', …)` lo ejecuta hoy `viajapro_app` sin restricción
  (`prisma.service.ts:86`, `aislamiento.spec.ts:32`).

---

### [CRÍTICO] El alta no prueba la titularidad del número: un tenant puede reclamar el `phone_number_id` de otro

- **Dónde:** `docs/03-adr/0008-...md:208-210`.
- **Qué pasa:** el ADR argumenta *"Nadie puede reclamar un número para un tenant del que no tiene
  sesión"*. Correcto, y responde a la pregunta equivocada. El ataque no es reclamar un número **para
  otro tenant**: es reclamar **el número de otro** para el tenant propio. El diseño verifica el
  origen del `tenant_id` (bien) y **no verifica el origen del `phone_number_id`**, que llega como
  parámetro de la función desde el cliente. Es literalmente el defecto que ADR-0003 §5 declara
  hallazgo crítico, con otro nombre de columna.
- **Escenario:** la agencia atacante, cliente legítimo con sesión válida y rol de administrador,
  llama al endpoint de conexión de WhatsApp pasando el `phone_number_id` de una agencia competidora
  (dato nada secreto: aparece en integraciones, en soportes, y basta un empleado que pasó por ambas
  agencias). Dos resultados posibles:
  - Si no existe fila para ese identificador —agencia que aún no se conecta, o conectada por otra
    vía—, la fila se crea apuntando al atacante y **todos los mensajes futuros de la víctima entran
    en la bandeja del atacante**.
  - Si la fila existe, la función la rechaza, pero el atacante acaba de confirmar que ese número
    está en la plataforma (oráculo, ver hallazgo BAJO correspondiente).
  Y una variante de denegación de servicio: el atacante registra en lote los identificadores de
  veinte competidores. Como "la fila no se borra nunca" (`:224`), **esos competidores no pueden
  darse de alta jamás** sin intervención manual con el rol propietario.
- **Corrección:** el `phone_number_id` y el `waba_id` **no pueden venir como parámetros de la
  petición**. Deben derivarse del intercambio de Embedded Signup, del lado del servidor:
  1. El cliente envía **solo** el `code` del Embedded Signup.
  2. El servidor lo canjea por el token y consulta los números del WABA con ese token; **la lista
     que devuelve Meta es la prueba de titularidad**, porque el token se emitió sobre el WABA que ese
     usuario administra.
  3. `registrar_enrutamiento` se invoca únicamente con identificadores salidos de esa respuesta,
     nunca con valores del cuerpo de la petición. El ADR debe decirlo con esas palabras y añadir la
     frase simétrica a ADR-0003 §5: **"el `phone_number_id` jamás viene del cliente"**.
  4. Si una fila existe y pertenece a otro tenant, la función rechaza **y emite un evento de
     seguridad** (no solo un error): un intento de reclamar un número ajeno es una señal, no un
     error de usuario.
  5. Resolver qué pasa con una fila `REVOCADO` cuyo número Meta reasignó a otra agencia. Propuesta:
     una fila `REVOCADO` puede reasignarse a otro tenant **solo si la prueba de titularidad del
     punto 2 la respalda**, y la reasignación queda en la bitácora del directorio con ambos tenants.
- **Dueño:** `arquitecto` (ADR), `whatsapp` (flujo de canje), `backend`.
- **Verificación:** PLAUSIBLE — el ADR no especifica de dónde salen los parámetros de
  `registrar_enrutamiento`, y la ausencia es el defecto.

---

### [ALTO] El `EXECUTE` de las funciones se concede a `PUBLIC` por omisión: el gemelo del `REVOKE` que el ADR no vio

- **Dónde:** `docs/03-adr/0008-...md:193-198`.
- **Qué pasa:** el ADR detectó el fallo silencioso de `ALTER DEFAULT PRIVILEGES` sobre tablas y no
  detectó el equivalente sobre funciones: **PostgreSQL concede `EXECUTE` a `PUBLIC` en toda función
  nueva, sin que nadie escriba un `GRANT`**. `CREATE FUNCTION registrar_enrutamiento(...) SECURITY
  DEFINER` queda, en el instante de crearse, ejecutable por `viajapro_app`, por cualquier rol de
  solo lectura que se cree para analítica mañana, y por cualquier rol que el proveedor gestionado
  añada. La separación de privilegios del hallazgo crítico anterior **no funciona si no se revoca
  esto**, porque el rol de alta y el rol general tendrían el mismo acceso por omisión.
- **Escenario:** se implementa todo correctamente, incluidos los roles separados, pero nadie escribe
  el REVOKE sobre PUBLIC. Seis meses después se crea `viajapro_reportes` para el panel de analítica,
  sin privilegios sobre nada en particular. Ese rol puede ejecutar `registrar_enrutamiento` y
  repuntar cualquier número. Nadie lo notará, porque nadie se lo concedió: lo tenía de nacimiento.
- **Corrección:** en la misma migración que crea las funciones, inmediatamente después de cada
  `CREATE FUNCTION`, revocar todo sobre `PUBLIC` para ambas funciones, y solo entonces conceder
  `EXECUTE` al rol que corresponda. Añadir además
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;` para que la
  próxima función no repita el defecto. El ADR debe nombrar esto junto al `REVOKE` de tablas, con el
  mismo énfasis: **son dos fallos silenciosos, no uno.**
- **Dueño:** `arquitecto` (ADR), `datos`.
- **Verificación:** CONFIRMADO — es el comportamiento documentado de PostgreSQL para `EXECUTE` sobre
  funciones nuevas.

---

### [ALTO] `recepciones_webhook` es legible en su totalidad por el rol de aplicación, y la aplicación tiene la clave

- **Dónde:** `docs/03-adr/0008-...md:277-281` y `:294-297`.
- **Qué pasa:** la mitigación declarada para la única tabla con contenido de varios tenants es
  "cifrado en reposo (AES-256-GCM), `NULL` al procesar, purga a 7 días". El cifrado en reposo
  protege contra el robo del disco o del respaldo. **No protege contra el rol de aplicación, que es
  precisamente quien tiene la clave.** Como el endpoint inserta y el relay lee, `viajapro_app`
  necesita `SELECT` e `INSERT` sobre la tabla, y descifra con una clave que vive en su propio
  proceso. Existe por tanto un camino —una inyección SQL, un endpoint de diagnóstico, un `findMany`
  sin filtro, un volcado de depuración— que entrega **el contenido de los mensajes de todas las
  agencias de los últimos minutos**, ya descifrado. El ADR lo resume como "el riesgo no es cero"; es
  bastante mayor que eso y merece una mitigación, no una nota.
- **Escenario:** un asesor de la agencia A dispara un endpoint con un parámetro no saneado que acaba
  en SQL y devuelve el contenido entero de `recepciones_webhook`. El proceso que ejecuta la consulta
  es el mismo que tiene la clave de plataforma; basta un segundo paso para descifrar. RLS no
  interviene: la tabla no la tiene, por diseño.
- **Corrección:** aplicar a esta tabla la misma disciplina que al directorio, que el ADR ya aceptó
  como correcta:
  1. `viajapro_app` **sin privilegios directos** sobre `recepciones_webhook`. Inserción mediante
     `registrar_recepcion(...)`, `SECURITY DEFINER`, que **solo inserta** (`ON CONFLICT DO NOTHING`)
     y devuelve un booleano "era nueva".
  2. Lectura mediante `tomar_recepcion(recepcion_id)` que devuelve **una** fila por su identificador
     exacto, concedida solo al rol del trabajador. Un barrido masivo deja de existir como operación
     posible.
  3. La función de purga y la que pone el payload a `NULL`, también `SECURITY DEFINER`, acotadas por
     identificador o por antigüedad, nunca con filtro libre.
  4. La clave de descifrado vive en el proceso del **trabajador**, no en la API. La API solo cifra:
     el proceso que puede listar no es el que puede descifrar.
- **Dueño:** `arquitecto` (ADR §4), `datos`, `backend`.
- **Verificación:** PLAUSIBLE.

---

### [ALTO] El payload del tenant desconocido o revocado ya se persistió: §2 y §4 se contradicen

- **Dónde:** `docs/03-adr/0008-...md:220-222` ("se descarta sin persistir contenido") contra
  `:277-281` (paso 4: el payload se guarda cifrado **antes** de saber de quién es).
- **Qué pasa:** el corte entre recibir y procesar persiste el cuerpo completo **antes** de resolver
  el tenant. Para los casos "revocado" y "desconocido", el contenido ya está en la base cuando el
  trabajador decide descartarlo. Y como esos eventos nunca se procesan con éxito, **el payload no se
  pone a `NULL`**: se queda los 7 días completos. La tabla de §2 afirma lo contrario, y el propio ADR
  escribe la frase que lo condena: *"procesar el contenido de un excliente no tiene ninguna base
  legal: sin contrato no hay finalidad (Ley 1581)"*. Conservarlo cifrado durante una semana es
  tratamiento.
- **Escenario:** una agencia se da de baja el día 1. Sus clientes siguen escribiendo una semana. Cada
  mensaje —con nombre, teléfono y a veces número de pasaporte en texto— queda almacenado 7 días en
  una tabla sin aislamiento, sin responsable del tratamiento identificable, sin finalidad y sin
  posibilidad de atender un derecho del titular, porque no hay tenant al que atribuir el dato. Si un
  titular ejerce su derecho de supresión, no podemos ni encontrar sus datos ni demostrar que los
  borramos.
- **Corrección:**
  1. El trabajador, al clasificar un evento como `REVOCADO` o desconocido, **pone el payload a
     `NULL` en ese mismo instante**, antes de cualquier otra cosa. Debe ser el primer paso de ambas
     ramas de §2, escrito como tal en el ADR.
  2. Reescribir la celda "se descarta sin persistir contenido" por **"se descarta y el contenido se
     borra de `recepciones_webhook` en el acto; el hash permanece"**, que es lo que el diseño puede
     cumplir de verdad.
  3. Declarar en el ADR que la ventana de exposición del contenido de un tenant no identificado va
     "desde la inserción hasta la clasificación en el trabajador", con presupuesto en segundos y
     alerta si se excede.
- **Dueño:** `arquitecto`, `backend`.
- **Verificación:** CONFIRMADO por lectura del propio documento: las dos secciones son incompatibles.

---

### [ALTO] El identificador de trabajo convierte un fallo permanente en pérdida silenciosa de mensajes

- **Dónde:** `docs/03-adr/0008-...md:280` y `:283-292`.
- **Qué pasa:** el ADR deduce que no hay ventana de pérdida porque "entre el 4 y el 5 un relay barre
  **lo no encolado**". Pero con `jobId = recepcion_id`, BullMQ **rechaza silenciosamente** un trabajo
  cuyo identificador ya existe, incluidos los que están en el conjunto de fallidos. Un evento que
  agota sus reintentos queda como trabajo fallido; el relay lo ve como "ya encolado" y no lo vuelve a
  poner; Meta ya recibió su 200 y no lo reenviará. **El mensaje se pierde y nadie se entera** — el
  modo de fallo exacto que el ADR declara inaceptable en `:38-39`.
- **Escenario:** un mensaje con un adjunto que dispara un error de deserialización agota cinco
  reintentos un sábado. El asesor nunca ve la consulta del cliente, que compra en otra agencia. En
  los registros no hay nada que buscar, porque el 200 se devolvió y la fila sigue ahí.
- **Corrección:**
  1. El criterio del relay deja de ser "no encolado" y pasa a ser **"no procesado"**: columna
     `procesado_en timestamptz NULL` en `recepciones_webhook`, y el relay barre las filas con
     `procesado_en` nulo y más de treinta segundos de antigüedad. Es la única señal que no depende
     del estado interno de Redis.
  2. El identificador de trabajo deja de ser el hash a secas: o incorpora el número de barrido del
     relay, o el relay elimina el trabajo fallido antes de reencolar. El ADR debe fijar una de las dos.
  3. Contador y alerta sobre filas con `procesado_en` nulo y más de cinco minutos de antigüedad. Esa
     métrica es lo que convierte el invariante en algo observable.
  4. La purga a 7 días **nunca borra una fila sin procesar**: borrar un evento no procesado es
     destruir la evidencia del fallo.
- **Dueño:** `arquitecto` (ADR §4), `backend`.
- **Verificación:** PLAUSIBLE — comportamiento conocido de BullMQ con identificador de trabajo explícito.

---

### [ALTO] El directorio no tiene bitácora: un repunte no se detecta ni se demuestra, y la víctima no puede verlo

- **Dónde:** `docs/03-adr/0008-...md:171-179` (el esquema propuesto) y `:386-387`.
- **Qué pasa:** la tabla guarda el estado actual, no la historia. `registrar_enrutamiento` hace
  "inserta o actualiza". Si un número cambia de tenant, **no queda rastro de que cambió, ni de
  quién lo cambió, ni desde qué tenant**. El ADR cierra diciendo que si alguna vez un webhook se
  atribuye al tenant equivocado "la decisión se revisa entera" — sin bitácora no hay con qué
  revisarla. Y `registros_auditoria` no sirve: tiene `tenant_id` y RLS forzada
  (`packages/database/prisma/schema.prisma:501-518`), de modo que el registro quedaría bajo el tenant
  **atacante** y la agencia víctima no podría verlo nunca.
- **Escenario:** la agencia A denuncia que dejó de recibir mensajes. Soporte mira
  `enrutamiento_canales` y ve una fila que apunta a B, creada "en algún momento". No hay forma de
  saber si fue un error de alta, un repunte malicioso o una reasignación de Meta. Ante una
  reclamación ante la SIC, no hay evidencia de nada.
- **Corrección:**
  1. Tabla global, **solo de inserción**, `enrutamiento_historial(id, clave_canal, tenant_anterior,
     tenant_nuevo, estado_anterior, estado_nuevo, actor_usuario_id, actor_tenant_id, motivo,
     ocurrido_en)`. La escribe `registrar_enrutamiento` dentro de la misma transacción; ningún rol
     tiene `UPDATE` ni `DELETE` sobre ella, ni siquiera el propietario del directorio.
  2. Todo cambio de `tenant_resuelto_id` sobre una fila existente **notifica a los dos tenants** y
     escribe además un registro de auditoría bajo cada uno. Un repunte legítimo no molesta a nadie;
     uno ilegítimo deja de ser invisible para la víctima, que es el punto.
  3. Métrica: número de cambios de titularidad por día. En operación normal es cero.
- **Dueño:** `arquitecto`, `datos`.
- **Verificación:** CONFIRMADO — el esquema propuesto en el ADR no incluye historial y
  `registros_auditoria` es tenant-scoped.

---

### [ALTO] `viajapro_enrutador` no se declara `NOLOGIN`: se crea una credencial nueva sin necesidad

- **Dónde:** `docs/03-adr/0008-...md:200-206`.
- **Qué pasa:** el ADR especifica `NOBYPASSRLS NOSUPERUSER` y calla sobre `LOGIN`. Por omisión
  `CREATE ROLE` es `NOLOGIN`, pero el ADR es la especificación y aquí lo que no se escribe se
  implementa al azar. Si alguien lo crea con `LOGIN` y contraseña —el reflejo natural, porque los
  otros roles del proyecto la tienen—, **aparece una credencial cuya posesión concede la propiedad
  del directorio y, con ella, el secuestro de cualquier conversación**. Esa contraseña acabaría en
  una variable de entorno y de ahí a un registro de despliegue.
- **Escenario:** la pregunta del encargo —"¿qué pasa si `viajapro_enrutador` se ve comprometido?"—
  solo tiene respuesta tranquilizadora si el rol **no es una credencial**. Con `NOLOGIN`, ser ese rol
  exige ya ser el propietario del esquema o superusuario, situación en la que el aislamiento está
  perdido de todos modos. Con `LOGIN`, el compromiso del rol es un escenario independiente y
  realista: `.env` filtrado, variable en el registro de CI, copia pegada en un chat.
- **Corrección:** el ADR debe escribir el conjunto completo y cerrado —`NOLOGIN NOBYPASSRLS
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`— y añadir la frase: **"este rol no tiene contraseña
  y nunca la tendrá; no es una credencial, es un propietario"**. Añadir también el
  `REVOKE neon_superuser FROM viajapro_enrutador` condicional, por la misma razón que
  `packages/database/prisma/policies/002-rol-aplicacion.sql:45-54` lo hace para `viajapro_app`: en el
  proveedor gestionado la herencia por omisión reintroduce `BYPASSRLS`, y el ADR razona
  explícitamente que el propietario no debe tenerlo (`:201-203`).
- **Dueño:** `arquitecto`, `datos`.
- **Verificación:** CONFIRMADO por omisión en el texto.

---

### [ALTO] La "clave de plataforma" no existe: ni inventario, ni versión, ni AAD, ni rotación

- **Dónde:** `docs/03-adr/0008-...md:280` ("cifrado con la clave de plataforma") y `:294-297`;
  contrastado con `docs/05-seguridad/02-proteccion-de-datos.md:113`.
- **Qué pasa:** el único cifrado de aplicación declarado en el proyecto es "AES-256-GCM para números
  de documento y tokens de tenant". ADR-0008 introduce **una tercera clase de clave** —de plataforma,
  no de tenant— sin decir dónde vive, quién la custodia, cómo se versiona ni qué pasa al rotarla. R6
  exige que la clave esté gestionada aparte, y la rotación debe estar definida y probada. Hoy no hay
  nada de eso escrito en el repositorio: `docs/05-seguridad/` no menciona gestión de claves.
- **Escenario concreto de daño:** sin versión de clave en la fila, **rotar la clave hace ilegibles
  todas las recepciones en vuelo**. Como son mensajes aún no procesados, rotar un martes a mediodía
  equivale a perder los mensajes de clientes de los últimos minutos de todas las agencias, y el fallo
  se manifiesta como errores de descifrado dispersos que nadie relacionará con el cambio de clave. Y
  sin AAD, una fila cuyo texto cifrado se sustituya por el de otra recepción se procesa sin protestar.
- **Corrección:**
  1. Columnas obligatorias: texto cifrado, nonce de 96 bits aleatorio por fila, etiqueta si la
     biblioteca no la concatena, y **versión de clave, no nula**.
  2. **AAD igual a `recepcion_id`.** Y tras descifrar, verificar que el sha256 del texto claro
     coincide con `recepcion_id` antes de procesar. Es gratis y ata el texto cifrado a su fila: una
     sustitución deja de pasar desapercibida.
  3. Rotación, aprovechando que el dato vive siete días o menos: las filas nuevas se cifran con la
     versión siguiente; la versión anterior se conserva **solo para descifrar** hasta que la purga
     vacíe la última fila que la usa, y entonces se retira. No hace falta recifrado. **Escribirlo así
     en el ADR cierra el punto con dos frases.**
  4. El cifrado ocurre en el proceso de Node, **nunca con pgcrypto pasando la clave dentro del SQL**:
     acabaría en `pg_stat_statements` y en los registros del proveedor. Prohibirlo explícitamente en
     el ADR, porque es el atajo que alguien tomará.
  5. Registrar la clave en `docs/05-seguridad/02-proteccion-de-datos.md` §5 como entrada propia,
     distinta de la de tokens de tenant, con su custodio y su periodicidad de rotación.
- **Dueño:** `arquitecto` (ADR), `devops` (custodia), `documentador` (inventario).
- **Verificación:** CONFIRMADO — no hay ninguna mención a gestión de claves en `docs/05-seguridad/`.

---

### [ALTO] `search_path` se menciona pero no se fija a un valor, y no se asegura que `public` no sea escribible

- **Dónde:** `docs/03-adr/0008-...md:193` ("Dos funciones, ambas con `search_path` fijado").
- **Qué pasa:** la omisión de `search_path` es la vulnerabilidad clásica de `SECURITY DEFINER`. El
  ADR la nombra pero **no dice a qué valor**, y "fijado" admite implementaciones inseguras: fijarlo
  a `public` sigue siendo vulnerable si el atacante puede crear objetos en `public`. Además el ADR no
  exige la mitad complementaria: que `viajapro_app` **no pueda crear nada** en ningún esquema del
  `search_path`.
- **Escenario:** la función fija el `search_path` a `public, pg_catalog` y llama a `now()` o a un
  operador sobre `text`. Si `viajapro_app` conserva `CREATE` sobre `public` —lo que depende del
  proveedor gestionado y de quién sea el propietario del esquema—, puede crear un objeto que
  secuestre la resolución de nombres y ejecutarlo con los privilegios del propietario del directorio.
- **Corrección:**
  1. Fijar el valor exacto en el ADR: **`search_path` vacío**, con todos los objetos cualificados
     (`public.enrutamiento_canales`, `pg_catalog.now()`). Es la única variante que no depende de
     quién puede crear qué.
  2. Añadir a la migración la revocación de `CREATE ON SCHEMA public` a `PUBLIC` y a `viajapro_app`.
  3. Prohibir en el ADR el SQL dinámico dentro de ambas funciones. Una función `SECURITY DEFINER`
     que compone SQL con un parámetro es una inyección con privilegios ajenos. El proyecto ya usa ese
     patrón en `aplicar_aislamiento_tenant`, y conviene decir que **ahí es aceptable porque lo
     ejecuta una migración, y aquí no lo es**.
  4. Declarar `resolver_enrutamiento` como `STABLE STRICT` y `registrar_enrutamiento` como
     `VOLATILE`; `STRICT` evita tener que razonar sobre la entrada nula.
- **Dueño:** `arquitecto`, `datos`.
- **Verificación:** CONFIRMADO por omisión en el texto.

---

### [MEDIO] `SUSPENDIDO` está en el esquema y no está en la tabla de decisiones

- **Dónde:** `docs/03-adr/0008-...md:177` contra `:218-222`.
- **Qué pasa:** el estado tiene tres valores y el manejo especifica dos casos (`REVOCADO` y
  desconocido). Quien implemente `resolver_enrutamiento` devolverá la fila igual para `ACTIVO` y
  `SUSPENDIDO`, y los mensajes de una agencia suspendida por impago o por investigación se procesarán
  con normalidad. Lo peligroso no es procesarlos: es que **nadie decidió** que se procesaran.
- **Corrección:** añadir la fila a la tabla de §2. Recomendación: `SUSPENDIDO` se persiste —el
  cliente vuelve— pero no se emite por Socket.IO ni dispara automatización; o bien se trata como
  `REVOCADO`. Lo que no puede quedar es sin decidir.
- **Dueño:** `arquitecto`. **Verificación:** CONFIRMADO.

---

### [MEDIO] `canales` no existe en el esquema, y el ADR delega en ella la custodia de los tokens de tenant

- **Dónde:** `docs/03-adr/0008-...md:176` y `:187-189`; contrastado con
  `packages/database/prisma/schema.prisma` (no hay ningún modelo `Canal`).
- **Qué pasa:** el ADR razona sobre `canales` como si existiera —"token cifrado, calidad del número,
  plantillas […] vive en `canales`, con `tenant_id` y RLS"— y es la tabla que custodiará los tokens
  de WhatsApp de terceros, prioridad número dos de esta auditoría. Esa tabla no está especificada en
  ningún sitio. El ADR coloca su columna de enlace sin que haya a qué enlazar.
- **Corrección:** o se especifica `canales` en `docs/02-arquitectura/03-modelo-de-datos.md` **antes**
  de aceptar este ADR, o este ADR declara explícitamente que `canal_id` queda sin clave foránea hasta
  que exista, y que la migración del directorio **no puede aplicarse antes** que la de `canales`. Lo
  segundo es aceptable; lo que no lo es, es la ambigüedad.
- **Dueño:** `arquitecto`, `datos`. **Verificación:** CONFIRMADO.

---

### [MEDIO] `canal_id` puede apuntar al canal de otro tenant y nada lo impide

- **Dónde:** `docs/03-adr/0008-...md:175-176`.
- **Qué pasa:** la fila guarda `tenant_resuelto_id` y `canal_id` como campos independientes. Nada
  obliga a que el canal pertenezca a ese tenant. Y `registrar_enrutamiento`, ejecutándose como
  `viajapro_enrutador` —que por diseño no tiene privilegios sobre `canales`—, **no puede verificarlo**.
- **Escenario:** un error en el alta, o un atacante con permiso de ejecución, crea una fila con el
  tenant propio y el `canal_id` de otra agencia. El trabajador fija el tenant correcto pero escribe
  los mensajes asociados a un canal que, bajo RLS, ese tenant no ve: conversaciones huérfanas, o peor,
  lógica aguas abajo que lea el canal fuera de contexto.
- **Corrección:** `UNIQUE (id, tenant_id)` en `canales` y clave foránea compuesta
  `(canal_id, tenant_resuelto_id) REFERENCES canales(id, tenant_id)`. El motor impone la coherencia
  sin que la función necesite privilegios de lectura. Es el patrón que debería aplicarse a toda
  referencia cruzada entre tablas con tenant, y merece una línea en el modelo de datos.
- **Dueño:** `datos`, `arquitecto`. **Verificación:** CONFIRMADO.

---

### [MEDIO] La lista de excepciones vive en dos sitios, ya divergió, y el ADR se apoya en la que no manda

- **Dónde:** `packages/database/prisma/policies/001-aislamiento-tenant.sql:110`
  (`tenants`, `monedas`, `_prisma_migrations`) contra
  `docs/02-arquitectura/03-modelo-de-datos.md:217-228` (`tenants`, `plans`, `countries`,
  `currencies`, `timezones`, `system_message_templates`); y `docs/03-adr/0008-...md:169`
  ("declarada como excepción a R1 en […] §4").
- **Qué pasa:** las dos listas no coinciden ni en los nombres ni en el idioma. La que **manda** es la
  del SQL; la del documento es decorativa. ADR-0008 se apoya en la decorativa como mecanismo de
  control. Peor: una vez que una tabla entra en la lista de exclusión de la vista, la prueba de
  aislamiento **deja de decir nada sobre ella para siempre**, y el ADR está a punto de meter dos.
- **Corrección:** la lista pasa a ser **dato en la base** (`excepciones_rls`, la misma tabla que pide
  el hallazgo crítico 1); la vista `tablas_sin_aislamiento` la consulta en vez de llevar una lista
  literal; y `docs/02-arquitectura/03-modelo-de-datos.md` §4 se corrige para que coincida. Además, la
  prueba compara el conjunto de excepciones contra una lista literal escrita **en el archivo de
  prueba**: añadir una excepción debe poner la prueba en rojo hasta que alguien edite la prueba, lo
  que fuerza la revisión que hoy no ocurre.
- **Dueño:** `datos`, `documentador`. **Verificación:** CONFIRMADO.

---

### [MEDIO] `nombrePerfil` viene de Meta y acaba en la bandeja: suplantación y texto sin sanear

- **Dónde:** `docs/03-adr/0008-...md:242` (`asegurarContacto({ telefonoE164, nombrePerfil })`).
- **Qué pasa:** `nombrePerfil` es el nombre de perfil de WhatsApp, controlado al cien por cien por
  quien escribe. Si `asegurarContacto` es un *upsert* que actualiza `nombre` en cada mensaje, **un
  cliente puede renombrarse a voluntad en la bandeja de la agencia** —por ejemplo a "ViajaPro Soporte
  — verificar pago en esta cuenta"— y sobrescribir el nombre que la agencia puso a mano. Es ingeniería
  social con nuestro producto como vector. Además es texto sin acotar que viaja a React y a las
  exportaciones.
- **Corrección:**
  1. `asegurarContacto` **no actualiza `nombre`** si ya tiene valor. El nombre de perfil se guarda en
     una columna distinta, `nombre_perfil_whatsapp`, y la interfaz lo muestra como lo que es: dato no
     verificado del remitente.
  2. Recorte a longitud máxima y eliminación de caracteres de control y de marcas de dirección
     bidireccional antes de persistir.
  3. Neutralizar la inyección de fórmulas en las exportaciones a hoja de cálculo.
- **Dueño:** `arquitecto` (contrato del puerto), `backend`, `frontend`.
- **Verificación:** PLAUSIBLE.

---

### [MEDIO] Sin límite de tamaño del cuerpo ni límite de tasa en el endpoint

- **Dónde:** `docs/03-adr/0008-...md:272-281`.
- **Qué pasa:** el paso 1 lee el cuerpo crudo sin tope declarado. El HMAC exige el cuerpo completo en
  memoria, de modo que **la validación de firma no puede proteger contra un cuerpo gigante**: cuando
  se sabe que la firma es inválida, ya se leyó todo. El ADR menciona "contador por IP" para firmas
  inválidas pero no dice que se rechace.
- **Escenario:** alguien envía cuerpos de 50 MB al endpoint público. Cada uno consume memoria y CPU
  antes de ser rechazado. Con suficiente paralelismo el proceso de la API se degrada y, con él, **la
  recepción de webhooks legítimos de todas las agencias**, que es el objetivo de disponibilidad que
  el propio ADR declara en `:36-37`.
- **Corrección:** tope duro de cuerpo —1 MiB es holgado para Cloud API— aplicado **en el servidor
  HTTP**, con `413` antes de leer; límite de tasa por IP sobre el endpoint; y bloqueo temporal tras N
  firmas inválidas. Escribirlo como paso 0 de la lista síncrona.
- **Dueño:** `arquitecto`, `backend`, `devops`. **Verificación:** CONFIRMADO por omisión.

---

### [MEDIO] La rotación del App Secret no está prevista, y todo §2 descansa sobre él

- **Dónde:** `docs/03-adr/0008-...md:214-216` y `:230-233`.
- **Qué pasa:** el argumento central de §2 —"una petición con firma válida es tráfico de nuestra
  propia app"— es correcto, y se usa para relajar el tratamiento de los casos raros. Pero el ADR no
  dice dónde vive el App Secret, quién lo rota ni cómo. Y la rotación **no es opcional**: el propio
  ADR contempla el escenario de compromiso y lo resuelve con "se escala a una persona", sin
  procedimiento.
- **Escenario:** se rota el App Secret un lunes. Durante la ventana en que Meta aún firma con el
  anterior, el endpoint devuelve `403` a tráfico legítimo. Meta reintenta y luego **degrada la
  entrega para todos los tenants** — exactamente el daño que el ADR quiere evitar.
- **Corrección:** el verificador acepta **una lista de secretos** —actual y anterior— y valida contra
  ambos durante la ventana de rotación, siempre en tiempo constante. Añadir al ADR una línea con el
  procedimiento y la referencia a dónde se custodia el secreto, más la regla ante sospecha de
  compromiso: rotar primero, investigar después.
- **Dueño:** `arquitecto`, `whatsapp`, `devops`. **Verificación:** CONFIRMADO por omisión.

---

### [MEDIO] Desuscribir el WABA automáticamente es una acción destructiva sobre un tercero disparada por un contador

- **Dónde:** `docs/03-adr/0008-...md:221` y `:230-233`.
- **Qué pasa:** cortar la suscripción al WABA deja a esa organización sin recibir mensajes por
  nuestra app. Como acción de contención ante un posible compromiso tiene sentido; como respuesta
  automática a un contador, es un interruptor de apagado para un cliente, accionable por error.
- **Escenario:** una agencia renueva tras dos semanas de baja. Mientras el alta se completa, los
  mensajes siguen entrando contra una fila `REVOCADO`, el contador se dispara y el sistema desuscribe
  el WABA. Reconectarlo exige intervención de la agencia en Meta. Hemos roto a un cliente que acababa
  de volver.
- **Corrección:** el desuscribir nunca es automático. El contador **propone** la acción, una persona
  la confirma, y queda excluido todo WABA con un alta en curso en las últimas 72 horas. Si se quiere
  automatismo, que sea en el sentido inocuo: dejar de encolar y alertar.
- **Dueño:** `arquitecto`, `whatsapp`. **Verificación:** PLAUSIBLE.

---

### [MEDIO] Nada prohíbe que el payload acabe en Redis, que no está cifrado ni cubierto por RLS

- **Dónde:** `docs/03-adr/0008-...md:280`.
- **Qué pasa:** el ADR no dice **qué** se encola. El atajo natural del implementador es meter el
  payload en los datos del trabajo para ahorrarse una lectura. Si eso ocurre, el contenido de mensajes
  de todas las agencias queda en Redis en claro, sin RLS, sin cifrado, con la retención que BullMQ
  tenga configurada para trabajos completados y visible en cualquier panel de inspección de colas.
- **Corrección:** escribir en el ADR, como invariante: **"el trabajo transporta únicamente
  `recepcion_id`. El contenido nunca sale de PostgreSQL."** Añadir la política explícita de
  eliminación de trabajos completados y fallidos.
- **Dueño:** `arquitecto`, `backend`. **Verificación:** PLAUSIBLE.

---

### [MEDIO] La resolución del tenant normaliza `sinTenantPorqueEsPlataforma` dentro de un módulo de negocio

- **Dónde:** `apps/api/src/shared/prisma/prisma.service.ts:98-104` contra
  `docs/03-adr/0008-...md:307-309`.
- **Qué pasa:** esa vía de escape está documentada como "deliberadamente incómoda de nombrar […] si
  aparece dentro de un módulo de negocio, es un defecto". El flujo de ADR-0008 necesita ejecutar algo
  sin contexto de tenant precisamente dentro de `inbox`. Si se usa ese método, el defecto que la
  revisión debía detectar pasa a ser el funcionamiento normal del módulo más activo del sistema, y el
  aviso que emite por cada mensaje recibido obligará a silenciarlo. A partir de ahí la señal se ha
  perdido para todo el proyecto.
- **Corrección:** un método propio y estrecho —`resolverEnrutamiento(phoneNumberId)`— en un servicio
  de plataforma, que **solo** sabe llamar a la función y no expone un cliente genérico sin tenant.
  `sinTenantPorqueEsPlataforma` sigue siendo incómodo y sigue sin aparecer en módulos de negocio. El
  ADR debe nombrar esa restricción en §4.
- **Dueño:** `arquitecto`, `backend`. **Verificación:** CONFIRMADO.

---

### [MEDIO] Dos retenciones nuevas que no están en la política, y una que dice "nunca"

- **Dónde:** `docs/03-adr/0008-...md:222`, `:224-227`, `:294-297` contra
  `docs/05-seguridad/02-proteccion-de-datos.md:92-103`.
- **Qué pasa:** el ADR crea dos periodos de conservación —cuarentena 7 días, `recepciones_webhook`
  7 días— que no existen en la tabla de retención, y una conservación **indefinida** ("la fila no se
  borra nunca") para el directorio. El propio documento de protección de datos dice que *"guardar
  todo para siempre no es una política de retención: es una ausencia de política"*. Sobre los 7 días:
  son defendibles para el **hash** —idempotencia frente a reintentos de Meta— y difícilmente para el
  **contenido**, cuya finalidad se agota al procesarlo. El plazo no está justificado en el ADR por
  ninguna finalidad concreta, que es lo que la Ley 1581 pide.
- **Corrección:**
  1. Separar los dos plazos en el ADR: **contenido cifrado, borrado al procesar o al clasificar
     (minutos)**; **hash, 7 días, finalidad: idempotencia frente a reintentos del proveedor**.
  2. Cuarentena: 7 días con finalidad declarada —"completar un alta a medias"— y purga automática,
     no manual.
  3. El "nunca se borra" del directorio pasa a ser un plazo: **5 años**, alineado con la bitácora de
     auditoría, que es la finalidad que el propio ADR invoca (`:226-227`). Si la agencia es persona
     natural —habitual en agencias pequeñas colombianas—, "para siempre" es insostenible frente a un
     derecho de supresión; "5 años por deber de prueba" sí se sostiene.
  4. Añadir las tres filas a la tabla de `02-proteccion-de-datos.md` §4 y una entrada al trabajo
     programado de retención.
- **Dueño:** `arquitecto`, `documentador`. **Verificación:** CONFIRMADO.

---

### [MEDIO] "Metadatos" no está definido, y el teléfono del viajero no puede entrar ahí

- **Dónde:** `docs/03-adr/0008-...md:222` y `:229-230`.
- **Qué pasa:** el ADR enumera "identificador, WABA, tipo de evento, hora" y luego usa la palabra
  "metadatos" sin cerrarla. La diferencia importa: `phone_number_id` y `waba_id` identifican a la
  **agencia** y son un riesgo bajo; el teléfono del **remitente** es dato personal de un ciudadano
  identificable y no puede estar en la cuarentena, con o sin cifrado, porque para él no tenemos ni
  responsable del tratamiento ni finalidad. La respuesta a la pregunta del encargo es: **un número de
  teléfono de viajero sí es dato personal y no es "metadato"**; el identificador de número de la
  agencia no lo es.
- **Corrección:** cerrar la lista en el ADR con fórmula restrictiva: *"la cuarentena guarda
  exactamente `phone_number_id`, `waba_id`, tipo de evento, marca de tiempo y un contador. Ninguna
  columna más. En particular **no** guarda el número del remitente, ni el `wamid`, ni nada derivado
  del contenido."* Y añadir la consecuencia operativa: si alguna vez hay que investigar un caso con
  más detalle, se hace con una decisión documentada y un plazo, no ampliando el esquema.
- **Dueño:** `arquitecto`. **Verificación:** CONFIRMADO.

---

### [MEDIO] El ADR no dice qué rol de la agencia puede conectar un número

- **Dónde:** `docs/03-adr/0008-...md:208-210`, contrastado con `docs/05-seguridad/04-rbac.md`.
- **Qué pasa:** "una sesión autenticada de la agencia" incluye al rol `ASESOR` y, según cómo se
  implemente, al `SOLO_LECTURA`. Conectar o reconectar el canal de WhatsApp es la operación más
  sensible del tenant después de facturar.
- **Corrección:** restringir `registrar_enrutamiento` a `DUENO` y, como mucho, `ADMINISTRADOR`;
  escribirlo en el ADR y cubrirlo con una prueba de RBAC.
- **Dueño:** `arquitecto`, `backend`. **Verificación:** CONFIRMADO por omisión.

---

### [BAJO] "Purga a los 7 días — conserva solo su hash": una fila no puede estar purgada y conservada

- **Dónde:** `docs/03-adr/0008-...md:296-297`.
- **Qué pasa:** la frase se contradice. Si la fila se borra, se pierde la idempotencia de recepción;
  si se conserva el hash, la fila no se purgó. Quien elija "borrar" reabre la ventana de
  reprocesamiento de un cuerpo repetido pasada la semana.
- **Corrección:** redactar: *"a los 7 días se purga el contenido y los metadatos operativos; la fila
  conserva `recepcion_id` y la marca de recepción durante 30 días para sostener la idempotencia;
  después se borra."* El impacto real es bajo porque la garantía fuerte es
  `UNIQUE (tenant_id, provider_message_id)`, tal como el ADR explica bien en `:299-304`.
- **Dueño:** `arquitecto`. **Verificación:** CONFIRMADO.

---

### [BAJO] "Enumerar el directorio completo deja de ser posible" es una sobreafirmación

- **Dónde:** `docs/03-adr/0008-...md:59-60` y `:197`.
- **Qué pasa:** `resolver_enrutamiento` devuelve una fila por llamada, lo que impide un volcado, no
  una enumeración. Los `phone_number_id` de Meta son numéricos y se asignan de forma densa: quien
  pueda llamar a la función en bucle puede barrer rangos y distinguir registrado de no registrado. La
  función **es** un oráculo de pertenencia a la plataforma; lo que cambia es el costo, no la
  posibilidad.
- **Corrección:** cambiar la frase por *"un volcado del directorio deja de ser una sola consulta; la
  enumeración sigue siendo posible a costa de N llamadas, y se vigila con una métrica de resoluciones
  fallidas por minuto, con alerta"*. Añadir esa métrica. Y declarar que la función solo se invoca
  desde el trabajador de webhooks: ninguna ruta HTTP la alcanza con entrada de usuario.
- **Dueño:** `arquitecto`. **Verificación:** CONFIRMADO.

---

### [BAJO] El cuerpo crudo no debe aparecer en los registros al fallar la firma

- **Dónde:** `docs/03-adr/0008-...md:276`.
- **Qué pasa:** el reflejo natural al depurar un fallo de firma es registrar el cuerpo. Ese cuerpo
  contiene mensajes de clientes, y `docs/05-seguridad/02-proteccion-de-datos.md:117` lo prohíbe sin
  matices.
- **Corrección:** una línea en el ADR: *"ante firma inválida se registran longitud del cuerpo, los
  primeros ocho bytes de su hash y la IP. Nunca el cuerpo ni la cabecera de firma."*
- **Dueño:** `arquitecto`, `backend`. **Verificación:** PLAUSIBLE.

---

### [BAJO] Una resolución vacía debe ser un caso explícito, no un nulo que fluye

- **Dónde:** `docs/03-adr/0008-...md:306-309`.
- **Qué pasa:** si el trabajador pasa el resultado directamente a fijar `app.current_tenant` sin
  comprobar, un nulo deja el parámetro en cadena vacía. El efecto es seguro —cero filas, y la
  inserción falla por `WITH CHECK`—, pero se manifiesta como un error de RLS confuso en vez de como
  el caso "desconocido" de §2.
- **Corrección:** el ADR fija que el trabajador **comprueba el resultado antes de fijar nada** y que
  una resolución vacía entra por la rama de §2. Añadir, como defensa en profundidad, una aserción
  antes de cada escritura: el tenant fijado en la sesión debe ser igual al tenant resuelto para ese
  `entry`.
- **Dueño:** `arquitecto`, `backend`. **Verificación:** PLAUSIBLE.

---

### [BAJO] El origen del contacto creado automáticamente no queda registrado

- **Dónde:** `docs/03-adr/0008-...md:259-261`.
- **Qué pasa:** el ADR acierta de pleno al separar "recibir un mensaje" de "consentimiento" —es más
  estricto que `docs/05-seguridad/02-proteccion-de-datos.md:67-68`, que sugiere lo contrario y debería
  corregirse—, pero el contacto creado sin consentimiento no queda marcado como tal. Sin esa marca,
  dentro de seis meses nadie sabrá qué contactos pueden recibir marketing.
- **Corrección:** `asegurarContacto` fija un origen `WHATSAPP_ENTRANTE` y deja el consentimiento
  nulo. Y abrir una corrección en `02-proteccion-de-datos.md` §4 para alinear su redacción con la
  regla del ADR, que es la correcta.
- **Dueño:** `arquitecto`, `documentador`. **Verificación:** CONFIRMADO.

---

## Respuesta a las preguntas del encargo

### 1. ¿La tabla sin RLS es la superficie mínima posible?

**No. Sobra información, y el ADR subestima el valor de una lectura completa.**

Quien la lea entera obtiene tres cosas, no una:

- **La lista completa de WABA y números de todas las agencias.** Como Tech Provider tenemos **un
  solo token de usuario de sistema con acceso a todos los WABA de clientes**. Ese token, sin el
  directorio, obliga a descubrir a quién atacar; con el directorio es una lista de objetivos lista
  para usar. La combinación "token de plataforma + directorio" permite **enviar mensajes suplantando
  a cualquier agencia cliente**. El ADR evalúa la lectura como "molesto, no fatal" sin contar esto.
- **La lista completa de `tenant_id`.** El ADR dice que conocer un `tenant_id` no es una capacidad
  "porque `app.current_tenant` se fija desde la sesión verificada". Es cierto hoy, y es exactamente
  la tabla de consulta que convierte **cualquier** bug futuro de ese tipo —una inyección, un
  parámetro mal cableado, un uso indebido de `sinTenantPorqueEsPlataforma`— de "hay que adivinar un
  UUID" a "elija a quién quiere suplantar". No es fatal por sí sola: es un acelerador, y debe
  describirse así.
- **El libro de clientes.** Con `creado_en` y `revocado_en`: cuántas agencias somos, cuándo entró
  cada una y cuándo se fue. Para un competidor, eso es todo.

**Sí puede contener menos, y conviene:**

- Clave primaria `phone_number_id_hmac` = HMAC-SHA256 del identificador con una **pimienta guardada
  en el almacén de secretos de la aplicación, nunca en la base**. Un **hash simple no sirve**:
  `phone_number_id` es numérico y de espacio pequeño, se invierte por fuerza bruta en minutos. Con
  HMAC y pimienta fuera de la base, **un volcado de la base no revela ni un solo número**. El límite,
  dicho sin adornos: a quien compromete el proceso de la aplicación esto no le estorba, porque tiene
  la pimienta. Pero el escenario que la tabla sin RLS crea —acceso de solo lectura a la base,
  réplica, respaldo, consola del proveedor— queda neutralizado por el costo de dos líneas de código.
- `waba_id`: igual, un HMAC para agrupar más un valor cifrado para el único camino que necesita el
  identificador en claro, el de desuscripción.
- **Fuera `creado_en` y `revocado_en`:** la cronología pertenece a `canales` —tenant-scoped— y al
  historial de auditoría. El directorio queda en cuatro columnas: clave del canal, tenant, canal y
  estado. Eso **sí** es la proyección mínima que el ADR dice querer.

### 2. ¿Están las funciones `SECURITY DEFINER` lo bastante especificadas?

**No, en cuatro puntos**, todos con hallazgo propio: el valor concreto de `search_path`; el
`REVOKE EXECUTE` sobre `PUBLIC` que el ADR no vio y que es el gemelo exacto del problema que sí vio;
la prohibición de SQL dinámico en el cuerpo; y el `NOLOGIN` del propietario.

Sobre el oráculo: **sí, `resolver_enrutamiento` es un oráculo de pertenencia**, y el ADR afirma lo
contrario. Con la clave en HMAC el oráculo deja de aceptar números en claro —hay que tener la
pimienta para preguntar—, lo que lo cierra para todo el que no esté ya dentro del proceso de la
aplicación. Lo que quede se vigila con la métrica de resoluciones fallidas por minuto.

### 3. ¿El diseño impide de verdad repuntar un número, o solo lo dificulta?

**Solo lo dificulta.** Hay tres caminos abiertos y el ADR solo considera el tercero:

- **Vía permiso de ejecución con contexto de tenant falseado.** Cualquier ejecución de SQL arbitrario
  con el rol de aplicación basta, porque el parámetro de sesión lo fija el propio rol. Es el hallazgo
  crítico 2. **Se cierra** con el rol separado para el camino de alta: no elimina el riesgo, lo
  reduce de "toda la API" a "un endpoint".
- **Vía alta sin prueba de titularidad.** Un cliente legítimo reclama un número ajeno. Es el hallazgo
  crítico 3. **Se cierra** derivando los identificadores del canje de Embedded Signup.
- **Vía compromiso de `viajapro_enrutador`.** Si el rol es `NOLOGIN` y sin contraseña, no existe como
  escenario independiente: para actuar como él hay que ser ya propietario del esquema o superusuario,
  y en ese punto el aislamiento está perdido con o sin este ADR. **Si tiene `LOGIN`, sí es un
  escenario nuevo y realista.** De ahí la exigencia de escribir `NOLOGIN` en el ADR.

Y lo que ninguno de los tres cierra: **la detección**. Sin el historial de inserción exclusiva, un
repunte exitoso por cualquiera de las tres vías es indetectable e indemostrable.

### 4. Cómo se verifica el `REVOKE` con una prueba que falle en rojo

El problema es peor de lo que el ADR cree —se deshace solo, hallazgo crítico 1— y la verificación no
puede ser una nota. Estas son las nueve aserciones que deben añadirse a
`packages/database/tests/aislamiento.spec.ts`, todas con `viajapro_app` como cliente, numeradas a
continuación de las siete que ya existen:

| # | Aserción | Qué atrapa |
|---|---|---|
| 8 | Un `SELECT` sobre `enrutamiento_canales` lanza `42501` (permiso denegado) | El `REVOKE` olvidado **o revertido**. Es la prueba clave: es de comportamiento, no de catálogo, y falla sin importar cómo se concedió el privilegio |
| 9 | `INSERT`, `UPDATE` y `DELETE` directos sobre `enrutamiento_canales` lanzan `42501` | La primitiva de secuestro al alcance del rol general |
| 10 | Para toda tabla de `excepciones_rls` y todo privilegio, `has_table_privilege('viajapro_app', …)` coincide exactamente con lo declarado | Cualquier privilegio sobrante en cualquier tabla global, hoy y en el futuro. **Es la que sobrevive al paso del tiempo, porque no enumera tablas: compara contra una declaración** |
| 11 | El conjunto de tablas de `excepciones_rls` es exactamente el literal escrito en el archivo de prueba | Que alguien añada una excepción a RLS sin que nadie la revise |
| 12 | `has_function_privilege('public', …, 'EXECUTE')` es falso para ambas funciones | El `EXECUTE` a `PUBLIC` que PostgreSQL concede por omisión |
| 13 | El `proconfig` de ambas funciones contiene una entrada `search_path`, y su `proowner` es `viajapro_enrutador` | `search_path` sin fijar, y una función creada por el propietario del esquema |
| 14 | `rolcanlogin`, `rolbypassrls` y `rolsuper` de `viajapro_enrutador` son falsos, y no es miembro de `neon_superuser` | El propietario convertido en credencial, o con evasión heredada del proveedor |
| 15 | Con el tenant A fijado, `registrar_enrutamiento` sobre un número de B lanza excepción **y la fila sigue apuntando a B** | La reimplementación de RLS dentro de la función |
| 16 | Un payload con dos `entry` de dos tenants deja cada mensaje en su tenant: A ve uno, B ve el otro, ninguno ve el del otro | El cruce por reutilización de la transacción entre `entry` |

La 8 y la 10 son las que responden literalmente a la pregunta: la 8 porque falla en rojo ante
cualquier regresión del privilegio, venga de donde venga; la 10 porque no hay que acordarse de
actualizarla cuando aparezca la tabla global número tres.

### 5. La cuarentena frente a la Ley 1581 y R10

Evaluada en dos hallazgos: la definición de "metadatos" (MEDIO) y la contradicción que hace que el
contenido del tenant desconocido ya esté persistido (ALTO). En resumen:

- **Qué es "metadato" aquí:** debe quedar cerrado por esquema, no por disciplina. El
  `phone_number_id` **no** es dato personal de un viajero: identifica a la agencia. El número del
  **remitente sí lo es** y no puede entrar en cuarentena.
- **¿Siete días es defendible?** Para esos metadatos de agencia, sí, con la finalidad declarada de
  completar un alta a medias. Para contenido, no: su finalidad se agota al clasificarlo.
- **Si acaba PII de un ciudadano colombiano cuyo tenant no existe**, estamos tratando datos sin
  responsable identificable, sin finalidad y sin capacidad de atender un derecho del titular —no
  podríamos ni localizar sus datos ni demostrar que los borramos. Por eso la regla tiene que ser que
  **las columnas no existan**, y que el payload se borre en el acto al clasificar el evento.

### 6. El cifrado del payload crudo

El algoritmo es coherente con R6 (AES-256-GCM) y no inventa un esquema nuevo. **Pero inventa una
clave que no existe en ningún inventario**, y omite versión, AAD y rotación. Detallado en el hallazgo
ALTO correspondiente. La parte buena: como el dato vive siete días o menos, la rotación se resuelve
sin recifrado —versión nueva para filas nuevas, versión vieja viva solo para descifrar hasta que la
purga la deje sin uso—, y eso cabe en dos frases del ADR.

### 7. Lo que el arquitecto no vio

Cinco cosas, todas del tipo "el sistema sigue funcionando y el aislamiento ya no se cumple":

1. El `GRANT ... ON ALL TABLES` que **revierte el `REVOKE`** en cada migración de políticas (crítico 1).
2. El `EXECUTE` concedido a `PUBLIC` por omisión en toda función nueva (ALTO).
3. El identificador de trabajo que convierte un fallo permanente en **pérdida silenciosa de mensajes
   de clientes**, rompiendo el único invariante que §4 promete (ALTO).
4. La ausencia de bitácora, que hace **indetectable e indemostrable** un secuestro consumado (ALTO).
5. El payload que **ya está persistido** cuando se descubre que no hay tenant al que atribuirlo
   (ALTO).

---

## Qué se revisó y salió limpio

Dicho explícitamente, porque un informe que solo lista problemas no deja saber qué quedó sin mirar:

- **La elección de la opción A sobre C, D y E.** El descarte de C es correcto y bien argumentado: un
  token en la URL es un `tenant_id` en la petición con otro nombre, y ADR-0003 §5 no admite matices.
  El de E es correcto. El de D como verdad, con admisión como caché futura, es correcto.
- **La decisión de no llamar `tenant_id` a la columna.** Es sólida: evita que el aplicador dirigido
  por datos de `packages/database/prisma/policies/001-aislamiento-tenant.sql:52-71` le ponga RLS y
  reabra el ciclo en producción. La exigencia de que la prueba verifique que la columna **no** existe
  es correcta y debe conservarse.
- **El orden del camino síncrono.** Cuerpo crudo antes de cualquier parseo, HMAC sobre el crudo,
  comparación en tiempo constante, y parseo de JSON desactivado en esa ruta. Es correcto, y es el
  error que más integraciones de este tipo cometen.
- **`403` ante firma inválida.** Correcto: no es tráfico de Meta y no hay riesgo de degradación.
- **`200` ante tenant revocado.** Correcto y bien razonado: devolver error ahí dañaría a todos.
- **El invariante "ningún 200 antes de una tabla durable".** La intención es correcta; falla en el
  detalle del identificador de trabajo, no en el diseño.
- **La idempotencia en dos capas**, con `UNIQUE (tenant_id, provider_message_id)` como garantía y el
  hash como optimización. La distinción está bien hecha y bien explicada.
- **"El tenant se resuelve por `entry`, nunca por petición."** Es la decisión correcta y el ADR
  acierta al hacerla estructural. Solo falta la prueba que lo verifique (aserción 16).
- **El puerto `asegurarContacto` sin parámetro de tenant**, apoyado en el contexto ambiente de la
  transacción. Correcto: un `tenant_id` como parámetro es un `tenant_id` que alguien puede pasar mal.
- **La separación entre recibir un mensaje y otorgar consentimiento** (`:259-261`). Es más estricta
  que la documentación vigente y es la postura correcta frente a la Ley 1581 y a las políticas de
  Meta. No se toca; lo que hay que corregir es la documentación, no el ADR.
- **Emitir por Socket.IO después del commit, a salas con prefijo de tenant**, reconociendo que Redis
  no está cubierto por RLS. Correcto y consistente con ADR-0003.
- **No reproducir automáticamente lo que está en cuarentena.** Correcto, y es la decisión que evita
  la peor operación posible de este sistema.
- **Secretos:** no se encontró ningún secreto en el ADR ni en los archivos de políticas revisados.
  `packages/database/prisma/policies/002-rol-aplicacion.sql:14-21` pasa la contraseña por parámetro
  de `psql`, que es lo correcto.
- **Fuera de perímetro**, no revisado en esta auditoría: rotación de tokens de refresco, límites de
  intentos en autenticación y recuperación, RBAC completo, aislamiento en S3, y el namespacing de
  Redis más allá de lo que este ADR toca.

---

## Deuda aceptada conscientemente

| Deuda | Por qué se acepta | Cuándo se revisa |
|---|---|---|
| Dos tablas globales sin RLS | No hay forma de romper el ciclo huevo-gallina sin al menos una; la segunda es el precio de la durabilidad antes del 200 | Al llegar la tabla global número tres: si la lista crece, el patrón está mal |
| Dos funciones `SECURITY DEFINER` | Es la única forma de dar acceso acotado a una tabla sin RLS sin conceder `SELECT` | En cada modificación de su cuerpo, con revisión de `auditor-seguridad` |
| El puerto síncrono `inbox` → `crm` | El costo está entendido y declarado; la alternativa deja la bandeja mostrando teléfonos huérfanos | Cuando se extraiga `inbox` como servicio (ADR-0004) |
| La resolución del tenant en el camino caliente | Es una lectura, y la caché está diseñada pero no implementada | Cuando aparezca en el perfil de latencia del trabajador |

---

## Dictamen

**El ADR-0008 NO puede pasar a Aceptado tal como está. Puede pasar a Aceptado con los cambios
enumerados abajo, todos ellos en el texto del ADR.** La decisión de fondo —opción A para el mapa,
opción G para la frontera, staging de B para la durabilidad— se ratifica sin reservas.

### Bloqueantes: sin esto, el ADR no se acepta

- **B-1.** Reescribir §1 "Permisos": el `REVOKE` no es un paso de migración, es una **excepción
  declarativa** que el propio aplicador de `001-aislamiento-tenant.sql` §4 vuelve a imponer después
  de cada `GRANT ... ON ALL TABLES`. Añadir la frase: *"la revocación debe sobrevivir a la
  reejecución del aplicador de políticas; hoy no lo haría."*
- **B-2.** Añadir a §1 la revocación de `EXECUTE` sobre `PUBLIC` para ambas funciones y el
  `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`, con el mismo énfasis que el
  `REVOKE` de tablas. **Son dos fallos silenciosos, no uno.**
- **B-3.** Separar los privilegios de ejecución por camino: `viajapro_app` sin `EXECUTE` sobre
  `registrar_enrutamiento`; rol `viajapro_altas` para el camino de alta; rol `viajapro_webhook` para
  el trabajador, con `EXECUTE` solo sobre `resolver_enrutamiento`. Y **corregir la frase de
  Consecuencias** `:343-344`, que hoy afirma algo falso.
- **B-4.** Añadir a §1 la prueba de titularidad: `phone_number_id` y `waba_id` **se derivan del canje
  de Embedded Signup en el servidor y jamás vienen del cliente**, con la frase simétrica a
  ADR-0003 §5. Definir qué ocurre con una fila `REVOCADO` que otra agencia reclama legítimamente.
- **B-5.** Fijar en §1 el `search_path` vacío con objetos cualificados, prohibir el SQL dinámico
  dentro de las funciones, y declarar `viajapro_enrutador` como `NOLOGIN NOBYPASSRLS NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOINHERIT`, sin contraseña, con el `REVOKE neon_superuser` condicional.
- **B-6.** Resolver la contradicción entre §2 y §4: el contenido de un evento clasificado como
  revocado o desconocido **se borra en el acto**, no a los 7 días. Reescribir la celda
  correspondiente de la tabla de §2.
- **B-7.** Añadir a §1 el historial de inserción exclusiva `enrutamiento_historial` y la notificación
  a ambos tenants ante todo cambio de titularidad.
- **B-8.** Añadir a §4 el criterio del relay por "no procesado" y la corrección del identificador de
  trabajo, para que un fallo permanente no se convierta en pérdida silenciosa. Es el invariante
  central del apartado y hoy no se cumple.
- **B-9.** Especificar la clave: nombre, custodio, columna de versión, nonce por fila, **AAD igual a
  `recepcion_id`**, verificación del sha256 del texto claro tras descifrar, procedimiento de rotación
  por expiración, y prohibición explícita de cifrar dentro del SQL.
- **B-10.** Añadir al ADR una sección "Cómo se verifica" con las nueve aserciones de la tabla de la
  pregunta 4, nombradas una a una. El ADR dice dos veces que algo "debe ser una aserción de la prueba
  de aislamiento, no una nota"; tiene que enumerarlas para que eso sea cierto.

### Recomendados: no bloquean, se aplican en la misma pasada

- **R-1.** Minimizar el directorio a cuatro columnas, con el identificador en HMAC y pimienta fuera
  de la base, el WABA en HMAC más valor cifrado, y las fechas movidas a `canales`.
- **R-2.** Corregir la evaluación del impacto de una lectura completa en `:68-73`: es el índice que
  hace utilizable el token de plataforma contra todos los clientes, y la tabla de consulta de
  `tenant_id` para cualquier bug futuro de suplantación. No es "molesto, no fatal".
- **R-3.** Sustituir "enumerar el directorio completo deja de ser posible" por la afirmación exacta,
  y añadir la métrica de resoluciones fallidas por minuto con alerta.
- **R-4.** Cerrar el caso `SUSPENDIDO` en la tabla de §2.
- **R-5.** Clave foránea compuesta `(canal_id, tenant_resuelto_id)` contra `canales(id, tenant_id)`,
  con el `UNIQUE` que la hace posible; o declarar la dependencia de orden con la migración de
  `canales`, que hoy no existe en `schema.prisma`.
- **R-6.** Tope de cuerpo con `413`, límite de tasa y bloqueo tras N firmas inválidas, como paso 0
  de §4. Y la regla de no registrar el cuerpo ni la cabecera de firma.
- **R-7.** Rotación del App Secret con dos secretos válidos durante la ventana.
- **R-8.** Desuscripción del WABA nunca automática.
- **R-9.** Invariante explícito: el trabajo de la cola transporta **solo** `recepcion_id`.
- **R-10.** Método estrecho `resolverEnrutamiento()` en lugar de `sinTenantPorqueEsPlataforma` dentro
  de `inbox`.
- **R-11.** Cerrar por esquema la lista de columnas de la cuarentena, excluyendo el número del
  remitente.
- **R-12.** Restringir el alta a `DUENO` y `ADMINISTRADOR`.
- **R-13.** Las tres retenciones a `docs/05-seguridad/02-proteccion-de-datos.md` §4, con el "nunca se
  borra" convertido en 5 años.
- **R-14.** `asegurarContacto` no sobrescribe `nombre`; el nombre de perfil va a columna propia,
  acotado y saneado.
- **R-15.** Unificar la lista de excepciones a RLS en una sola fuente y corregir
  `docs/02-arquitectura/03-modelo-de-datos.md` §4, que ya divergió del SQL que manda.

### Reverificación

Cuando `arquitecto` aplique B-1 a B-10, este auditor revisa **solo** esos puntos. La implementación
posterior exige una segunda revisión independiente: el texto corregido no es evidencia, y en este ADR
hay tres mecanismos cuyo fallo es silencioso por naturaleza. **La evidencia aceptable son las nueve
aserciones en verde contra una base real**, igual que ADR-0007 estableció para `BYPASSRLS`.
