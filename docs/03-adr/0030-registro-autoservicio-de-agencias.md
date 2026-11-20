# ADR-0030 — Registro autoservicio de agencias: cuenta verificada, alta atómica por `crear_agencia` y prueba gratis

- **Estado:** Propuesto
- **Fecha:** 2026-11-20
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta). **Pendientes antes de aceptar:** `auditor-seguridad`
  (obligatorio: toca la creación de tenants y una función `SECURITY DEFINER`; aquí no aplica la
  regla de una sola vuelta, R13), `experto-turismo` (datos que se piden en el alta), `datos`
  (migración), `dueno-de-producto` (orden de las fases).
- **Amplía:** [ADR-0008](0008-resolucion-de-tenant-en-webhooks-entrantes.md) §1.3 y su inventario de
  funciones `SECURITY DEFINER`, como hicieron [ADR-0026](0026-rol-viajapro-metricas-y-medir-cola-de-salida.md)
  y [ADR-0027](0027-rol-viajapro-ajustes-y-zona-horaria-de-la-agencia.md).
- **Supersede parcialmente:** [ADR-0011](0011-autenticacion-y-tenant-de-sesion.md), **solo** en una
  frase de «Requisitos de la configuración de Better Auth»: «Una identidad nace solo por invitación o
  por un script de plataforma». Con este ADR hay una tercera vía, el registro con correo verificado.
  **El resto de ADR-0011 sigue vigente**, incluido `disableSignUp: true` en Better Auth (ver §2).

> **Revisión de seguridad, primera vuelta (2026-11-20): NO ACEPTABLE todavía.** Tres bloqueantes
> que el ADR debe resolver antes de aceptarse, y antes de empezar T-262, T-264, T-265 y T-270:
>
> 1. **Código de registro por fuerza bruta (§1.1-1.2).** Una sola fila viva por correo, intento
>    consumido de forma atómica (`UPDATE … WHERE intentos>0 RETURNING` o `FOR UPDATE`), mismos
>    parámetros que el OTP de ingreso, tope de fallos por correo en 24 h, aviso al atar una invitación
>    a una identidad ya existente, y e2e con intentos concurrentes. Sin esto, crear la identidad del
>    correo de una asesora antes de que la inviten da acceso a su agencia.
> 2. **Código de acceso del piloto (P2) sin diseño.** Tabla global con hash de un secreto de 128 bits,
>    caducidad, uso único, sin tenant ni rol (solo autoriza crear una agencia nueva); consumido dentro
>    de `crear_agencia` (un `ROLLBACK` lo devuelve); nunca logueado; exigido también en `solicitar`.
> 3. **Conexión manual de WhatsApp (§5.1, P6, T-270).** Sobre el `tenantId` de una solicitud creada
>    dentro de la agencia (nunca por nombre o slug, que elige el registrante), con confirmación del
>    DUENO y token entregado por un formulario del tenant que lo cifra (R6). Verificar con
>    `investigador` si Meta permite operar WABAs de terceros sin ser Tech Provider.
>
> Los hallazgos de cola (tope global y DoS, `completar` sobre identidad existente, cola sin agencia,
> NIT/RNT ajenos, orden de `set_config` para S1, vía de la transacción, slugs reservados, contador
> del limitador, aceptaciones) se incorporan en la segunda vuelta. La auditoría completa vuelve a
> correr tras corregirlos: en aislamiento no aplica R13.

---

## Contexto

**Fuerza: velocidad de adopción y coste de adquisición.** El propietario lo dijo así: «la idea de
este CRM es que se pueda implementar en cualquier agencia, incluso que sea autoimplementable». El
roadmap v3 (Fase 4) fija como criterio de salida que una agencia nueva pase «de registrarse a recibir
su primer WhatsApp en ViajaPro en un día sin intervención nuestra». La auditoría competitiva del
2026-11-16 pone «pequeño y listo para usar en un día» entre las brechas de mercado que podemos
ocupar. Hoy dar de alta una agencia exige que alguien del equipo ejecute scripts contra la base.

**Fuerza que limita: aislamiento entre agencias.** Crear un tenant es la operación más delicada del
sistema. Si el alta reutiliza una agencia existente, o deja que el cliente elija la fila, el
registro se convierte en la forma de entrar como dueño en la agencia de otro.

**No hay urgencia de calendario.** No hay servicio desplegado ni agencia real (`ESTADO.md`). Este ADR
fija la forma para que no se improvise el día del despliegue. Si se acepta, las fases se ordenan
detrás del piloto y no delante.

### Verificado en el código (2026-11-20, rama `claude/repository-status-d4ug6p`)

| Hecho | Dónde |
|---|---|
| **No existe ningún endpoint que cree una agencia.** Se crean con `seed.ts` y `semilla-agencia-desde-json.ts`, que escriben la fila de `tenants` y la de `identidades` con `DATABASE_URL` (el propietario) | `packages/database/prisma/semilla-agencia-nucleo.ts:199-221` |
| Esos scripts hacen **`tenant.upsert({ where: { slug } })`** y `usuario.upsert(...)`. Es correcto para sembrar, pero **en un registro público sería una brecha**: registrar una agencia con el nombre de otra te haría dueño de la existente | `semilla-agencia-nucleo.ts:204` y `:237` |
| `tenants` es global, sin RLS, declarada en `excepciones_rls` con `{SELECT}` para `viajapro_app`, `viajapro_altas` y `viajapro_webhook`. **Ningún rol de aplicación puede insertar en ella** | migraciones `20261007120100` y `20261007140000` |
| **`viajapro_altas` no sirve para esto.** Su único privilegio adicional es `EXECUTE` sobre `registrar_enrutamiento` (el alta de un **canal** de WhatsApp), y sobre `tenants` solo puede leer («el alta de un canal necesita leer el tenant, nunca escribirlo») | ADR-0008 §1.3; migración `20261007120100:66` |
| `tenants.id` **no tiene valor por defecto en la base** (el `uuid(7)` lo genera Prisma en el cliente) y `actualizado_en` es `NOT NULL` sin valor por defecto | migración `20261007042145`, líneas 23-35 |
| `estado_tenant` = `EN_PRUEBA` (por defecto), `ACTIVO`, `SUSPENDIDO`, `CANCELADO`. Solo `EN_PRUEBA` y `ACTIVO` dejan entrar | `schema.prisma:108`; `identity/domain/estados-de-agencia.ts` |
| No hay columna de NIT, RNT ni razón social en ningún modelo | `schema.prisma` |
| Better Auth va con `emailAndPassword.disableSignUp: true` y `emailOTP({ disableSignUp: true })` | `identity/infrastructure/crear-auth.ts:153-175` |
| Las rutas sin tenant son una **lista exacta**: lo que no está ahí da 401 | `shared/tenant/tenant.middleware.ts:44-52` |
| Una invitación se guarda en `verificaciones` (`invitacion:<sha256(token)>`), se consume borrándola y crea la identidad ya verificada (`crearVerificada`). Después crea la membresía con `viajapro_app` y RLS, fijando el tenant de la invitación. **Son dos transacciones en dos pools**, no una | `invitaciones.prisma.ts`, `aceptar-invitacion.use-case.ts`, `identidades.prisma.ts`, `miembros.prisma.ts:94-150` |
| Hay un limitador de envíos de código, con puerto, adaptadores Redis y memoria, y claves HMAC (no guarda ni el correo ni la IP en claro) | `identity/application/limitador-de-envios.ts` |
| `siembra-de-tenant.ts` siembra roles (`DUENO`, `ASESOR`, `OPERACIONES`), formatos de viaje, etapas y motivos de pérdida, de forma idempotente y por clave. **La política de precio no está ahí**: la siembra `semilla-agencia-nucleo.ts`. El cotizador funciona sin ella, porque cae a `POLITICA_POR_DEFECTO` | `siembra-de-tenant.ts`; `quoting/application/cotizaciones.use-case.ts:389-401` |
| Ya hay precedente de un módulo que llama a otro **por un puerto, dentro de su propia transacción**: `identity` suelta las conversaciones de un miembro dado de baja con `PuertoConversacionesDeMiembro.soltarLasDe(tx, …)` | `miembros.prisma.ts:196` |
| Los módulos escriben `registros_auditoria` (con `tenant_id` y RLS) dentro de su transacción | `quoting/application/ajustes-de-catalogo.use-case.ts` |
| El asistente de bienvenida (T-105) guarda el progreso **en `localStorage`**, por tenant | `apps/web/src/lib/onboarding-logica.ts:393-456` |
| **No hay código de Embedded Signup.** El único registro de canal es un script que exige `APP_ENV=local`, opera solo sobre la agencia `agencia-demo` y usa el token de la plataforma solo para esa agencia (T-060) | `inbox/scripts/registrar-canal-de-prueba.ts` |
| Hay adaptador de correo con Postmark (ADR-0012), **sin probar contra Postmark real** | `notifications/infrastructure/correo.postmark.ts`; `ESTADO.md` §1 |

### Supuesto (no verificado; hay que comprobarlo antes de implementar)

- **S1.** Un `set_config('app.current_tenant', …, true)` ejecutado dentro del cuerpo de una función
  `SECURITY DEFINER` sigue vigente al volver de la función, hasta el final de la transacción. Solo se
  restauran los parámetros que la función declara con una cláusula `SET`. Es lo documentado en
  PostgreSQL, pero `datos` lo fija con una aserción (fase F1). Si resultara falso, el alta sigue
  funcionando: la API fijaría el contexto con el id que devuelve la función (variante de §3.4).
- **S2.** El modelo de cobro no está decidido (`docs/00-vision/04-modelo-de-negocio.md`: «Nada más está
  decidido»). Este ADR no supone ninguno.
- **S3.** Ningún script de hoy conecta el número real de una agencia. Antes de Embedded Signup, una
  conexión real necesita una vía de plataforma que hoy no existe (§5.1).

## Opciones consideradas

### Eje 1 — Con qué privilegio se crea la fila de `tenants`

#### A — `GRANT INSERT ON tenants` a `viajapro_app` (rechazada)
- **Gana:** es lo más corto, un `INSERT` desde Prisma.
- **Cuesta:** la API pasa a escribir la tabla que define el aislamiento. Un `upsert` por slug como
  el de los scripts, copiado al registro, haría dueño de una agencia ajena a quien se registre. La
  declaración `{SELECT}` de `excepciones_rls`, que hoy afirman tres migraciones, deja de ser verdad.
- **Cierra:** la garantía de que la API no puede crear ni tocar ninguna fila de `tenants`.

#### B — Reutilizar `viajapro_altas` como rol de login del registro (rechazada)
- **Gana:** no hace falta un rol de login nuevo.
- **Cuesta:** `viajapro_altas` existe para separar `registrar_enrutamiento` (reclamar un número para
  un tenant) del resto de la API (ADR-0008, crítico 2). Darle también la creación de agencias junta
  dos superficies peligrosas en un solo rol. Además hoy solo lee `tenants`.
- **Cierra:** la separación por la que ese rol existe.

#### C — Rol de login nuevo (`viajapro_registro` con login) y un quinto pool (rechazada)
- **Gana:** el registro queda aislado del resto de la API también a nivel de conexión.
- **Cuesta:** un quinto rol de login, otra `DATABASE_*_URL`, otro guardia de arranque y un cambio
  mayor en R2. **No protege nada que D no proteja**: la operación solo puede insertar una fila
  nueva, y el riesgo de que `viajapro_app` la ejecute por error es crear una agencia de más, no
  entrar en una ajena. ADR-0008 separó `viajapro_altas` porque su función podía apropiarse de algo
  ajeno (un número). Esta no puede.
- **Cierra:** nada, pero cuesta operación sin ganar aislamiento.

#### D — Dueño `NOLOGIN` `viajapro_registro` y función `SECURITY DEFINER` `crear_agencia`, ejecutada por `viajapro_app` (elegida)
Es el patrón de ADR-0026 y ADR-0027. La base genera el id, solo puede **insertar**, aplica los
límites contra el abuso y deja fijado el contexto de la agencia nueva.
- **Gana:** `viajapro_app` sigue sin poder escribir en `tenants`. Ningún error de la aplicación
  alcanza una agencia existente, porque la función no tiene `UPDATE` ni `DELETE` y el id lo elige
  ella.
- **Cuesta:** un rol y una función más en el inventario de ADR-0008, cada cambio de cuerpo pasa por
  `auditor-seguridad`, y R2 de `CLAUDE.md` cambia (ruta protegida).
- **Cierra:** nada que no estuviera ya cerrado.

### Eje 2 — Cómo nace la identidad que se registra

#### E — Activar el registro de Better Auth (`disableSignUp: false`, `requireEmailVerification`) (rechazada)
- **Gana:** es código de la biblioteca.
- **Cuesta:** abre toda la superficie de registro de Better Auth: identidades sin verificar en la
  tabla, rutas que hoy `auth.controller.ts` no expone a propósito, y el comportamiento de «cuenta sin
  probar» del plugin OTP (borra la contraseña de una identidad sin verificar). Sin hook propio,
  tampoco evita revelar si un correo ya tiene cuenta.
- **Cierra:** el control fino de lo que se expone de Better Auth, que hoy es una decisión explícita.

#### F — Registro propio en dos pasos con código por correo, con el patrón de las invitaciones (elegida)
`solicitar` guarda en `verificaciones` un código hasheado y lo envía. `completar` lo consume y crea
la identidad **ya verificada**, con `crearVerificada`, el mismo camino que una invitación aceptada.
- **Gana:** nunca existe una identidad sin verificar. Responde igual exista o no el correo. Reutiliza
  `verificaciones`, el limitador y `crearVerificada`. Better Auth sigue cerrado.
- **Cuesta:** dos rutas propias más que mantener.
- **Cierra:** nada.

#### G — Sin cuenta previa: un formulario único que crea identidad y agencia a la vez (rechazada)
- **Gana:** un paso menos para el usuario.
- **Cuesta:** junta dos pools en una operación que parece atómica y no lo es. Obliga a crear la
  agencia antes de verificar el correo, o a guardar la agencia «pendiente» en algún sitio global.
- **Cierra:** que una persona que ya tiene cuenta (por ejemplo, asesora de otra agencia) cree su
  propia agencia sin registrarse de nuevo.

### Eje 3 — Quién siembra los datos de una agencia nueva

#### H — `identity` escribe etapas, motivos y formatos directamente (rechazada)
Viola R4: `identity` escribiría tablas de `crm` y `quoting`.

#### I — Siembra por eventos: `identity.agencia_creada` y cada módulo siembra lo suyo (rechazada para v1)
- **Gana:** desacople total.
- **Cuesta:** la agencia existe durante un rato sin embudo ni formatos. Si un consumidor falla, se
  queda así hasta el reintento, y el primer pantallazo del dueño es un tablero vacío y roto.
- **Cierra:** nada. Es la vía natural si un módulo se extrae algún día.

#### J — Puertos declarados en `identity`, implementados por `crm` y `quoting`, ejecutados en la misma transacción (elegida)
Tiene el mismo precedente que `PuertoConversacionesDeMiembro`. Cada implementación llama a las
funciones de `siembra-de-tenant.ts`, que siguen siendo **el único sitio** que decide qué trae una
agencia nueva.
- **Gana:** es atómica (todo o nada) y cumple R4.
- **Cuesta:** `identity` conoce que «una agencia nueva se siembra», aunque no sepa con qué.
- **Cierra:** nada. Pasar a eventos (I) es cambiar el adaptador, no el puerto.

## Decisión

**D + F + J.** La identidad nace por un registro propio con código por correo. La agencia nace en
**una sola transacción** de `viajapro_app`, que empieza por `crear_agencia`, una función
`SECURITY DEFINER` con dueño `NOLOGIN` (`viajapro_registro`), y siembra todo lo demás bajo RLS por
puertos. Ninguna otra combinación deja a la base, y no a la aplicación, eligiendo qué fila de
`tenants` se escribe.

### 1. Flujo de alta

```
/registro            POST /api/v1/auth/registro/solicitar   { correo }                         → 202 siempre
                     POST /api/v1/auth/registro/completar   { correo, codigo, nombre,
                                                              contrasena, aceptaciones }         → 200 + cookie de sesión
/registro/agencia    POST /api/v1/auth/agencias             { nombre, nit?, paisIso,
                                                              zonaHoraria, monedaIso,
                                                              aceptaEncargo: version }           → 201 { slug }
                     → la sesión queda con tenant_activo = la agencia nueva → /bienvenida
```

1. **Solicitar.** Se responde `202` siempre. Si el correo no tiene identidad, se guarda en
   `verificaciones` el identificador `registro:<HMAC(correo)>` con el valor
   `{ hashDelCodigo, intentosRestantes: 5 }`, vigencia de 10 minutos, y se encola el correo con el
   código de 6 dígitos (R5). Si **ya tiene** identidad, se encola otro correo: «ya tienes cuenta,
   inicia sesión o recupera tu contraseña». La respuesta y el tiempo son los mismos en los dos
   casos: no se revela quién tiene cuenta (la misma regla que en las invitaciones).
2. **Completar.** Se consume el código (borrar al acertar; restar un intento al fallar; al llegar a
   cero se borra). Luego `crearVerificada` y, **en la misma transacción del pool de identidad**, una
   fila por documento aceptado en `aceptaciones_de_identidad` (§4). Por último se inicia la sesión
   por el camino normal de Better Auth, sin crear filas de `sesiones` a mano. Una contraseña de menos
   de 12 caracteres da 422 antes de consumir el código.
3. **Crear la agencia.** La ruta exige sesión viva e identidad con `correo_verificado`, y **no exige
   tenant activo**: va en `RUTAS_DE_AUTENTICACION_SIN_TENANT`, como `tenant-activo`, y lee la
   sesión por `identity`. El cuerpo es un Zod `.strict()` **sin ningún campo de tenant**. Ver §3.
4. **Entrar.** Tras el `COMMIT`, se fija `tenant_activo_id` por `CambiarAgenciaActiva`, que vuelve a
   leer la membresía bajo RLS. Si ese paso falla, la agencia existe y la persona la elige en el
   selector: `accesos_identidad` ya la tiene, porque la escribe el disparador de `usuarios`.

**Quién la crea queda como `DUENO`**: un `usuarios` con el rol sembrado de clave `DUENO`, la
identidad de la sesión y el correo y nombre de la identidad. Cualquier identidad verificada puede
crear una agencia, aunque ya pertenezca a otra (ADR-0011 §3 ya admite la multiagencia). El límite
es de una agencia en prueba a la vez (§3.2).

### 2. Estados y prueba gratis

- Una agencia de autoservicio nace **`EN_PRUEBA`**, con `origen_del_alta = 'AUTOSERVICIO'` y
  `prueba_termina_en = now() + p_dias_de_prueba`. Los días los da la configuración de la API
  (`PRUEBA_DIAS`, 14 por defecto, pregunta P1) y la función los acota a `1..60`. Las agencias de
  plataforma (scripts) llevan `origen_del_alta = 'PLATAFORMA'`.
- **`EN_PRUEBA → ACTIVO`** lo hace hoy la plataforma, por script, hasta que exista `payments`.
- **Al vencer la prueba no hay corte automático en este ADR.** La web muestra los días que quedan.
  Al vencer, la plataforma decide a mano. El modelo de negocio dice que bloquear a una asesora a
  mitad de una venta es inaceptable, y la política de vencimiento (solo lectura, gracia o
  suspensión) es una decisión de cobro. La tomará el ADR de planes y cobro.
- **No se añaden valores a `estado_tenant`.** Un enum de la base es caro de cambiar, y «prueba
  vencida» se calcula con `estado = 'EN_PRUEBA' AND prueba_termina_en < now()`.
- `agenciaPermiteAcceso` no cambia.

### 3. Seguridad y aislamiento

#### 3.1 El rol `viajapro_registro` (se añade a ADR-0008 §1.3)

- `NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`. Si existe `neon_superuser` y
  es miembro, se le revoca.
- Privilegios **solo de columna**:
  - `tenants`: `SELECT (id, slug, estado, origen_del_alta, creado_por_identidad_id, creado_en)`.
  - `tenants`: `INSERT (id, slug, nombre, pais_iso, moneda_iso, zona_horaria, estado,
    origen_del_alta, creado_por_identidad_id, prueba_termina_en, encargo_version,
    encargo_aceptado_en, actualizado_en)`.
  - `monedas`: `SELECT (codigo_iso)`.
  - **Ningún `UPDATE`, `DELETE` ni `TRUNCATE`**, ni privilegios sobre tablas de negocio o de
    identidad.
- `CREATE` sobre `public` se le presta para crear la función y se le retira en la misma migración.
- **Miembros:** ningún rol de `roles_de_login_vigilados`. El rol de migraciones con `SET TRUE,
  INHERIT FALSE`, igual que `viajapro_ajustes`.

#### 3.2 La función `crear_agencia`

Firma:

```
crear_agencia(p_nombre text, p_slug_base text, p_pais_iso text, p_moneda_iso text,
              p_zona_horaria text, p_identidad_id uuid, p_dias_de_prueba int,
              p_version_encargo text) RETURNS uuid
```

- `SECURITY DEFINER`, `plpgsql`, `VOLATILE`, `SET search_path = ''`, todo cualificado, sin SQL
  dinámico. No es `STRICT`, por la razón de ADR-0027: un `NULL` tiene que dar error, no un `NULL`
  silencioso. Se crea bajo `SET ROLE viajapro_registro`. `EXECUTE` revocado a `PUBLIC` y concedido
  **solo a `viajapro_app`**.
- **Precondición de contexto:** si `app.current_tenant` no está vacío, aborta (`42501`). Así no
  puede ejecutarse dentro de una transacción que ya trabaja para una agencia y cambiarle el
  contexto a mitad de camino.
- **Validación:** nombre recortado de 2 a 200 caracteres; `p_slug_base` con
  `^[a-z0-9]+(-[a-z0-9]+)*$` y de 3 a 50 caracteres; país `^[A-Z]{2}$`; moneda existente en
  `monedas`; zona en `pg_timezone_names`, con los mismos alias excluidos que en ADR-0027;
  `p_dias_de_prueba` en `1..60`; `p_version_encargo` no vacía. Si algo falla, `22023`.
- **Contra el abuso, dentro de la base** (no depende de que la API recuerde nada):
  - `pg_advisory_xact_lock` sobre la identidad. Con el candado, si ya hay una agencia de
    `origen_del_alta = 'AUTOSERVICIO'`, `estado = 'EN_PRUEBA'` y `creado_por_identidad_id =
    p_identidad_id`, aborta con `VPR01` (`agencia_en_prueba_existente`).
  - **Tope global:** si en la última hora se crearon más de **30** agencias de autoservicio, aborta
    con `VPR02` (`registro_saturado`). Es un cortocircuito ante un bucle o un ataque, no un límite de
    negocio. Cambiarlo exige una migración, y es a propósito: así la API no lo puede subir.
  - `p_identidad_id` viene de la API, que lo lee de la sesión verificada. **No es una frontera de
    aislamiento**, solo la llave del límite. La función no puede leer `identidades` y no lo
    necesita.
- **Escritura:** `id = gen_random_uuid()` (v4; PostgreSQL 16 no trae uuid v7, y en `tenants` el
  orden del índice no importa). El slug es `p_slug_base`; si choca con uno existente se le añade
  `-` y 4 caracteres aleatorios, hasta 5 intentos (después, `VPR03`). **Nunca se reutiliza una fila
  existente.** `estado = 'EN_PRUEBA'`, `origen_del_alta = 'AUTOSERVICIO'`, `encargo_aceptado_en =
  now()`, `actualizado_en = now()`. Es un `INSERT` simple: sin `ON CONFLICT DO UPDATE`.
- **Contexto:** `set_config('app.current_tenant', id::text, true)`. La transacción queda atada a la
  agencia nueva, y la API **no** fija el tenant: lo hereda de la función (S1). Devuelve el id.

| SQLSTATE | Caso | HTTP |
|---|---|---|
| `22023` | Dato inválido (nombre, país, moneda, zona, días, versión) | 422 |
| `42501` | Contexto de tenant no vacío al llamar. Error de programación | 500 |
| `VPR01` | Esta identidad ya tiene una agencia en prueba de autoservicio | 409 |
| `VPR02` | Tope global por hora | 503 con `Retry-After` |
| `VPR03` | No se encontró un slug libre en 5 intentos | 500 |

La API traduce por SQLSTATE, no por texto (como en ADR-0027 §3).

#### 3.3 Columnas y tablas nuevas

| Objeto | Alcance | Qué |
|---|---|---|
| `tenants` + `origen_del_alta` | global (ya exceptuada) | enum `origen_del_alta` (`PLATAFORMA`, `AUTOSERVICIO`), `NOT NULL DEFAULT 'PLATAFORMA'`. Es un invariante del sistema, no política de la agencia (R12) |
| `tenants` + `creado_por_identidad_id` | global | `uuid NULL → identidades(id)`. Solo un id, sin datos personales |
| `tenants` + `prueba_termina_en` | global | `timestamptz NULL` (UTC, R9) |
| `tenants` + `encargo_version`, `encargo_aceptado_en` | global | La aceptación del contrato de encargo en nombre de la agencia, por `creado_por_identidad_id` |
| `perfiles_de_agencia` | **tenant, RLS** (`USING` + `WITH CHECK` por `001`) | `tenant_id` PK y FK, `nit`, `digito_verificacion`, `razon_social`, `rnt`, todos `NULL`. **El NIT no va en `tenants`**: esa tabla la leen enteros tres roles de login, y el NIT de una persona natural es su cédula. La escribe `viajapro_app` bajo RLS. La marca y la pieza de cotización (RNT) la reutilizan después |
| `aceptaciones_de_identidad` | **global**, solo `viajapro_identidad` | `id`, `identidad_id → identidades`, `documento` (`TERMINOS`, `AVISO_DE_PRIVACIDAD`), `version`, `aceptado_en`. Solo `SELECT, INSERT` para `viajapro_identidad`, sin `UPDATE` ni `DELETE`: es evidencia. Se declara en `excepciones_rls` con `{}` para los otros tres roles de login, y **se amplía el literal de `aislamiento.spec.ts`** (R1) |

#### 3.4 La transacción del alta, en orden

Todo con `viajapro_app`, en **una** transacción:

1. `SELECT crear_agencia(...)`. Devuelve `tenantId` y deja el contexto fijado.
2. Comprobación de consistencia: `current_setting('app.current_tenant') = tenantId`, o `ROLLBACK`.
   Si S1 resultara falsa, en este punto la API fija el contexto con el id **devuelto por la
   función**, nunca con uno del cliente.
3. `sembrarRoles` (identity). Después, por los puertos `SembradorDeAgenciaNueva`: `crm` siembra
   etapas y motivos de pérdida, y `quoting` siembra formatos y política de precio. Todo con las
   funciones de `siembra-de-tenant.ts`, bajo RLS.
4. `INSERT` en `usuarios` con el rol `DUENO`. Lo dispara `sincronizar_acceso_identidad`, que
   escribe en `accesos_identidad`.
5. `INSERT` en `perfiles_de_agencia`, si llegó NIT.
6. `INSERT` en `registros_auditoria`: `accion = 'agencia.creada'`, `usuario_id` del dueño, `ip`, y
   `detalle = { origen, encargoVersion }`, **sin nombre, correo ni NIT** (R10).
7. `INSERT` en `outbox`: `identity.agencia_creada` v1, `payload = { tenantId, origen }`. Sin datos
   personales.
8. `COMMIT`. Cualquier fallo revierte todo: no quedan agencias a medio sembrar.

#### 3.5 Por qué un registro no puede tocar otra agencia

1. La función solo **inserta**: no tiene `UPDATE` ni `DELETE` sobre `tenants`, y no hay `ON
   CONFLICT`.
2. El id lo genera la base. El contrato no tiene ningún campo de tenant, y un campo desconocido es
   un 400 (`.strict()`).
3. El contexto lo fija la función, y solo si estaba vacío.
4. Todo lo demás se escribe bajo RLS con `WITH CHECK`. Una fila con otro `tenant_id` falla en la
   base, no en un `if`.
5. **Prohibido reutilizar en este camino los `upsert` por slug o por correo de los scripts de
   semilla.** Lo fija una prueba (§7).

**Qué no protege** (igual que ADR-0027 §4): quien pueda ejecutar SQL arbitrario como
`viajapro_app` puede crear agencias, hasta el tope por hora. No puede entrar en una existente.

#### 3.6 Contra el abuso, fuera de la base

- **El correo verificado es la barrera principal.** Sin código no hay identidad, y sin identidad no
  hay agencia.
- **Límites** con el `LimitadorDeEnvios` que ya existe: `solicitar`, 3 por correo y 10 por IP cada
  15 minutos (los valores actuales del OTP, configurables), más un tope global de correos de
  registro por hora para proteger la reputación del remitente. `completar` y `agencias` caen bajo
  el límite general de T-002.
- **Sin captcha en v1.** Se declara el puerto `VerificadorDeHumano` con un adaptador que siempre
  aprueba. Se conecta un proveedor real si en una semana hay más de 50 solicitudes de registro sin
  completar, o si llega una queja de bombardeo de correos. Para entonces `investigador` verifica
  proveedor y precio, y hace falta ADR (CLAUDE.md §10). Un captcha hoy sería una dependencia
  externa para un tráfico que no existe.
- **Sin lista de dominios desechables.** Se evade fácil, hay que mantenerla y da falsos positivos.
  Además, lo caro de una agencia falsa no es la fila: es WhatsApp y la IA, y esos dos tienen su
  propia compuerta (§5).
- **Interruptor:** `REGISTRO_AUTOSERVICIO_HABILITADO`, `false` por defecto. Con `false`, las tres
  rutas responden 404. Se activa por entorno, solo cuando la fase F0 (textos legales) esté cerrada.

### 4. Datos personales (R10, Ley 1581)

Hay dos relaciones distintas, y el alta las registra por separado:

1. **ViajaPro como responsable de los datos de quien se registra** (correo, nombre, IP de la
   sesión). En `completar`, la persona acepta los **Términos** y el **Aviso de privacidad de
   ViajaPro**, cada uno con su versión. Se guarda en `aceptaciones_de_identidad`: fecha, documento
   y versión, como pide `docs/05-seguridad/02-proteccion-de-datos.md` §4. Sin las dos casillas
   marcadas, la respuesta es 422. **Las casillas no vienen marcadas por defecto.**
2. **ViajaPro como encargado de la agencia** (los datos de sus viajeros). Al crear la agencia, quien
   la crea acepta el **contrato de encargo del tratamiento** en nombre de la agencia
   (`encargo_version`, `encargo_aceptado_en`, `creado_por_identidad_id`). El mismo documento de
   protección de datos lo exige «en el flujo de alta del cliente, no como un PDF que alguien
   recuerda enviar» (§2).

Además:
- Las versiones de los textos son **código** (una constante en `packages/contracts`, con el texto
  publicado en `/terminos` y `/privacidad`). Así la API rechaza una versión que no es la vigente.
- **Ninguna de las tres rutas loguea el correo, el NIT ni el código.** Los contadores van por HMAC,
  como hoy.
- **Supresión:** suprimir una identidad (ya previsto en ADR-0011) no borra sus aceptaciones. La fila
  solo guarda el `identidad_id`, y es la prueba de que hubo autorización.

### 5. Relación con lo que viene

#### 5.1 WhatsApp

- **Con Embedded Signup** (bloqueado por T-080, Tech Provider): el paso de WhatsApp del asistente
  llama al caso de uso de alta de canal de ADR-0008. Corre con `viajapro_altas`, como siempre, y
  **no** es parte de este ADR.
- **Mientras tanto:** el paso muestra «Conectar WhatsApp: lo hace el equipo de ViajaPro» y un botón
  **Solicitar conexión**. El botón emite `identity.conexion_whatsapp_solicitada` por el outbox, y
  `notifications` avisa a la plataforma por correo. El resto del CRM (catálogo, cotizador, contactos,
  embudo) funciona sin canal. **Hoy la plataforma no tiene ninguna vía para conectar el número real
  de una agencia** (S3): el script existente es solo de desarrollo y solo para `agencia-demo`. Esa
  vía es trabajo del agente `whatsapp`, con su propia auditoría (T-270), y la decide el
  propietario (P6).
- **Una agencia en prueba no conecta WhatsApp sin que nadie la mire.** Hoy lo garantiza la
  conexión manual. Cuando llegue Embedded Signup, decidir si `EN_PRUEBA` conecta sola es parte de su
  ADR. Un número de una agencia falsa haciendo spam a través de nuestra app de Tech Provider es un
  riesgo para todas las demás.

#### 5.2 Catálogo

El asistente ofrece la importación por CSV que ya existe. La ingesta con IA es **T-057 y T-058**
(T-053 a T-056 son la API pública por claves, no IA). Cuando llegue, una agencia en prueba tiene
un presupuesto de IA acotado por `PoliticaDeUso` (§5.5), porque los tokens son coste variable
(modelo de negocio §2).

#### 5.3 Equipo

Las invitaciones ya existen y no cambian. Lo único nuevo es el límite de miembros en prueba (§5.5).

#### 5.4 Asistente de primeros pasos

**El progreso se calcula a partir de hechos, no se guarda.** `GET /api/v1/agencia/primeros-pasos`
responde cada paso con `hecho: boolean`:
- **Marca:** hoy, que la agencia tenga nombre; cuando exista `perfiles_de_agencia`, además el RNT.
- **Catálogo:** hay al menos un producto activo (puerto hacia `quoting`).
- **Equipo:** hay más de un miembro activo.
- **WhatsApp:** hay un canal activo (puerto hacia `inbox`).

Cada dato llega por un puerto declarado en `identity` (R4). Los pasos **omitidos** siguen en
`localStorage`: son una preferencia de pantalla, no un dato de negocio, y guardarlos en la base no
justifica una migración. Esta parte no depende del registro y ya sirve a las agencias de script:
por eso su tarea (T-267) puede empezar antes de que se acepte este ADR.

#### 5.5 Planes y cobro: el gancho, no el sistema

- **Sin tabla `planes` ni `suscripciones` en este ADR.** El modelo de cobro no está decidido (S2), y
  una tabla diseñada sin él es esquema que habrá que migrar.
- Se declara el puerto `PoliticaDeUso` en `identity`: `limites(tenant) → { maxMiembrosActivos,
  maxCanales, presupuestoIaMensual }`. Su único adaptador decide **por estado**. `EN_PRUEBA`
  recibe los límites de configuración (por defecto 5 miembros y 1 canal; P5). `ACTIVO` no tiene
  límite.
- **Los límites solo impiden añadir** (invitar al sexto miembro, conectar un segundo canal). Nunca
  quitan acceso a lo que ya se usa.
- El ADR de cobro sustituirá el adaptador por uno que lea el plan. El puerto no cambia.

### 6. Qué NO incluye

- Pasarela, cobro, facturación, planes y vencimiento automático de la prueba.
- Embedded Signup y la conexión de WhatsApp por plataforma (solo su relación con el asistente).
- Captcha y lista de dominios desechables (con sus condiciones de entrada en §3.6).
- Inicio de sesión social, SSO y MFA (ADR-0011).
- Borrar agencias, y la purga de agencias de prueba abandonadas (va a la cola: T-272).
- Recuperación de contraseña por autoservicio: sigue siendo de ADR-0011.
- Más países que el mercado base: el contrato acepta los que el propietario habilite (P4).

### 7. Verificación

| Prueba | Qué sostiene |
|---|---|
| La migración aborta si `viajapro_registro` puede iniciar sesión, saltarse RLS o es superusuario; si conserva `CREATE`; si su superficie efectiva de columnas no es exactamente la de §3.1; si tiene algún privilegio de tabla; si es miembro de algún rol; si un rol vigilado puede actuar como él; si alguien distinto de `viajapro_app` puede ejecutar `crear_agencia`; o si la declaración de `tenants` para `viajapro_app` dejó de ser `{SELECT}` | La superficie, igual que en ADR-0027 §5 |
| `aislamiento.spec.ts` («Registro de agencias»): `crear_agencia` con contexto ya fijado da `42501`; un slug igual al de una agencia existente crea **otra** agencia y la existente queda intacta (mismas filas en `usuarios`, mismo `actualizado_en`); `viajapro_app` sigue con `42501` al hacer `INSERT`/`UPDATE` directo sobre `tenants`; `aceptaciones_de_identidad` da `42501` a `viajapro_app`, `viajapro_altas` y `viajapro_webhook`; S1 se cumple | Que el registro no puede tocar otra agencia |
| e2e: un alta que falla en la siembra (puerto falso que lanza) no deja fila en `tenants` | La atomicidad |
| e2e: el cuerpo con `tenantId` da 400; la segunda agencia en prueba de la misma identidad da 409; `solicitar` responde igual (estado, cuerpo y tiempo dentro de un margen) para un correo existente y para uno nuevo | El contrato y la no enumeración |
| e2e: con `REGISTRO_AUTOSERVICIO_HABILITADO=false`, las tres rutas dan 404 | El interruptor |

### 8. Plan de implementación por fases

Las tareas están en `roadmap/tasks.yaml`. **Migración** = ruta protegida, la aprueba el propietario.
**Auditoría** = pasa por `auditor-seguridad` antes de integrar.

| Fase | Qué | Tarea | Dueño | Migración | Auditoría |
|---|---|---|---|---|---|
| F0 | Textos versionados: términos, aviso de privacidad de ViajaPro y contrato de encargo | T-261 | propietario + `documentador` | No | Sí (contenido legal) |
| F1 | Rol `viajapro_registro`, `crear_agencia`, columnas de `tenants`, `perfiles_de_agencia`, `aceptaciones_de_identidad`, `excepciones_rls`, aserciones y cambio de R2 | T-262 | `datos` | **Sí** | **Sí, las vueltas que hagan falta** (aislamiento) |
| F1b | Política de precio dentro de `siembra-de-tenant.ts` | T-263 | `datos` | No | No |
| F2 | Rutas `registro/solicitar` y `registro/completar`, con límites, interruptor y aceptaciones | T-264 | `backend` | No | **Sí** |
| F3 | `POST /api/v1/auth/agencias`: transacción de §3.4, puertos de siembra en `crm` y `quoting`, auditoría y outbox | T-265 | `backend` | No | **Sí, las vueltas que hagan falta** (aislamiento) |
| F4 | Web: `/registro`, código, crear agencia, casillas legales | T-266 | `frontend` | No | No (revisión normal) |
| F5 | Primeros pasos calculados en la API, y el asistente leyéndolos | T-267, T-268 | `backend`, `frontend` | No | No |
| F6 | `PoliticaDeUso` y días de prueba visibles | T-269 | `backend` | No | No |
| — | Conexión de WhatsApp por la plataforma antes de Tech Provider | T-270 | `whatsapp` | Probable (credenciales por tenant, R6) | **Sí** |
| — | Embedded Signup en el asistente | T-271 | `whatsapp` | Probable | **Sí** |
| Cola | Purga de agencias de prueba abandonadas | T-272 | `datos` | Sí | Sí |

El orden mínimo para que una agencia se registre sola es F0 → F1 → F2 → F3 → F4. F5 y F6 pueden ir
en paralelo. **El interruptor no se enciende en producción sin F0.**

## Consecuencias

### Positivas
- Una agencia puede empezar a usar ViajaPro sin que nadie del equipo toque la base.
- `viajapro_app` sigue sin poder escribir en `tenants`, y `excepciones_rls` no cambia para
  `tenants`.
- Los límites contra el abuso viven en la base: un bug de la API no los salta.
- El consentimiento y el contrato de encargo quedan registrados con versión desde la primera agencia
  real, no reconstruidos después.
- `siembra-de-tenant.ts` sigue siendo la única definición de lo que trae una agencia nueva.

### Negativas
- **Un rol y una función `SECURITY DEFINER` más**, y una tabla global más con su línea en el literal
  de aislamiento. Cada cambio de cuerpo exige auditoría.
- **R2 de `CLAUDE.md` cambia** (ruta protegida): una cláusula para `viajapro_registro`.
- **El tope global de 30 por hora vive en SQL.** Subirlo es una migración. Es lo que se busca, pero
  si un día de lanzamiento llegan 31 agencias en una hora, la 31 espera.
- **La identidad y la agencia van en dos transacciones.** Puede quedar una identidad verificada sin
  agencia. Es un estado válido (la web ofrece «crear agencia»), pero hay que contarlo en las
  métricas del embudo.
- **El NIT de una persona natural queda en claro bajo RLS**, no cifrado. Es el mismo dato que la
  agencia imprime en sus facturas. Si `auditor-seguridad` lo considera PII sensible, entra en
  ADR-0015.
- **No hay corte al vencer la prueba.** Una agencia de prueba puede seguir usando el producto hasta
  que alguien actúe a mano.
- **La pantalla de WhatsApp promete una conexión que hoy depende de trabajo que no existe** (T-270).
  Si el propietario no quiere conexión manual, el paso solo puede decir «próximamente».

### Qué habría que cambiar para revertir esto
Apagar `REGISTRO_AUTOSERVICIO_HABILITADO` y, en una migración nueva: `DROP FUNCTION
public.crear_agencia(...)`, revocar y `DROP ROLE viajapro_registro`. Las columnas de `tenants`,
`perfiles_de_agencia` y `aceptaciones_de_identidad` **se conservan**: las agencias ya creadas y sus
aceptaciones son datos y evidencia legal, no un adorno de esta decisión.

## Cuándo revisar esta decisión

- Cuando se decida el modelo de cobro: el adaptador de `PoliticaDeUso` y la política de vencimiento
  cambian, y probablemente aparezca `suscripciones`.
- Cuando Embedded Signup esté disponible (T-080): decidir si `EN_PRUEBA` conecta WhatsApp sola.
- Si se cumple la condición del captcha de §3.6, o se toca el tope global más de una vez en un mes.
- Si alguien propone que `crear_agencia` reciba el id o actualice una fila existente: necesita ADR y
  auditoría propios.
- Si `tenants` pasa a tener RLS o deja de ser global.

## Preguntas para el propietario

| # | Pregunta | Propuesta del arquitecto |
|---|---|---|
| P1 | ¿Cuántos días de prueba? | 14 |
| P2 | ¿Registro abierto a cualquiera al activarlo, o con código de acceso de la plataforma durante el piloto? | Interruptor apagado hasta tener el despliegue y los textos legales. Después, abierto |
| P3 | Términos, aviso de privacidad de ViajaPro y contrato de encargo: ¿quién los redacta y aprueba? | Abogado y propietario (T-093, T-098). Sin ellos, el interruptor no se enciende |
| P4 | ¿Qué países y monedas se ofrecen en el alta? | Solo Colombia/COP al principio; el resto cuando haya normativa verificada |
| P5 | Límites de la prueba | 5 miembros activos, 1 canal, sin IA hasta T-057 |
| P6 | Antes de Tech Provider, ¿conecta la plataforma a mano el número de una agencia real (T-270)? | Sí, para el piloto: es el único camino al primer WhatsApp real |
| P7 | ¿A qué buzón llegan los avisos de nueva agencia y de solicitud de conexión? | Un buzón de operaciones, por variable de entorno |

### Respuestas del propietario (2026-11-20)

El propietario aceptó las propuestas que se le presentaron en la sesión:

| # | Decisión |
|---|---|
| P1 | 14 días de prueba |
| P2 | Durante el piloto, registro **con código de acceso** de la plataforma (además del interruptor apagado por defecto); abierto después |
| P3 | Términos, aviso de privacidad y contrato de encargo: los redacta un abogado y los aprueba el propietario (T-093, T-098). Sin ellos el interruptor no se enciende |
| P4 | Solo Colombia y COP al principio |
| P5 | Prueba: 5 miembros activos, 1 canal de WhatsApp, sin IA |
| P6 | Sí: antes de Tech Provider, la plataforma conecta a mano el número de cada agencia piloto (T-270) |
| P7 | Los avisos llegan al correo del propietario, configurado por variable de entorno (nunca escrito en el repositorio) |

El ADR sigue **Propuesto** hasta cerrar la auditoría de seguridad; estas respuestas no lo aceptan por sí solas.

---

> Un ADR aceptado **no se edita jamás.** Si la decisión cambia, se escribe uno nuevo que lo supersede.
