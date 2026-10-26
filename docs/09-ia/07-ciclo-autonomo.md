# Ciclo autónomo — guía de una página

Decisión: [ADR-0016](../03-adr/0016-ciclo-autonomo-con-sesiones-de-opencode.md).

## Qué es
Dos supervisores (Backend y Frontend) que, sin que nadie los mire, toman una tarea de `roadmap/tasks.yaml`, la planifican, la revisan con otro modelo, la implementan, pasan las puertas y abren un PR que se integra solo si el CI está en verde.

## Arrancar, parar, ver
| Qué | Cómo |
|---|---|
| Instalar (una vez) | `.\scripts\ciclo-instalar.ps1` desde el checkout `D:\Projects\CRM-ciclo` (clon de `main`, limpio, con `npm ci` en `tools\roadmap-mcp`) |
| Arrancar ya | `Start-ScheduledTask -TaskName ViajaPro-Ciclo-backend` y `-frontend` |
| Ver el estado | `node scripts\ciclo-estado.mjs` |
| **Parar** | crear el fichero `D:\Projects\sesiones\STOP` (para entre ciclos; borrarlo reanuda) |
| Probar un ciclo sin publicar | `node scripts\ciclo.mjs backend --una --prueba` |
| Qué tarea tocaría | `node scripts\ciclo.mjs backend --elegir` |

## Qué le toca al Owner
1. Crear las tres GitHub Apps (ver «Identidades») y poner sus ids en `scripts/gh-apps.json`.
2. Subir `.github/CODEOWNERS` y los workflows nuevos (las apps no pueden tocar `.github/`).
3. Aprobar los PRs de rutas protegidas: migraciones, RLS, cifrado, infra, dependencias.
4. Claves de modelos (NVIDIA, OpenCode Go), secretos del repo y pagos.

## Identidades (GitHub Apps)
En la organización `system-technology` → Settings → Developer settings → GitHub Apps → New. Tres apps: `viajapro-integradora`, `viajapro-backend`, `viajapro-frontend`.
- Webhook: desactivado. Visibilidad: solo en esta organización.
- Permisos de repositorio: **Contents: Read & write**, **Pull requests: Read & write**, **Checks: Read**, **Actions: Read**, **Metadata: Read**. Nada más: sin Administration, sin Workflows.
- Generar una clave privada y guardarla como `~/.viajapro-keys/<integradora|backend|frontend>.pem`. **Nunca en el repo.**
- Instalar cada app solo en el repositorio `CRM`. Anotar el App ID en `scripts/gh-apps.json`.
- Para los workflows de cierre: variable de repo `INTEGRADORA_APP_ID` y secreto `INTEGRADORA_APP_KEY` (el `.pem` de la integradora).

## Cómo se verificó cada pieza
Se anota en la bitácora de la fase correspondiente (`docs/_bitacora/`).
