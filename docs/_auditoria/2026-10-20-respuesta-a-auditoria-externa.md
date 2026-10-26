# Respuesta del equipo de ViajaPro a la auditoría externa (hallazgos, roadmap v2 y dictamen v3)

| Campo | Valor |
|---|---|
| Fecha | 2026-10-20 |
| Estado auditado | `main` en `3a1369a` (v0.38.0) |
| Informe de partida | `docs/_auditoria/2026-10-20-informe-para-auditoria-externa.md` (rama `docs/informe-auditoria-externa`) |
| Documentos recibidos | Hallazgos AUD-001 a AUD-017 (CSV), roadmap técnico v2 y dictamen de conciliación v3 |

## 1. Resumen

Aceptamos los hallazgos abiertos y adoptamos los **cinco criterios de corte para producción** del
roadmap v2. El roadmap presentaba como «problema actual» varios puntos que en la auditoría figuraban
como «riesgo, pendiente de validación», y que el código no confirma. El dictamen v3 ya los rectificó.
Este documento deja constancia de la evidencia y de tres correcciones al script de comprobación del
dictamen v3.

## 2. Puntos del roadmap v2 que el código no confirmaba (rectificados en el v3)

| Punto | Lo que dice el código | Evidencia |
|---|---|---|
| Contexto de tenant por sesión o fuera de `$transaction` | `set_config('app.current_tenant', $tenantId, true)` dentro de `$transaction`, con parámetro vinculado. No hay ningún `SET app.` | `apps/api/src/shared/prisma/prisma.service.ts:100` y `prisma-webhook.service.ts:64` |
| RLS permisiva sin contexto | `NULLIF(current_setting('app.current_tenant', true), '')::uuid`: sin contexto, cero filas | Migración `20261007042518_rls_sin_contexto_cero_filas`, línea 44 |
| El cliente elige la sala o declara el tenant | Las salas las asigna el servidor; el handshake aplica los pasos 3 y 4 del ADR-0011; se revalida cada 60 s; se cierra con `identity.acceso_revocado` | `apps/api/src/modules/inbox/interface/bandeja-en-vivo.gateway.ts:133` |
| `socket.join('tenant:${id}')` | **Rechazado.** Desde v0.37.0 se emite por `usuario:<id>` según la visibilidad (CA1 a CA17) | `docs/01-producto/12-visibilidad-de-conversaciones.md` |
| Guardia de rol por implementar | Ya existe en los tres servicios: aborta ante `rolsuper`, ante `rolbypassrls` o ante un rol inesperado | `prisma.service.ts`, `prisma-webhook.service.ts` y `prisma-identidad.service.ts` |
| Colas y barrido por implementar | `removeOnComplete` y `removeOnFail`, `FOR UPDATE SKIP LOCKED`, `jobId` determinista, barrido cada 30 s con tope en la base y `SET NX` | `cola-de-changes.bullmq.ts:40-41` y `outbox.prisma.ts` |
| Netos e inmutabilidad por implementar | `autorizarMargen()` con 403, enteros y disparadores de inmutabilidad | v0.22.0, v0.24.1, v0.34.0 y v0.34.1 |

## 3. Correcciones al script de comprobación del dictamen v3 (§5)

1. **`SECURITY DEFINER`:** el dictamen exige `search_path=public, pg_temp`. Nuestras funciones usan
   **`search_path` vacío** (`''`), que es más estricto porque obliga a calificar cada objeto. La
   condición correcta: `proconfig` contiene `search_path`, y su valor no incluye ningún esquema
   escribible por roles de aplicación.
2. **Privilegios de `viajapro_identidad`:** el dictamen excluye `session`, `user`, `account` y
   `verification`, los nombres por defecto de Better Auth. Las nuestras son `identidades`,
   `credenciales`, `sesiones`, `verificaciones` y `accesos_identidad`, y **sí** tienen privilegios por
   diseño: CRUD en las cuatro primeras y solo lectura en `accesos_identidad`. La condición correcta:
   `FALSE` en toda tabla que no sea una de esas cinco.
3. **`FORCE ROW LEVEL SECURITY`:** incluir `relkind = 'p'` para las tablas particionadas, como
   `enrutamiento_historial`, además de `relkind = 'r'`.

## 4. ADR-0014: cifrado del texto de los mensajes

Coincidimos con el **Enfoque A** del dictamen v3: cifrar y buscar solo por metadatos. El propietario
lo aceptó el 2026-10-20, y está pendiente de nuestro `auditor-seguridad`. Hay dos precisiones:

- **AAD:** usamos tenant ‖ mensaje ‖ columna, no solo el tenant. Así un texto cifrado tampoco puede
  trasplantarse a otro mensaje de la misma agencia.
- **Alcance:** incluye también **`conversaciones.ultimo_mensaje_texto`**, una segunda copia en claro
  que no figuraba en la auditoría.

Las claves se derivan **por agencia con HKDF** a partir de una clave maestra. **Límite declarado:**
eso **no** permite el *crypto-shredding* por agencia. Mientras exista la clave maestra, las ramas de
Neon y la recuperación a un instante (PITR) conservan criptogramas legibles. Para un borrado
criptográfico real hacen falta claves aleatorias por agencia, envueltas y borrables: queda como un
ADR futuro, ligado a la supresión por Ley 1581 (AUD-002). Nuestro `auditor-seguridad` aceptó el
ADR-0014 con cambios: `info` de HKDF con etiqueta y versión, IV de 96 bits con tope de 2^32 cifrados
por clave, AAD con longitudes prefijadas y la clave solo en la API y en el trabajador.

## 5. Estado de los hallazgos

| ID | Estado |
|---|---|
| AUD-013 y AUD-015 (P0) | **En verificación:** prueba de arranque con roles prohibidos, aserción `relforcerowsecurity` y REG-02 (50 peticiones concurrentes cruzadas con `connection_limit=2`) en el CI |
| AUD-008 | **En verificación:** `has_table_privilege` dinámico sobre todo el esquema, visto en rojo y en verde en el CI |
| AUD-017 | **En verificación:** tope a los fallidos, prueba del 413 y concurrencia acotada |
| AUD-014 | Mutantes `WITH CHECK` existentes (M3, M4 y M9); criterio de cierre: 100 % de los mutantes muertos |
| AUD-016 | **Resuelto** (confirmado en el dictamen v3) |
| AUD-001 | ADR-0014 aceptado por el propietario; pendiente de la auditoría interna y de la implementación |
| AUD-003 | Modelo de amenazas escrito: `docs/05-seguridad/01-modelo-de-amenazas.md` |
| AUD-002, AUD-005, AUD-006 y AUD-007 | Aceptados y planificados. El AUD-002 depende del ADR-0014; el AUD-007 se acota a `enrutamiento_historial` y a las tablas de auditoría |
| AUD-009 | En curso (frontend) |
| AUD-012 | *Blueprint* y workflow hechos; la auditoría interna los aceptó con dos cambios, que están en curso |
| AUD-004 | Aceptado; requiere GitHub Pro o Team para *rulesets* en un repositorio privado (decisión del propietario) |
| AUD-010 | Bloqueado hasta que existan las cuentas de Meta y Postmark |
| AUD-011 | Aceptado; se sincronizará `ESTADO.md` |

## 6. Hallazgos propios, posteriores a la auditoría

Salen de nuestro modelo de amenazas y no tienen control hoy:

- `registros_auditoria` existe, pero nada escribe en ella (R10);
- la comprobación de `Origin` solo existe en `auth` y en el socket, lo que deja un riesgo de CSRF entre
  subdominios del mismo sitio;
- la web no tiene CSP;
- no hay límite de tasa fuera de `auth`;
- las acciones de GitHub no están fijadas por SHA.

Van a nuestra cola con dueño.

## 7. Lo que pedimos para la siguiente pasada

1. Que todo hallazgo que diga «problema actual» cite el archivo y la línea que lo demuestran.
2. Que ejecuten el script de la §5 del v3 con las correcciones de la §3 de este documento, sobre una
   base desechable.
3. Que revisen el ADR-0014 cuando esté integrado.
