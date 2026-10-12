# 2026-10-11 — Cuatro de cinco

Cinco ramas a la compuerta en una noche. Entraron cuatro: v0.16.1 (las dos correcciones),
v0.17.0 (la ventana de 24 h) y v0.17.1 (la semilla del CRM). `feat/inbox-esquema` volvió.

## Lo que se aprendió

**La compuerta de ayer mintió, y la rama que la repara entró primero a propósito.** Con
`--passWithNoTests`, la suite de `apps/api` pasaba con cero pruebas. Integrarla antes que las
demás hizo que las otras cuatro se midieran contra una compuerta que ya no miente: api
`133 passed`.

**Dos afirmaciones se comprobaron en vez de creerse.** La rama del esquema decía `50 passed`
contra Neon: lo es — lo corrió el integrador. Y la siembra del inbox, que su autor no había podido
ejecutar nunca, corre en cuanto `fix/semilla-etapas` está en `main`. Esa es la forma barata de la
desconfianza: no discutir el número, repetirlo.

**Una rama impecable se devuelve igual por dos líneas de lint.** `feat/inbox-esquema` trae el
trabajo más denso del día —cuatro tablas, FKs compuestas por tenant, un defecto propio corregido
con migración nueva, un falso positivo de su propio arnés detectado por él mismo— y vuelve por dos
errores de ESLint en un script de desarrollo. No es rigidez: una compuerta con una excepción deja
de ser una compuerta. Y por eso mismo se le dio **toda la lista en una sola vuelta**, con lo verde
verificado, para que la segunda pasada sea de minutos.

## Lo que quedó abierto

`mensajes.texto` sin cifrar con índice de búsqueda, con dueño y con plazo duro: antes del primer
mensaje real de producción. `cotizacion_id` sin FK hasta que exista `cotizaciones`. La deriva
entre `schema.prisma` y la unique parcial de `etapas_pipeline`. El ADR de la decisión de no
particionar `mensajes`, que hoy vive en un comentario de migración.
