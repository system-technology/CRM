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
- **Hallazgos:** 3 críticos, 8 altos, 11 medios, 5 bajos.

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
