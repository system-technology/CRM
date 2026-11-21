---
name: ahorro-de-tokens
description: Reglas para no malgastar tokens en ViajaPro — leer lo mínimo, no repetir trabajo, no esperar con consultas, briefs cortos a subagentes y sesiones cortas. Úsalo al empezar cualquier sesión o subagente y siempre antes de leer archivos grandes, revisar CI en bucle o lanzar una auditoría.
---

# Ahorro de tokens

El gasto real no son las tareas: es **el contexto que se relee en cada turno**. Una sesión de horas con
500 mil tokens cuesta mucho más que diez sesiones cortas. Las reglas, de más a menos efecto:

## 1. Sesión corta, una tarea
- Una sesión = una tarea (un PR). Al terminar, `relevo-de-sesion` y se archiva. No maratones.
- La memoria vive en `docs/_contexto/TABLERO-DEL-ORQUESTADOR.md`, `ESTADO.md`, `roadmap/tasks.yaml` y los docs
  del tema (R14), **no** en la conversación. Léelos, no los reconstruyas.

## 2. Lee lo mínimo
- Antes de abrir un archivo: `grep -n`, `git diff --stat` o `Read` con `offset`/`limit`. Un archivo de 1.000 líneas
  se lee por tramos. Nunca leas completo lo que solo necesitas ubicar.
- `git diff --stat` primero; el diff entero solo de lo que cambia comportamiento. Los logs de CI: la cola
  (`tail`), no el log entero.
- No releas lo que ya está en tu contexto ni lo que acabas de escribir. No pegues salidas largas en mensajes.
- Los resúmenes de otra sesión o subagente se citan con su id/ruta, no se copian.

## 3. No consultes en bucle
- Una sola comprobación de CI por motivo concreto; luego `send_later` con el intervalo de lo que tarda (el CI
  completo, ~10 min), no revisiones cada minuto.
- No «verifiques por si acaso» lo que acabas de verificar en el mismo turno. Sí verifica antes de afirmar lo
  que no viste (veracidad).
- Notificaciones: léelas y actúa; no las recapitules.

## 4. No repitas trabajo
- Antes de empezar: `gh pr list` y el tablero. Dos sesiones no hacen el mismo entregable (pasó con T-339).
- Una sola vuelta de revisión (R13), salvo aislamiento entre agencias: no audites auditorías. Una segunda
  pasada solo sobre el diff del arreglo, nunca sobre todo el PR.
- Numerar ids tras `git fetch` y mirar los PR de docs abiertos: renumerar después cuesta una vuelta entera.

## 5. Subagentes
- Brief corto: objetivo, archivos, lo ya descartado, formato de salida y **tope de líneas** (p. ej. «máx. 60
  líneas»). Pide que devuelvan conclusión y evidencia `archivo:línea`, no volcados.
- Modelo y esfuerzo según `modelo-y-esfuerzo`. Lo mecánico (enlaces, ids repetidos, estado de CI) con el modelo
  más barato o con un script.
- No lances un subagente para algo de dos llamadas que ya sabes hacer.

## 6. Escribe una vez
- Un PR de docs por lote, no uno por tarea. Los PR con auto-merge de docs mueven `main` y atrasan a los demás:
  cada atraso es un CI repetido.
- Tableros y checkpoints: actualizar las líneas que cambian, no reescribir el archivo.
