# Ruta de seguridad y privacidad

| | |
|---|---|
| Fecha | 2026-10-28 |
| Origen | Auditoría de ciberseguridad del 2026-10-28 (tareas T-082 a T-092), políticas de `docs/05-seguridad/` (PR #105) y obligaciones de la Ley 1581 de 2012 |
| Relación | Complementa `01-roadmap.md` (criterios C1–C5) y `04-ruta-al-entregable-fase-1.md`. Manda `roadmap/tasks.yaml` |
| Aviso | Las referencias legales son orientativas y **no sustituyen la revisión de un abogado** colombiano |

## Punto de partida

La auditoría no encontró fugas entre agencias. Lo abierto es: permisos finos por ruta, PII en claro
(mensajes, preferencias), ausencia de derechos del titular, cadena de suministro (acciones sin fijar,
dependencias npm sin vigilancia), un rol de agente con acceso amplio a la base y **cero manejo de
privacidad de cara al usuario** (sin aviso, sin política de cookies, sin consentimiento registrado en
la web).

## Cookies hoy

Las cookies que usa el producto son de sesión y protección CSRF, **estrictamente necesarias**: no
requieren consentimiento, pero sí **informar** (inventario y política, T-094). No hay analítica ni
terceros en la web; el día que se agreguen, el banner (T-095) debe bloquearlos hasta que el usuario
acepte. Regla: nada no esencial se carga antes del consentimiento.

## Fases

### S0. Antes de cualquier agencia real (bloquea el piloto con datos reales)

| Qué | Tarea | Quién |
|---|---|---|
| Aprobar las políticas y `SECURITY.md` | PR #105 | propietario |
| Aviso de privacidad y política de tratamiento; páginas `/privacidad` y `/terminos` | T-093 | propietario + abogado |
| ADR de PII (cifrado o tokenización en mensajes y preferencias, supresión, retención) | T-090 | arquitecto + propietario |
| Derechos del titular: exportar y suprimir (cierra C5) | T-097 | backend + datos |
| Cifrado de campos sensibles integrado (PR #29) | ADR-0015 | propietario decide |
| Verificar la protección de `main` y corregir su copia en `.github/` | T-083 | propietario |

### S1. Hardening técnico (sin esperar a nadie, salvo rutas protegidas)

| Qué | Tarea | Notas |
|---|---|---|
| Permisos de mutación y rol `SOLO_LECTURA` | T-089 | backend |
| Fijar acciones por SHA, `persist-credentials: false`, `npm ci --ignore-scripts` | T-085 | toca `.github/`: propietario |
| Verificar SHA de Dependabot #11 a #13 | T-086 | toca `.github/` |
| Dependabot npm y `pnpm audit` | T-087 | toca `.github/` |
| Rol de solo lectura para el MCP `postgres` y versiones fijas | T-084 | migración: propietario |
| Prueba de humo de `req.ip` tras el rewrite de Next | T-088 | staging |
| `ParseUUIDPipe`, token de invitación en fragmento, HSTS y Permissions-Policy | T-091, T-092 | bajo riesgo |

### S2. Privacidad de cara al usuario

| Qué | Tarea | Criterio de salida |
|---|---|---|
| Inventario de cookies y política de cookies | T-094 | Cada cookie con finalidad, duración y categoría; enlace en el pie |
| Banner de consentimiento (aceptar, rechazar, configurar) y registro | T-095 | Nada no esencial carga antes de aceptar; cambio posible después |
| Consentimiento del viajero en WhatsApp, con revocación | T-096 | Revocar detiene los envíos de esa finalidad |
| Mínima exposición de PII en logs, auditoría y pantallas | T-099 | Prueba de que no hay teléfono completo ni documentos en logs |

### S3. Cumplimiento y operación

| Qué | Tarea | Notas |
|---|---|---|
| Registro Nacional de Bases de Datos y contrato de encargo con cada agencia | T-098 | abogado: confirmar si aplica y plazos |
| Respuesta a incidentes ensayada una vez | `docs/05-seguridad/09-*` (#105) | simulacro con plantilla |
| Respaldos y supresión en copias (PITR de Neon) | política de retención (#105) | decisión del propietario |

## Orden recomendado

1. **Esta semana:** aprobar #105; arrancar T-093 con un abogado; T-089, T-091, T-092 y T-094 (no dependen de nadie).
2. **Antes del piloto con datos reales:** T-090 y T-097 más el cifrado (#29); T-095 y T-096.
3. **Antes de producción abierta:** S1 completa, T-098 y el simulacro de incidente.

Regla de recorte (R13): una pasada por tarea; en aislamiento entre agencias y en PII no se recorta.
