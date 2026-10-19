# Integración 2026-10-19 (décima) — `ci/primer-verde`, sin etiqueta

| Rama | Veredicto | Commit |
|---|---|---|
| `ci/primer-verde` @ `0e31bcf` | **DEVUELTA**: la lista blanca de gitleaks ocultaba una credencial real | — |
| `ci/primer-verde` @ `33283a5` | **INTEGRADA** (`d56f06c`, `--no-ff`) | sin etiqueta: CI, configuración y pruebas |

## La compuerta

Corrida https://github.com/Alfavear/CRM/actions/runs/39308173658, sobre `33283a5`. Es la punta
exacta: la rama iba 0 por detrás y el árbol fusionado es idéntico. Resultado comprobado con `gh run view`:
`secretos`, `typecheck`, `lint`, `build`, `test`, `aislamiento-tenants`, `fronteras-entre-modulos`
y `politica-de-rama` en **success**. `convencion-de-commits` sale *skipped*, porque solo corre en PR.

## Por qué volvió la primera vez

`.gitleaks.toml` permitía el literal `68488059…1c70f` como «token de una prueba unitaria». Lo comprobé
contra los `.env` (solo el nombre de la variable, sin imprimir el valor): **es el
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` de los cuatro árboles de trabajo**. Entró en `94bf78f`, en
`verificacion-suscripcion.spec.ts:4`.

## Lo que se comprobó en la vuelta

- La prueba genera el token con `randomBytes(16)` en cada corrida.
- El literal salió de `.gitleaks.toml`. Ahí solo queda la regla de `VAR=` vacío, que no puede casar
  con un valor.
- `.gitleaksignore` ignora una sola huella: commit completo + archivo + regla + línea
  (`94bf78fe…:apps/api/src/modules/inbox/domain/verificacion-suscripcion.spec.ts:generic-api-key:4`).
  Cualquier otra aparición del valor vuelve a poner el job en rojo.
- `git grep` del valor en `main` tras la fusión: 0 coincidencias en archivos rastreados. En el
  historial sigue en `94bf78f`, `020ef3a` y `33283a5`, porque la historia no se borra.
- **El comentario de `.gitleaksignore` dice «ya rotado» y no es cierto todavía.** Queda en
  `ESTADO.md` §4 como bloqueo del Usuario: rotar el token en Meta y en los cuatro `.env`. Su
  alcance es solo el apretón de manos GET.

## Los otros dos puntos

- `APP_ENV=local` solo está en el `env` del paso «Pruebas» del job `test`, en un contenedor efímero.
  No alcanza a ningún despliegue.
- El flujo local no cambia: `db:migrate` sigue en `migrate dev`, y el CI pasa a `db:migrate:deploy`,
  que ya existía.
