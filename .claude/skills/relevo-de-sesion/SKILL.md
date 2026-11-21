---
name: relevo-de-sesion
description: Protocolo para cerrar una sesión de ViajaPro sin perder el hilo y relanzarla con contexto limpio, modelo y esfuerzo adecuados. Úsalo cuando una sesión lleva horas, su contexto es grande, cambia de tarea o hay que archivarla y relanzarla.
---

# Relevo de sesión

Una sesión larga es cara y se degrada. El relevo la cierra con el estado en el repositorio y la relanza pequeña.

## Quien se va (antes de archivar)
1. Termina la **unidad atómica** en curso (un commit/PR coherente) o déjala en una rama empujada; nada de
   trabajo solo local. Detén los subagentes en marcha o espera su resultado.
2. R14: lo hecho y lo que viene está en el repositorio (`tasks.yaml`, `ESTADO.md`/bitácora si cerraste un lote,
   docs del tema). Lo que solo estaba en la conversación, se escribe ahora.
3. Manda a la sesión madre **un solo mensaje de traspaso** (máx. 25 líneas) con:
   - PR y ramas abiertos (número, SHA, estado verificado y qué falta);
   - lo siguiente, en orden, con criterios de aceptación;
   - trampas y decisiones que no están en los docs;
   - lo prometido y no hecho; lo no verificado.
4. Responde «listo para archivar». No sigas trabajando.

## La madre
1. Verifica con `gh`/`git` lo que dice el traspaso y lo añade al tablero.
2. Archiva la sesión (`archive_session`) y crea la nueva con `create_session`: `model` y `effort` según
   `modelo-y-esfuerzo`, `source_url` del repo, `permission_mode: auto`, `tags` del rol, y el prompt de abajo.
3. Anota en el tablero (sección 1 y 7) el id nuevo, el modelo y el esfuerzo. No se les da órdenes a las
   sesiones que abrió el propietario.

## Prompt de arranque (plantilla corta)
> Eres la sesión de **<rol>** de ViajaPro. Lee primero, por tramos: `CLAUDE.md`,
> `docs/_contexto/TABLERO-DEL-ORQUESTADOR.md` y lo del tema <rutas>. Aplica los skills `ahorro-de-tokens`,
> `modelo-y-esfuerzo` y `relevo-de-sesion`. Tu tarea: <una tarea, criterio de aceptación>. Estado heredado:
> <traspaso resumido, PR y SHA>. Reglas: R14, sin auto-merge en `apps/web`, ventana de integración pedida a
> `@parent`, `git fetch` y PR de docs abiertos antes de numerar ids, auditoría de seguridad donde toque dinero,
> autenticación o aislamiento. Al terminar: traspaso a `@parent` y para.

## Cuándo se relevan (regla del propietario, 2026-11-21)
- **Una sesión = una tarea puntual** (un PR, o una auditoría, o un lote de docs). Al cerrarla, relevo y archivo.
- **Tope de contexto: 150 mil tokens** (`external_metadata.context_usage.used_tokens` en `get_session`). Al
  llegar, la sesión termina su unidad atómica y se relevan; no se acepta tarea nueva por encima del tope.
- **Corte previo:** si una sesión pasa de **100 mil** y su tarea siguiente es grande, se releva antes de empezarla.
- La madre mide el contexto de cada sesión activa en cada despertar de las dos horas (`get_session`, solo
  esa cifra) y lo anota en el tablero. Una sesión que no cierra una tarea en ~3 horas también se releva.
- Las sesiones de la misma tarea que siguen un hilo corto (p. ej. corregir lo que pidió la auditoría del PR que
  acaban de abrir) pueden continuar si están bajo 100 mil.
