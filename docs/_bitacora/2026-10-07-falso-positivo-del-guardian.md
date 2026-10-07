# 2026-10-07 — Falso positivo del guardián de rama

**Participantes:** `integrador` + Claude Opus 5
**Alcance:** corrección del hook `guard-rama.mjs` y pruebas de la política.

---

## Qué pasó

Durante la etapa 7 de la primera integración real (limpiar la rama ya fusionada), el guardián
bloqueó este comando:

```bash
git push origin --delete docs/gobierno-de-integracion
```

Borrar una rama de trabajo en el remoto **no escribe una sola línea en `main`**. El bloqueo era un
defecto: la regla *«cualquier push estando parado en main exige autorización»* era demasiado
amplia.

## Qué se corrigió

- La decisión salió del hook a `lib/politica-rama.mjs`, como lógica pura.
- `pushTocaMain()` ahora distingue el objetivo real del push: borrado de otra rama, push de otra
  rama, o push sin refspec (que sí empuja la actual).
- Suite de 24 casos en `lib/politica-rama.test.mjs`, cableada a `pnpm test:hooks` y a un job
  propio en CI.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó |
|---|---|---|
| Extraer la política a un módulo puro | Permite probarla de verdad | `.claude/hooks/lib/politica-rama.mjs` |
| **No** añadir una variable de entorno para simular la rama en pruebas | Una puerta trasera para hacer verificable al guardián es peor que el defecto que evita | — |
| Los hooks de gobierno entran a CI | Son código; código sin pruebas se rompe en silencio | `.github/workflows/ci.yml` |

---

## Reincidencia, el mismo día

Horas después, el guardián bloqueó otro comando legítimo:

```bash
git commit -F - <<'MSG'
... Esta rama no se integra a main hasta que compile ...
MSG
git push -u origin feat/fase0-fundaciones-tecnicas
```

La palabra «main» **dentro del mensaje de commit** —cosa normalísima al documentar una
integración— activó la guarda del push.

Es el **mismo error de fondo** que el primero: analizar la cadena completa del comando trata
como argumento lo que es prosa. La corrección anterior arregló un síntoma; esta ataca la causa.

**Corrección:** `limpiarTextoLibre()` elimina, antes de analizar, los cuerpos de heredoc y todo
lo que sigue a `-m`, `--message` o `-F`. Seis casos de prueba nuevos, incluidos dos que
garantizan que un push real a `main` **sigue detectándose** pese al mensaje, y que
`git push origin "main"` entrecomillado tampoco se escapa.

Decisión explícita: **no** se eliminan todas las comillas. Perder una detección real es peor
que mantener un falso positivo.

## Qué aprendimos

**Un guardián que bloquea lo legítimo acaba desactivado.** Ese es el modo de fallo real de este
tipo de control: no que alguien lo burle, sino que estorbe lo suficiente como para que alguien lo
apague. Por eso un falso positivo en un guardián es más grave que en un linter.

**El defecto apareció usando la herramienta, no revisándola.** Pasó todas las verificaciones de
sintaxis y las pruebas manuales del día anterior. Lo descubrió la primera integración real.
Ninguna cantidad de revisión sustituye a usar la cosa.

**La corrección se hizo por el procedimiento, no esquivándolo.** Era tentador arreglarlo en `main`
—son dos líneas, en el propio guardián, y estábamos parados ahí—. Se hizo en
`fix/hook-guard-rama-falso-positivo` y pasó por la compuerta. Un proceso que se salta cuando
incomoda no es un proceso.

**Lo que se prueba es la decisión, no el efecto.** Simular ramas con una variable de entorno
habría abierto un camino para saltarse el guardián. Separar la lógica pura dio pruebas honestas
sin debilitar el control.

**Dos falsos positivos el mismo día, de la misma causa: el enfoque es frágil.** Reconocer patrones
sobre cadenas de shell es adivinar la intención a partir del texto, y el texto incluye prosa,
heredocs y comillas. Ha aguantado dos parches; si aparece un tercero, la respuesta no es otro
parche sino cambiar el enfoque —analizar los argumentos ya separados en lugar de la línea cruda—.

Dicho eso, el balance sigue siendo correcto: **el control ha bloqueado lo que debía bloquear en
todos los intentos reales**, y los falsos positivos se descubrieron usándolo, no en revisión.
Un guardián imperfecto que se corrige vale más que uno perfecto que nunca se escribió.
