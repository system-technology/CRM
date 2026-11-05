# MARCO DE TRABAJO — cómo se trabaja en cada sesión

> Se inyecta al iniciar toda sesión. Es corto a propósito. Lo que cambia día a día vive en
> `CHECKPOINT.local.md` y `DIARIO.md`; lo estable en `CONTEXTO.md`; las reglas duras en `CLAUDE.md`.

## 1. Estructura del cerebro (qué se lee y en qué orden)

| # | Archivo | Capa | Se escribe |
|---|---|---|---|
| 1 | `docs/_contexto/CHECKPOINT.local.md` | Estado vivo, local (ignorado por git) | Tras cada hito, sin PR |
| 2 | `docs/_contexto/DIARIO.md` | Decisiones y hitos, versionado | Al cerrar un lote, por PR carril `i/` |
| 3 | `docs/_contexto/MARCO.md` | Este marco | Solo si cambia la forma de trabajar |
| 4 | `docs/_contexto/CONTEXTO.md` | Lo estable: quién decide, trampas, integración | Rara vez |
| 5 | `ESTADO.md`, `roadmap/tasks.yaml`, ADR, `docs/_bitacora/` | Autoridad del proyecto (CLAUDE.md §9) | Por tarea |

Si el checkpoint contradice a `gh`/`git`, manda la realidad y se corrige el checkpoint.

## 2. Protocolo de arranque (los primeros cinco minutos)

1. Leer lo inyectado. No volver a preguntar lo que ya está decidido en el diario.
2. Verificar: `gh pr list --state open`, `git fetch`, estado de los PRs nombrados en el checkpoint.
3. Responder al propietario en **cinco líneas**: qué está verificado, qué quedó prometido y sin
   hacer, qué se hace primero. Sin recapitular la historia.
4. Ejecutar la lista «Prometido y NO hecho» del checkpoint antes de abrir trabajo nuevo.

## 3. Reglas de veracidad (nacieron de errores reales)

- **Verificar antes de afirmar.** «CI en verde», «integrado», «listo» solo con evidencia de `gh`,
  `git` o navegador del mismo turno. Si no se comprobó, se dice «sin verificar».
- **Prometer = ejecutar en el mismo turno o apuntarlo** en «Prometido y NO hecho». Nunca «empiezo
  ahora» sin la llamada que empieza.
- **Verificado vs. supuesto** se separan siempre, en respuestas y en el diario.
- Un «terminado» solo lo es integrado en `main` (CLAUDE.md §8.1).
- Respuestas cortas, en español, con tablas. Si algo falló, decir qué y por qué.

## 4. Ciclo de trabajo

```
hito (PR abierto / integrado / hallazgo / decisión)
   └─► actualizar CHECKPOINT.local.md  (1 minuto, sin PR)
lote de la carril cerrado
   └─► consolidar en DIARIO.md por PR i/T-000-… (alcance hilo)
contexto grande (muchos archivos leídos, muchas rondas) o aviso del hook
   └─► checkpoint COMPLETO antes de seguir: petición viva, pendientes, verificado/supuesto
sesión nueva o degradada
   └─► pegar «Retoma desde el cerebro persistente» y seguir el protocolo del §2
```

## 5. Marco de entrega

- **Carriles:** `a/` backend y base de datos, `b/` frontend, `i/` docs e integración. Un PR no
  mezcla carriles. **Lotes grandes por carril y tanda**; migraciones, rutas protegidas y todo lo de
  aislamiento entre agencias van en PR aparte (R13).
- **Nombres de rama:** nunca `T-126` en una rama que no cierre T-126 (dispara `cerrar-tarea`); usar
  `T-000`. Commitlint: alcance `hilo` para docs de hilo, no `bitacora`.
- **Flujo:** worktree por rama; `cd <wt> && git …` en una sola llamada (hook `guard-rama`); push con
  `node scripts/gh-app.mjs <carril> push`; PR con `… gh pr create`; auto-merge `--auto --merge`;
  ramas rezagadas con `gh pr update-branch`. 8 checks, protección de servidor, R11.
- **Autorización:** el propietario delegó aprobar rutas protegidas y merges, pero el hook de
  integración impide autoautorizarse: si lo bloquea, se pide al propietario, no se rodea.
- **Agentes:** reanudar con `SendMessage` en vez de crear nuevos; encargo con alcance, rutas y
  presupuesto explícitos. Antigravity no está habilitado: un agente `frontend` de Claude lo suple.
- **Una vuelta de revisión** (R13), salvo aislamiento entre agencias. Lo demás, a la cola.

## 6. Prioridad vigente (congelamiento de alcance)

1. Cerrar el flujo **H1–H6** en navegador contra la API real (campaña funcional T-126, en curso).
2. Corregir cada hallazgo bloqueante por PR en su carril y repetir hasta cero bloqueantes.
3. Preparar la demo para **el dueño de JD Tours**: vista gerencial (reportes, margen, pipeline).
4. Congelado: multiidioma (T-152..T-172), reportes avanzados, nuevas funciones. Gasto de
   alojamiento: ninguno hasta que el flujo funcione en local/Codespaces.
5. Antes de datos reales de viajeros: revisión externa de RLS y criterios C1–C5.

## 7. Sesión desde cero: lo que hay que saber ya

Propietario: `Alfavear`, habla español, exige resultados reales, no una maqueta. Verifica Meta
(T-080) él mismo. Codespaces es el entorno de prueba (`pnpm dev:nube`, puertos 3000/3333 públicos
mientras se prueba). La memoria del modelo es un apoyo; **la fuente es este directorio**.
