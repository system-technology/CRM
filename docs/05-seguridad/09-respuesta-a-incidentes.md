# Respuesta a incidentes y notificación

| Campo | Valor |
|---|---|
| Versión | 0.1, borrador |
| Fecha | 2026-10-27 |
| Estado | **Pendiente de aprobación del propietario y de revisión por un abogado** (plazos legales) |
| Responsable | Propietario (coordinador del incidente y único que notifica fuera); `auditor-seguridad` (análisis); `devops` y `backend` (contención) |
| Desarrolla | [02-proteccion-de-datos.md §6](02-proteccion-de-datos.md), que fija los cinco pasos. Aquí van los plazos, los contactos y la plantilla |

> **No es asesoría jurídica.** Los plazos legales de la §4 son los que se entienden de la norma
> colombiana a la fecha; el abogado de la tarea pendiente de
> [02-proteccion-de-datos.md §7](02-proteccion-de-datos.md) los confirma.

## 1. Alcance

Todo evento que comprometa, o pueda haber comprometido, la confidencialidad, integridad o
disponibilidad de datos de agencias o viajeros, o de un secreto N4. Incluye: una fuga entre
agencias, una credencial filtrada (aunque no se haya usado), un secreto publicado en el repositorio
público, acceso no autorizado a un panel, pérdida de datos, y un informe externo verosímil.

## 2. Severidad

| Nivel | Criterio | Ejemplos |
|---|---|---|
| **SEV1** | Datos N3 o N2 de una agencia **expuestos a otra agencia o a un tercero**, o secreto N4 de producción comprometido | Fuga entre tenants; `DATABASE_APP_URL` de producción publicada; token de WhatsApp de una agencia filtrado |
| **SEV2** | Exposición posible no confirmada, o secreto de staging comprometido, o indisponibilidad > 4 h | Bug de RLS detectado sin evidencia de explotación; caída prolongada |
| **SEV3** | Debilidad sin datos reales afectados | Hallazgo de divulgación responsable sobre código sin desplegar |

**Una fuga entre agencias es siempre SEV1** hasta que se demuestre lo contrario.

## 3. Procedimiento y plazos internos

Los plazos corren desde la **detección** (hora en que alguien del proyecto lo sabe).

| Paso | Qué | Plazo | Quién |
|---|---|---|---|
| 1. Registrar | Abrir el registro con la plantilla de la §6, en privado (no en un issue público) | Inmediato | Quien lo detecta |
| 2. Contener | Cortar el acceso: rotar el secreto, revocar sesiones, suspender la agencia o apagar el servicio. **Rotar primero, investigar después** | SEV1: 1 h. SEV2: 24 h | Propietario, `devops` |
| 3. Evaluar | Qué datos, qué agencias, cuántos titulares, si hay menores o datos sensibles, ventana de exposición | SEV1: 24 h | `auditor-seguridad` |
| 4. Notificar | Ver §4 | Ver §4 | **Solo el propietario** |
| 5. Corregir | El arreglo entra con **la prueba automatizada que lo habría detectado** | Según el caso | `backend`, `datos` |
| 6. Cerrar | Postmortem sin culpables en `docs/_incidentes/AAAA-MM-DD-<tema>.md`, **sin datos personales ni secretos** (el repositorio es público) | 10 días hábiles tras contener | Propietario |

## 4. A quién se notifica y cuándo

ViajaPro es **encargado** del tratamiento; cada agencia es **responsable**. Por eso el orden es:
primero la agencia, que es quien responde ante sus viajeros.

| Destinatario | Cuándo | Plazo | Base |
|---|---|---|---|
| **Agencias afectadas** (contacto designado en el contrato de encargo) | Todo SEV1 y todo SEV2 que las afecte | **Compromiso propuesto: 48 h desde la detección**, aunque la evaluación no haya terminado; se amplía después | Contrato de encargo (pendiente); Ley 1581, art. 18 (deberes del encargado) |
| **Superintendencia de Industria y Comercio (SIC)**, por el Registro Nacional de Bases de Datos (RNBD) | Violación de los códigos de seguridad con riesgo para los datos de los titulares | **15 días hábiles** desde que se conoce el incidente (Circular Única de la SIC). **A confirmar con el abogado:** si el reporte lo hace la agencia como responsable, ViajaPro como encargado, o ambos | Ley 1581, art. 17 lit. n y art. 18 lit. k |
| **Titulares (viajeros)** | Cuando el riesgo para ellos sea alto | Lo decide y lo hace **la agencia**, con nuestra ayuda | La agencia es responsable |
| **Meta** | Compromiso de un token o de la App de WhatsApp | Al contener | Términos de la plataforma |
| **Agencias no afectadas** | Nunca se les revela qué agencia se vio afectada | — | Confidencialidad entre clientes |

## 5. Cómo se comprueba

- **Simulacro anual** (SEV1 ficticio: una credencial de `viajapro_app` filtrada), con el resultado
  anotado en `docs/_bitacora/`. Comprueba que existen los contactos, que se sabe rotar y que la
  plantilla se puede llenar en una hora.
- Cada incidente real tiene su postmortem en `docs/_incidentes/`.

## 6. Plantilla de registro de incidente

> Copiar en un documento **privado** mientras el incidente está abierto. La versión que se publica
> en `docs/_incidentes/` al cerrar va sin datos personales, sin nombres de agencias y sin secretos.

```markdown
# Incidente <AAAA-MM-DD>-<tema-corto>

| Campo | Valor |
|---|---|
| Severidad | SEV1 / SEV2 / SEV3 |
| Detectado (UTC) | AAAA-MM-DD HH:MM |
| Detectado por / cómo | <persona, alerta, informe externo> |
| Coordinador | <propietario> |
| Estado | Abierto / Contenido / Cerrado |

## Qué pasó
<hechos verificados, sin suposiciones; lo no verificado se marca "no verificado">

## Alcance
- Agencias afectadas: <número; identificadores solo en la versión privada>
- Titulares afectados: <número estimado>
- Tipos de dato: <N2 / N3; ¿menores? ¿salud? ¿documentos?>
- Ventana de exposición: <desde — hasta, UTC>

## Línea de tiempo (UTC)
- HH:MM — detección
- HH:MM — contención: <qué se rotó o revocó>
- HH:MM — notificación a agencias
- AAAA-MM-DD — reporte a la SIC (radicado: <número>)

## Contención
<qué se hizo para cortar el acceso>

## Causa
<la condición que permitió el fallo, no la persona>

## Corrección
- Arreglo: <PR>
- Prueba que lo habría detectado: <ruta del spec>

## Notificaciones
| A quién | Cuándo (UTC) | Medio | Hecho por |
|---|---|---|---|

## Pendientes
| Qué | Dueño | Tarea |
|---|---|---|
```

## 7. Estado real hoy (2026-10-27)

- **No hay datos reales**, así que hoy ningún incidente puede afectar a titulares. Esta política
  existe para estar lista **antes** de la primera agencia.
- **No existen:** contrato de encargo con contacto designado por agencia, cuenta de la empresa en el
  RNBD de la SIC, canal privado de incidentes, ni simulacro hecho.
- **No hay alertas automáticas** de seguridad (accesos anómalos, picos de 401/403). La detección
  depende hoy de los logs y de informes externos.
- El compromiso de 48 h a las agencias es una **propuesta** que fija el propietario.
