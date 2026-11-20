# ADR-0030 — Registro autoservicio de agencias: cuenta verificada, alta atómica por `crear_agencia` y prueba gratis

- **Estado:** Aceptado (2026-11-20, por el propietario por delegación, tras tres vueltas de
  `auditor-seguridad`; la tercera cerró B1 sin bloqueantes pendientes)
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

> **Revisión de seguridad:** la segunda vuelta cerró los bloqueantes 2 y 3 de la primera. **Tercera
> vuelta: B1 abordado** (§1.2, §3.7, §3.8, §6) y **verificado** por el auditor el 2026-11-20: sin
> bloqueantes. Se aplicó además su corrección recomendada en T-281 (restablecer la credencial de toda
> identidad de autoservicio, no solo la que no tiene pertenencias).

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
| Hay un limitador de envíos de código, con puerto, adaptadores Redis y memoria, y claves HMAC (no guarda ni el correo ni la IP en claro). **El prefijo de la clave es fijo** (`viajapro:otp-envio:`): otro uso compartiría contador con el OTP de ingreso | `identity/application/limitador-de-envios.ts:43-47` |
| **`verificaciones.identificador` no es único** (solo `@@index`), y `valor` es texto libre. Un contador de intentos guardado en `valor` sería leer, modificar y escribir: dos intentos concurrentes leerían el mismo contador | `schema.prisma:411-422` |
| `AceptarInvitacionUseCase`, si la identidad del correo **ya existe**, la ata a la agencia sin tocar su contraseña ni avisar a nadie | `aceptar-invitacion.use-case.ts:39-55` |
| El OTP de ingreso usa 6 dígitos, 5 minutos y 3 intentos (`CODIGO_DE_CORREO`) | `crear-auth.ts:48` |
| Las transacciones sin tenant se declaran una a una en `OPERACIONES_DE_PLATAFORMA` y se abren con `sinTenantDeclarado` (lo que no está declarado no compila) | `shared/prisma/operaciones-de-plataforma.ts`; `prisma.service.ts:133-139` |
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
  PostgreSQL, con dos condiciones que este ADR fija: la función solo declara `SET search_path = ''`
  (aserción `proconfig = {search_path=""}`), y el `set_config` es **la última sentencia, fuera de
  todo bloque `EXCEPTION`**, porque revertir una subtransacción revierte también el `set_config`
  hecho dentro. `datos` lo prueba en F1 **por el camino del slug que choca**, que es el que
  reintenta. Si resultara falso, el alta sigue funcionando: la API fijaría el contexto con el id que
  devuelve la función (variante de §3.4).
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
`solicitar` guarda un código hasheado en una tabla propia, `codigos_de_registro` (§3.7), y lo
envía. `completar` lo consume de forma atómica y crea la identidad **ya verificada**, con
`crearVerificada`, el mismo camino que una invitación aceptada.
- **Gana:** nunca existe una identidad sin verificar. Responde igual exista o no el correo. Reutiliza
  el limitador y `crearVerificada`. Better Auth sigue cerrado.
- **Cuesta:** dos rutas propias y una tabla global más. Se descartó reutilizar `verificaciones`: su
  `identificador` no es único y `valor` es texto, así que el contador de intentos no se puede
  decrementar de forma atómica sin cambiar una tabla que es de Better Auth.
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
/registro#acceso=…   POST /api/v1/auth/registro/solicitar   { correo, codigoDeAcceso }         → 202 siempre
                     POST /api/v1/auth/registro/completar   { correo, codigo, nombre,
                                                              contrasena, aceptaciones }         → 200 + cookie de sesión
/registro/agencia    POST /api/v1/auth/agencias             { nombre, nit?, paisIso,
                                                              zonaHoraria, monedaIso,
                                                              aceptaEncargo: version,
                                                              codigoDeAcceso }                   → 201 { slug }
                     → la sesión queda con tenant_activo = la agencia nueva → /bienvenida
```

0. **Código de acceso del piloto** (P2, decidido): la plataforma lo genera y lo entrega por otro
   canal como enlace `/registro#acceso=<secreto>`. Va en el **fragmento**, que el navegador no
   envía al servidor, así que no aparece en registros de acceso. La web lo lee y lo manda en el
   cuerpo. Se **comprueba** en `solicitar`, sin consumirlo, y se **consume** dentro de
   `crear_agencia`. Diseño en §3.8.
1. **Solicitar.** Se responde `202` siempre, también con un código de acceso inválido (en ese caso
   no se envía nada, y el intento cuenta para el límite por IP de §3.8). Si el correo no tiene
   identidad, se **reemplaza** su fila de `codigos_de_registro` (§3.7) y se encola el correo con el
   código. Si **ya tiene** identidad, se encola el correo «ya tienes cuenta, inicia sesión o
   recupera tu contraseña». **Las dos ramas encolan un trabajo con la misma forma, en el mismo punto
   del código**, y la respuesta sale antes de encolar. Así ni el estado, ni el cuerpo, ni el tiempo
   revelan quién tiene cuenta. El código **no viaja en claro por la cola** (§3.7).
2. **Completar.** El intento se consume de forma atómica (§3.7). Si el código es correcto, se
   comprueba que **no existe identidad con ese correo**. Si existe (por ejemplo, la crearon entre los
   dos pasos al aceptar una invitación), la respuesta es el mismo error genérico que un código
   inválido: **`completar` nunca reutiliza ni ata una identidad existente.** Ojo: el
   `crearVerificada` de hoy **sí** reutiliza la identidad cuando el alta choca con `P2002`
   (`identidades.prisma.ts:42-47`), y eso es correcto para invitaciones pero no aquí. `completar`
   usa una variante, `crearVerificadaNueva(tx, …)`, que ante `P2002` lanza el error genérico. Con
   ella crea la identidad y, **en la misma transacción `tx` del pool de identidad**, una fila por
   documento aceptado en `aceptaciones_de_identidad` (§4). La carrera (dos `completar`, o
   `completar` contra una invitación aceptada a la vez) tiene su e2e. Por último se inicia la sesión por el camino normal
   de Better Auth, sin crear filas de `sesiones` a mano. Una contraseña de menos de 12 caracteres da
   422 antes de consumir el intento.
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
  - `codigos_de_acceso_al_registro` (§3.8): `SELECT (hash, usado_en, expira_en, correo_hmac)` y
    `UPDATE (usado_en, usado_por_identidad_id)`. Nada más: ni `INSERT` ni `DELETE`. Los códigos
    los crea la plataforma.
  - `parametros_del_registro` (§3.2): `SELECT (tope_por_hora)`.
  - **Ningún `UPDATE`, `DELETE` ni `TRUNCATE` sobre `tenants`**, ni privilegios sobre tablas de
    negocio o de identidad.
- `CREATE` sobre `public` se le presta para crear la función y se le retira en la misma migración.
- **Miembros:** ningún rol de `roles_de_login_vigilados`. El rol de migraciones con `SET TRUE,
  INHERIT FALSE`, igual que `viajapro_ajustes`.

#### 3.2 La función `crear_agencia`

Firma:

```
crear_agencia(p_nombre text, p_slug_base text, p_pais_iso text, p_moneda_iso text,
              p_zona_horaria text, p_identidad_id uuid, p_dias_de_prueba int,
              p_version_encargo text, p_hash_codigo_de_acceso bytea,
              p_correo_hmac bytea) RETURNS uuid
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
  - **Código de acceso** (§3.8): `UPDATE codigos_de_acceso_al_registro SET usado_en = now(),
    usado_por_identidad_id = p_identidad_id WHERE hash = p_hash_codigo_de_acceso AND usado_en IS
    NULL AND expira_en > now() AND correo_hmac = p_correo_hmac`. Si afecta
    0 filas, aborta con `VPR04`, con el mismo error para un código inexistente, usado, caducado o de
    otro correo. Como va en la misma transacción, un `ROLLBACK` posterior devuelve el código.
    **La función siempre lo exige**: abrir el registro sin código es otro ADR y otra migración, no
    una variable de entorno. Ese ADR tiene una **precondición**: T-281 integrado (§3.7, defensa en
    la invitación).
  - **Tope global:** si en la última hora se crearon más agencias de autoservicio que
    `parametros_del_registro.tope_por_hora` (una fila, 30 al crearla), aborta con `VPR02`
    (`registro_saturado`). Es un cortocircuito ante un bucle o un ataque, no un límite de negocio.
    Vive en una tabla para que subirlo no exija una migración. **Solo la escribe la plataforma**:
    ningún rol de login tiene `UPDATE`. Mientras se exija código de acceso, nadie sin código puede
    agotarlo (DoS); antes de abrir el registro, §3.6 obliga a añadir límites por IP y por dominio.
  - `p_identidad_id` viene de la API, que lo lee de la sesión verificada. **No es una frontera de
    aislamiento**, solo la llave del límite. La función no puede leer `identidades` y no lo
    necesita.
- **Escritura:** `id = gen_random_uuid()` (v4; PostgreSQL 16 no trae uuid v7, y en `tenants` el
  orden del índice no importa). El slug es `p_slug_base`. Si es un **slug reservado** (`admin`,
  `api`, `app`, `www`, `soporte`, `ayuda`, `viajapro`, `plataforma`, `demo`, `agencia-demo`,
  `registro`, `ingresar`; la lista vive en la función, y los prefijos `viajapro-*` y `soporte-*`
  se añaden en T-291), o si choca con uno existente, se le añade
  `-` y 4 caracteres aleatorios, hasta 5 intentos (después, `VPR03`). Cada intento es un `INSERT
  … ON CONFLICT (slug) DO NOTHING RETURNING id`: **sin bloques `EXCEPTION`**, y nunca `DO UPDATE`.
  **Nunca se reutiliza una fila existente.** `estado = 'EN_PRUEBA'`, `origen_del_alta =
  'AUTOSERVICIO'`, `encargo_aceptado_en = now()`, `actualizado_en = now()`.
- **Contexto:** `set_config('app.current_tenant', id::text, true)` es **la última sentencia antes
  del `RETURN`, fuera de todo bloque `EXCEPTION`** (S1). La transacción queda atada a la agencia
  nueva, y la API **no** fija el tenant: lo hereda de la función. Devuelve el id.
- La función solo declara `SET search_path = ''`. La migración afirma `proconfig =
  '{search_path=""}'`: una cláusula `SET app.current_tenant` restauraría el valor al volver y
  rompería S1 en silencio.

| SQLSTATE | Caso | HTTP |
|---|---|---|
| `22023` | Dato inválido (nombre, país, moneda, zona, días, versión) | 422 |
| `42501` | Contexto de tenant no vacío al llamar. Error de programación | 500 |
| `VPR01` | Esta identidad ya tiene una agencia en prueba de autoservicio | 409 |
| `VPR02` | Tope global por hora | 503 con `Retry-After` |
| `VPR03` | No se encontró un slug libre en 5 intentos | 500 |
| `VPR04` | Código de acceso inexistente, usado, caducado o de otro correo (sin distinguir) | 422 |

La API traduce por SQLSTATE, no por texto (como en ADR-0027 §3).

#### 3.3 Columnas y tablas nuevas

| Objeto | Alcance | Qué |
|---|---|---|
| `tenants` + `origen_del_alta` | global (ya exceptuada) | enum `origen_del_alta` (`PLATAFORMA`, `AUTOSERVICIO`), `NOT NULL DEFAULT 'PLATAFORMA'`. Es un invariante del sistema, no política de la agencia (R12) |
| `tenants` + `creado_por_identidad_id` | global | `uuid NULL → identidades(id)`. Solo un id, sin datos personales |
| `tenants` + `prueba_termina_en` | global | `timestamptz NULL` (UTC, R9) |
| `tenants` + `encargo_version`, `encargo_aceptado_en` | global | La aceptación del contrato de encargo en nombre de la agencia, por `creado_por_identidad_id` |
| `perfiles_de_agencia` | **tenant, RLS** (`USING` + `WITH CHECK` por `001`) | `tenant_id` PK y FK, `nit`, `digito_verificacion`, `razon_social`, `rnt`, todos `NULL`, y **`verificado_en timestamptz NULL`**. **El NIT no va en `tenants`**: esa tabla la leen enteros tres roles de login, y el NIT de una persona natural es su cédula. La escribe `viajapro_app` bajo RLS. **Lo que declara el registrante no está verificado**: cualquiera puede escribir el NIT o el RNT de otra agencia. Un disparador `BEFORE INSERT OR UPDATE` pone `verificado_en = NULL` cuando quien escribe es `viajapro_app`, y también cuando cambia `nit` o `rnt`. Solo la plataforma lo fija, tras comprobarlo (T-280). **Ningún documento hacia el viajero imprime NIT ni RNT sin `verificado_en`**. Se usa disparador y no `GRANT` por columnas porque `privilegios_declarados` no admite columnas (nota de T-257) |
| `aceptaciones_de_identidad` | **global**, solo `viajapro_identidad` | `id`, `identidad_id → identidades`, `documento` (`TERMINOS`, `AVISO_DE_PRIVACIDAD`), `version`, **`canal`** (`WEB_REGISTRO`; `INVITACION` cuando lo adopte la aceptación de invitaciones), `aceptado_en`. Solo `SELECT, INSERT` para `viajapro_identidad`, sin `UPDATE` ni `DELETE`: es evidencia. Retención: mientras dure la relación más el plazo de prescripción que fije el abogado (T-267). Se declara en `excepciones_rls` con `{}` para los otros tres roles de login, y **se amplía el literal de `aislamiento.spec.ts`** (R1) |
| `codigos_de_registro` | **global**, solo `viajapro_identidad` | §3.7. `SELECT, INSERT, UPDATE, DELETE` para `viajapro_identidad`; `{}` para los otros tres roles de login en `excepciones_rls`; literal ampliado |
| `codigos_de_acceso_al_registro` | **global**, sin ningún rol de login | §3.8. `{}` para **los cuatro** roles de login en `excepciones_rls`; solo `viajapro_registro` (§3.1) y la plataforma la tocan; literal ampliado |
| `parametros_del_registro` | **global**, una fila | `tope_por_hora int NOT NULL CHECK (tope_por_hora BETWEEN 1 AND 1000)`, con `CHECK` de fila única. `{}` para los cuatro roles de login; `SELECT (tope_por_hora)` para `viajapro_registro`; literal ampliado |

#### 3.4 La transacción del alta, en orden

Todo con `viajapro_app`, en **una** transacción abierta con
`prisma.sinTenantDeclarado('identity/crear-agencia', …)`. La operación se declara en
`OPERACIONES_DE_PLATAFORMA` con su motivo, y no se usa `sinTenantPorqueEsPlataforma`. La transacción
empieza sin tenant porque es lo que exige la precondición de la función:

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

1. La función solo **inserta**: no tiene `UPDATE` ni `DELETE` sobre `tenants`, y el único `ON
   CONFLICT` es `DO NOTHING` por slug, para reintentar con otro.
2. El id lo genera la base. El contrato no tiene ningún campo de tenant, y un campo desconocido es
   un 400 (`.strict()`).
3. El contexto lo fija la función, y solo si estaba vacío.
4. Todo lo demás se escribe bajo RLS con `WITH CHECK`. Una fila con otro `tenant_id` falla en la
   base, no en un `if`.
5. **Prohibido reutilizar en este camino los `upsert` por slug o por correo de los scripts de
   semilla.** Lo fija una prueba (§7).

**Qué no protege** (igual que ADR-0027 §4): quien pueda ejecutar SQL arbitrario como
`viajapro_app` puede crear agencias, una por cada código de acceso válido que tenga y hasta el tope
por hora. No puede entrar en una existente.

#### 3.6 Contra el abuso, fuera de la base

- **Durante el piloto, la barrera principal es el código de acceso** (§3.8). La segunda es el correo
  verificado: sin código de correo no hay identidad, y sin identidad no hay agencia.
- **Límites** con el `LimitadorDeEnvios` que ya existe, pero **con un prefijo propio**
  (`viajapro:registro:`). `claveDeLimite` recibe el prefijo como parámetro, para que el registro no
  comparta contador con el OTP de ingreso (si lo compartiera, quien se registra agotaría el ingreso
  de otra persona, y al revés). `solicitar`: 3 por correo y 10 por IP cada 15 minutos, más un tope
  global de correos de registro por hora para proteger la reputación del remitente. Fallos de
  `completar`: §3.7. Códigos de acceso inválidos: §3.8. `agencias` cae bajo el límite general de
  T-002.
- **Mientras se exija código de acceso: sin captcha ni lista de dominios desechables.** Se declara el
  puerto `VerificadorDeHumano` con un adaptador que siempre aprueba. Sin código no se envía ningún
  correo, así que un tercero no puede usar el registro para bombardear buzones ni agotar el tope
  global.
- **Antes de abrir el registro sin código**, cosa que exige otro ADR (§3.2), son **obligatorios**:
  **T-281 integrado** (la barrera de §3.7: sin ella, cualquiera podría crear la identidad del
  correo de una asesora antes de que la inviten), un captcha real detrás de `VerificadorDeHumano` (proveedor y precio los verifica `investigador`,
  y lleva su propio ADR por CLAUDE.md §10), límites por IP y por dominio de correo en `solicitar` y
  en `agencias`, y una revisión del tope global. Lo caro de una agencia falsa no es la fila: es
  WhatsApp y la IA, y esos dos tienen su propia compuerta (§5).
- **Interruptor:** `REGISTRO_AUTOSERVICIO_HABILITADO`, `false` por defecto. Con `false`, las tres
  rutas responden 404. Se activa por entorno, solo cuando la fase F0 (textos legales) esté cerrada.

#### 3.7 El código de registro (bloqueante 1 de la primera auditoría)

**La amenaza.** Si alguien adivina el código de un correo ajeno, crea una identidad para ese correo
con una contraseña suya. Cuando la agencia de la víctima la invite, `AceptarInvitacionUseCase`
atará la invitación a esa identidad sin tocar la contraseña, y el atacante entrará en la agencia.
Por eso el código no puede admitir fuerza bruta, tampoco concurrente.

**Tabla `codigos_de_registro`** (global, solo `viajapro_identidad`): `id`, **`correo_hmac bytea
UNIQUE`** (HMAC-SHA256 del correo normalizado con el secreto de la aplicación), `hash_codigo bytea`
(SHA-256), `intentos_restantes smallint NOT NULL CHECK (intentos_restantes >= 0)`, `expira_en`,
`creado_en`. **Una sola fila viva por correo, garantizada por la base.**

- **Parámetros:** los mismos que `CODIGO_DE_CORREO`: 6 dígitos, **5 minutos, 3 intentos**. Se
  importan de esa constante, no se copian.
- **Emitir** (`solicitar`): `INSERT … ON CONFLICT (correo_hmac) DO UPDATE SET hash_codigo,
  intentos_restantes = 3, expira_en`. Pedir un código nuevo invalida el anterior. Que eso reinicie
  los intentos lo acotan el límite de envíos (3 cada 15 min) y el tope diario de fallos.
- **Intentar** (`completar`), en este orden:
  1. Si el tope de fallos de 24 h de ese correo está agotado, se responde el error genérico sin
     tocar la base.
  2. **El intento se consume antes de comparar, de forma atómica:** `UPDATE codigos_de_registro SET
     intentos_restantes = intentos_restantes - 1 WHERE correo_hmac = $1 AND intentos_restantes > 0
     AND expira_en > now() RETURNING id, hash_codigo`. Sin fila, error genérico. N peticiones
     concurrentes obtienen como mucho 3 filas: la base serializa el `UPDATE` sobre la fila.
  3. La comparación se hace en tiempo constante. Si falla, se suma uno al contador de fallos de 24 h
     (`LimitadorDeEnvios` con prefijo `viajapro:registro-fallos:`, máximo 10 por correo en 24 h) y
     se responde el error genérico.
  4. Si acierta: `DELETE FROM codigos_de_registro WHERE id = $1`, y **solo si borró exactamente 1
     fila** se sigue. De dos aciertos simultáneos gana uno.
  5. Se exige que no exista identidad con ese correo (§1.2) y se crea en la misma transacción que
     las aceptaciones.
- **Cota:** como mucho 10 intentos por correo y día. Con 10⁶ códigos posibles, la probabilidad de
  acertar en un día es de 10⁻⁵.
- **Correo encolado sin el código en claro (verificado).** La cola de correo de BullMQ ya sella cada
  trabajo con AES-256-GCM, con el id del trabajo como dato asociado
  (`notifications/domain/sellado-de-correo.ts:33-52`). El registro usa esa misma cola. Las dos ramas
  de `solicitar` producen trabajos sellados con la misma forma.
- **Defensa en la invitación** (amplía el comportamiento de `AceptarInvitacionUseCase`):
  - **Ya, con el registro detrás del código de acceso (T-270):** cuando una invitación se ata a una
    identidad **ya existente**, se encola un correo a esa identidad: «Tu correo ya tenía una cuenta
    de ViajaPro, creada el <fecha>. La contraseña que escribiste no se aplicó. Si no creaste esa
    cuenta, avisa ya». Es un aviso, no una barrera.
  - **La barrera (T-281), precondición para abrir el registro sin código:** atar una invitación a
    una identidad existente exige **el ingreso por código de un solo uso de esa identidad**. El OTP
    de ingreso ya existe (`auth.controller.ts`, `/otp/iniciar-sesion`), así que no espera a la
    recuperación de contraseña. Si la identidad nació por autoservicio (tenga o no pertenencias:
    quien la creó con un correo ajeno puede haber creado ya su propia agencia), además se
    **restablece su credencial**: se fija la contraseña nueva y se revocan
    todas sus sesiones. Así, quien la creó con el correo de otra persona pierde el acceso en ese
    momento.
- **Prueba obligatoria:** e2e con 20 peticiones `completar` concurrentes y códigos distintos sobre
  el mismo correo: como mucho 3 comparaciones, ninguna identidad creada si ninguna acierta, y el
  error es idéntico en todas.

#### 3.8 El código de acceso del piloto (bloqueante 2 de la primera auditoría)

**Qué autoriza:** crear **una** agencia nueva. Nada más: no lleva tenant ni rol, y no da acceso a
nada que exista.

**Tabla `codigos_de_acceso_al_registro`** (global; **ningún rol de login** tiene privilegios, y se
declara así en `excepciones_rls` con `{}` para `viajapro_app`, `viajapro_altas`, `viajapro_webhook` y
`viajapro_identidad`):

| Columna | Qué |
|---|---|
| `hash bytea PRIMARY KEY` | SHA-256 del secreto. El secreto tiene **al menos 128 bits** de `crypto.randomBytes`, codificado en base32. Con esa entropía no hace falta sal |
| `expira_en timestamptz NOT NULL` | Días, no horas: 14 por defecto al generarlo |
| `usado_en timestamptz NULL`, `usado_por_identidad_id uuid NULL` | Uso único |
| `correo_hmac bytea NOT NULL` | **Obligatorio mientras dure el piloto**: ata el código al correo que eligió la plataforma (el mismo HMAC de §3.7). Así `solicitar` solo emite códigos de registro a ese buzón, y un código filtrado no sirve con otro correo |
| `creado_en`, `nota text NULL` | La nota es para la plataforma (para qué agencia piloto es), **sin datos personales** |

- **Lo genera la plataforma** con un comando de plataforma (T-280), con el rol de plataforma, no con
  un rol de aplicación. El secreto se muestra **una vez** en la terminal y se entrega por otro
  canal (WhatsApp o llamada al dueño de la agencia piloto). **Nunca se escribe en un registro**, ni
  en el comando, ni en la API, ni en la web.
- **Se comprueba sin consumirlo en `solicitar`** con `codigo_de_acceso_vigente(p_hash bytea,
  p_correo_hmac bytea) RETURNS boolean`. Es una función `SECURITY DEFINER` con el mismo dueño
  (`viajapro_registro`), `STABLE`, `search_path` vacío, que solo lee, y cuyo `EXECUTE` es solo de
  `viajapro_app`. Se llama con `sinTenantDeclarado('identity/comprobar-codigo-de-acceso', …)`.
  Exige `correo_hmac = p_correo_hmac`: no hay rama para un código sin correo. Responde un
  booleano, sin decir por qué falló.
- **Se consume dentro de `crear_agencia`** (§3.2). Un `ROLLBACK` del alta lo devuelve.
- **Límite de intentos por IP:** 10 códigos inválidos por IP en una hora, entre `solicitar` y
  `agencias`, con prefijo `viajapro:registro-acceso:`. Al pasarlo, 429. Con 128 bits no hay fuerza
  bruta posible: el límite es para que un escaneo no cueste nada a la base.
- **Qué pasa si se filtra:** sirve para crear una sola agencia en prueba, que la plataforma ve
  (`origen_del_alta`, la `nota` del código, el evento `identity.agencia_creada`) y puede suspender.
  Y solo con el buzón del correo al que está atado.

### 4. Datos personales (R10, Ley 1581)

Hay dos relaciones distintas, y el alta las registra por separado:

1. **ViajaPro como responsable de los datos de quien se registra** (correo, nombre, IP de la
   sesión). En `completar`, la persona acepta los **Términos** y el **Aviso de privacidad de
   ViajaPro**, cada uno con su versión. Se guarda en `aceptaciones_de_identidad`: fecha, documento,
   versión y canal, como pide `docs/05-seguridad/02-proteccion-de-datos.md` §4. Sin las dos casillas
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
- **Mientras tanto (P6, decidido): conexión manual por la plataforma, sobre una solicitud creada
  dentro de la agencia** (bloqueante 3 de la primera auditoría). **Hoy la plataforma no tiene
  ninguna vía para conectar el número real de una agencia** (S3): el script existente es solo de
  desarrollo y solo para `agencia-demo`. La vía nueva es trabajo del agente `whatsapp`, con su propia
  auditoría (T-276), y se construye así:
  1. **La solicitud nace dentro del tenant.** Tabla `solicitudes_de_conexion_whatsapp` (tenant,
     RLS con `USING` + `WITH CHECK`): `id`, `tenant_id`, `estado` (`PENDIENTE`, `CONFIRMADA`,
     `CONECTADA`, `CANCELADA`), `solicitada_por_usuario_id`, `confirmada_por_usuario_id`,
     `business_id_declarado`, fechas. **Una sola pendiente por agencia**, con un índice único
     parcial `(tenant_id) WHERE estado IN ('PENDIENTE','CONFIRMADA')`. La crea el botón
     **Solicitar conexión**, que exige el permiso de dueño o administrador (`usuarios.administrar`
     hoy; `canales.administrar` si T-276 lo crea). Emite
     `identity.conexion_whatsapp_solicitada` por el outbox con solo `{ solicitudId }`.
  2. **La plataforma trabaja sobre el `tenant_id` de esa fila, nunca sobre un nombre ni un slug**,
     que elige el registrante y pueden parecerse a los de otra agencia. Las pendientes se listan con
     una función de plataforma que devuelve solo `(solicitud_id, tenant_id, creada_en)`, como
     `tenants_con_eventos_por_entregar`. El aviso al buzón de la plataforma (P7) lleva solo el id de
     la solicitud.
  3. **Confirma un DUENO por correo verificado.** Se envía un enlace de un solo uso (token hasheado,
     24 h) a los correos verificados de los usuarios activos con rol `DUENO`, y se confirma **con la
     sesión de un DUENO de esa agencia**. Sin confirmación, la plataforma no avanza. Así, quien solo
     tiene permiso de administrador no conecta un número a espaldas del dueño.
  4. **El token de Meta se entrega en un formulario del tenant**, que lo cifra al llegar (R6,
     ADR-0015) y lo guarda atado a la solicitud. **Nunca por correo, chat ni llamada.** La
     plataforma no lo ve en claro.
  5. **Se comprueba que la WABA es del negocio de la agencia**: con ese token se lee de la Graph API
     el negocio propietario de la WABA, y debe coincidir con `business_id_declarado`. El
     `phone_number_id` sale de esa lectura y **nunca del cliente** (ADR-0008 §1.5). El registro corre
     por el caso de uso de alta de canal de ADR-0008, con `viajapro_altas`.
  6. **Antes de construirlo,** `investigador` verifica si las condiciones de Meta permiten que una app
     que no es Tech Provider opere la WABA de un tercero con un token de usuario de sistema de ese
     tercero, y con qué permisos (T-279). Si no lo permiten, el plan B es que cada agencia piloto
     opere con su propia app de Meta, y eso cambia el punto 4.

  El resto del CRM (catálogo, cotizador, contactos, embudo) funciona sin canal.
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
por eso su tarea (T-273) puede empezar antes de que se acepte este ADR.

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
- Captcha y límites por dominio (obligatorios antes de abrir el registro sin código, §3.6).
- Abrir el registro sin código de acceso: otro ADR, con T-281 integrado como precondición.
- Inicio de sesión social, SSO y MFA (ADR-0011).
- Borrar agencias, y la purga de agencias de prueba abandonadas (va a la cola: T-278).
- Recuperación de contraseña por autoservicio: sigue siendo de ADR-0011.
- Más países que el mercado base: el contrato acepta los que el propietario habilite (P4).

### 7. Verificación

| Prueba | Qué sostiene |
|---|---|
| La migración aborta si `viajapro_registro` puede iniciar sesión, saltarse RLS o es superusuario; si conserva `CREATE`; si su superficie efectiva de columnas no es exactamente la de §3.1 (incluidas `codigos_de_acceso_al_registro` y `parametros_del_registro`); si tiene algún privilegio de tabla; si es miembro de algún rol; si un rol vigilado puede actuar como él; si alguien distinto de `viajapro_app` puede ejecutar `crear_agencia` o `codigo_de_acceso_vigente`; si el `proconfig` de alguna de las dos no es exactamente `{search_path=""}`; o si la declaración de `tenants` para `viajapro_app` dejó de ser `{SELECT}` | La superficie, igual que en ADR-0027 §5 |
| `aislamiento.spec.ts` («Registro de agencias»): `crear_agencia` con contexto ya fijado da `42501`; un slug igual al de una agencia existente crea **otra** agencia y la existente queda intacta (mismas filas en `usuarios`, mismo `actualizado_en`); **S1 se cumple por ese mismo camino del slug que choca**; un slug reservado nunca se asigna tal cual; `viajapro_app` sigue con `42501` al hacer `INSERT`/`UPDATE` directo sobre `tenants`; `aceptaciones_de_identidad` y `codigos_de_registro` dan `42501` a los tres roles que no son de identidad; `codigos_de_acceso_al_registro` y `parametros_del_registro` dan `42501` a los cuatro roles de login; `viajapro_app` no puede fijar `perfiles_de_agencia.verificado_en` | Que el registro no puede tocar otra agencia |
| Código de acceso: usado, caducado, de otro correo o inexistente dan `VPR04`; un alta que falla después de consumirlo lo deja sin usar; dos altas simultáneas con el mismo código crean una sola agencia | El uso único (§3.8) |
| e2e: 20 `completar` concurrentes sobre el mismo correo hacen como mucho 3 comparaciones; con el tope de 24 h agotado, ni el código correcto pasa; `completar` con una identidad ya existente da el error genérico; aceptar una invitación sobre una identidad preexistente encola el aviso | El bloqueante 1 (§3.7) |
| e2e (T-276): una solicitud de conexión solo la ve su agencia; sin confirmación de un DUENO no avanza; el `phone_number_id` del cuerpo se ignora | El bloqueante 3 (§5.1) |
| e2e: un alta que falla en la siembra (puerto falso que lanza) no deja fila en `tenants` | La atomicidad |
| e2e: el cuerpo con `tenantId` da 400; la segunda agencia en prueba de la misma identidad da 409; `solicitar` responde igual (estado, cuerpo y tiempo dentro de un margen) para un correo existente y para uno nuevo | El contrato y la no enumeración |
| e2e: con `REGISTRO_AUTOSERVICIO_HABILITADO=false`, las tres rutas dan 404 | El interruptor |

### 8. Plan de implementación por fases

Las tareas están en `roadmap/tasks.yaml`. **Migración** = ruta protegida, la aprueba el propietario.
**Auditoría** = pasa por `auditor-seguridad` antes de integrar.

| Fase | Qué | Tarea | Dueño | Migración | Auditoría |
|---|---|---|---|---|---|
| F0 | Textos versionados: términos, aviso de privacidad de ViajaPro y contrato de encargo | T-267 | propietario + `documentador` | No | Sí (contenido legal) |
| F1 | Rol `viajapro_registro`, `crear_agencia`, `codigo_de_acceso_vigente`, columnas de `tenants`, `perfiles_de_agencia`, `aceptaciones_de_identidad`, `codigos_de_registro`, `codigos_de_acceso_al_registro`, `parametros_del_registro`, `excepciones_rls`, aserciones y cambio de R2 | T-268 | `datos` | **Sí** | **Sí, las vueltas que hagan falta** (aislamiento) |
| F1c | Comandos de plataforma: generar código de acceso, verificar NIT y RNT, cambiar el tope global | T-280 | `backend` | No | **Sí** |
| F1b | Política de precio dentro de `siembra-de-tenant.ts` | T-269 | `datos` | No | No |
| F2 | Rutas `registro/solicitar` y `registro/completar`, con límites, interruptor y aceptaciones | T-270 | `backend` | No | **Sí** |
| F3 | `POST /api/v1/auth/agencias`: transacción de §3.4, puertos de siembra en `crm` y `quoting`, auditoría y outbox | T-271 | `backend` | No | **Sí, las vueltas que hagan falta** (aislamiento) |
| F4 | Web: `/registro`, código, crear agencia, casillas legales | T-272 | `frontend` | No | No (revisión normal) |
| F5 | Primeros pasos calculados en la API, y el asistente leyéndolos | T-273, T-274 | `backend`, `frontend` | No | No |
| F6 | `PoliticaDeUso` y días de prueba visibles | T-275 | `backend` | No | No |
| — | ¿Permite Meta operar WABAs de terceros sin ser Tech Provider? | T-279 | `investigador` | No | No |
| — | Conexión de WhatsApp por la plataforma antes de Tech Provider (§5.1) | T-276 | `whatsapp` | **Sí** (`solicitudes_de_conexion_whatsapp`, token cifrado) | **Sí** |
| Precondición para abrir | Aceptar una invitación sobre una identidad existente exige su ingreso por código; se restablece la credencial de toda identidad nacida por autoservicio | T-281 | `backend` | No | Sí |
| Cola | Endurecimientos de la segunda auditoría (C3-C13) | T-284 a T-291 | varios | Algunos | Algunos |
| — | Embedded Signup en el asistente | T-277 | `whatsapp` | Probable | **Sí** |
| Cola | Purga de agencias de prueba abandonadas | T-278 | `datos` | Sí | Sí |

El orden mínimo para que una agencia se registre sola es F0 → F1 → F1c → F2 → F3 → F4. F5 y F6 pueden ir
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
- **Un rol y dos funciones `SECURITY DEFINER` más**, y **cuatro tablas globales** con su línea en el
  literal de aislamiento. Cada cambio de cuerpo exige auditoría.
- **R2 de `CLAUDE.md` cambia** (ruta protegida): una cláusula para `viajapro_registro`.
- **Cada agencia piloto necesita que alguien de la plataforma genere y entregue un código.** Es
  fricción deliberada mientras dure el piloto. Abrir el registro exige otro ADR.
- **El tope global lo cambia solo la plataforma.** Si un día de lanzamiento se agota, las
  siguientes esperan hasta que alguien lo suba.
- **La identidad y la agencia van en dos transacciones.** Puede quedar una identidad verificada sin
  agencia. Es un estado válido (la web ofrece «crear agencia»), pero hay que contarlo en las
  métricas del embudo.
- **El NIT de una persona natural queda en claro bajo RLS**, no cifrado. Es el mismo dato que la
  agencia imprime en sus facturas. Si `auditor-seguridad` lo considera PII sensible, entra en
  ADR-0015.
- **No hay corte al vencer la prueba.** Una agencia de prueba puede seguir usando el producto hasta
  que alguien actúe a mano.
- **La pantalla de WhatsApp promete una conexión que hoy depende de trabajo que no existe** (T-276)
  y de una respuesta de Meta que no tenemos (T-279). Hasta entonces, el paso solo puede decir
  «solicitud recibida».
- **Mientras dure el piloto, el aviso al atar una invitación a una identidad existente es solo un
  aviso.** Lo que cierra el ataque es que el código de acceso esté atado a un correo. La barrera
  (T-281) es obligatoria antes de abrir el registro sin código.

### Qué habría que cambiar para revertir esto
Apagar `REGISTRO_AUTOSERVICIO_HABILITADO` y, en una migración nueva: `DROP FUNCTION
public.crear_agencia(...)` y `codigo_de_acceso_vigente(...)`, revocar y `DROP ROLE
viajapro_registro`. Las tablas de códigos se pueden vaciar. Las columnas de `tenants`,
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
| P2 | ¿Registro abierto a cualquiera al activarlo, o con código de acceso de la plataforma durante el piloto? | Interruptor apagado hasta tener el despliegue y los textos legales; después, con código de acceso (§3.8). Abrirlo sin código es otro ADR |
| P3 | Términos, aviso de privacidad de ViajaPro y contrato de encargo: ¿quién los redacta y aprueba? | Abogado y propietario (T-093, T-098). Sin ellos, el interruptor no se enciende |
| P4 | ¿Qué países y monedas se ofrecen en el alta? | Solo Colombia/COP al principio; el resto cuando haya normativa verificada |
| P5 | Límites de la prueba | 5 miembros activos, 1 canal, sin IA hasta T-057 |
| P6 | Antes de Tech Provider, ¿conecta la plataforma a mano el número de una agencia real (T-276)? | Sí, para el piloto: es el único camino al primer WhatsApp real |
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
| P6 | Sí: antes de Tech Provider, la plataforma conecta a mano el número de cada agencia piloto (T-276) |
| P7 | Los avisos llegan al correo del propietario, configurado por variable de entorno (nunca escrito en el repositorio) |

El ADR sigue **Propuesto** hasta cerrar la auditoría de seguridad; estas respuestas no lo aceptan por sí solas.

---

> Un ADR aceptado **no se edita jamás.** Si la decisión cambia, se escribe uno nuevo que lo supersede.
