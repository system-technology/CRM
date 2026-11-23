# 2026-11-22 · Turno nocturno de la orquestadora

`main` de **`e5b670e0`** a **`7580325b`**. **Veinte PR integrados.** El propietario se fue a dormir
dejando el turno a cargo, con un orden: navegabilidad, veracidad de la documentación, campaña de
pruebas, Ley 1581 y los dos contextos que faltan. **«Que lo último sea lo mío.»**

## Lo que entró

| Qué | PR |
|---|---|
| La cadena de navegación cerrada en los dos sentidos | #524 |
| Fotos de destinos en el ingreso, como dato configurable | #526 |
| La hidratación del modo demo: de 15 rutas rotas a 1 | #516 |
| El mapa de cobertura y nueve coberturas falsas corregidas | #527 |
| **El error de dinero del cotizador** | #529 |
| Los dos refactores de la guía de Chrome | #512, #513 |
| El check de rutas protegidas (en `main`, **no obligatorio todavía**) | #517 |
| La cola saneada, dos veces | #522, #523 |

## El hallazgo

**La campaña de pruebas se pagó sola en su primera ejecución.** La aserción nueva comparó, por primera
vez en la vida del proyecto, el total del cotizador con el de la cotización guardada:

> el detalle muestra «$ 550.000» y el cotizador mostraba 275000

**El cotizador enseñaba el precio de una persona mientras su barra decía «2 adt».** La causa no era
una suma doble: eran **dos caminos que mandaban distinta composición desde el mismo fichero** —
`undefined` al cotizar, un `2` literal al guardar, a cien líneas de distancia. La API no tenía ningún
error: aplicaba su contrato.

**No se tocó la prueba.** El PR se dejó en rojo y sin auto-merge hasta que el defecto estuvo
arreglado, y el arreglo **unificó los dos caminos en una función** en vez de parchear el número.

## Nueve pruebas que no probaban nada

La peor: **seis de siete comprobaciones de título buscaban un texto que es también la etiqueta del
menú lateral**, siempre visible. **Pasaban con la pantalla vacía.** Mismo patrón que T-604.

Y el total enviado por WhatsApp se comprobaba con `toContain('*Total:')` — **bastaba la etiqueta,
aunque el importe estuviera mal**.

## Quince afirmaciones falsas en la documentación

Verificadas **una por una, con un comando cada una** (#525, pendiente de aprobación). La más
llamativa: **el stack declaraba `shadcn/ui` y `TanStack Query`, y ninguno de los dos está
instalado** — están en un ADR, no en el `package.json`.

## La compuerta que no existía

**#511 se integró sin una sola revisión** tocando `CLAUDE.md`. `require_code_owner_reviews: true` con
el contador de aprobaciones en **0** no exige nada. **R11 mentía**, y se descubrió **pasando por
ella**, no auditándola.

Al arreglarlo apareció algo peor: **GitHub no deja que el autor apruebe su propio PR**, y todos los de
la sesión salen a nombre del propietario. De ahí el modelo nuevo que él decidió —los PR los abre la
app Integradora— y **el orden que no se puede alterar**: enrutado, luego el check, y solo entonces
marcarlo obligatorio.

## Lo que no se hizo, y por qué

- **No se empezaron `automation` ni `audit`.** Al mirarlos, `audit` **ya funciona repartido** (la
  tabla existe y se escribe; su hueco real es que **no tiene purga**), y `automation` es «reglas e IA
  del producto», que **no se empieza sin ADR** y arrastra coste por conversación y responsabilidad
  sobre lo que la IA afirme. Queda como **T-645**, bloqueada en el propietario.
- **No se cerró T-126.** Hizo la parte posible, pero pide un recorrido manual con Postgres y aquí no
  se puede levantar. **El CI no lo sustituye.**
- **No se lanzó la siembra de la demo.** El workflow rotaba la contraseña y **la imprimía en claro en
  un repositorio público**. Se partió en dos (#532) en vez de usarlo.

## Errores propios

1. **Afirmé que tres PR esperaban aprobación sin comprobar que la compuerta corriera.** El mismo error
   que llevaba dos días corrigiendo en otros.
2. **Envenené la cola**: `depends_on` a una tarea que nunca registré. Una sola dependencia rota **apaga
   el cierre automático del repositorio entero**.
3. **Encargué al `arquitecto` que empujara una rama**, y ese agente no tiene `Bash`.

## Pendiente del propietario

**#521** (el enrutado — desbloquea la compuerta), **#525**, **#528** (ADR-0037, once decisiones) y
**#532**. Fuera de los PR: **rotar los secretos (T-598, P0)**, el registro ante la SIC (T-098) y la
verificación con Meta (T-080).
