# 2026-10-13 — La unión del catálogo y el inbox

> Sesión del agente `datos`, en `feat/inbox-esquema` (`D:\Projects\CRM-inbox`).
> `main` avanzó a v0.18.0 con el ADR-0009 y esta rama se quedó atrás.

## El problema

`git merge origin/main` dejaba 23 conflictos en `packages/database/prisma/schema.prisma`. La
mayoría eran ruido de `prisma format` corriendo sobre dos bases distintas, pero cuatro eran
tramos grandes y de verdad.

## Lo que lo hizo tratable

Las dos ramas salen del mismo `main` y añaden tablas **distintas**. El resultado correcto es la
unión, no una elección — así que el conflicto no se resuelve leyendo tramos, se resuelve
comparando **bloque por bloque** contra la base común.

El procedimiento, que conviene repetir la próxima vez:

1. `git merge-base origin/main HEAD` da la base.
2. Partir las tres versiones del esquema (base, `HEAD`, `origin/main`) en un archivo por
   `model`/`enum`.
3. Comparar cada bloque **ignorando espacios** contra la base: eso separa lo que cada lado cambió
   de verdad de lo que solo reformateó.
4. Partir del esquema de `main` y volver a aplicar encima **solo** los bloques exclusivos del
   inbox.
5. Volver a partir el resultado y exigir que **cada bloque sea idéntico a uno de los dos lados**.
   El único que puede quedar distinto es el que ambos tocaron.

La comprobación del paso 5 es lo que da la certeza. Aquí dejó un solo bloque distinto de ambos,
`usuarios`, y su diferencia contra `main` son exactamente las dos líneas que añadió el inbox.

Después: `prisma format`, y comprobar que el diff **ignorando espacios** contra lo de antes es
vacío. Si no lo es, el formateador movió algo que no era suyo.

## Lo que entró

`vigencias`, `tarifas` y `politicas_de_precio` del ADR-0009 conviven con `conversaciones`,
`mensajes`, `adjuntos` y `plantillas_whatsapp` del inbox. Ninguna foránea cruza de un bloque al
otro. `salidas` ya no existe: es `vigencias`, y la semilla del inbox no la usaba.

`packages/database/package.json` y `prisma/seed.ts` los mezcló git solo, y la mezcla es la unión
correcta: el `resumen` de la semilla cuenta a la vez `vigencias`, `tarifas`, `conversaciones`,
`mensajes` y `plantillas`.

Un detalle que costó una compuerta en rojo: `main` añadió `@viajapro/domain` como dependencia de
`@viajapro/database`, y el árbol de trabajo no la tenía enlazada. `pnpm install` antes de
`pnpm build`, siempre, después de traer `main`.

## Lo que NO se tocó

**Ninguna migración.** La base de Neon ya tenía aplicadas las tres del inbox y la del catálogo. La
mezcla no necesita ninguna migración nueva, y la aserción 23 —que aplica la cadena completa desde
cero en una base recién creada— pasó, así que el orden de los archivos tampoco es un problema.

## Lo que queda rojo, y no es de esta rama

La suite de aislamiento **no lee `schema.prisma`**: habla SQL crudo contra la base. Así que su
resultado no puede depender de esta mezcla. Y aun así es intermitente: cuatro corridas en verde
50/50 y cuatro en rojo, con tres síntomas distintos (foránea a `tenants` que no existe, `57P01
terminating connection due to administrator command`, y aserciones 15/16 del directorio).

Medido, no supuesto: con un vigilante sobre `pg_stat_activity` durante una corrida se ven **dos
conexiones `neondb_owner` desde direcciones distintas** y los tres tenants de fixture
desapareciendo y reapareciendo cuando esta sesión no estaba haciendo ninguna de las dos cosas.
La base de Neon es de los cuatro árboles de trabajo, y esta noche había otro corriendo el mismo
arnés.

Es la tarea 0 de `ESTADO.md` por otro camino: el arnés de aislamiento necesita **fixtures que no
colisionen entre árboles** —identificadores por corrida, no tres UUID escritos en el código— o una
base por árbol. Mientras no lo tenga, «50/50» solo significa algo si nadie más está corriendo.
