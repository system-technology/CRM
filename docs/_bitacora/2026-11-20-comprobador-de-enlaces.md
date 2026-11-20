# 2026-11-20 — Comprobador de enlaces de la documentación (T-302, paso 1 de 4)

**Participantes:** documentador (Claude), propietario (aprobó el plan).
**Duración / alcance:** solo el comprobador. No se movió ni se borró ningún documento.

## Qué se hizo
- `scripts/comprobar-enlaces.mjs`: recorre los `*.md` versionados, extrae enlaces markdown y menciones
  en backticks de rutas del repo (`docs/`, `traspaso/`, `apps/`, `packages/`) y comprueba que existan.
  Solo biblioteca estándar. Falla solo por roturas nuevas respecto de la línea base.
- `scripts/enlaces-rotos.base.json`: 70 roturas de hoy. 49 son los enlaces markdown ya conocidos
  (48 en `docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md`, 1 en `docs/03-adr/0000-plantilla.md`);
  las otras 21 son menciones en backticks a rutas inexistentes.
  No se corrigió ninguna.
- Prueba `scripts/comprobar-enlaces.test.mjs`, añadida a `pnpm test:hooks`.
- `pnpm docs:enlaces` y el job `enlaces-de-documentacion` de CI, en modo aviso (`continue-on-error`).
  No está en `.github/proteccion-main.json`.
- T-302 en `roadmap/tasks.yaml` con los cuatro pasos.

## Decisiones tomadas
| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| El job de CI es aviso, no obligatorio | Hay 70 roturas viejas; subirlo a obligatorio antes de estabilizar la base bloquearía PRs ajenos | T-302 (paso 4) |
| La clave de la línea base es archivo + destino, sin número de línea | Editar el texto de alrededor no debe volver «nueva» una rotura vieja | Cabecera del script |

## Qué quedó pendiente
- [ ] Paso 2: mover lo de riesgo bajo, actualizando quienes lo citan.
- [ ] Paso 3: decidir la bitácora (el hook de arranque no recorre subcarpetas).
- [ ] Paso 4: índice de `docs/README.md` y subir el comprobador a obligatorio.
- [ ] Las menciones muertas en `.yml` y `.mjs` (el documento de flujo citado desde `ownership.yml` y `scripts/gh-app.mjs`;
      el de ciclo citado desde `scripts/ciclo.mjs`) quedan fuera: el comprobador solo lee `.md`.

## Qué aprendimos
Las menciones en backticks mezclan rutas con nombres de rama (`docs/adr-0009-parametrico`), archivos
locales ignorados por git (`docs/_contexto/CHECKPOINT.local.md`) y patrones (`AAAA-MM-DD`). El
comprobador ignora los tres; sin eso, la línea base nacía con unas 50 falsas roturas más.
