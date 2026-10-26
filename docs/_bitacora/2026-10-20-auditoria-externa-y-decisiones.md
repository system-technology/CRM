# 2026-10-20 — Auditoría externa y decisiones del propietario

## Qué pasó

1. Se escribió el informe completo para la auditoría externa:
   `docs/_auditoria/2026-10-20-informe-para-auditoria-externa.md`, en la rama
   `docs/informe-auditoria-externa`, sobre `main` en `3a1369a` (v0.38.0).
2. La herramienta externa devolvió **17 hallazgos** (AUD-001 a AUD-017) y un **roadmap v2**.
3. El equipo contrastó cada hallazgo con el código y respondió con evidencia:
   `docs/_auditoria/2026-10-20-respuesta-a-auditoria-externa.md`. Varios puntos del roadmap
   describían como «problema actual» cosas que el código ya resuelve: el contexto de tenant, la RLS
   sin contexto, las salas del socket, la guardia de rol, las colas y las cotizaciones.
4. La auditoría emitió un **dictamen v3 de conciliación** que rectifica esos puntos y da por resuelto
   el AUD-016. Su script SQL de comprobación tiene tres errores, corregidos en la respuesta: el
   `search_path`, los nombres de las tablas de identidad y las tablas particionadas.

## Decisiones del propietario

Respuesta literal a las tres propuestas (ADR-0014 con la opción (a), roadmap v2 con correcciones y
guardar la respuesta en el repositorio): «si avanza con lo que propones».

| Decisión | Efecto |
|---|---|
| **ADR-0014, opción (a)** | Se cifran `mensajes.texto` y `conversaciones.ultimo_mensaje_texto` con AES-256-GCM, versión de clave, una clave por agencia derivada con HKDF y AAD tenant ‖ mensaje ‖ columna. **La búsqueda por el cuerpo de los mensajes desaparece**: se busca por contacto, teléfono, fecha, estado y cotización. Pendiente de `auditor-seguridad` |
| **Roadmap v2, con las correcciones** | Se integra en `docs/08-roadmap/` con lo ya hecho marcado y su evidencia. Se conserva la visibilidad por usuario (`usuario:<id>`) en lugar de las salas `tenant:` |
| **Respuesta a la auditoría** | Guardada en `docs/_auditoria/` |

## Hallazgos propios, posteriores a la auditoría (modelo de amenazas)

Salen de `docs/05-seguridad/01-modelo-de-amenazas.md`. Ninguno tiene control hoy:

- `registros_auditoria` existe, pero nada escribe en ella (R10);
- `Origin` solo se comprueba en `auth` y en el socket, así que hay riesgo de CSRF entre subdominios;
- la web no tiene CSP;
- no hay límite de tasa fuera de `auth`;
- las acciones de GitHub no están fijadas por SHA.

Van a la cola de `ESTADO.md` con dueño.
