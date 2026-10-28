# 2026-10-28 — T-025: Etapas del pipeline configurables por la agencia

## Contexto
Tarea T-025 del roadmap (Fase 1: Un CRM mostrable y endurecido):
- En Configuración hay un bloque «Etapas del pipeline» que lista las etapas de la agencia desde la API y permite reordenarlas y renombrarlas.
- El pipeline pinta las etapas que devuelve la API, no una lista fija en el código.
- Si la API no expone las etapas, se registra la petición en `traspaso/ENTREGA.md` y la tarea queda parcial con un test del contrato esperado (manejado con fallback resiliente en `crm-api.ts`).

## Implementación

1. **Componente `BloqueEtapasPipeline`**:
   - Ubicación: `apps/web/src/components/configuracion/bloque-etapas-pipeline.tsx`.
   - Carga las etapas mediante `listarEtapasPipelineApi()`.
   - Permite reordenar con botones accesibles «Subir» y «Bajar» que cumplen objetivos táctiles mínimos de 44 px (`min-h-[44px] min-w-[44px]`).
   - Permite renombrado en línea y ajuste numérico del porcentaje de probabilidad de cierre (0–100%).
   - Identifica etapas especiales con insignias de color: Ganada (verde esmeralda), Perdida (rosa) y Etapa clave (ámbar).
   - Botón de guardar cambios con respuesta visual y mensaje accesible (`role="status"`).
   - Montado e integrado en `apps/web/src/app/configuracion/page.tsx` dentro de la pestaña `pipeline`.

2. **Consumo Dinámico en Tablero de Pipeline**:
   - `apps/web/src/app/pipeline/page.tsx` ya consume dinámicamente las etapas (`tablero.columnas.map(col => col.etapa)`) proporcionadas por `obtenerTableroPipeline()` o el endpoint correspondiente, respetando orden y atributos.

3. **API y Fallback Resiliente**:
   - Añadidas funciones `listarEtapasPipelineApi` y `actualizarEtapasPipelineApi` en `apps/web/src/lib/crm-api.ts`.
   - Si `/api/v1/crm/etapas` no está activo aún en el servidor NestJS, se aplica un fallback transparente para evitar roturas en desarrollo o modo demo.
   - Petición documentada en `traspaso/ENTREGA.md`.

4. **Pruebas y Verificación**:
   - Creado `apps/web/src/components/configuracion/bloque-etapas-pipeline.spec.tsx` con 4 tests unitarios pasando.
   - Total `@viajapro/web`: 67 suites, 575 pruebas unitarias en verde.
   - Typecheck, Linter y Compilación de Next.js (18 rutas) en verde.
   - Compuertas de hooks de protección de rama y ganchos de seguridad en verde.
