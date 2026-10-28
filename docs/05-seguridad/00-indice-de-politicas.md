# Índice de políticas de seguridad

| Campo | Valor |
|---|---|
| Fecha | 2026-10-27 |
| Mantiene | `auditor-seguridad`; aprueba el propietario |
| Regla | Cada política tiene alcance, reglas, responsable, cómo se comprueba y **estado real hoy**. Lo que no se cumple se dice. Ninguna está aprobada todavía |

**Leyenda de estado.** *Cumple*: la regla tiene mecanismo y prueba en `main`. *Parcial*: hay
mecanismo pero falta prueba, cobertura o despliegue. *No se cumple*: no existe todavía.
*Documento*: el texto está aprobado (A) o es borrador (B).

## Políticas

| # | Política | Doc. | Estado del sistema frente a la política | Lo más grave que falta |
|---|---|---|---|---|
| 05 | [Seguridad de la información](05-politica-de-seguridad-de-la-informacion.md): principios, roles, clasificación | B | **Parcial** | `mensajes.texto` en claro (ADR-0015 sin integrar, PR #29); responsable de seguridad sin nombrar |
| 06 | [Control de accesos, contraseñas, sesiones y MFA](06-control-de-accesos.md) | B | **Parcial**: autenticación de la app cumple; infraestructura sin evidencia | **Sin MFA** para usuarios de agencia; MFA de los paneles no verificado |
| 07 | [Gestión de secretos y claves](07-gestion-de-secretos-y-claves.md) (R6) | B | **Parcial**: CI y repositorio cumplen; producción no verificable | Sin recifrado para rotar `CAMPOS_SENSIBLES_KEY`; nombre de la clave maestra inconsistente entre ADR-0013 y ADR-0015 |
| 08 | [Desarrollo seguro](08-desarrollo-seguro.md): revisión, dependencias, CI, `main`, GitHub Apps | B | **Parcial**: protección de servidor y 8 checks cumplen | ¿CODEOWNERS activo en el servidor? (discrepancia con `.github/proteccion-main.json`); sin escaneo de vulnerabilidades npm |
| 09 | [Respuesta a incidentes y notificación](09-respuesta-a-incidentes.md), con plantilla | B | **No se cumple** (no hay contactos, canal ni simulacro) | Contrato de encargo con contacto por agencia; plazos legales sin validar |
| 10 | [Retención, supresión y respaldo](10-retencion-supresion-y-respaldo.md) (criterio C5) | B | **No se cumple** | Ningún trabajo programado de retención ni servicio de supresión; restauración nunca probada |
| 11 | [Divulgación responsable](11-divulgacion-responsable.md) + [`SECURITY.md`](../../SECURITY.md) | B | **Parcial** | Canal de correo inexistente (sin dominio); reporte privado de GitHub sin verificar |
| 12 | [Uso aceptable para agentes de IA](12-uso-aceptable-agentes-ia.md) | B | **Parcial** | Hooks solo protegen a Claude Code; permisos `node:*` permiten leer `.env` |

## Documentos existentes que estas políticas enlazan

| Documento | Estado |
|---|---|
| [01-modelo-de-amenazas.md](01-modelo-de-amenazas.md) | Vigente, **desactualizado** en D1 (protección de `main`), R10 (`Origin`), R12 (auditoría) y F2 (CSP): T-001, T-003 y T-006 ya están integrados |
| [02-proteccion-de-datos.md](02-proteccion-de-datos.md) | Vigente. Marco Ley 1581, rol de encargado, retención. Pendiente de revisión legal |
| [03-politicas-whatsapp.md](03-politicas-whatsapp.md) | **Marcador**, sin escribir (dueño: `whatsapp`) |
| [04-rbac.md](04-rbac.md) | **Marcador**, sin escribir, aunque los roles por agencia ya existen (ADR-0011) |

## Qué bloquea la primera agencia con datos reales

De todo lo anterior, esto es lo que, según estas políticas, debe estar hecho **antes** de que entre
un dato real. Lo demás va a la cola con dueño.

1. ADR-0015 integrado (PR #29): texto de mensajes y PII sensible cifrados.
2. Contrato de encargo firmado con la agencia, con su contacto para incidentes.
3. Revisión legal de los plazos (retención y notificación a la SIC).
4. Canal privado de divulgación operativo.
5. Discrepancia de CODEOWNERS resuelta.
6. Respaldo de producción configurado y una restauración probada.

## Mantenimiento

- Al cambiar el estado de una regla, se actualiza la sección «Estado real hoy» de su política y la
  fila de este índice en el mismo PR.
- Una política aprobada no se reescribe en silencio: se sube la versión y se anota el cambio en
  `docs/_bitacora/`.
