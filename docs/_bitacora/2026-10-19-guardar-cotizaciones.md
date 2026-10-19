# 2026-10-19 — Guardar cotizaciones (tarea 6)

Rama `feat/quoting-guardar-cotizacion`, desde `860d335` (v0.22.0, esquema ya integrado).

## Rutas

- `POST /api/v1/cotizaciones` — cabecera + versión 1 (201).
- `POST /api/v1/cotizaciones/:id/versiones` — versión siguiente (201).
- `GET  /api/v1/cotizaciones/:id` — cabecera con todas sus versiones.
- Las tres aceptan `?incluirMargen=true`; sin él, ni `neto` ni `margen` salen (se omiten las claves).

## Contratos (`packages/contracts/src/cotizaciones.ts`)

`GuardarCotizacion`, `AnadirVersionACotizacion`, `ComposicionDeVersion`, `CotizacionGuardada`,
`VersionDeCotizacion`, `PoliticaAplicada`, `EstadoCotizacion`. Los de entrada son `.strict()`: un
cuerpo con importes se rechaza con 400 en vez de ignorarse en silencio.

## Decisiones

- **El servidor recalcula, dentro de la misma transacción que escribe.** `CotizarSalidaUseCase`
  se partió en `ejecutar` (abre transacción) y `calcular(tx, …)`; guardar usa `calcular` con
  `incluirMargen: true` para conservar el margen aunque luego no se muestre.
- **Margen desconocido es nulo, no cero:** si alguna línea no trae margen, `neto` y `margen` de la
  versión quedan `null` (dominio `armarVersion`, probado).
- **Numeración sin carrera:** `añadir versión` bloquea la cabecera (`FOR UPDATE`) antes de tomar
  `max(numero)+1`.
- **crm sin importarlo (R4):** contacto y oportunidad se comprueban leyendo sus tablas bajo RLS con
  predicado de tenant explícito; la base lo respalda con las FK compuestas.
- Códigos de error terminados en `_NO_ENCONTRADO` para que el filtro global los dé como 404.

## Verificación

- Unitarias: `version-de-cotizacion.spec.ts` (7), `cotizaciones.spec.ts` de contratos.
- `cotizaciones.e2e-spec.ts` contra Neon con dos agencias de fixture (no escribe en la demo: las
  versiones solo las borra la purga): guardar, recalcular, rechazo de importes, versión 2 tras subir
  la tarifa sin que cambie la 1, disparador de inmutabilidad, aislamiento entre tenants, contacto
  ajeno, oportunidad inexistente, fecha sin vigencia no deja filas.

## A cola

- El filtro global traduce a 404 solo códigos `_NO_ENCONTRADO`; `crm` tiene
  `OPORTUNIDAD_NO_ENCONTRADA` y `ETAPA_NO_ENCONTRADA`, que hoy salen como 400 (dueño `backend`).
- Sin autenticación, `incluirMargen=true` no se contrasta con un rol (igual que cotizar).
- No hay listado de cotizaciones por contacto ni cambio de estado/envío: el esquema los admite,
  los casos de uso no existen todavía.
- `creado_por` queda nulo hasta que exista identidad.

## Corrección R10: la política solo viaja con `incluirMargen=true`

`VersionDeCotizacion.politica` salía siempre. Con base `SOBRE_EL_NETO`, porcentaje y venta, el neto
sale por división (`neto = venta / (1 + %)`). Ahora `politica` es opcional en el contrato y se omite
entera, clave incluida, junto con `neto` y `margen`, en las tres rutas.

Barrido del resto de la respuesta: `origenDeLaVenta` y `redondeoVenta` solos no despejan el neto,
pero son parte de la misma política interna y se ocultan con ella. `lineas` ya se limpiaba de
`margen` y `margenPorcentaje`; `venta`, `precioUnitario` y `total` son precio de venta. No hay
listado de cotizaciones todavía, así que no hay otra superficie. La e2e busca en el TEXTO de la
respuesta (`neto|margen|politica|porcentaje|redondeo|origen|SOBRE_|DERIVADA|FIJADA`), no en claves
conocidas: un campo futuro que filtre también la pone en rojo.
