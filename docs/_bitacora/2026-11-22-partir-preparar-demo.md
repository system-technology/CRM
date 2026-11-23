# 2026-11-22 · T-646: partir `preparar-demo-staging.yml` en dos

**Problema.** Un solo workflow sembraba la demo y ponia la contrasena; exigia una contrasena para
sembrar, y la imprimia en claro (con el correo) en el resumen, en un repositorio publico. Por eso las
etiquetas de T-614 (#509) no llegaban a staging: relanzarlo rotaba la clave del cliente del piloto.

**Hecho.** Dos workflows (se retira `preparar-demo-staging.yml`):
- `sembrar-demo-staging.yml`: sin `inputs`; diagnostico + semilla idempotente. No toca credenciales.
- `rotar-credencial-demo-staging.yml`: contrasena obligatoria sin valor por defecto; diagnostico +
  credencial. No siembra (si no hay agencia demo, se niega).
Guardias conservadas en ambos: solo `staging`, solo `main`, falta de `DIRECT_URL`, agencias ajenas.

**Por que dos y no un `input` de modo.** Sembrar queda sin ningun campo que escribir (no se puede pasar
una clave por error ni elegir el modo destructivo), cada uno tiene su nombre en la lista de Actions, y
el coste es ~30 lineas de preparacion duplicadas.

**Fuga.** El resumen ya no lleva contrasena ni correo (`resumenDeLaPreparacion`). En el registro la
contrasena se lee del archivo del evento, se enmascara con `::add-mask::` y no pasa por `env:`.
Limite: GitHub muestra los valores de `workflow_dispatch` en la pagina de la ejecucion; no se puede
evitar con un `input`. Alternativa si importa: leerla de un secreto del Environment.

**Sin probar.** Ningun workflow se ha ejecutado (no corren hasta estar en `main`); sin `act` ni
`actionlint`. Tras integrar: lanzar `sembrar-demo-staging.yml` (sin riesgo para la clave del cliente).
