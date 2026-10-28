# Política de seguridad de la información

| Campo | Valor |
|---|---|
| Versión | 0.1, borrador |
| Fecha | 2026-10-27 |
| Estado | **Pendiente de aprobación del propietario.** Hasta entonces describe una intención, no una obligación |
| Responsable del documento | `auditor-seguridad` (contenido); el propietario (aprobación) |
| Revisión | Cada 6 meses, o antes si cambia la forma del sistema (ADR nuevo) o hay un incidente |

> Esta política es el paraguas. Las políticas específicas están en el
> [índice](00-indice-de-politicas.md). No repite lo que ya dicen
> [02-proteccion-de-datos.md](02-proteccion-de-datos.md) (marco legal y derechos del titular) ni el
> [modelo de amenazas](01-modelo-de-amenazas.md) (controles por superficie): los enlaza.

## 1. Alcance

Todo lo que trata datos de las agencias o de sus viajeros, o que puede cambiar lo que llega a
producción: el código del repositorio público `system-technology/CRM`, la base en Neon, Redis, los
servicios de Render, los proveedores (Meta, Postmark), las cuentas de GitHub y las personas y
agentes de IA que trabajan en el proyecto.

## 2. Principios

| # | Principio | Dónde se concreta |
|---|---|---|
| P1 | **El aislamiento entre agencias es la propiedad número uno.** No depende de que alguien recuerde filtrar por `tenant_id` | R1, R2; ADR-0003, ADR-0008, ADR-0011 |
| P2 | **Defensa en profundidad.** Un fallo en una capa (un `WHERE` olvidado, una credencial filtrada) no se convierte en brecha | RLS forzada + roles sin `BYPASSRLS` + cifrado de aplicación (ADR-0015) |
| P3 | **Mínimo privilegio.** Cada proceso, persona y agente recibe solo lo que usa | Matriz de secretos por proceso (ADR-0013 §4); roles por agencia (ADR-0011) |
| P4 | **Minimización.** No se pide ni se guarda un dato sin finalidad; lo que no hace falta se purga | [02-proteccion-de-datos.md §4](02-proteccion-de-datos.md) |
| P5 | **Verificable o no existe.** Un control sin prueba automatizada o comando de comprobación se declara «parcial» | Columna «Prueba» del modelo de amenazas |
| P6 | **Honestidad del estado.** Ningún documento afirma lo que el sistema no hace | Cada política tiene su sección «Estado real hoy» |

## 3. Roles y responsabilidades

ViajaPro es hoy **una persona (el propietario) y agentes de IA**. Los roles existen aunque los
ocupe la misma persona; separarlos sirve para que nadie se apruebe a sí mismo.

| Rol | Quién hoy | Responde de |
|---|---|---|
| Propietario | La persona dueña del repositorio y de las cuentas | Aprobar políticas y ADR; custodiar secretos de producción; notificar a la SIC y a las agencias; aceptar riesgos |
| Responsable de seguridad | **Sin asignar a una persona.** De forma provisional, el propietario, asistido por `auditor-seguridad` | Mantener estas políticas, coordinar incidentes, revisar cambios que tocan datos de agencias |
| Agentes de IA de desarrollo | Agentes de `.claude/agents/`, Antigravity | Cumplir la [política de uso aceptable](12-uso-aceptable-agentes-ia.md) |
| `integrador` / auto-merge | GitHub App `viajapro-integradora` | Que en `main` solo entre lo que pasa las compuertas (R11) |
| Agencia (cliente) | Cada tenant | Es **responsable del tratamiento** de los datos de sus viajeros; ViajaPro es **encargado** ([02-proteccion-de-datos.md §2](02-proteccion-de-datos.md)) |
| Usuario de agencia (dueño, asesor, operaciones) | Personas de la agencia | Custodiar su contraseña; no compartir sesión |

## 4. Clasificación de datos

Cuatro niveles. El nivel decide el tratamiento mínimo, no al revés.

| Nivel | Qué incluye | Tratamiento mínimo |
|---|---|---|
| **N4 — Secreto** | Claves de cifrado (`CAMPOS_SENSIBLES_KEY`, `WEBHOOK_PAYLOAD_KEY`, `CORREO_PAYLOAD_KEY`, pimienta), `BETTER_AUTH_SECRET`, `META_APP_SECRET`, tokens de WhatsApp de las agencias, cadenas de conexión, claves de las GitHub Apps | Solo en el gestor de secretos o el entorno del proceso que lo lee. Nunca en el repositorio, logs, chat, tickets ni Redis. Ver [07-gestion-de-secretos-y-claves.md](07-gestion-de-secretos-y-claves.md) |
| **N3 — Sensible** | PII sensible del viajero (documento, fecha de nacimiento, salud, menores), texto de los mensajes, notas internas, preferencias; neto y margen de la agencia | Cifrado de aplicación (ADR-0015), lectura auditada (R10), nunca en logs ni fuera de producción |
| **N2 — Confidencial** | PII ordinaria (nombre, teléfono, correo de viajeros y asesores), cotizaciones, catálogo propio de cada agencia, IP y agente de usuario de sesiones | RLS por agencia, TLS en tránsito, nunca fuera de producción |
| **N1 — Público** | El código del repositorio, la documentación de `docs/`, el catálogo sembrado de demostración | Puede publicarse. **Ojo:** el repositorio es público, así que todo lo que se escribe en él es N1 por definición |

**Regla derivada.** Fuera de producción solo existen datos N1 o sintéticos. Ningún dato N2 o N3
real en local, CI, staging ni en una rama de Neon que no sea `production`.

## 5. Cómo se comprueba

- Cada política del índice declara su propio «cómo se comprueba».
- La propiedad P1 la comprueba en cada PR el job obligatorio `aislamiento-tenants`
  (`packages/database/tests/aislamiento.spec.ts`).
- La regla N4 la comprueban el job obligatorio `secretos` (gitleaks sobre todo el historial) y el
  hook local `.claude/hooks/guard-secretos.mjs`.

## 6. Estado real hoy (2026-10-27)

| Qué | Estado |
|---|---|
| Principios P1, P2, P3, P5 | **Se cumplen en el código integrado** para la base y la API (ver modelo de amenazas) |
| P2 para el texto de los mensajes | **No se cumple todavía:** la implementación de ADR-0015 está en el PR #29, sin integrar. `mensajes.texto` sigue en claro en `main` |
| Responsable de seguridad nombrado | **No.** Lo asume el propietario de forma provisional |
| Clasificación aplicada a los datos reales | No aplica: **no hay datos reales** todavía (ninguna agencia en producción) |
| Política aprobada | **No.** Borrador |
| Revisión legal de la Ley 1581 | **Pendiente** ([02-proteccion-de-datos.md §7](02-proteccion-de-datos.md)) |
