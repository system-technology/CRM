---
description: Reconstruye el hilo del proyecto — dónde estamos, qué se decidió, qué sigue, qué está bloqueado.
allowed-tools: Read, Glob, Grep, Bash(git log:*), Bash(git status:*), Bash(git diff:*)
---

Reconstruye y preséntame el hilo completo del proyecto. Úsalo al retomar después de días sin
trabajar, o cuando sospeches que el contexto de la conversación se desalineó de la realidad.

Lee, en este orden:

1. `ESTADO.md` — el punto actual declarado.
2. Las dos últimas entradas de `docs/_bitacora/`.
3. Los ADR en `docs/03-adr/`, solo títulos y estado (aceptado / superseded).
4. `docs/08-roadmap/01-roadmap.md` — fase actual y siguiente hito.
5. `git log --oneline -20` y `git status --porcelain` — la realidad, contra la que se contrasta todo.

Preséntame:

```
## Dónde estamos
<Fase, qué funciona hoy, qué no existe todavía.>

## Decisiones vigentes
<Las estructurales, en una línea cada una, con su ADR.>

## Qué sigue
<La cola real, priorizada, con el agente que debería tomar cada cosa.>

## Bloqueado
<Qué, por quién, desde cuándo.>

## Discrepancias detectadas
<Dónde la documentación no coincide con el repositorio. Si no hay, dilo.>
```

La última sección es la importante: si `ESTADO.md` dice una cosa y `git log` otra, el hilo se
rompió y hay que repararlo antes de seguir trabajando.
