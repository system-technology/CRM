# 2026-10-20 — El cotizador antiguo no entrega el neto sin `incluirMargen`

**Defecto (R10):** `POST /api/v1/paquetes/cotizar` devolvía siempre `totalNeto`, `margen`,
`margenPorcentaje` y `subtotalNeto` por línea. Barrido de la API: `GET /api/v1/paquetes/:id` devolvía
el `neto` de cada precio de cada temporada.

**Corrección** (mismo patrón que `/catalogo/cotizar` y `/cotizaciones`):
- `POST /paquetes/cotizar`: `incluirMargen` opcional en el cuerpo (`CotizarPaquete`). Sin él, ninguna
  de las cuatro claves existe en la respuesta.
- `GET /paquetes/:id`: `?incluirMargen=true` para el `neto` de cada precio.
- Contratos: `Precio.neto` pasa a opcional; `CotizarPaquete.incluirMargen` nuevo.
- e2e `paquetes-sin-margen.e2e-spec.ts` (fixture propio): busca en el texto completo de la respuesta
  neto, margen, porcentaje, política y base sin el flag; los encuentra con él.
- Barrido del resto: `/catalogo/salidas`, `/catalogo/cotizar`, `/cotizaciones*` y CRM ya respetaban el flag
  o no exponen neto.

**No hecho a propósito:** el permiso (403) llega con `feat/identity-modulo`.
**Web:** `api.cotizar` (que llama a la ruta antigua) no se usa en pantallas; el cotizador web usa el
simulador local. Con `Precio.neto` opcional hubo que guardar tres usos en web
(`ficha-detalle-paquete.tsx`, `cotizador-logica.ts`, `catalogo-logica.spec.ts`). Avisar a Antigravity.
**Cola:** `mayoristaId`/`mayorista` siguen saliendo en `/paquetes` y `/paquetes/:id` (identidad del
mayorista, no neto); decidir con la autenticación.

## Segunda vuelta (tras v0.34.0, permiso)
`POST /paquetes/cotizar` y `GET /paquetes/:id` llaman a `autorizarMargen()` antes de entregar neto o
margen: sin `cotizacion.ver_neto_y_margen`, 403 `PERMISO_DENEGADO`. e2e en `identity.e2e-spec.ts`
(asesor 403 en las dos rutas, dueña 200 con campos). Barrido de `incluirMargen` en `apps/api/src`:
salidas, cotizaciones (guardar, versiones, leer) y las dos de paquetes pasan por `autorizarMargen`;
ninguna otra lo acepta.
