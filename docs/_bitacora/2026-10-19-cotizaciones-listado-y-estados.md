# 2026-10-19 — Cotizaciones: listado, estados y filtro de errores

Rama `feat/quoting-listado-y-estados`.

- `GET /api/v1/cotizaciones`: cursor (instante de la última versión + id), filtros `estado`, `contactoId`, `desde`/`hasta` (sobre la última versión, `hasta` exclusivo). Cada fila: venta de la última versión y número de versiones. Sin neto ni margen, y sin `incluirMargen` (el esquema es estricto y lo rechaza).
- `POST /api/v1/cotizaciones/:id/estado`: BORRADOR -> ENVIADA -> ACEPTADA | RECHAZADA | VENCIDA. Al enviar se fija `versionEnviada` (la última) y `enviadaEn`. Función pura en `quoting/domain/estado-de-cotizacion.ts`. Los tres finales no admiten versión nueva (409 `COTIZACION_TERMINAL`); transición inválida, 409 `COTIZACION_TRANSICION_INVALIDA`.
- Filtro global: `_NO_ENCONTRADA` y `_NO_ENCONTRADO` dan 404 (antes los de `crm` en femenino salían 400).
- Contratos nuevos en `packages/contracts/src/cotizaciones.ts`: `CambiarEstadoDeCotizacion`, `ListarCotizaciones`, `FilaDeCotizacion`, `PaginaDeCotizaciones`.
- Sin migración: el esquema ya tenía estado, `version_enviada` y `enviada_en` con sus CHECK.

Pendiente (cola): `incluirMargen` sigue esperando la autenticación (ADR-0011). Un e2e de `inbox-relay` falló una vez en la primera corrida y pasó en la segunda sin cambios (flaky, ajeno a este cambio).
