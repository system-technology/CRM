# Retención, supresión y respaldo de datos

| Campo | Valor |
|---|---|
| Versión | 0.1, borrador |
| Fecha | 2026-10-27 |
| Estado | **Pendiente de aprobación del propietario y de revisión legal** (plazos de retención) |
| Responsable | `datos` y `backend` (implementación), propietario (respaldos y aceptación de plazos), `auditor-seguridad` (revisión) |
| Criterio de salida | **C5** del [roadmap](../08-roadmap/01-roadmap.md): una solicitud de supresión deja cero rastros del titular en Postgres, BullMQ y Redis, verificado por prueba. Tareas M2.4 y M4.3 |
| Desarrolla | La tabla de retención de [02-proteccion-de-datos.md §4](02-proteccion-de-datos.md). **Los plazos de ahí mandan**; aquí no se repiten, se hacen operables |

## 1. Alcance

Todo dato de agencias, viajeros y asesores en: PostgreSQL (Neon, incluidas ramas y PITR), Redis
(BullMQ y pub/sub), S3 (cuando exista), proveedores (Postmark, Meta) y logs.

## 2. Reglas de retención

| # | Regla |
|---|---|
| RT1 | Los plazos son los de [02-proteccion-de-datos.md §4](02-proteccion-de-datos.md), más los de esta tabla para datos técnicos |
| RT2 | Un **trabajo programado** aplica la retención. Un plazo sin trabajo que lo ejecute no es una política |
| RT3 | Al terminar el contrato con una agencia, sus datos se devuelven (exportación) y se suprimen en **30 días** (plazo propuesto, lo fija el contrato de encargo) |

| Dato técnico | Retención | Fuente |
|---|---|---|
| Payloads crudos del webhook (`recepciones_webhook`), cifrados | **15 días** | Roadmap M4.3; función `purgar_payloads` en la base |
| Sesiones caducadas (`ip`, `agente_usuario`) | **30 días** tras caducar | ADR-0011 |
| Trabajos de BullMQ completados o fallidos | Se eliminan al terminar (`removeOnComplete` / `removeOnFail`) | Roadmap M2.3 |
| Logs de aplicación | **30 días** (propuesta) | — |
| Registros de auditoría de lectura de PII | 5 años | 02-proteccion-de-datos.md §4 |

## 3. Reglas de supresión (derecho del titular, Ley 1581)

| # | Regla |
|---|---|
| SU1 | La supresión es **borrado real** o anulación de las columnas cifradas, no un borrado lógico. Alcanza la base viva, Redis y la caché |
| SU2 | La pide la **agencia** (responsable) y se ejecuta sin intervención de un desarrollador |
| SU3 | Lo que la ley obliga a conservar (archivos de viaje por obligaciones contables) se conserva **anonimizado** respecto del titular cuando sea posible, y se documenta la base legal |
| SU4 | Suprimir una identidad de asesor anonimiza sus filas de `usuarios`, borra sus sesiones y sus `accesos_identidad` (ADR-0011) |
| SU5 | **Límite declarado:** la supresión no alcanza las ramas de Neon ni el PITR mientras exista la clave maestra (ADR-0015, concreción 8). Esos datos caducan con la ventana de retención del PITR. Se informa así a la agencia, sin prometer más |

## 4. Reglas de respaldo

| # | Regla |
|---|---|
| RS1 | Producción tiene restauración a un punto en el tiempo (PITR) de Neon. La ventana la fija el propietario según el plan contratado |
| RS2 | Los respaldos están cifrados en reposo por el proveedor; además, las columnas N3 van cifradas por la aplicación (ADR-0015) |
| RS3 | **La restauración se prueba cada trimestre** en una rama aislada, y se anota en `docs/_bitacora/` el tiempo que tomó (RTO) y cuántos datos se perdieron (RPO) |
| RS4 | Staging nunca es copia de producción: nace como rama *schema-only* (ADR-0013 §Pasos 3). Ningún respaldo de producción se restaura fuera de producción |
| RS5 | Las claves de cifrado tienen copia fuera de Render ([07-gestion-de-secretos-y-claves.md](07-gestion-de-secretos-y-claves.md), S6): un respaldo sin su clave no sirve |

## 5. Cómo se comprueba

| Regla | Comprobación |
|---|---|
| RT2 | Una prueba e2e por trabajo de retención: siembra una fila vencida y otra vigente, ejecuta el trabajo, comprueba que solo desaparece la vencida |
| SU1 / C5 | La prueba de C5: suprimir un titular sembrado y buscar su teléfono y su texto en Postgres (con el rol de aplicación), en las claves de Redis y en BullMQ. Cero coincidencias |
| RS3 | Entrada trimestral en la bitácora con la restauración |
| RS4 | ADR-0013; inspección del tipo de rama en el panel de Neon |

## 6. Estado real hoy (2026-10-27)

**C5 está abierto. Casi nada de esta política se cumple todavía**, y eso es aceptable solo porque
no hay datos reales.

| Qué | Estado |
|---|---|
| Purga de payloads del webhook | **Parcial:** la función `purgar_payloads` existe en la base (migración `20261007140100`), pero **ningún trabajo programado la invoca** |
| Purga de sesiones caducadas | **No existe** |
| Limpieza de trabajos en BullMQ | **Cumple** (M2.3) |
| Trabajo programado de retención de conversaciones, documentos y media | **No existe** |
| Servicio de supresión de un titular (C5, M4.3) | **No existe** |
| Purga del directorio de números (M2.4) | **No existe** |
| *Crypto-shredding* por agencia | **No existe;** ADR-0015 lo deja para un ADR futuro |
| PITR de producción configurado | **No verificado:** no hay producción |
| Restauración probada | **Nunca** |
| Plazos de retención validados por un abogado | **No** |
