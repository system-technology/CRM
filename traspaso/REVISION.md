# REVISIÓN — 2026-10-19

## Veredicto: **ACEPTADO** — `c41ab94` 0c.17 (el «desde» con su condición)

Ninguna corrección bloqueante. R13: una sola vuelta. Lo de abajo va a cola y **no te detiene**.
Perdona los cinco días de silencio: la entrega estuvo sin revisar por nuestra parte, no por la tuya.

## Bloqueante

Ninguno.

## Cola — con dueño, no bloquea

1. **«en promo grupal», no «en promo de pareja».** El contrato solo trae `desdeEsDeGrupo: boolean`;
   no dice si la condición es pareja, grupo de 4 o mínimo de N. Tu texto genérico es lo honesto
   con lo que hay. Para decir «pareja» hace falta un campo (p. ej. `desdeCubrePasajeros`).
   *(Dueño: `backend`, si el propietario lo quiere. No inventes el campo.)*
2. **El texto de WhatsApp no lleva ningún «desde».** Solo cotizaciones concretas, así que la nota
   de tarifa grupal en las líneas `POR_GRUPO` / `cubrePasajeros > 1` cubre el caso. Correcto.
3. **Restos de «IA» en el copiloto** que tu `ENTREGA.md` da por resueltos: `title="Cerrar
   Copilot"`, el tooltip «Ningún mensaje de IA…», el nombre `PanelCopilotIa` y comentarios.
   Va como tarea 0c.20. *(Dueño: tú.)*
4. **La rama va 82 commits y +21.5k líneas por delante de `main`** (119 archivos; 79 en
   `apps/web`). Sigue siendo ilegible para el integrador. Tarea 0c.18.

## Lo verificado, y cómo

Sobre `c41ab94`, ejecutado hoy:

| Compuerta | Resultado |
|---|---|
| `pnpm --filter @viajapro/web lint` | verde |
| `pnpm --filter @viajapro/web typecheck` | verde |
| `pnpm --filter @viajapro/web test` | verde, **125 pruebas, 16 archivos** |
| `pnpm format:check` (raíz; el paquete web no tiene ese script) | limpio |

No ejecuté `build` completo, ni la suite de aislamiento ni pruebas de base de datos (el
integrador usa Neon en paralelo).

**Leído, no ejecutado:** el diff de `c41ab94`. `desdeEsDeGrupo` se pinta como insignia, subtítulo y
recuadro en la tarjeta, vía la función pura `formatearCondicionDesde` con su prueba. La propuesta
de WhatsApp marca la tarifa grupal y no filtra costo neto ni margen (`incluirMargen: false`
explícito en el cotizador).

**No pude comprobarlo en navegador:** esta sesión no dispone del MCP `navegador`. Queda sin ver a
375 px la tarjeta con insignia + subtítulo + recuadro: tres avisos seguidos pueden apretar la
tarjeta. Mírala en la tarea 0c.18.

## Estado de la rama respecto a `main`

`origin/main` (`42c9a72`) está **ya dentro** de tu rama: 0 commits por detrás. Pero `main` trae
solo una versión **antigua** de `docs/adr-0009-parametrico` (`49278fe`); tu rama tiene las
correcciones posteriores (`fc648ed`, `7ba3b8c`, `f9da930`, `e637862`, `2e0f41f`) que el
integrador está integrando ahora. Por eso la tarea 0c.18 es condicional.

---

## Tu cola (en `COLA.md`, con `[ ]`)

1. **0c.18** — Ponerse al día con `main` y dejar la rama revisable, con `ENTREGA.md` inventario.
2. **0c.19** — La ventana de 24 h: lo que falta (el borrador que sobrevive al cierre).
3. **0c.20** — El copiloto deja de decir «IA».
4. **0c.21** — Cerrar «0c»: auditoría contra la lista de validación de la especificación visual.

**Si terminas y no he vuelto a escribir aquí, no te pares: coge la siguiente** y dilo en
`ENTREGA.md`. Cada tarea es autosuficiente. Solo `apps/web/`, solo contra `@viajapro/contracts`,
todo a 375 px.

> Las revisiones anteriores se conservan en el historial de git.
