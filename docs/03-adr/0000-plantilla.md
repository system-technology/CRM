# ADR-0000 — Plantilla

- **Estado:** Propuesto | Aceptado | Rechazado | Superseded por [ADR-XXXX](...)
- **Fecha:** AAAA-MM-DD
- **Decide:** <quién tiene la última palabra>
- **Consultados:** <agentes y personas>

---

## Contexto

¿Qué fuerza real motiva esta decisión? Volumen, acoplamiento, latencia, cumplimiento, velocidad del
equipo, costo. Sé concreto: si no se puede nombrar la presión, la respuesta correcta probablemente
sea "no hagas nada todavía" — y eso también es un ADR válido.

## Opciones consideradas

### A — <nombre>
Qué es, en dos frases.
- **Gana:** ...
- **Cuesta:** ...
- **Cierra:** qué deja de ser posible si elegimos esto

### B — <nombre>
...

## Decisión

Una opción, declarada sin ambigüedad. Y el porqué en dos o tres frases.

## Consecuencias

### Positivas
- ...

### Negativas
- ... (**esta sección es obligatoria.** Un ADR que solo lista ventajas no fue pensado.)

### Qué habría que cambiar para revertir esto
- ...

## Cuándo revisar esta decisión

La condición concreta que nos haría reconsiderar: un umbral de volumen, un cambio de proveedor,
una exigencia de un cliente. Sin esto, la decisión se vuelve dogma.

---

> Un ADR aceptado **no se edita jamás.** Si la decisión cambia, se escribe uno nuevo que declara
> `Supersedes: ADR-XXXX`, y el antiguo se marca `Superseded by` conservando su contenido intacto.
> El valor de un ADR no es decir qué hacemos hoy —eso lo dice el código— sino **qué se descartó y
> por qué**, para que nadie vuelva a proponerlo dentro de seis meses.
