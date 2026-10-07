# Continuidad del hilo

> El problema que resuelve este documento: **ningún modelo recuerda la sesión anterior.**
> Tampoco una persona, después de dos semanas en otra cosa.

---

## 1. Cómo se pierde el hilo

No se pierde de golpe. Se pierde así, y siempre en este orden:

1. Una sesión productiva termina sin actualizar `ESTADO.md`.
2. La siguiente sesión empieza a ciegas y **reconstruye el contexto a partir del código**.
3. Al reconstruirlo, interpreta mal una decisión que nadie escribió.
4. Implementa algo que contradice una decisión anterior.
5. Nadie lo nota, porque tampoco quedó escrita.
6. Tres sesiones después, el sistema tiene dos criterios opuestos conviviendo.

**El punto de fuga es siempre el paso 1.** Todo el mecanismo apunta ahí.

---

## 2. Los cuatro artefactos

Jerarquía de autoridad. Si dos se contradicen, gana el de arriba.

### `ESTADO.md` — el presente

Dónde estamos, qué sigue, qué bloquea. **Se reescribe** cada sesión; no se acumula. Es el primer
archivo que lee cualquiera. Si tiene más de dos semanas y hay commits recientes, está mintiendo.

### `docs/03-adr/` — el porqué

Decisiones estructurales. **Inmutable**: un ADR aceptado no se edita jamás. Si la decisión cambia,
se escribe uno nuevo que declara `Supersedes: ADR-000X`, y el viejo se marca `Superseded by` pero
conserva su contenido intacto.

Esa inmutabilidad es el punto: el valor de un ADR no es decir qué hacemos hoy —eso lo dice el
código—, sino **qué se descartó y por qué**. Sin eso, cada seis meses alguien vuelve a proponer
exactamente lo mismo que ya se rechazó, y hay que volver a pensarlo entero.

### `docs/_bitacora/` — el pasado

Una entrada por sesión. **Se acumula**, nunca se edita. La sección que justifica el archivo es
*"Qué aprendimos"*: lo que un agente futuro necesita saber y no puede deducir leyendo el código.

### `docs/08-roadmap/` — el futuro

Fases, hitos, criterios de salida. Se actualiza al cerrar cada fase.

---

## 3. Mecanismos automáticos

Una regla escrita se olvida. Estos no:

| Mecanismo | Momento | Qué hace |
|---|---|---|
| `.claude/hooks/session-start.mjs` | Al abrir sesión | Inyecta estado, cola, bloqueos y última bitácora. Advierte si `ESTADO.md` tiene más de 14 días. |
| `.claude/hooks/recordatorio-estado.mjs` | Al cerrar sesión | Avisa si hubo cambios sin actualizar el hilo. |
| `CLAUDE.md` | Siempre cargado | Reglas vigentes, mapa del código, equipo de agentes. |
| `/contexto` | Bajo demanda | Reconstruye el hilo y **contrasta `docs/` contra `git log`**. |
| MCP `memoria` | Continuo | Grafo de conocimiento persistente entre sesiones. Complemento, no sustituto. |

Sobre el último: el grafo de memoria MCP **no reemplaza a los archivos**. Es un índice de apoyo.
Los archivos están versionados, se revisan en los *pull requests* y los lee una persona; el grafo no.
Si solo está en el grafo, no cuenta como decidido.

---

## 4. Protocolo de traspaso entre sesiones

**Al cerrar** (`/estado`, skill `cerrar-sesion`):

1. Mirar los cambios reales, no reconstruir de memoria.
2. Reescribir `ESTADO.md`.
3. Escribir la bitácora, con la sección de aprendizajes.
4. Sincronizar la documentación que quedó mintiendo.
5. **Dejar escrita la primera tarea de la próxima sesión**, con el agente que debería tomarla.

El paso 5 es el que más rinde: quien abra el proyecto mañana empieza a trabajar en treinta
segundos, en vez de pasar veinte minutos averiguando dónde quedó todo.

**Al abrir** (automático, o `/contexto` si hubo un corte largo):

1. El hook inyecta el estado.
2. Si pasaron más de dos semanas, correr `/contexto` para contrastar documentación contra realidad.
3. Si hay discrepancia, **repararla antes de trabajar**. Trabajar sobre un hilo roto multiplica el daño.

---

## 5. Continuidad entre modelos distintos

El hilo no puede depender de *qué* IA trabaja. Por eso:

- Todo el contexto necesario está **en archivos de texto plano versionados**, no en la memoria de
  una herramienta ni en el historial de un chat.
- `CLAUDE.md` es legible por cualquier agente, de cualquier proveedor.
- Los agentes especializados son archivos markdown: se pueden traducir al formato de otra
  herramienta sin perder su contenido.
- El paquete de traspaso (skill `handoff-ia-externa`) es autosuficiente: incluye los archivos
  íntegros, no rutas.

**Prueba de fuego:** si mañana cambiamos de herramienta de IA por completo, ¿se pierde algo?
La respuesta debe ser *nada*. Si la respuesta es *sí*, hay contexto atrapado donde no debe estar.

---

## 6. Señales de hilo roto

Búscalas activamente. Cualquiera de estas exige parar y reparar:

- `ESTADO.md` con más de dos semanas y commits recientes en el repositorio.
- Un ADR cuya decisión fue abandonada en el código sin superseder.
- Dos partes del sistema resolviendo lo mismo de formas distintas.
- Una sesión que empieza preguntando "¿en qué íbamos?".
- Documentación que describe módulos que ya no existen o cambiaron de nombre.
- Un término del dominio que en el código aparece con otro nombre.

---

## 7. El costo

Este protocolo cuesta entre tres y cinco minutos por sesión.

Reconstruir el contexto perdido cuesta entre veinte minutos y una tarde. Corregir una decisión
contradictoria que ya se propagó por tres módulos cuesta días. La aritmética no admite discusión.
