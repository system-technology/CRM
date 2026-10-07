---
name: cerrar-sesion
description: Cierra una sesión de trabajo dejando el hilo del proyecto intacto — actualiza ESTADO.md, escribe la entrada de bitácora, sincroniza la documentación afectada y deja la cola de trabajo lista para quien retome. Úsalo al terminar cualquier sesión que haya modificado el proyecto.
---

# Cerrar sesión

El rito que impide que el proyecto pierda el hilo. Toma tres minutos y ahorra una hora de
reconstrucción en la sesión siguiente.

## Paso 1 — Mirar qué pasó de verdad

```bash
git status --porcelain
git diff --stat
git log --oneline -10
```

No reconstruyas la sesión de memoria. Mira los cambios reales: casi siempre se hizo algo que no
estaba planeado y casi siempre es lo que más importa registrar.

## Paso 2 — Actualizar `ESTADO.md`

1. **Cabecera:** fecha, quién, fase, avance.
2. **Dónde estamos:** mueve aquí lo que se completó. Redáctalo como estado, no como narración
   ("el módulo de inbox recibe y persiste mensajes entrantes", no "trabajamos en el inbox").
3. **Qué sigue:** reescribe la cola real. Si algo lleva tres sesiones en la cola sin moverse,
   o no es prioritario o está bloqueado: decídelo y márcalo.
4. **Bloqueos:** agrega los nuevos, retira los resueltos. Todo bloqueo tiene dueño y mitigación.
   Un bloqueo sin dueño después de dos sesiones es un problema, no un riesgo.
5. **Preguntas abiertas:** agrega lo que quedó sin respuesta. Esto es lo que más se pierde.

## Paso 3 — Escribir la bitácora

`docs/_bitacora/AAAA-MM-DD-<tema-en-kebab>.md`:

```markdown
# <AAAA-MM-DD> — <tema>

**Participantes:** <agentes y personas>
**Alcance:** <qué abarcó la sesión>

## Qué se hizo
- ...

## Decisiones tomadas
| Decisión | Razón | Dónde quedó registrada |
|---|---|---|

## Qué quedó pendiente
- [ ] ...

## Qué aprendimos
<Lo que un agente futuro necesita saber y no puede deducir leyendo el código. Esta sección es
la razón de ser del archivo: si está vacía, piénsalo otra vez.>
```

## Paso 4 — Sincronizar la documentación

Pregunta concreta: **¿qué documento quedó mintiendo por lo que hicimos hoy?**

- ¿Cambió el modelo de datos? → `docs/02-arquitectura/03-modelo-de-datos.md`
- ¿Cambió la forma del sistema? → `docs/02-arquitectura/01-vision-general.md` y, si fue estructural, un ADR
- ¿Apareció un término nuevo del dominio? → `docs/01-producto/02-lenguaje-ubicuo.md`
- ¿Cambiaron los pasos para arrancar? → `README.md`
- ¿Una regla de `CLAUDE.md` dejó de cumplirse? → se arregla el código o se cambia la regla, pero no
  se deja la contradicción viva.

## Paso 5 — Dejar la entrada lista para quien retome

Lo último que escribes en `ESTADO.md` es la primera tarea concreta de la próxima sesión, con el
agente que debería tomarla. Quien abra el proyecto mañana —persona o modelo— debe poder empezar
sin preguntar nada.

## Paso 6 — Resumen al usuario

Cinco líneas, no más:

- Qué se completó
- Qué quedó pendiente
- Qué decisión necesita el usuario
- Qué está bloqueado y por quién

Sin recuento de archivos tocados. Sin narración del proceso.
