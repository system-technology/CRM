# ADR-0031 — Ingreso por apodo, además del correo

- **Estado:** Aceptado (2026-11-20, tras dos vueltas de `auditor-seguridad` y la aprobación del propietario del PR #351)
- **Fecha:** 2026-11-20
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta) y `auditor-seguridad` (primera vuelta hecha: aceptable con
  cambios, ver «Auditoría de seguridad»). **Pendientes antes de aceptar:** segunda vuelta de
  `auditor-seguridad` sobre los cambios (obligatoria: cambia el cuerpo de una función
  `SECURITY DEFINER` y la ruta de inicio de sesión; aquí no aplica la regla de una sola vuelta, R13)
  y `datos` (migración).
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
  con `{ email, password }` y mapea el fallo de credenciales a `CREDENCIALES_INVALIDAS` (un `429` sale como `DEMASIADOS_INTENTOS` y un `403` como `ORIGEN_NO_CONFIABLE`; ver §4).
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
| `sincronizar_acceso_identidad()` | Pasa a `AFTER INSERT OR DELETE OR UPDATE OF identidad_id, tenant_id, activo, eliminado_en, **apodo**` (hoy `apodo` no está en la lista y un cambio de apodo no dispararía nada; **el `DELETE` se conserva**: sin él, borrar un `usuarios` dejaría el par y el apodo en el índice). Al insertar copia `NEW.apodo`. **Si en un `UPDATE` cambia el apodo, borra el par y lo inserta de nuevo** con el apodo nuevo, así no hace falta `UPDATE` y se conserva «un par se pone o se quita». Al desactivar o eliminar borra el par, como ya hace. El `INSERT` lleva **`ON CONFLICT (identidad_id, tenant_acceso_id) DO NOTHING` con sus columnas**: el `ON CONFLICT` sin columnas de hoy también absorbería la violación de `UNIQUE (apodo)` y la colisión no daría `23505`. Se conserva `SECURITY DEFINER`, `search_path = ''`, `REVOKE ... FROM PUBLIC`, el dueño `viajapro_accesos` y las marcas `[par-old]` del arnés M17 |
| `viajapro_accesos` | **Sin privilegios nuevos de tabla.** Conserva `SELECT, INSERT, DELETE` sobre `accesos_identidad` («ni UPDATE»); la columna nueva queda cubierta por ellos. El `CREATE OR REPLACE` corre con `SET ROLE viajapro_accesos`, conserva dueño y `REVOKE`, y comprueba `PROPIETARIO_ESPERADO` |

El `CHECK` admite solo minúsculas ASCII. Así la unicidad sin distinguir mayúsculas sale **por
construcción**: no hace falta `citext` y no hay dos apodos que solo difieran en la caja. Con el
`ON CONFLICT` acotado, un apodo repetido en otra agencia hace fallar el disparador con `23505` y
**revierte el cambio en `usuarios`** (no queda una pertenencia sin su fila en el índice). La API lo
traduce **por el nombre de la restricción** a `409 APODO_NO_DISPONIBLE`, para que el mensaje de
Postgres (`Key (apodo)=(...)`) no llegue al log.

### 2. Formato y asignación

- **Normalización (en `packages/contracts`, compartida por API y web):** recortar, NFKC, minúsculas.
  Después, el mismo patrón del `CHECK`: de 3 a 30 caracteres, empieza por letra, y `.`, `_` o `-`
  solo entre caracteres alfanuméricos. Lo que no sea ASCII tras NFKC (`ñ`, tildes, cirílico) **se
  rechaza, no se translitera**. Así se cierran los homógrafos.
- **Reservados** (lista en código, en contratos): `admin`, `administrador`, `root`, `soporte`,
  `ayuda`, `viajapro`, `plataforma`, `sistema`, `api`, `www`, `demo`, `ingresar`, `ingreso`,
  `registro`, `null`, `undefined`, `dueno`, `asesor`, `operaciones`. También los prefijos `viajapro`
  y `soporte`. La lista no se replica en la base: un reservado mal colado no abre nada.
- **Quién lo fija:** quien tenga el permiso `usuarios.administrar` (los roles son una tabla por
  agencia: un rol personalizado también puede llevarlo), **al editar un miembro existente**, con
  `PATCH /api/v1/miembros/:id/apodo` (o `null` para quitarlo). **Con la misma guarda que la baja de
  miembros** (`permisoQueFalta`, `miembros.prisma.ts`): nadie edita el apodo de quien tiene más
  permisos que él. Un dueño sí puede cambiar el apodo de otro dueño, igual que puede darlo de baja.
  Sin esa guarda, un rol personalizado con `usuarios.administrar` podría quitarle el apodo a la dueña
  y ponérselo a sí mismo. Corre con `viajapro_app`: un miembro de otra agencia da 404 por RLS.
  **No hay autoasignación** ni registro libre de apodos. En la fase 1 el apodo **no se fija al
  invitar**: la fila de `usuarios` no existe hasta aceptar la invitación (dos transacciones en dos
  pools), y una colisión en la aceptación fallaría después de crear la identidad. Quien
  crea una agencia por autoservicio (ADR-0030) se lo fija a sí mismo como dueño (**la única excepción** a «no hay autoasignación») desde la misma
  pantalla. Cambiar o quitar un apodo deja un `registros_auditoria` con el `usuario_id` y sin el apodo
  en `detalle`.
- **Es opcional.** Sin apodo se entra por correo, como hoy.
- **Lenguaje ubicuo:** «Apodo de ingreso». La columna es `apodo`, igual que el resto del módulo
  `identity`, que ya nombra en español. `documentador` añade la entrada al glosario.

### 3. Cómo se resuelve el identificador

1. El contrato `IniciarSesion` pasa de `correo` a `identificador` (`string`, 1..255). Durante una
   versión, la API acepta también la clave `correo`, porque web (Vercel) y API (Render) se despliegan
   por separado (T-363).
2. **Si trae `@`, es correo.** Si no, se normaliza como apodo. Si no cumple el formato, **no se
   responde 400**: se sigue como un apodo inexistente, para no distinguir «mal formado» de
   «incorrecto», igual que ya se hace con la contraseña.
3. **Apodo → correo, en el servidor, con el pool de identidad:** una sola consulta,
   `accesos_identidad` unida a `identidades` con `eliminado_en IS NULL` (no dos condicionales, para no
   crear una diferencia de tiempo). Si no hay fila, se usa un **correo centinela que nunca existe**,
   con **formato de correo válido** (`x@viajapro.invalid`): un formato que Better Auth rechazara
   devolvería un 400 rápido sin pasar por el hash, y eso se distinguiría.
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
  clave es el identificador normalizado. Propuesta: 10 fallos en 15 minutos. **Agotado el tope, el
  ingreso recorre exactamente el mismo camino que cualquier otro**: llama a `/sign-in/email` con el
  **correo centinela** (mismo hash, mismo cupo por IP) y **descarta el resultado**, respondiendo
  `CREDENCIALES_INVALIDAS` también con la clave correcta. **Todo intento fallido, también el
  bloqueado, hace exactamente las mismas escrituras en el contador** (mismo `INSERT`, mismo barrido,
  mismo recuento): si el camino bloqueado se ahorrara esas escrituras, una diferencia sistemática de
  milisegundos, con suficientes muestras, volvería a revelar «esta identidad está bloqueada». La
  ventana pasa a ser deslizante mientras dure el ataque, coherente con el precio que ya se acepta
  (C1). El estado del contador no se ve desde fuera. **El centinela tiene que ser realmente
  inexistente:** nada impide hoy una identidad con correo `...@viajapro.invalid` (la columna solo
  exige que no esté vacía); si existiera con una contraseña conocida, todo apodo inexistente más esa
  contraseña abriría sesión, y el resultado sería un oráculo perfecto. Por eso el PR 1 lleva un
  `CHECK` en `identidades.correo` que rechaza el dominio `.invalid`, el contrato rechaza `.invalid`
  en invitaciones y registro, y una aserción de aislamiento lo prueba. Si Better Auth responde `429` por la IP, se
  devuelve ese mismo `429`. **No hay atajo que se salte el hash ni el cupo por IP**: un atajo
  distinguiría, por estado, cuerpo o tiempo, el correo de una identidad bloqueada (el atacante
  agotaría su cupo por IP con correos ajenos y vería que el de la identidad bloqueada responde otra
  cosa y sin consumir cupo). Un apodo es más corto y más adivinable que un correo, y hoy la
  contraseña no tiene tope por cuenta, así que esto **entra con el PR de backend, no va a la cola.**
  El bloqueo deliberado de un apodo ajeno es el precio conocido (ver C1 en la cola). El titular
  conserva el código por correo, que lleva su propio contador.
- **Códigos que sí distinguen, y por qué no filtran:** `DEMASIADOS_INTENTOS` (429, por IP) y
  `ORIGEN_NO_CONFIABLE` (403) salen con otro código que `CREDENCIALES_INVALIDAS`, pero dependen de la
  IP y del origen, **nunca de si el identificador existe**.
- **El apodo no se imprime**: ni en logs, ni en el `detalle` de auditoría, ni en el payload de eventos.
  Se deriva del nombre de la persona, así que es dato personal. Los contadores van por HMAC. El
  centinela tampoco se loguea como si fuera un intento real.
- **Código de un solo uso:** **sigue siendo solo por correo** (`otp/enviar` y `otp/iniciar-sesion`
  no cambian). Aceptar un apodo ahí permitiría disparar correos a alguien conociendo solo un
  identificador corto. Queda en la cola (T-360), sin bloquear.
- **Excepción de la demo:** el apodo no la amplía. La semilla da apodos sintéticos a sus identidades
  (por ejemplo, `dueno.demo`; `dueno` y `demo` solos están reservados). Cuando se retire la
  contraseña de staging, el apodo seguirá existiendo, pero sin credencial no abre nada, y el fallo
  es el genérico.
- **Aislamiento:** el apodo no aporta tenant. La sesión sigue fijando la agencia por
  `accesos_identidad` y el paso 4 la revalida bajo RLS. Fuga conocida de la fase 1: el `409` revela a
  un dueño que el apodo existe en **alguna** agencia, sin decir cuál. Con una sola agencia no hay a
  quién filtrar, y desaparece en la fase 2.
- **Precondición dura (auditoría de seguridad, B3): la fase 1 solo es válida con UNA agencia.** Con la
  unicidad global, quien cree una agencia por autoservicio (ADR-0030) queda como dueño y podría
  **(a)** enumerar los apodos de todo el sistema con `PATCH /miembros/:id/apodo` (el `409` significa
  «existe en alguna agencia», sin límite de intentos) y **(b)** acaparar apodos predecibles
  (`nombre.apellido`) de personal de otras agencias. Por eso **T-361 (fase 2) debe estar terminada
  antes de encender `REGISTRO_AUTOSERVICIO_HABILITADO` y antes de dar de alta cualquier segunda
  agencia, también por script.** ADR-0030 está Aceptado y no se edita: esta condición se registra aquí
  y en la cola (T-364 lo anota en la tabla de precondiciones de ADR-0030 al tocarlo). **No basta con
  un freno solo en el autoservicio:** la segunda agencia también puede nacer **por script**
  (`semilla-agencia-desde-json.ts`, la semilla de la piloto). Por eso la precondición se hace cumplir
  **por construcción, en cualquier camino de alta**, con una comprobación que falla cerrado:
  - **Cómo se detecta que el índice es global:** por el **catálogo** (`pg_index`, `pg_class`,
    `pg_attribute`, legibles por cualquier rol, sin privilegios de tabla). Es global si existe un
    índice único válido sobre `public.accesos_identidad` cuyas columnas clave incluyen `apodo` y **no**
    incluyen `tenant_acceso_id`. Se compara por `indkey`, no por el nombre del índice. Si hay un
    índice de expresión o parcial sobre `apodo`, o la consulta falla, **se trata como global**.
  - **Dónde se aplica:** **(a)** al arrancar la API con `REGISTRO_AUTOSERVICIO_HABILITADO` activo, que
    se niega a arrancar; **(b)** en `PATCH /miembros/:id/apodo` y en la resolución del apodo al
    ingresar: si el índice es global y `tenants` (global, en `excepciones_rls`, no es una tabla de
    negocio con RLS) tiene **más de una fila**, la función queda apagada: el `PATCH` responde con un
    error genérico, no con el `409`, y el apodo se trata como inexistente; **(c)** en
    `guardia-de-semilla-agencia.ts` y en `crear_agencia` cuando exista: rechazar una segunda agencia
    mientras el índice sea global.
  Con (b) la precondición se cumple en cualquier camino de alta, y T-364 queda como lo que es:
  documentación.

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
| 1 | **Datos** (ruta protegida): columnas, `CHECK`, índices, cuerpo del disparador, **un `CHECK` en `identidades.correo` que rechaza el dominio `.invalid`** (el centinela del ingreso no puede existir como identidad) y apodos en la semilla. Sin privilegios nuevos de tabla ni de columna para `viajapro_accesos` | `datos` + `auditor-seguridad` | Suite de aislamiento en verde con aserciones nuevas. **(a)** el disparador escribe `(identidad, tenant, apodo)` solo de la fila que pasó RLS; **(b)** `viajapro_app` y `viajapro_identidad` siguen sin poder escribir `accesos_identidad`; **(c)** desactivar o eliminar al usuario retira su apodo del índice; **(d)** el mismo apodo en dos agencias da `23505`; **(e)** el `CHECK` rechaza mayúsculas, `@` y lo que no es ASCII; **(f)** la matriz de funciones no cambia para ningún rol de login; **(g)** cambiar el apodo actualiza el índice y el apodo viejo deja de resolver; **(h)** poner `null` lo retira; **(i)** la colisión entre agencias revierte el cambio en `usuarios` y no deja una pertenencia sin su fila en el índice; **(j)** `viajapro_identidad` no tiene `has_column_privilege` sobre `usuarios.apodo`, y `viajapro_accesos` sigue sin `UPDATE`, comprobado con `has_any_column_privilege('viajapro_accesos','public.accesos_identidad','UPDATE') = false` (la prueba 63 usa `has_table_privilege`, que no detecta un `GRANT` de columna); **(k)** el `CHECK` de `identidades.correo` rechaza `...@viajapro.invalid` y cualquier subdominio de `.invalid`; **(l)** `DELETE FROM usuarios` retira el par y su apodo del índice. **Condiciones del cuerpo del disparador:** la rama del apodo va **fuera** de las marcas `[par-old]` (la expresión del arnés M17 es codiciosa y borraría todo lo que haya entre la primera y la última marca), se condiciona con `OLD.apodo IS DISTINCT FROM NEW.apodo`, borra por el par de `NEW` y **todos los `DELETE` van antes del `INSERT`**. Se añade una mutación nueva al arnés («sin la rama del apodo») que la aserción (g) debe detectar, y M17 debe seguir detectándose con la prueba 64 |
| 2 | **Backend**: normalización y reservados en contratos, `identificador`, la resolución con centinela, el tope por identificador, `PATCH /miembros/:id/apodo` con `usuarios.administrar` y auditoría | `backend` | e2e: se entra con el apodo; apodo inexistente, mal formado o desactivado y clave errónea dan la misma respuesta; el tope se comparte entre correo y apodo; el dueño de A recibe 404 al fijar el apodo de un miembro de B; un apodo de A no da sesión en B (paso 4); el apodo no aparece en el log capturado, **tampoco en la ruta del `409`**; el OTP rechaza el apodo; **con la identidad bloqueada y la IP agotada, la respuesta es idéntica a la de un identificador no bloqueado (B2)**; un rol personalizado con `usuarios.administrar` no puede editar el apodo de quien tiene más permisos (B4); el hook de sesión no usa el apodo para fijar la agencia; la API no arranca con el autoservicio activo y el índice global (B3). **Orden obligatorio PR 1 → PR 2 → PR 3**: si la web sale antes que la API, la API responde 400 a `identificador` |
| 3 | **Frontend**: «Correo o usuario» en `/ingresar` y el campo de apodo al editar un miembro existente (no al invitar: ver §2) | `frontend` | Probado en un navegador real, también en el móvil. Ningún mensaje distingue «usuario no existe». El 409 se muestra solo en la edición de miembros |

## Cola (no bloquea; va a `roadmap/tasks.yaml` con dueño)

> Numeración: estos ids se asignaron primero como T-308 a T-319, que **otras tareas ya usaban**
> (registro autoservicio, layout). Se renumeraron a T-360 a T-371 y están en `roadmap/tasks.yaml`.

| Id | Pendiente | Dueño |
|---|---|---|
| T-360 | Código de un solo uso pedido por apodo (decidir si vale el riesgo de disparar correos) | `backend`, `auditor-seguridad` |
| T-361 | Fase 2: `/<agencia>/ingreso`, índice por agencia y campo `agencia` en el contrato (§5) | `arquitecto` → `datos`, `backend`, `frontend` |
| T-362 | Fase 2b: subdominio `<agencia>.viajapro.com` cuando haya dominio propio; cookie solo de su anfitrión | `devops`, `frontend` |
| T-363 | Retirar la clave `correo` de `IniciarSesion` una versión después del PR 2 | `backend` |
| T-364 | Anotar en la tabla de precondiciones de ADR-0030 que T-361 va **antes** de encender el autoservicio (ADR-0030 está Aceptado: va como nota de seguimiento, no como edición) | `documentador` |
| T-365 | Bloqueo por denegación (C1): clave del tope por `(identidad, IP o su /24)`, 10 en 15 min, más un techo por identidad más alto (p. ej. 50 en 24 h) con alerta. La demo, cuyo correo no recibe nada, no tiene recuperación por código | `backend`, `auditor-seguridad` |
| T-366 | Normalización y reservados (C4): unicidad sobre el apodo sin separadores (`isabel.alvear`, `isabel_alvear` e `isabel-alvear` son hoy tres apodos); ampliar reservados (`support`, `help`, `security`, `seguridad`, `staff`, `equipo`, `contacto`, `facturacion`, prefijo `admin`) | `backend` |
| T-367 | Apodo en invitaciones (C5): fijarlo al aceptar sin bloquear la aceptación | `backend` |
| T-368 | `GRANT SELECT` por columnas de `accesos_identidad` para `viajapro_identidad` (C6); contrato de transición: rechazar por forma si llegan `correo` e `identificador` a la vez (C7) | `datos`, `backend` |
| T-369 | Semilla: apodos sintéticos solo en la local, no en staging (C8) | `datos` |
| T-370 | `ContadorDeFallosPostgres` barre solo `LIKE 'viajapro:otp-fallos:%'`: pasar el prefijo como parámetro en el PR 2, o las filas `viajapro:ingreso-fallos:` no se purgan y `verificaciones` crece sin límite | `backend` |
| T-371 | La baja de un miembro debe limpiar `usuarios.apodo` (si no, al reactivarlo vuelve sin que nadie lo decida y el apodo queda ocupado para siempre; también minimización, Ley 1581) | `backend` |
| — | El límite por IP de Better Auth, a Redis: ya es **T-301**, no se duplica | `backend` |

## Auditoría de seguridad (primera vuelta, 2026-11-20)

Veredicto: **aceptable con cambios**. Se corrigieron en este texto cuatro bloqueantes: **B1** el
disparador no incluía `apodo` en `UPDATE OF` y su `ON CONFLICT` sin columnas absorbía el `23505`
(§1); **B2** el atajo del tope por identidad permitía saber si un apodo existe y a qué correo
corresponde (§4); **B3** la unicidad global choca con el autoservicio de ADR-0030, que ya está
Aceptado (§4, precondición dura); **B4** `usuarios.administrar` no basta para fijar el apodo de otro
(§2). Cola: C1 a C9 repartidos en T-365 a T-371 y en el PR 2. Verificado contra la etiqueta v1.7.22
de Better Auth en GitHub (no contra el paquete instalado): con correo inexistente hace un hash
ficticio. **Segunda vuelta (2026-11-20): aceptable con cambios menores**, ya incorporados: N1 el disparador
conserva `DELETE`; N2 el plan del PR 1 no pide privilegios nuevos; N3 la precondición de B3 se hace
cumplir por construcción en cualquier camino de alta (detección por catálogo, §4); N4 todo intento
fallido hace las mismas escrituras en el contador y el centinela no puede existir como identidad
(`CHECK` en `identidades.correo`). Las condiciones del cuerpo del disparador y las aserciones de
aislamiento nuevas van en el PR 1, que lleva su propia auditoría antes de integrar.

## Cuándo revisar esta decisión

- Al arrancar la segunda agencia real: se ejecuta T-361 **antes** de darle de alta, no después (y
  antes de encender el autoservicio: ver la precondición dura en §4).
- Si se exige MFA o SSO, porque el modelo de identificadores se revisa junto con el de credenciales.
- Si la auditoría del disparador concluye que `accesos_identidad` no debe asumir un segundo uso.
  Entonces la alternativa es una tabla global hermana con el mismo disparador, no la opción B.
