# Roadmap v2

| Campo | Valor |
|---|---|
| Versión | 2, adoptada el 2026-10-20 |
| Origen | Roadmap técnico v2 de la auditoría externa, **con las correcciones del equipo** |
| Aprobación | Propietario, 2026-10-20: «si avanza con lo que propones» |
| Estado auditado | `main` en `3a1369a` (v0.38.0) |
| Evidencia | `docs/_auditoria/2026-10-20-respuesta-a-auditoria-externa.md` |
| Sustituye a | El roadmap por fases del 2026-10-07. Sus fases de producto siguen aquí, en la §5 |

> **Cómo se lee.** Las semanas son relativas a la adopción (la semana 1 es la que empieza el
> 2026-10-20). No hay fechas absolutas: las que dependen de terceros (Meta, Postmark, GitHub) no
> las controlamos. **Terminado significa integrado en `main`**; lo que está en una rama se marca
> como «en rama».
>
> El orden dentro de cada hito es el orden de la cola. La fuente de verdad del estado sigue siendo
> `ESTADO.md`; si este documento y `ESTADO.md` discrepan, gana `ESTADO.md` y aquí se corrige.

---

## 1. Correcciones al roadmap externo

El roadmap v2 externo describía como «por implementar» varias cosas que el código ya resuelve. El
dictamen v3 de la auditoría ya lo rectificó. Lo que cambia respecto del texto externo:

| Punto del externo | Corrección | Por qué |
|---|---|---|
| `socket.join('tenant:${id}')` | **Rechazado.** Se mantiene `usuario:<id>` con la visibilidad | Una sala por agencia entrega a cada asesor conversaciones que no le tocan. CA1 a CA17 de `docs/01-producto/12-visibilidad-de-conversaciones.md` |
| Parámetro de contexto | Se llama **`app.current_tenant`** | `set_config('app.current_tenant', $tenantId, true)` en `apps/api/src/shared/prisma/prisma.service.ts:100` |
| `preDeployCommand` para migraciones | **Rechazado.** Las migraciones corren desde **GitHub Actions** | ADR-0013: el rol que migra no vive en el servicio que atiende tráfico |
| Particiones automáticas de `mensajes` | Aplica a **`enrutamiento_historial`**, no a `mensajes` | Particionar `mensajes` por fecha mete la fecha en la unique de `wamid` y el mismo reintento de Meta entraría dos veces (rompe R5) |
| Guardia de rol, contexto transaccional, colas, socket, netos e inmutabilidad «por hacer» | **Hechos** en el código; falta la prueba donde se indica | Tabla de la §2 de la respuesta a la auditoría |

---

## 2. Definition of Ready for Production

Los cinco criterios de corte. **Ninguna agencia real pone datos de viajeros en producción hasta que
los cinco estén en verde y comprobados en el CI o en staging.** No se negocian con calendario: si
uno no se cumple, se recorta alcance.

| # | Criterio | Cómo se comprueba | Hitos que lo cierran | Estado |
|---|---|---|---|---|
| C1 | **100 % de los mutantes muertos**, en `USING` y en `WITH CHECK` | La suite de mutantes de RLS en el CI informa 0 supervivientes | M1.3, AUD-014 | Mutantes `WITH CHECK` existen (M3, M4 y M9); falta el 100 % |
| C2 | **Cero PII en claro**, comprobado con `$queryRaw` | Una prueba lee `mensajes.texto` y `conversaciones.ultimo_mensaje_texto` crudos y no encuentra texto legible | M1.4 | Abierto: depende del ADR-0014 |
| C3 | **Meta y Postmark reales en staging** | Un mensaje real entra por el webhook de Meta y un correo real sale por Postmark, en staging | M2.1, M2.2, M5.1 | Bloqueado por las cuentas (propietario) |
| C4 | **Protección de `main` activa** | Un `push` directo a `main` es rechazado por GitHub | M1.1 | Bloqueado por el plan de GitHub (propietario) |
| C5 | **Supresión operativa** en la base, las colas y la caché | Una solicitud de supresión deja cero rastros del titular en Postgres, BullMQ y Redis, verificado por prueba | M4.3, M2.4 | Abierto: depende del ADR-0014 |

---

## 3. Hitos técnicos

Columnas: **Hecho** lleva su versión o rama; **Queda** es lo único que falta para cerrarlo.

### M1 — Cimientos · semanas 1 y 2

**Objetivo:** que ningún defecto de código pueda volverse una fuga entre agencias, y que nada entre
en `main` sin compuerta.

| # | Qué | Hecho, con evidencia | Queda | Dueño | Depende de |
|---|---|---|---|---|---|
| M1.1 | Protección de `main` (AUD-004) | Compuerta por agente `integrador` (R11, ADR-0005) | *Rulesets* en GitHub: exige **GitHub Pro o Team** para un repositorio privado | **Propietario** (plan), luego `devops` | Decisión de pago del propietario |
| M1.2 | Guardia de rol en el arranque (AUD-013) | **Hecho en el código:** aborta ante `rolsuper`, `rolbypassrls` o rol inesperado en `prisma.service.ts`, `prisma-webhook.service.ts` y `prisma-identidad.service.ts` | La prueba de arranque con roles prohibidos y la aserción `relforcerowsecurity` en el CI (en curso) | `qa` | — |
| M1.3 | Contexto transaccional con 50 peticiones concurrentes (AUD-015, AUD-008) | **Hecho en el código:** `set_config('app.current_tenant', …, true)` dentro de `$transaction` (`prisma.service.ts:100`, `prisma-webhook.service.ts:64`); sin contexto, cero filas (migración `20261007042518_rls_sin_contexto_cero_filas`) | **REG-02** en el CI: 50 peticiones cruzadas con `connection_limit=2` (en curso). `has_table_privilege` dinámico visto en rojo y en verde. Mutantes al 100 % (C1) | `qa`, `datos` | — |
| M1.4 | Cifrado del texto de los mensajes (AUD-001) | ADR-0014 **aceptado por el propietario** (Enfoque A: AES-256-GCM, clave por agencia con HKDF, AAD tenant ‖ mensaje ‖ columna) | Auditoría de `auditor-seguridad` del ADR; migración que cifra `mensajes.texto` y `conversaciones.ultimo_mensaje_texto`; quitar la búsqueda por cuerpo; prueba `$queryRaw` (C2) | `auditor-seguridad`, luego `datos` y `backend` | ADR-0014 auditado |
| M1.5 | **Propio.** Acciones de GitHub fijadas por SHA | — | Fijar cada `uses:` a un SHA completo y añadir Dependabot para actualizarlas | `devops` | — |
| M1.6 | **Propio.** Comprobación de `Origin` en toda ruta que cambia estado | Existe en `auth` y en el socket | Extenderla al resto de mutaciones de la API: hoy hay riesgo de CSRF entre subdominios del mismo sitio | `backend` | — |

**Por qué M1.5 y M1.6 van aquí:** una acción de terceros sin fijar corre con los secretos del CI
—incluido, con el ADR-0013, el que migra la base—, y el CSRF es una mutación hecha con la sesión de
otro. Las dos son baratas y cierran caminos de ataque que existen hoy.

**Criterio de salida:** C1 y C4 en verde; M1.4 integrado o, como mínimo, con su migración en
revisión.

---

### M2 — Núcleo asíncrono e integraciones · semanas 3 y 4

**Objetivo:** que los efectos externos sean reales en staging, y que lo que la API expone al mundo
aguante abuso.

| # | Qué | Hecho, con evidencia | Queda | Dueño | Depende de |
|---|---|---|---|---|---|
| M2.1 | Meta real en staging (AUD-010) | Webhook con firma HMAC, idempotencia y relay por `change` (v0.21.0); número de prueba como entorno de desarrollo | Conectar la app de Meta al webhook de staging y ver entrar un mensaje real (C3) | `whatsapp` | **Cuenta de Meta** (propietario), M2.5 y M5.1 |
| M2.2 | Postmark real (AUD-010) | Adaptador en `feat/notifications-postmark`, ADR-0012 | Cuenta, dominio verificado (SPF/DKIM) y un correo real enviado desde staging (C3) | `backend` | **Cuenta de Postmark y DNS** (propietario) y M5.1 |
| M2.3 | Colas y barrido (AUD-017) | **Hecho:** `removeOnComplete`/`removeOnFail`, `FOR UPDATE SKIP LOCKED`, `jobId` determinista y barrido cada 30 s con tope en la base y `SET NX` (`cola-de-changes.bullmq.ts:40-41`, `outbox.prisma.ts`) | Tope a los fallidos, prueba del 413 y concurrencia acotada (en verificación) | `backend`, `qa` | — |
| M2.4 | Purga del directorio | — | Purga de las entradas del directorio de números que ya no enrutan a ninguna agencia. Es parte de C5 | `datos` | M2.3 |
| M2.5 | **Propio.** Límite de tasa fuera de `auth` | Existe solo en `auth` | Límite por IP en el webhook y por sesión en la API, antes de exponer el webhook a Meta real | `backend` | — |
| M2.6 | **Propio.** Escritores de `registros_auditoria` (R10) | La tabla existe | Escribir en ella cada acceso a PII y cada cambio de permisos, con una prueba que lo compruebe. Necesario para la supresión (M4.3) y para los documentos de viajeros (§5) | `backend`, `datos` | — |
| M2.7 | **Propio.** CSP en la web | — | `Content-Security-Policy` estricta en `apps/web`, probada en el navegador sin romper la bandeja | `frontend` | — |

**Por qué estos tres van a M2 y no a M1:** ninguno es una fuga entre agencias hoy. El límite de
tasa importa cuando el webhook sea público (M2.1); la auditoría, cuando haya PII real de viajeros;
la CSP, cuando la web tenga sesión en un navegador ajeno (M3.1). Los tres tienen que estar antes de
que ocurra eso.

**Criterio de salida:** C3 en verde, o bloqueado solo por las cuentas del propietario.

---

### M3 — Frontend y tiempo real · semanas 5 y 6

| # | Qué | Hecho, con evidencia | Queda | Dueño | Depende de |
|---|---|---|---|---|---|
| M3.1 | La web con Better Auth (AUD-009) | ADR-0011 aceptado; rebanadas 1 (v0.33.0), 2 (v0.34.0) y 4 (v0.35.0) integradas | Rebanada 3: pantalla de ingreso y selector de agencia. Quitar la cabecera de tenant de desarrollo | Antigravity (`frontend`) | M1.6, M2.7 |
| M3.2 | Socket seguro | **Hecho en la API:** salas asignadas por el servidor, handshake con los pasos 3 y 4 del ADR-0011, revalidación cada 60 s, cierre con `identity.acceso_revocado`, emisión por `usuario:<id>` (v0.37.0; `bandeja-en-vivo.gateway.ts:133`) | Conectar la web al socket con la cookie de sesión | `frontend` | M3.1 |
| M3.3 | Bandeja reactiva | Bandeja web integrada (v0.24.0 a v0.28.0) | Actualización en vivo sin recargar; ventana de 24 h visible y aplicada | `frontend` | M3.2 |

**Criterio de salida:** un asesor entra con su usuario, ve solo sus conversaciones y la cola común, y
un mensaje nuevo aparece sin recargar.

---

### M4 — Finanzas y Ley 1581 · semanas 7 y 8

| # | Qué | Hecho, con evidencia | Queda | Dueño | Depende de |
|---|---|---|---|---|---|
| M4.1 | Ocultar netos | **Hecho:** `autorizarMargen()` con 403 y dinero en enteros (v0.22.0, v0.24.1, v0.34.0) | — | — | — |
| M4.2 | Inmutabilidad de las cotizaciones | **Hecho:** disparadores de inmutabilidad (v0.34.1); el servidor recalcula y no guarda los importes del cliente (v0.23.0) | — | — | — |
| M4.3 | Servicio de supresión (AUD-002) y purga de payloads crudos a los 15 días | — | Supresión de un titular en base, colas y caché; *crypto-shredding* de una agencia entera; purga programada de los payloads crudos del webhook a los 15 días (C5) | `backend`, `datos` | M1.4, M2.4, M2.6 |

---

### M5 — Despliegue · semanas 9 y 10

| # | Qué | Hecho, con evidencia | Queda | Dueño | Depende de |
|---|---|---|---|---|---|
| M5.1 | `render.yaml` segregado (AUD-012) | *Blueprint* y workflow **en rama** `ci/despliegue-staging-render`; la auditoría interna lo aceptó con dos cambios | Los dos cambios y la integración. Migraciones desde GitHub Actions, no con `preDeployCommand`. Solo staging (ADR-0013) | `devops` | **Cuenta de Render** (propietario). **Se adelanta a M2**, porque M2.1 y M2.2 lo necesitan |
| M5.2 | Particiones automáticas de `enrutamiento_historial` (AUD-007) | Tabla ya particionada | Creación automática de las particiones futuras y retiro de las viejas; incluir las tablas de auditoría | `datos` | — |
| M5.3 | Prueba de carga con 500 webhooks | — | 500 webhooks en ráfaga en staging sin duplicados ni pérdidas, con la latencia medida | `qa` | M2.1, M5.1 |

---

### M6 — Beta · semanas 11 y 12

| # | Qué | Hecho, con evidencia | Queda | Dueño | Depende de |
|---|---|---|---|---|---|
| M6.1 | Compuertas de liberación | Siete compuertas del `integrador` para `main` (ADR-0005) | Compuerta de producción: los cinco criterios de la §2 comprobados de forma automática | `integrador`, `devops` | C1 a C5 |
| M6.2 | De 2 a 3 agencias piloto | Hay una agencia piloto desde el 2026-10-07 | Conseguir una o dos más; operar dos semanas sin volver al celular | **Propietario** | M6.1 |
| M6.3 | Observabilidad sin PII | — | Trazas, logs estructurados y errores sin texto de mensajes ni datos de viajeros, con una prueba que lo compruebe | `devops` | M1.4 |

**Criterio de salida de la beta:** la agencia piloto opera **todo** su WhatsApp aquí durante dos
semanas. Es la prueba que el roadmap anterior pedía a la Fase 1, y sigue siendo la que importa.

---

## 4. Lo que solo puede hacer el propietario

| Qué | Bloquea | Cuándo hace falta |
|---|---|---|
| Plan GitHub Pro o Team | M1.1 y C4 | Semana 1 |
| Cuenta de Render para staging | M5.1, y con ella M2.1 y M2.2 | Semana 3 |
| Cuenta de Meta (app y número de prueba) y verificación de Meta Business | M2.1, C3 y lanzar con clientes reales | Semana 3; la verificación tarda semanas, **hay que arrancarla ya** |
| Cuenta de Postmark y acceso al DNS del dominio | M2.2 y C3 | Semana 3 |
| Agencias piloto adicionales | M6.2 | Semana 11 |
| Tarifario real del piloto y tarifa de Meta en COP | La §5 y el precio de entrada | Ya |
| Pasarela de pagos | Reservas y pagos (§5) | Antes de empezar esa fase |

---

## 5. Producto: lo que el roadmap técnico no cubre

El roadmap v2 externo es de cimientos y seguridad. **No sustituye el alcance de producto de v1**
—inbox + pipeline, cotizador, reservas y pagos, automatización e IA—, que se mantiene. Se
construye en paralelo donde no compite con los hitos, y después de la beta lo que dependa de ella.

| Fase | Estado | Encaje con los hitos |
|---|---|---|
| **Inbox con WhatsApp** | Webhook, bandeja web y visibilidad hechos | Lo cierran M2.1 y M3 |
| **CRM y pipeline** | Esquema y API en ramas `feat/crm-*` | En paralelo con M3; es lo que hace vendible el producto |
| **Cotizador** | De punta a punta en `main`; guardado, versiones y estados hechos | Falta el PDF con la marca y el envío por WhatsApp; en paralelo con M3 y M4 |
| **Reservas y pagos** | Sin empezar | **Después de M4.** Los documentos del viajero exigen M1.4 y M2.6 (R10). Pagos idempotentes por cola (R5). Pasarela pendiente de decisión del propietario |
| **Automatización e IA** | Sin empezar | **Después de la beta.** Extracción de intención primero. Con el ADR-0014, la IA lee el texto descifrado solo en el trabajador, nunca en claro desde la base |
| **Analítica y escala** | Sin empezar | Después de la beta. El particionado es de `enrutamiento_historial` y de auditoría, no de `mensajes` (ver §1) |

Los criterios de salida de cada fase del roadmap anterior siguen vigentes. Por ejemplo, el del
cotizador: de conversación a propuesta enviada en menos de cinco minutos, cronometrado con un caso
real.

---

## 6. Fuera de v1

| Fuera | Por qué | Cuándo |
|---|---|---|
| Integración con GDS (Amadeus, Sabre) | Contratos, certificación y complejidad desproporcionados | v2 |
| Contabilidad y facturación electrónica | No competimos con el ERP de la agencia: integramos | v2, vía API |
| App móvil nativa | La web responsive cubre el caso | v2 |
| Instagram, Messenger, correo en el inbox | WhatsApp es el 90 % del volumen real | v1.5 |
| Búsqueda por el cuerpo de los mensajes | Desaparece con el ADR-0014: se busca por contacto, teléfono, fecha, estado y cotización | Se reconsidera solo con un ADR que la haga sin texto en claro |
| Marca blanca completa | Solo PDF y color de acento en v1 | Plan enterprise |
| Portal del viajero | Interesante, no urgente | v2 |
| Turismo corporativo | Otro producto, otro comprador | v3 |
| Producción con clientes reales | Solo staging hasta cumplir la §2 (ADR-0013) | Cuando C1 a C5 estén en verde |
