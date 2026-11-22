# Traspaso a la próxima sesión orquestadora

> **Lo escribe la madre saliente antes de quedarse sin contexto, no después.** Si lo lees, eres la
> siguiente: esto es lo que necesitas para arrancar sin repetir trabajo. Lo estable está en
> `CONTEXTO.md`, lo aprendido en `DIARIO.md` y `TABLERO-DEL-ORQUESTADOR.md`; aquí va solo lo que no
> puede esperar a que los leas.
>
> Escrito el **2026-11-22, 00:30 UTC**, por la séptima madre
> (`session_01R81Xh4xCBnaheEL9Gxa6TL`), con ~355 mil tokens consumidos.

---

## 1. Lo primero: por qué esta sesión no te creó a ti

**La cadena de madres se agotó.** Esta sesión está en **profundidad de linaje 8 de 8** y el sistema
responde, literal, que *«no user or organization setting changes this limit»*. No puede crear sesiones
hijas, ni la madre siguiente, ni rearmar la tarea programada.

**Por eso te abre el propietario a mano, desde la raíz.** Y por eso, si vuelves a relevarte encadenando
sesiones, le pasará lo mismo a quien venga detrás. **Mira `lineage.depth` en la misma llamada de
`get_session` en la que miras `used_tokens`.** A partir de 6, la siguiente nace desde la raíz.

Lo que sí funciona y no gasta linaje: **subagentes en proceso** (`Agent`, con
`isolation: "worktree"`). No abren PR —no llevan las herramientas de GitHub—, consumen contexto de la
madre y **mueren con la sesión**. Sirven para un lote.

## 2. Estado verificado (2026-11-22, 00:30 UTC)

- `main` = **`009cc5ab`** (PR #492, el renombrado del admin a John).
- **Cola: 566 tareas** — 254 `done`, 50 `ready`, 32 `blocked`, 226 `backlog`, 1 `review`, 3 `dropped`.
- Abiertas por prioridad: **4 P0, 15 P1**, 164 P2, 126 P3. **Siguiente id libre: T-602.**
- **Las 4 P0 no son de código** (T-079, T-080, T-093, T-126): esperan despliegue, al propietario o un
  recorrido manual. No las repartas a una sesión de código.

### PR abiertos al cerrar

| PR | Qué | Estado |
|---|---|---|
| #487 | Correcciones del hilo + T-594, T-595, T-597, T-598, T-600 y bitácoras | `behind`, 1 rojo (el inestable) |
| #488 | `CLAUDE.md`: quitar «sin servicio desplegado» | **ruta protegida, espera al propietario** |
| #489 | Blindaje de `WEB_PUBLIC_URL`/`API_PUBLIC_URL` | verde entero, `behind` |
| #490 | Script acotado de diagnóstico del ingreso | **necesita una línea en `.claude/settings.json`** |

### Subagentes que estaban trabajando y murieron con la sesión

**T-592** (e2e inestable, P1), **T-586** (modo oscuro, P1) y **T-590** (columna de pasajeros en
cobros). Si sus ramas existen en `origin`, su trabajo está ahí; **compruébalo antes de relanzarlos**:
`git branch -r | grep -E 'T-59[02]|T-586'`.

## 3. Lo que cambió de verdad anoche, y corrige el hilo

**Esto es lo más importante del traspaso.** El repositorio llevaba días afirmando cosas falsas, todas
en la misma dirección, y las sesiones las repetían como propias.

1. **Staging ESTÁ desplegado y vivo.** La web responde, y la API de Render devuelve
   `{"estado":"ok","baseDeDatos":"ok","rol":"viajapro_app","aislamiento":"forzado"}`. **Hay un cliente
   del propietario usándolo.** El hilo decía «no hay nada desplegado» en nueve sitios.
2. **Integrar un PR DESPLIEGA.** `deploy-staging.yml` dispara Render y Vercel y **corre migraciones
   contra Neon** en cada merge a `main`. Lleva más de 50 ejecuciones. **Un PR que toque
   `packages/database` es un cambio en producción, no un merge.**
3. **La base está al día**: «56 migrations found», «No pending migrations to apply». Lo de «32 de 47
   migraciones y faltan 3 roles» era falso.
4. **El cierre automático de tareas no estaba roto: lo envenenábamos.** `cerrar-tarea.mjs` valida la
   cola entera, así que **una sola tarea `blocked` sin `blocked_reason` lo aborta** y ningún PR cierra
   la suya. Además **no escribe en `main`**: deja una rama `i/cerrar-T-XXX-prNNN` **cuyo PR hay que
   integrar**. Las dos cosas están arregladas y el circuito cerró solo dos veces.
5. **Los secretos del Environment los cargó una sesión de IA con plantillas** (lo recordó el
   propietario). Hay que rotarlos: **T-598, P0**.

## 4. Las comprobaciones de diez líneas sobre `tasks.yaml`

Córrelas **antes y después** de editar la cola. La tercera nació anoche y la cuarta me pilló a mí:

```python
import yaml, collections
ts = yaml.safe_load(open('roadmap/tasks.yaml'))['tasks']
by = {t['id']: t for t in ts}
print([i for i,c in collections.Counter(t['id'] for t in ts).items() if c>1])           # duplicados
print([t['id'] for t in ts if t.get('status')=='blocked' and not t.get('blocked_reason')])  # rompe el cierre
print([(t['id'],x) for t in ts if t.get('status')=='ready'
       for x in (t.get('depends_on') or []) if by.get(x,{}).get('status')!='done'])     # ready que miente
```

## 5. Trampas verificadas (las nuevas; el resto, en el tablero §1.13–§1.18)

- **Integra con `mcp__github__merge_pull_request`** y `update_pull_request_branch`. La vía Bash está
  denegada. **Sha completo** en `update-branch` (el truncado da 422).
- **`navegador` cae al azar**: 4 de 4 veces pasó al relanzar sin tocar nada (T-592). **`test` NO**: si
  `test` falla, es real.
- **El check «Carril y tarea» deduce el carril del prefijo de la rama.** Una rama `a/` o `b/` **no
  puede tocar `docs/`**: la bitácora va al PR de cierre (R14 lo admite). Una rama `fix/`, `test/` o
  `chore/` **no activa** la regla.
- **commitlint rechaza un asunto que empieza por mayúscula** (un nombre de archivo lo tumba): empieza
  por verbo. Nada de hexadecimales en el cuerpo. El id, al final entre paréntesis.
- **Con subagentes en worktree, `git add -A` no es seguro**: se traga `.claude/worktrees/agent-*`.
  Añade por ruta.
- **Una sesión NO puede editar `.claude/settings.json`** (el clasificador lo deniega, y hace bien).
  `Bash(curl:*)` y `psql` están en su lista `deny`.
- **`sleep` en primer plano está bloqueado**; para esperar, `Monitor` con bucle que **termine solo**.

## 6. Lo que espera al propietario

Ver `PENDIENTES-DEL-PROPIETARIO.md`, y de ahí lo que más bloquea:

1. **Abrir la sesión madre siguiente desde la raíz** (T-584) — sin esto no hay relevo ni modo desatendido.
2. **Rotar los secretos** cargados por una sesión (T-598, P0), antes de que entre un dato real.
3. **Rotar la contraseña de la demo**: quedó en texto plano en el log de un run de un repositorio
   público.
4. La línea de permiso para el script de diagnóstico (#490) y las credenciales de los conectores de
   **Neon, Render y Vercel**, que rechazan su token.
5. La muestra de su hoja de reservas (bloquea T-334 y T-336) y la lista de chats a excluir de JD Tours.

## 7. Cómo repartir, que es lo que funcionó

- **Reparte contra el criterio de salida de JD Tours**
  (`docs/08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md` §3), no contra la lista de P1.
- **Escribe el síntoma, no el diagnóstico**, y marca tus sospechas como **hipótesis numeradas a
  confirmar o desmentir**. Funciona: anoche una hija desmintió mi hipótesis sobre quién rechazaba el
  login y otra encontró que el manual estaba desactualizado por un motivo distinto al que yo creía.
- **Di qué NO es su carril y qué archivo no tocar** si hay otra en vuelo.
- **Pide ver la prueba en rojo** y que separe **qué comprobó corriendo algo** de **qué queda al CI**.
- **Audita el código, no el informe** (R13), donde haya dinero, permisos o aislamiento.
- **Sonnet por defecto.** Opus solo con dominio, dinero o aislamiento de verdad.

## 8. La lección de método, que vale más que cualquier dato de arriba

Pasé el turno exigiendo «verificar antes de afirmar» mientras repetía tres veces «ninguna agencia ha
visto nada» **sin comprobarlo ni una vez**. Lo heredé del hilo y lo di por propio.

**Un estado heredado envejece hacia el pesimismo igual que hacia el optimismo, y las dos formas
mienten.** Antes de repetir una afirmación de estado —desplegado, probado, visto por alguien—,
**mídela o márcala como heredada y sin verificar**. No hay tercera opción honesta.

Y el corolario, de un fallo que llevaba cinco lotes sin diagnosticarse: **contar las veces que algo
falla no es diagnosticarlo.** Cinco observaciones idénticas sin abrir un log no valen lo que una
lectura del log.
