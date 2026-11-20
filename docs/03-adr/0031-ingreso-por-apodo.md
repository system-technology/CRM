# ADR-0031 — Ingreso por apodo, además del correo

- **Estado:** Propuesto
- **Fecha:** 2026-11-20
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta). **Pendientes antes de aceptar:** `auditor-seguridad`
  (obligatorio: cambia el cuerpo de una función `SECURITY DEFINER` y la ruta de inicio de sesión;
  aquí no aplica la regla de una sola vuelta, R13) y `datos` (migración).
- **Amplía:** [ADR-0011](0011-autenticacion-y-tenant-de-sesion.md), §5 (métodos de acceso). No lo
  supersede: correo y contraseña, el código por correo y los pasos 2 a 6 del flujo no cambian.

---

## Contexto

**Fuerza: fricción de uso en el día a día, no volumen ni cumplimiento.** El propietario quiere que
un asesor entre con un identificador corto (`ialvear`) en lugar de su correo. En el móvil, escribir
`isabel.alvear@agencia.com.co` cada vez es lento. Además, la identidad de la demo
(`dueno@agenciademo.test`) tiene un correo que no recibe nada.

**Decisiones del propietario, ya tomadas (no se discuten aquí):**
1. Hoy hay una sola agencia en uso (la demo). Hay un solo formulario de ingreso, sin agencia en el enlace.
2. Con varias agencias se «sectoriza» como Freshdesk: la agencia va en el enlace (primero
   `/<agencia>/ingreso` y después `<agencia>.viajapro.com`) y el apodo pasa a ser **único por
   agencia**. Este ADR deja ese camino descrito y barato, pero no lo construye.
3. La cédula o el NIT como identificador de ingreso quedan fuera (ver la opción D).
4. El correo sigue sirviendo para entrar y para pedir el código de un solo uso.

**Restricciones verificadas en el código:**
- El ingreso corre con `viajapro_identidad` y sin `app.current_tenant`. Ese rol **solo** toca
  `identidades`, `credenciales`, `sesiones`, `verificaciones` y (con `SELECT`) `accesos_identidad`,
  y en su matriz no tiene `EXECUTE` sobre ninguna función (ADR-0011 §6, R2).
- `usuarios` (la pertenencia) lleva `tenant_id` y RLS forzado. `accesos_identidad` es su índice
  global `(identidad_id, tenant_acceso_id)`, y solo la escribe el disparador
  `sincronizar_acceso_identidad()` (dueño `viajapro_accesos`, `NOLOGIN`), con el par de una fila que
  ya pasó el `WITH CHECK`.
- `auth.controller.ts` no monta Better Auth como ruta abierta: `sign-in/email` lo invoca por dentro
  con `{ email, password }` y mapea todo fallo a `CREDENCIALES_INVALIDAS`.
- El inicio con contraseña **solo** tiene el límite de Better Auth por IP (5 por minuto, en memoria,
  T-301). El tope por correo que ya existe (`TopeDeFallosDeCodigo`) es **del código de un solo uso**,
  no de la contraseña.
- Ninguna ruta deja editar un miembro, salvo darlo de baja (`miembros.controller.ts`).
- **Excepción vigente:** en staging, `dueno@agenciademo.test` tiene una contraseña puesta a mano. Se
  retira antes de cargar datos reales (checkpoint del 2026-11-20).

## Opciones consideradas

### A — Columna `apodo` en `identidades` (global, única)
- **Gana:** el ingreso resuelve el apodo en el mismo pool de identidad, con cero roles nuevos y cero funciones nuevas.
- **Cuesta:** quien fija el apodo es el dueño de una agencia (`viajapro_app`, bajo RLS), que no
  puede escribir `identidades`. Habría que validar la pertenencia en un pool y escribir en el otro,
  en dos transacciones. Además, **el dueño de la agencia A cambiaría un dato global** de una persona
  que también puede trabajar en la agencia B. Y la fase 2 obligaría a **mover la columna** a la
  pertenencia: dos cambios de esquema sobre la misma idea.
- **Cierra:** nada de forma irreversible, pero se coloca el dato donde la fase 2 no lo quiere.

### B — Columna en `usuarios` y una función `SECURITY DEFINER` que la lee sin tenant
- **Gana:** el dato queda en la pertenencia desde el día uno.
- **Cuesta:** una función que lee una tabla de negocio **saltándose RLS entre todas las agencias**,
  un rol `NOLOGIN` nuevo como dueño y `EXECUTE` para `viajapro_identidad`. Eso rompe la frase de R2
  «nunca las de negocio» y la matriz de ADR-0011 (cambia `CLAUDE.md`, ruta protegida). Es la
  superficie más delicada del sistema para un beneficio de comodidad.
- **Cierra:** la propiedad de que `viajapro_identidad` no alcanza nada de negocio.

### C — Columna en `usuarios`, reflejada por el disparador en `accesos_identidad` (elegida)
`usuarios.apodo` es el dato. `sincronizar_acceso_identidad()`, que ya escribe
`(identidad_id, tenant_acceso_id)` en cada alta, cambio o baja, copia también `apodo`. El ingreso lee
`accesos_identidad`, que `viajapro_identidad` ya puede leer.
- **Gana:** **cero roles, funciones ni privilegios nuevos de login.** El dueño fija el apodo con
  `viajapro_app`, bajo RLS, en una transacción: no puede tocar la pertenencia de otra agencia. El dato
  vive ya donde lo quiere la fase 2, así que **la fase 2 es cambiar un índice, no mover datos.**
- **Cuesta:** cambia el cuerpo de una función `SECURITY DEFINER` (auditoría obligatoria).
  `accesos_identidad` deja de servir solo al selector de agencia: también resuelve el apodo hacia una
  identidad. **Sigue sin conceder nada**: después hace falta la contraseña de esa identidad, y el
  paso 4 bajo RLS. Si el índice se desincroniza, el ingreso falla, no se abre de más.
- **Cierra:** nada.

### D — Cédula o NIT como identificador (descartada por el propietario)
Es dato personal (Ley 1581, R10) y, en Colombia, enumerable y fácil de conseguir: convertiría en
identificador de ingreso un dato que circula en fotocopias y en cada cotización. Exigiría guardarlo
en claro o con un hash determinista solo para buscarlo, contra ADR-0015. Se descarta por ahora.

### E — El plugin `username` de Better Auth (descartada)
Pone el nombre de usuario en la tabla global de usuarios, con unicidad global. Es el modelo de A, y
choca de frente con la fase 2. Añade una ruta de ingreso propia y su propia normalización, que habría
que exponer y auditar, y hasta mapear `fields` en `crear-auth.ts`. Resolver el apodo a su correo en
nuestro controlador y llamar a la misma `/sign-in/email` de siempre **no añade superficie de Better
Auth**: el hash, la sesión, la cookie y el límite por IP siguen siendo los que ya están auditados.

## Decisión

**Opción C. El apodo es un dato de la pertenencia (`usuarios.apodo`), lo fija el dueño, el disparador
existente lo refleja en `accesos_identidad`, y el ingreso lo traduce al correo en el servidor y
reutiliza el flujo de correo y contraseña de Better Auth.** Es la única opción que no amplía la
superficie de `viajapro_identidad`, no deja a una agencia escribir un dato global y no obliga a mover
la columna en la fase 2.

### 1. Esquema (fase 1)

| Objeto | Cambio |
|---|---|
| `usuarios.apodo` | `text NULL` con `CHECK (apodo ~ '^[a-z][a-z0-9]*([._-][a-z0-9]+)*$' AND length(apodo) BETWEEN 3 AND 30)`. **`UNIQUE (tenant_id, apodo)`**: es ya la restricción de la fase 2 |
| `accesos_identidad.apodo` | `text NULL`, mismo `CHECK`. **`UNIQUE (apodo)` global en la fase 1** |
| `sincronizar_acceso_identidad()` | Copia `NEW.apodo` al insertar y al actualizar, y borra el par (con su apodo) al desactivar o eliminar, como ya hace. `viajapro_accesos` recibe solo lo que necesite sobre la columna nueva de `accesos_identidad` |

El `CHECK` admite solo minúsculas ASCII. Así la unicidad sin distinguir mayúsculas sale **por
construcción**: no hace falta `citext` y no hay dos apodos que solo difieran en la caja. Un apodo
repetido en otra agencia hace fallar el disparador con `23505`, y la API lo traduce a `409
APODO_NO_DISPONIBLE`.

### 2. Formato y asignación

- **Normalización (en `packages/contracts`, compartida por API y web):** recortar, NFKC, minúsculas.
  Después, el mismo patrón del `CHECK`: de 3 a 30 caracteres, empieza por letra, y `.`, `_` o `-`
  solo entre caracteres alfanuméricos. Lo que no sea ASCII tras NFKC (`ñ`, tildes, cirílico) **se
  rechaza, no se translitera**. Así se cierran los homógrafos.
- **Reservados** (lista en código, en contratos): `admin`, `administrador`, `root`, `soporte`,
  `ayuda`, `viajapro`, `plataforma`, `sistema`, `api`, `www`, `demo`, `ingresar`, `ingreso`,
  `registro`, `null`, `undefined`, `dueno`, `asesor`, `operaciones`. También los prefijos `viajapro`
  y `soporte`. La lista no se replica en la base: un reservado mal colado no abre nada.
- **Quién lo fija:** el dueño (permiso `usuarios.administrar`), al invitar o al editar un miembro,
  con `PATCH /api/v1/miembros/:id/apodo` (o `null` para quitarlo). Corre con `viajapro_app`: un
  miembro de otra agencia da 404 por RLS. **No hay autoasignación** ni registro libre de apodos. Quien
  crea una agencia por autoservicio (ADR-0030) se lo fija a sí mismo como dueño desde la misma
  pantalla. Cambiar o quitar un apodo deja un `registros_auditoria` con el `usuario_id` y sin el apodo
  en `detalle`.
- **Es opcional.** Sin apodo se entra por correo, como hoy.
- **Lenguaje ubicuo:** «Apodo de ingreso». La columna es `apodo`, igual que el resto del módulo
  `identity`, que ya nombra en español. `documentador` añade la entrada al glosario.

### 3. Cómo se resuelve el identificador

1. El contrato `IniciarSesion` pasa de `correo` a `identificador` (`string`, 1..255). Durante una
   versión, la API acepta también la clave `correo`, porque web (Vercel) y API (Render) se despliegan
   por separado (T-311).
2. **Si trae `@`, es correo.** Si no, se normaliza como apodo. Si no cumple el formato, **no se
   responde 400**: se sigue como un apodo inexistente, para no distinguir «mal formado» de
   «incorrecto», igual que ya se hace con la contraseña.
3. **Apodo → correo, en el servidor, con el pool de identidad:** `accesos_identidad WHERE apodo = $1`
   → `identidades.correo` (con `eliminado_en IS NULL`). Si no hay fila, se usa un **correo centinela
   que nunca existe** (dominio `.invalid`).
4. **Siempre** se llama a `/sign-in/email` de Better Auth, también con el centinela. Así el camino,
   el límite por IP y el trabajo de hash son los mismos exista o no el apodo. El correo resuelto
   **nunca** vuelve al cliente: la respuesta es la `SesionActual` de siempre, o
   `CREDENCIALES_INVALIDAS`.
5. Después, todo igual: hook de sesión, paso 2 (agencia única), paso 4 bajo RLS.

### 4. Seguridad

- **Sin enumeración:** mismo estado, mismo cuerpo y el mismo camino de código para apodo
  inexistente, mal formado, de un usuario desactivado o con la clave errónea. **Supuesto a
  verificar:** que Better Auth, en la versión fijada, hashea una contraseña ficticia cuando el correo
  no existe. Si no lo hace, el controlador lo iguala (scrypt sobre un hash fijo) antes de integrar.
  El e2e lo mide de forma gruesa (medianas, sin umbral fino).
- **Tope de fallos por identificador**, nuevo y para los dos caminos. Se cuenta con
  `ContadorDeFallos` en Postgres, como el tope del código, con prefijo propio
  (`viajapro:ingreso-fallos:`) y la clave en HMAC. La clave es **la identidad resuelta**, así que
  correo y apodo comparten contador y probar los dos no duplica los intentos. Si no hay identidad, la
  clave es el identificador normalizado. Propuesta: 10 fallos en 15 minutos. Agotado, se responde
  `CREDENCIALES_INVALIDAS` sin llamar a Better Auth, también con la clave correcta. Un apodo es más
  corto y más adivinable que un correo, y hoy la contraseña no tiene tope por cuenta, así que esto
  **entra con el PR de backend, no va a la cola.** El bloqueo deliberado de un apodo ajeno es el
  precio conocido. El titular conserva el código por correo, que lleva su propio contador.
- **El apodo no se imprime**: ni en logs, ni en el `detalle` de auditoría, ni en el payload de eventos.
  Se deriva del nombre de la persona, así que es dato personal. Los contadores van por HMAC. El
  centinela tampoco se loguea como si fuera un intento real.
- **Código de un solo uso:** **sigue siendo solo por correo** (`otp/enviar` y `otp/iniciar-sesion`
  no cambian). Aceptar un apodo ahí permitiría disparar correos a alguien conociendo solo un
  identificador corto. Queda en la cola (T-308), sin bloquear.
- **Excepción de la demo:** el apodo no la amplía. La semilla da apodos sintéticos a sus identidades
  (por ejemplo, `dueno.demo`; `dueno` y `demo` solos están reservados). Cuando se retire la
  contraseña de staging, el apodo seguirá existiendo, pero sin credencial no abre nada, y el fallo
  es el genérico.
- **Aislamiento:** el apodo no aporta tenant. La sesión sigue fijando la agencia por
  `accesos_identidad` y el paso 4 la revalida bajo RLS. Fuga conocida de la fase 1: el `409` revela a
  un dueño que el apodo existe en **alguna** agencia, sin decir cuál. Con una sola agencia no hay a
  quién filtrar, y desaparece en la fase 2.

### 5. Fase 2, sectorización por agencia (descrita, no se construye)

1. **Índice:** se quita `UNIQUE (apodo)` de `accesos_identidad` y se pone
   `UNIQUE (tenant_acceso_id, apodo)`. `usuarios` ya tiene la suya. **No se mueve ningún dato**: es
   una migración de índices.
2. **Contrato:** `IniciarSesion` gana `agencia` (slug). La API traduce el slug a un tenant con
   `viajapro_app` (`tenants` ya es legible para ese rol, sin RLS), por un puerto y como operación
   declarada sin tenant. Después busca `(tenant, apodo)` en `accesos_identidad` con el pool de
   identidad. Un slug inexistente da el mismo error genérico. **No hay privilegios nuevos para
   `viajapro_identidad`.**
3. **Reglas:** el apodo **solo** se acepta con agencia en el enlace. En `/ingresar` sin agencia,
   solo correo. La sesión puede fijar ya ese tenant como activo, pero el paso 4 lo sigue decidiendo.
4. **Web:** primero la ruta `/<agencia>/ingreso` y, con dominio propio, el subdominio. El subdominio
   lo resuelve el middleware de Next, y la cookie se queda en su anfitrión (sin `Domain=.viajapro.com`).
   Así una sesión no viaja entre agencias.
5. **Costo estimado:** una migración de índices, un campo de contrato, un puerto y una ruta web.
   No hay que migrar datos ni cambiar roles.

## Consecuencias

### Positivas
- Ingreso corto sin roles, funciones ni privilegios de login nuevos. La superficie de
  `viajapro_identidad` no cambia.
- El dato queda donde lo quiere la fase 2. Sectorizar cuesta un índice, no una reestructuración.
- Ninguna agencia puede alterar un dato global de una persona.
- La contraseña gana un tope por cuenta que hoy no tiene, con correo o con apodo.

### Negativas
- Cambia el cuerpo de `sincronizar_acceso_identidad()`: auditoría obligatoria, sin regla de una
  sola vuelta.
- `accesos_identidad` asume un segundo uso (resolver el apodo). Su contrato de «índice, no
  autoridad» hay que repetirlo en las pruebas, no solo en un comentario.
- Un segundo identificador es un segundo blanco: más corto y más adivinable. Lo compensan el tope por
  identificador y la contraseña de 12 o más caracteres. **No hay MFA** (ADR-0011).
- En la fase 1, el 409 revela que el apodo existe en otra agencia.
- El bloqueo deliberado: cualquiera que conozca un apodo puede agotar su tope de contraseña.

### Qué habría que cambiar para revertir esto
Borrar las dos columnas, devolver el disparador a su cuerpo anterior y volver el contrato a `correo`.
Ningún dato de negocio depende del apodo.

## Plan por PR (carriles separados, R11/R13)

| # | PR | Dueño | Exige para integrar |
|---|---|---|---|
| 1 | **Datos** (ruta protegida): columnas, `CHECK`, índices, cuerpo del disparador, privilegio de columna de `viajapro_accesos` y apodos en la semilla | `datos` + `auditor-seguridad` | Suite de aislamiento en verde con aserciones nuevas. **(a)** el disparador escribe `(identidad, tenant, apodo)` solo de la fila que pasó RLS; **(b)** `viajapro_app` y `viajapro_identidad` siguen sin poder escribir `accesos_identidad`; **(c)** desactivar o eliminar al usuario retira su apodo del índice; **(d)** el mismo apodo en dos agencias da `23505`; **(e)** el `CHECK` rechaza mayúsculas, `@` y lo que no es ASCII; **(f)** la matriz de funciones no cambia para ningún rol de login |
| 2 | **Backend**: normalización y reservados en contratos, `identificador`, la resolución con centinela, el tope por identificador, `PATCH /miembros/:id/apodo` con `usuarios.administrar` y auditoría | `backend` | e2e: se entra con el apodo; apodo inexistente, mal formado o desactivado y clave errónea dan la misma respuesta; el tope se comparte entre correo y apodo; el dueño de A recibe 404 al fijar el apodo de un miembro de B; un apodo de A no da sesión en B (paso 4); el apodo no aparece en el log capturado; el OTP rechaza el apodo |
| 3 | **Frontend**: «Correo o usuario» en `/ingresar` y el campo de apodo al invitar o editar un miembro | `frontend` | Probado en un navegador real, también en el móvil. Ningún mensaje distingue «usuario no existe». El 409 se muestra solo en la edición de miembros |

## Cola (no bloquea; va a `roadmap/tasks.yaml` con dueño)

| Id | Pendiente | Dueño |
|---|---|---|
| T-308 | Código de un solo uso pedido por apodo (decidir si vale el riesgo de disparar correos) | `backend`, `auditor-seguridad` |
| T-309 | Fase 2: `/<agencia>/ingreso`, índice por agencia y campo `agencia` en el contrato (§5) | `arquitecto` → `datos`, `backend`, `frontend` |
| T-310 | Fase 2b: subdominio `<agencia>.viajapro.com` cuando haya dominio propio; cookie solo de su anfitrión | `devops`, `frontend` |
| T-311 | Retirar la clave `correo` de `IniciarSesion` una versión después del PR 2 | `backend` |
| — | El límite por IP de Better Auth, a Redis: ya es **T-301**, no se duplica | `backend` |

## Cuándo revisar esta decisión

- Al arrancar la segunda agencia real: se ejecuta T-309 **antes** de darle de alta, no después.
- Si se exige MFA o SSO, porque el modelo de identificadores se revisa junto con el de credenciales.
- Si la auditoría del disparador concluye que `accesos_identidad` no debe asumir un segundo uso.
  Entonces la alternativa es una tabla global hermana con el mismo disparador, no la opción B.
