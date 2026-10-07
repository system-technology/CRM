---
name: auditoria-integral
description: Loop de auditoría multi-agente sobre el estado del proyecto — seguridad, aislamiento entre tenants, calidad de código, deuda técnica, cumplimiento normativo, veracidad de la documentación y salud operativa. Úsalo antes de cerrar cada fase del roadmap, antes de un release, y como revisión periódica programada.
---

# Auditoría integral

Una revisión del sistema completo por varios agentes especializados en paralelo, cuyos hallazgos
se consolidan, se verifican y se convierten en trabajo con dueño.

**Cuándo se ejecuta:** al cerrar cada fase del roadmap, antes de cada release a producción, y de
forma programada (quincenal durante desarrollo activo, mensual después).

---

## Paso 1 — Definir el perímetro

Antes de lanzar nada, decide y declara qué se audita:

- **Completa:** todo el repositorio. Para cierre de fase o release mayor.
- **Incremental:** solo lo cambiado desde la última auditoría (`git diff <tag-anterior>..HEAD`).
  Para la revisión periódica.

Escribe el perímetro en el informe. Una auditoría sin perímetro declarado no se puede repetir.

---

## Paso 2 — Lanzar las seis dimensiones en paralelo

Cada dimensión es un agente independiente, con su propio contexto. Van en paralelo porque no
dependen entre sí.

| Dimensión | Agente | Pregunta que responde |
|---|---|---|
| Seguridad y aislamiento | `auditor-seguridad` | ¿Puede un tenant ver o escribir datos de otro? ¿Hay un secreto expuesto? |
| Calidad y fronteras | `auditor-codigo` | ¿Hay defectos de corrección? ¿Se está erosionando la arquitectura? |
| Fidelidad del dominio | `experto-turismo` | ¿El modelo sigue reflejando cómo opera una agencia real? |
| Cobertura de pruebas | `qa` | ¿Qué camino crítico puede romperse sin que ninguna prueba se entere? |
| Salud operativa | `devops` | ¿Qué se cae un domingo y nadie se entera? ¿Cuánto cuesta cada tenant? |
| Veracidad documental | `documentador` | ¿Qué partes de `docs/` ya son mentira? |

A cada agente se le entrega: el perímetro, `CLAUDE.md`, `ESTADO.md` y los ADR vigentes.

---

## Paso 3 — Verificar antes de consolidar

**Ningún hallazgo entra al informe sin verificarse.** Por cada uno:

1. Abre el archivo y lee el código circundante. Muchas cosas que parecen defectos ya están
   manejadas aguas arriba.
2. Describe el escenario concreto que lo revela: quién, con qué entrada, obtiene qué.
3. Si no puedes construir ese escenario, el hallazgo se descarta. **Un hallazgo falso cuesta más
   que uno omitido**, porque entrena al equipo a ignorar la auditoría.

Marca cada superviviente como `CONFIRMADO` (reproducido) o `PLAUSIBLE` (razonamiento sólido, sin
reproducir).

---

## Paso 4 — Consolidar

```markdown
# Auditoría integral — <fecha>

**Perímetro:** <completa | incremental desde X>
**Archivos revisados:** <n>
**Hallazgos:** <n críticos, n altos, n medios, n bajos>

## Veredicto
<Dos o tres frases. ¿Este sistema se puede poner frente a clientes hoy? Sí o no, con el porqué.>

## Hallazgos
### [CRÍTICO] <título>
- **Dónde:** archivo:línea
- **Qué pasa:** ...
- **Escenario:** ...
- **Corrección:** ...
- **Dueño:** <agente>
- **Verificación:** CONFIRMADO | PLAUSIBLE

## Qué se revisó y salió limpio
<Explícito por dimensión. Un informe que solo lista problemas no deja saber qué quedó sin mirar.>

## Deuda aceptada conscientemente
| Deuda | Por qué se acepta | Cuándo se revisa |
```

---

## Paso 5 — Convertir en trabajo

- **CRÍTICO y ALTO:** se corrigen antes de continuar con cualquier otra cosa. Se asignan al agente
  dueño del área.
- **MEDIO y BAJO:** entran a `ESTADO.md` como deuda, **con dueño y fecha de revisión**.
  Deuda sin dueño es deuda que nadie pagará.
- El informe completo se guarda en `docs/_auditorias/AAAA-MM-DD-auditoria.md`.
- `ESTADO.md` se actualiza con el veredicto.

---

## Paso 6 — Cerrar el loop

Tras aplicar las correcciones, **vuelve a lanzar únicamente las dimensiones afectadas** y verifica
que los hallazgos quedaron cerrados. Una auditoría sin esta vuelta de verificación es una lista de
buenas intenciones.

---

## Disciplina

- No reportes estilo: para eso están ESLint y Prettier.
- Compara contra las auditorías anteriores en `docs/_auditorias/`: un hallazgo que reaparece es una
  señal sobre el proceso, no sobre el código.
- Si una dimensión no encontró nada, dilo explícitamente. El silencio no es un resultado.
