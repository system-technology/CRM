---
description: Cierra la sesión de trabajo actualizando ESTADO.md, la bitácora y la documentación afectada.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git status:*), Bash(git diff:*), Bash(git log:*)
---

Cierra esta sesión de trabajo siguiendo la skill `cerrar-sesion`.

Antes de escribir nada, mira los cambios reales del repositorio (`git status --porcelain`,
`git diff --stat`, `git log --oneline -10`). No reconstruyas la sesión de memoria: casi siempre se
hizo algo que no estaba planeado, y suele ser lo que más importa registrar.

Luego: actualiza `ESTADO.md`, escribe la entrada en `docs/_bitacora/`, sincroniza los documentos de
`docs/` que hayan quedado desactualizados, y deja la primera tarea de la próxima sesión escrita con
el agente que debería tomarla.

Cierra con un resumen de cinco líneas: qué se completó, qué quedó pendiente, qué decisión necesita
el usuario, qué está bloqueado y por quién.

$ARGUMENTS
