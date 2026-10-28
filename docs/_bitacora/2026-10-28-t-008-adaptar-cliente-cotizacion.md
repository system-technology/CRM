# 2026-10-28 — T-008: Adaptar el cliente de la web a la retirada de la ruta antigua de cotización de paquetes

## Contexto
Tarea T-008 del roadmap (Fase 1: Un CRM mostrable y endurecido):
- `apps/web/src/lib/api.ts` no llama a la ruta antigua de cotizar-paquete (`/api/v1/paquetes/cotizar`), la cual fue retirada en el backend durante T-007 (PR #21).
- El cotizador de `apps/web` sigue cotizando contra la ruta vigente (`POST /api/v1/catalogo/cotizar`); cubierto por pruebas.
- `pnpm compuertas` en verde.

## Implementación

1. **Retirada de la ruta antigua y delegación en `apps/web/src/lib/api.ts`**:
   - Se removió el método obsoleto `api.cotizar` que invocaba `POST /api/v1/paquetes/cotizar`.
   - Se integró `api.cotizarSalida` delegando a `cotizarSalidaApi` (`apps/web/src/lib/catalogo-api.ts`), que apunta a la ruta vigente `POST /api/v1/catalogo/cotizar` con el contrato canónico `CotizarSalida` de `@viajapro/contracts` (R3).
   - Se reexporta `cotizarSalidaApi` directamente desde `api.ts`.

2. **Pruebas y Verificación**:
   - Creado `apps/web/src/lib/api.spec.ts` (4 pruebas):
     - `api.listarPaquetes` consulta `/api/v1/paquetes` y no la ruta retirada.
     - Lanza `ErrorApi` tipado cuando la respuesta coincide con el sobre de error contractual (`EsquemaError`).
     - Lanza `RESPUESTA_NO_RECONOCIDA` si el error no es contractual (ej. 502 Bad Gateway).
     - `api.cotizarSalida` delega a `/api/v1/catalogo/cotizar` y no a `/api/v1/paquetes/cotizar`.
   - Pruebas del cotizador (`apps/web/src/app/cotizador/page.spec.tsx`): 6 pruebas pasando.
   - Total `@viajapro/web`: 73 suites, 606 pruebas unitarias en verde.
   - Typecheck (9/9), Linter (7/7) y Compilación Next.js (18 rutas) en verde.
   - Ganchos y fronteras (`pnpm test:hooks`): 59/59, 19/19, 6/6 en verde.
