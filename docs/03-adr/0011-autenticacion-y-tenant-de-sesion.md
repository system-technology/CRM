# ADR-0011 — Autenticación con Better Auth en la API y el tenant como dato de la sesión

- **Estado:** Propuesto, a la espera del propietario. `auditor-seguridad` lo **aceptó** en la
  segunda vuelta (2026-10-19), con los dos bloqueantes cerrados (la baja en el socket y la
  superficie de `viajapro_identidad`). Aceptarlo exige cambiar R2 de `CLAUDE.md` (roles nuevos).
- **Fecha:** 2026-10-19
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta) y `auditor-seguridad` (dos vueltas). Pendiente: `datos`

---

## Contexto

Hoy `TenantMiddleware` toma el tenant de la cabecera `x-dev-tenant-id`, y solo cuando
`APP_ENV=local`. Fuera de local, todas las peticiones dan 401. Esto deja abiertos dos problemas
(tarea 12 de `ESTADO.md`):

1. **No se puede desplegar.** No hay ninguna forma legítima de que un asesor entre al sistema.
2. **`?incluirMargen=true` no revisa el rol.** Cualquiera que llame ve el neto y el margen. Con la
   cabecera de desarrollo no importa. Con usuarios reales, un asesor vería lo que la agencia le
   oculta a propósito.

Restricciones que vienen de decisiones ya tomadas:

- ADR-0003 §4-5: el tenant se fija con `SET LOCAL` en cada transacción y **sale de la sesión
  verificada**. Nunca del cuerpo, la URL ni una cabecera.
- ADR-0008 §1.2-1.3: una tabla sin `tenant_id` debe estar declarada en `excepciones_rls`, con sus
  privilegios exactos por rol. La frontera real es el rol de conexión, y cada pool verifica al
  arrancar con qué rol entró.
- ADR-0006 / R12: los roles de una agencia son política de negocio. Van en una tabla por tenant,
  nunca en un `enum`. Hoy `usuarios.rol` es el `enum RolUsuario`, así que eso también es deuda.
- R6, R10, Ley 1581: los correos y nombres de los asesores son datos personales. Las contraseñas y
  los tokens de sesión son secretos.
- El esquema actual ya tiene `usuarios(tenant_id, correo, hash_contrasena, rol)`, con
  `@@unique([id, tenantId])`. Ocho o más tablas apuntan a él (asesor asignado, autor de una nota,
  autor de un mensaje, creador de una cotización…). **Esa tabla es cara de tocar.**

Volumen previsto: 50 agencias y 300 usuarios. Los asesores trabajan mucho desde el móvil.

## Opciones consideradas

Precios y capacidades consultados el **2026-10-19** en las fuentes citadas.

### A — Neon Auth (Better Auth gestionado por Neon)
Neon guarda usuarios y sesiones en el esquema `neon_auth` de nuestra propia base.
- **Gana:** incluido en todos los planes; el gratuito llega a 60 000 MAU, así que el costo es **0 USD**
  ([about](https://neon.com/docs/auth/about)). La identidad vive en la misma base.
- **Cuesta:** el plugin *Organization* figura como **parcial**. **No se pueden desplegar web y
  API por separado**, porque la cookie HttpOnly no se comparte entre dominios
  ([roadmap](https://neon.com/docs/auth/roadmap)). No admite hooks ni plugins propios
  ([about](https://neon.com/docs/auth/about)), y sin un hook no hay forma de ligar la sesión al
  tenant activo. El esquema `neon_auth` lo gestiona Neon, fuera de nuestras migraciones y de
  `excepciones_rls`. Tampoco funciona con *IP Allow* ni *Private Networking*.
- **Cierra:** endurecer la red de la base en el futuro, y sumar más dependencia de Neon a la que ya
  fijó ADR-0007.

### B — Better Auth autoalojado dentro del módulo `identity` de NestJS (elegida)
Es la misma biblioteca, montada en `/api/v1/auth/*` (esa ruta ya está en `RUTAS_SIN_TENANT`). Sus
tablas van en nuestro `schema.prisma`, con nombres propios (`modelName` y `fields`).
- **Gana:** **0 USD** en licencias. Tablas, migraciones y privilegios quedan bajo el mecanismo de
  ADR-0008. Trae contraseña, OTP por correo y enlace mágico como plugins, y los hooks permiten
  guardar el tenant activo en la sesión ([organization](https://www.better-auth.com/docs/plugins/organization)).
- **Cuesta:** el equipo opera la autenticación: actualizaciones de seguridad, límites de intentos
  y recuperación de cuenta. Hay que integrarla con NestJS a mano (el parser de cuerpo de esa ruta,
  el adaptador de Prisma con su propio pool).
- **Cierra:** casi nada. Las tablas son nuestras, así que cambiar de biblioteca después sería una
  migración de datos, no una reescritura del modelo.

### C — Proveedor externo (Clerk o Auth0)
- **Gana:** cero operación de criptografía, MFA incluido, paneles listos.
- **Cuesta:** con 50 agencias necesitamos organizaciones con roles propios.
  - **Clerk:** incluye 100 organizaciones. Pero los roles personalizados y más de 20 miembros por
    organización exigen el complemento *Enhanced*: 100 USD/mes, más Pro 25 USD/mes, es decir
    **unos 125 USD/mes** ([pricing](https://clerk.com/pricing)).
  - **Auth0:** el plan gratuito trae solo 5 organizaciones. *B2B Essentials* cuesta **150 USD/mes
    a 500 MAU** ([pricing](https://auth0.com/pricing)).
  En los dos casos la identidad vive fuera de la base: no hay FK desde `usuarios`, hay que
  sincronizar por webhook (otro webhook que hacer idempotente), y los datos personales de los
  asesores quedan en un tercero que hay que declarar como encargado bajo la Ley 1581.
- **Cierra:** la integridad referencial con la identidad. Además, el precio sube con cada
  agencia nueva.

### D — Sesión propia con contraseña y enlace mágico
Lo mismo que B, pero escribiendo nosotros el hash, los tokens, la rotación, los límites de intentos
y la verificación.
- **Gana:** cero dependencias.
- **Cuesta:** semanas de código de seguridad que ya existe probado. Para un equipo pequeño, es la
  opción con más probabilidad de esconder un fallo.
- **Cierra:** nada, pero no gana nada frente a B.

## Decisión

**Opción B: Better Auth autoalojado en `apps/api`, sesión opaca en cookie, y el tenant activo como
columna de la sesión, validada en cada petición bajo RLS.**

A ofrecía lo mismo pero se cae por dos condiciones concretas: no admite web y API en despliegues
separados, y no admite hooks. C cuesta entre 125 y 150 USD/mes y saca la identidad de la base.
Con B, la identidad vive en tablas nuestras y queda sujeta a los mismos privilegios declarados que
el resto del sistema.

### Decisiones subordinadas

1. **Cookie, no JWT.** Usamos una cookie de sesión opaca, `HttpOnly; Secure; SameSite=Lax`, y la
   **valida solo NestJS**, contra la tabla de sesiones, en cada petición. La razón es la
   revocación: si una agencia desactiva a un asesor que se fue, deja de entrar en la petición
   siguiente, no cuando caduque un JWT. Por la misma razón, **`session.cookieCache` de Better Auth
   va desactivado de forma explícita**: con esa caché activa, la sesión se valida contra la cookie
   firmada y no contra la base, y una baja tardaría lo que dure la caché. Next.js no valida nada.
   Su middleware solo redirige a `/ingresar` si falta la cookie, y eso es experiencia de usuario,
   no autorización.
2. **Mismo origen.** Next reescribe `/api/v1/*` hacia la API. Así la cookie es de primera parte
   para el navegador (Safari en iOS bloquea las de terceros), y los Server Components reenvían la
   cabecera `cookie` al llamar a la API.
3. **Multiagencia sí entra en v1, en el modelo.** No cuesta nada si la identidad es global y la
   pertenencia lleva tenant (ver abajo). Mientras nadie pertenezca a dos agencias, el selector de
   agencia en la web puede ser mínimo.
4. **No se usa el plugin *Organization* de Better Auth.** Sus tablas `organization` y `member`
   son globales, y nos obligarían a poner la pertenencia a una agencia fuera de RLS. Nuestra
   pertenencia ya existe: es `usuarios`.
5. **Métodos de acceso:** correo y contraseña desde el primer despliegue. Después, un **código de
   un solo uso por correo** (plugin *Email OTP*) en lugar del enlace mágico. En el móvil, el
   enlace se abre en el navegador interno de la app de correo, que tiene otro almacén de cookies,
   y la sesión no llega a donde el asesor trabaja. El código de seis dígitos se escribe donde uno
   está. Este método depende del adaptador de correo de producción, que no existe todavía.
6. **Un cuarto rol de conexión, `viajapro_identidad`.** Es el único con privilegios sobre las
   tablas globales de identidad. `viajapro_app`, `viajapro_altas` y `viajapro_webhook` no tienen
   **ninguno**, y así se declara en `excepciones_rls`. El adaptador de Better Auth usa un cliente de
   Prisma propio sobre `DATABASE_IDENTIDAD_URL`, y ese pool aborta al arrancar si `current_user` no
   es `viajapro_identidad` (R2). R2 menciona tres roles, así que hay que actualizar la tabla de
   `CLAUDE.md` cuando este ADR se acepte.

   **Superficie exacta de `viajapro_identidad`.**
   - **No entra en el literal `roles_de_aplicacion`** de `aplicar_privilegios_declarados()`
     (migración `20261007140000`). Ese literal recibe `GRANT ... ON ALL TABLES` y los privilegios
     por defecto. Por tanto, `viajapro_identidad` no tiene **ningún privilegio sobre tablas de
     negocio**, ni siquiera sobre `usuarios`, `roles` o `tenants`. El paso 4 del flujo lo hace
     `viajapro_app`.
   - Sus únicos privilegios son las filas que declare `excepciones_rls`: `SELECT, INSERT, UPDATE,
     DELETE` sobre `identidades`, `credenciales`, `sesiones` y `verificaciones`, y solo `SELECT`
     sobre `accesos_identidad`. Ninguna otra cosa.
   - Es un rol de login sin `BYPASSRLS`, así que la vista `roles_de_login_vigilados` lo vigila
     por atributo: las aserciones 8, 9, 10 y 20 de ADR-0008 lo incluyen sin que nadie lo añada.
     **Se agrega una aserción nueva**: `viajapro_identidad` da `42501` sobre una muestra de tablas
     de negocio (`usuarios`, `contactos`, `mensajes`, `cotizaciones`).
   - En su matriz de §1.3 no tiene `EXECUTE` sobre ninguna función.

   **Quién escribe `accesos_identidad`.** Ni `viajapro_app` ni `viajapro_identidad` pueden
   escribirla. La mantiene un trigger `AFTER INSERT OR UPDATE OR DELETE` sobre `usuarios` que
   llama a `sincronizar_acceso_identidad()`. Esa función es `SECURITY DEFINER`, tiene
   `search_path` vacío y su dueño es un rol nuevo, `viajapro_accesos`, que es `NOLOGIN` y no tiene
   `BYPASSRLS` ni pertenece a `neon_superuser`. Solo puede escribir en `accesos_identidad`, y solo
   el par `(NEW.identidad_id, NEW.tenant_id)` de una fila que ya pasó el `WITH CHECK` de RLS, así
   que **no puede registrar un acceso a otro tenant**. Al desactivar o borrar el usuario, borra
   ese par. Así el índice se actualiza en la misma transacción que la pertenencia. La función
   **entra en el inventario de funciones de ADR-0008**, con `EXECUTE` revocado a `PUBLIC` y a todo
   rol de login (un trigger no necesita ese privilegio en quien lo dispara). Queda cubierta por las
   aserciones 12, 13 y 14 (con `viajapro_accesos` como dueño esperado) y por la matriz de la 20,
   con «no» en todas las columnas.

### Por qué la identidad es global y la pertenencia no

- **`identidades`, `sesiones`, `credenciales` y `verificaciones` son globales**, y van declaradas
  en `excepciones_rls`. No pueden llevar tenant: una persona existe antes de elegir agencia, y el
  inicio de sesión ocurre sin `app.current_tenant`. Tienen el riesgo propio de toda tabla global:
  una consulta sin filtro, hecha con el rol equivocado, expondría tokens de sesión de todas las
  agencias. **Por eso solo `viajapro_identidad` las puede tocar**, y el código de negocio, que corre
  con `viajapro_app`, no las ve. Es la misma respuesta que dio ADR-0008 al directorio.
- **La pertenencia a una agencia (`usuarios`) lleva `tenant_id` y RLS forzado**, como hoy. Es dato
  de negocio: en la agencia X, Ana es asesora, tiene un rol y tiene clientes asignados. Las FK que
  ya existen hacia `usuarios(id, tenant_id)` siguen siendo correctas. Rehacer `usuarios` como
  tabla global tocaría ocho o más relaciones y sacaría de RLS justo la tabla que dice quién puede
  ver qué.
- **`accesos_identidad` es global y solo sirve de índice.** El selector de agencia necesita saber
  en qué agencias está una identidad, y bajo RLS esa consulta no se puede hacer. Esta tabla solo
  guarda `(identidad_id, tenant_id)`, sin datos de negocio, y no decide nada: **la comprobación que
  cuenta siempre es la lectura de `usuarios` bajo RLS.** Si las dos tablas se desincronizan, el
  resultado es que se niega el acceso, nunca que se concede de más.

## Modelo de datos mínimo

Los nombres van en `snake_case`. La migración la escribe `datos`.

| Tabla | Alcance | Columnas |
|---|---|---|
| `identidades` | global, solo `viajapro_identidad` | `id uuid`, `correo citext UNIQUE`, `correo_verificado bool`, `nombre`, `creado_en`, `actualizado_en`, `eliminado_en` |
| `credenciales` | global, solo `viajapro_identidad` | `id`, `identidad_id → identidades`, `proveedor` (`credential`), `hash_contrasena` (scrypt, el valor por defecto de Better Auth), fechas |
| `sesiones` | global, solo `viajapro_identidad` | `id`, `identidad_id`, `token UNIQUE`, `expira_en`, **`tenant_activo_id uuid NULL → tenants`**, `ip`, `agente_usuario`, fechas |
| `verificaciones` | global, solo `viajapro_identidad` | `id`, `identificador`, `valor`, `expira_en` (códigos de un solo uso y recuperación) |
| `accesos_identidad` | global, solo `viajapro_identidad` | `identidad_id`, `tenant_id`, PK compuesta |
| `roles` | **tenant, RLS** | `id`, `tenant_id`, `nombre`, `clave NULL` (para los roles sembrados), `permisos text[]` con `CHECK` contra el catálogo cerrado, `UNIQUE (tenant_id, nombre)`, `UNIQUE (id, tenant_id)` |
| `usuarios` (se modifica) | **tenant, RLS** | **+ `identidad_id → identidades`**, `UNIQUE (tenant_id, identidad_id)`. **+ `rol_id`**, con FK compuesta `(rol_id, tenant_id) → roles(id, tenant_id)`. **Se quitan** `rol` (el `enum`) y `hash_contrasena`. `correo` y `nombre` se quedan como copia de presentación |

**El catálogo de permisos es código, no tabla.** Lo que el sistema *sabe hacer* es un invariante.
Cómo lo agrupa cada agencia es política. El catálogo es un `z.enum` en `packages/contracts`, y la
migración lo refleja en el `CHECK`. v1 incluye, como mínimo: `cotizacion.ver_neto_y_margen`,
`usuarios.administrar`, `roles.administrar` y `conversaciones.ver_todas`. Cada agencia recibe tres
roles sembrados: **dueño** (todos los permisos), **asesor** y **operaciones**. La agencia puede
renombrarlos y crear otros.

## Flujo de una petición

1. **Inicio de sesión.** `POST /api/v1/auth/sign-in/email`. Better Auth (pool `viajapro_identidad`)
   verifica la contraseña, crea la fila de `sesiones` y emite la cookie.
2. **Elegir agencia.** Un hook busca en `accesos_identidad`. Si hay una sola agencia, la fija como
   `tenant_activo_id`. Si hay varias, la web muestra el selector, y
   `POST /api/v1/auth/tenant-activo` valida el paso 4 **antes** de escribir el valor.
3. **Cada petición de negocio.** `TenantMiddleware` (sigue siendo middleware, no interceptor) lee
   la cookie y busca la sesión con el pool de identidad. Si falta, o si `tenant_activo_id` es
   nulo, responde 401.
4. **Abre la transacción con `viajapro_app` y ejecuta `SET LOCAL app.current_tenant =
   tenant_activo_id`.** Luego lee `usuarios JOIN roles JOIN tenants WHERE identidad_id = $1 AND
   activo AND eliminado_en IS NULL`, y exige además que la agencia no esté suspendida
   (`tenants.estado`). **RLS garantiza que esa fila pertenece a ese tenant.** Si la consulta
   devuelve cero filas (la identidad no pertenece a esa agencia, la agencia la desactivó o la
   agencia está suspendida), la respuesta es 401 y la sesión se invalida.
5. `ContextoTenant` recibe `tenantId`, `usuarioId` y `permisos: ReadonlySet<Permiso>`.
6. **Autorización.** Un decorador `@RequierePermiso(...)` y un guard. `incluirMargen=true` sin
   `cotizacion.ver_neto_y_margen` responde **403**. Ignorarlo en silencio enseñaría al cliente que
   pedirlo es inocuo.

**La bandeja en vivo (Socket.IO) no pasa por `TenantMiddleware`**, así que repite los pasos por
su cuenta:
- **Al conectar:** se ejecutan los pasos 3 y 4 con la cookie del handshake. Si fallan, se rechaza
  la conexión. Cada socket se une a las salas `tenant:<id>` y `usuario:<id>`, y guarda sus
  permisos.
- **Cada 60 segundos:** se vuelve a ejecutar el paso 4 para cada socket abierto. Si da cero filas
  o la sesión caducó, se desconecta. Si cambió el rol, se actualizan los permisos.
- **Al dar de baja** a un usuario, revocar su sesión o cambiarle el rol, se emite un evento por el
  outbox. El gateway reacciona con `disconnectSockets()` sobre la sala `usuario:<id>`, y el
  adaptador de Redis lleva la orden a todas las réplicas. El intervalo de 60 segundos es el
  respaldo para cuando el evento se pierde, no el mecanismo principal.

**Requisitos de la configuración de Better Auth** (cada uno es una línea):
- `emailAndPassword.disableSignUp: true`. Una identidad nace solo por invitación o por un script
  de plataforma. La invitación responde lo mismo exista o no el correo, en esta o en otra agencia,
  para que nadie pueda averiguar quién trabaja en qué agencia.
- **El token de sesión se guarda hasheado** (SHA-256) y el OTP también (`storeOTP: 'hashed'`).
  Así, aunque alguien lea la tabla, no puede suplantar a nadie. Si Better Auth no permite hashear el
  token de sesión de forma nativa, `backend` lo resuelve en la rebanada 2 y lo lleva al
  `auditor-seguridad` **antes** de integrar.

Lo que se elimina: `x-dev-tenant-id`, `x-dev-usuario-id` y el atajo de `APP_ENV=local`. En local
se entra con las identidades de la semilla, igual que en producción.

## Consecuencias

### Positivas
- El tenant sale de una sola fuente, verificada en el servidor. Una sesión con un
  `tenant_activo_id` manipulado no consigue nada, porque el paso 4 la lee bajo RLS.
- Una baja revoca el acceso a la API en la petición siguiente. En la bandeja en vivo, el acceso
  se corta en cuanto llega el evento, y nunca tarda más de 60 segundos.
- Los roles pasan a ser tabla por tenant, y se elimina el `enum RolUsuario` (R12).
- Ningún costo por agencia, y la identidad tiene FK reales dentro de la misma base.

### Negativas
- **Somos dueños de la seguridad de la autenticación.** Hay que seguir los avisos de seguridad de
  Better Auth. Los límites de intentos tienen que vivir en Redis en producción, porque en memoria no
  sirven con varias réplicas.
- Cada petición hace una consulta más, la de la sesión. Con 300 usuarios no importa. Una caché
  corta va a la cola de `ESTADO.md`, no a v1.
- Habrá un cuarto rol de conexión y un segundo pool en la API. Eso trae más aserciones en
  `aislamiento.spec.ts` y un cambio en R2.
- **La recuperación de contraseña y el código por correo dependen del adaptador de correo de
  producción**, que necesita su propio ADR (CLAUDE.md §10). Hasta que exista, el restablecimiento
  lo hace la plataforma con un script.
- **Ley 1581.** `sesiones` guarda IP y agente de usuario. Se purgan 30 días después de caducar.
  Suprimir una identidad anonimiza sus filas de `usuarios`, pero no las borra, porque el historial
  apunta a ellas. Los inicios de sesión, los fallos, los cambios de agencia y los cambios de rol
  se emiten como eventos al módulo `audit`. `BETTER_AUTH_SECRET` y `DATABASE_IDENTIDAD_URL` viven
  en el gestor de secretos y nunca en el repositorio (R6).
- No hay MFA en v1.

### Qué habría que cambiar para revertir esto
Las tablas son nuestras. Pasar a un proveedor externo sería exportar `identidades` y
`credenciales` (los hashes scrypt no siempre se pueden importar, así que tocaría forzar un
restablecimiento) y cambiar el paso 3 del flujo. Los pasos 4 a 6 y el modelo de roles no cambian.

## Plan de implementación

| # | Rebanada | Dueño | Hecho cuando |
|---|---|---|---|
| 1 | Esquema: las cinco tablas globales, `roles`, la modificación de `usuarios`, el rol `viajapro_identidad` (fuera de `roles_de_aplicacion`), el rol `viajapro_accesos` con su trigger, las filas de `excepciones_rls` (cero privilegios para los otros tres roles) y la semilla con tres roles por agencia | `datos` | La suite de aislamiento en verde con aserciones nuevas: los tres roles de siempre no tienen ningún privilegio sobre las tablas de identidad; `viajapro_identidad` da `42501` sobre las tablas de negocio; la matriz de la 20 incluye `sincronizar_acceso_identidad`; `roles` lleva política `USING` + `WITH CHECK`; el literal de `aislamiento.spec.ts` está actualizado |
| 2 | Módulo `identity`: Better Auth en `/api/v1/auth` (sin `cookieCache`, con `disableSignUp`, token y OTP hasheados), pool de identidad con verificación al arrancar, contraseña, `tenant-activo`, el nuevo `TenantMiddleware`, el guard de permisos, el 403 de `incluirMargen` y la autenticación del socket (handshake, revalidación periódica y desconexión por evento) | `backend` | e2e contra Neon: una sesión con el tenant activo de una agencia ajena da 401; un asesor sin el permiso recibe 403 al pedir el margen; un usuario desactivado, o de una agencia suspendida, da 401 en la petición siguiente; **un socket abierto de un usuario dado de baja se cierra** |
| 3 | Web: `/ingresar`, la reescritura `/api/v1/*`, el selector de agencia, quitar las cabeceras de desarrollo y ocultar neto y margen sin permiso | `frontend` / Antigravity | Verificado en un navegador real, también en el móvil |
| 4 | Administración: el dueño invita asesores, asigna roles y edita permisos. Después, el código por correo, cuando exista el adaptador de correo | `backend` + `frontend` | **No bloquea el primer despliegue.** La agencia piloto se da de alta por script |

Las rebanadas 1 a 3 cierran la tarea 12 y desbloquean el despliegue.

## Cola (no bloquea; va a `ESTADO.md` con dueño)

| Pendiente | Dueño |
|---|---|
| El límite de intentos detrás del proxy: confiar solo en la cabecera de IP del balanceador propio. Fijar también `trustedOrigins` por entorno | `backend`, `devops` |
| `RUTAS_SIN_TENANT` excluye todo el prefijo `/api/v1/auth/`, que es muy amplio. Hay que reducirlo a las rutas de Better Auth y comprobar que `tenant-activo` hace el paso 4 por su cuenta | `backend` |
| Ley 1581: un aviso de privacidad para los asesores, sobre qué datos suyos se guardan, por qué y cuánto tiempo | `auditor-seguridad`, `documentador` |
| Ley 1581: el procedimiento para suprimir una identidad, que cubra también sus filas de `accesos_identidad` y sus sesiones | `datos`, `backend` |
| Una aserción sobre `pg_auth_members` que compruebe que ningún rol de login es miembro de `viajapro_accesos`. **Entra en la rebanada 1** | `datos` |
| El disparador de `accesos_identidad`, en `UPDATE`: si cambia `identidad_id` o `tenant_id`, borra el par `OLD`. **Entra en la rebanada 1**, con su aserción | `datos` |
| La revalidación del socket cada 60 s repite **también el paso 3** (la sesión existe y no está revocada), no solo el 4. Si no, una sesión revocada cuyo evento se perdió sigue viva. **Entra en la rebanada 2** | `backend` |

## Cuándo revisar esta decisión

- Una agencia exige SSO corporativo (SAML) o MFA obligatorio antes de que lo construyamos.
  Entonces hay que reevaluar C.
- Aparece un aviso de seguridad grave de Better Auth sin parche en un plazo razonable.
- Neon Auth admite hooks y despliegues separados. Entonces A vuelve a ser candidata para dejar de
  operar la autenticación nosotros.
- Más de 5 000 usuarios activos, o una latencia de sesión que se note. Entonces toca la caché de
  sesión.
