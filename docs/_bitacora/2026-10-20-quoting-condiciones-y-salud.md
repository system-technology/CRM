# 2026-10-20 — quoting: condiciones no evaluables, ruta antigua retirada, /salud/listo 503

Rama `fix/quoting-condiciones-y-salud`. Tres defectos de la auditoría integral del propietario.

1. **Edad y silla.** El cálculo solo recibe conteos (adultos, niños, infantes). Una tarifa con
   `edadMinima`, `edadMaxima` u `ocupaSilla` que cubriría a alguien ya no se cobra: sale en
   `noAplicables` con su motivo (`condicionNoEvaluable`). Si por eso quedan pasajeros sin precio y
   no hay alternativas de grupo, se lanza `TarifasConCondicionNoEvaluableError`
   (`TARIFAS_CON_CONDICION_NO_EVALUABLE`) en vez de devolver un total corto.
2. **Ruta antigua.** `POST /api/v1/paquetes/cotizar` (y su caso de uso `CotizarPaqueteUseCase`)
   retirada: nada en `apps/web` la llamaba (`api.cotizar` estaba definido y sin usos; también se
   quitó). Se retiraron sus pruebas e2e; `GET /paquetes/:id` conserva `autorizarMargen`. Las
   tablas `Paquete`, `Temporada` y `Precio` NO se tocan: es de `datos`, otra rama.
3. **`/salud/listo`** responde 503 si el rol salta RLS o la base no responde; el cuerpo mantiene el
   mismo detalle y no incluye la causa del error de conexión.

## Siguiente paso
Modelar la edad por pasajero y si el infante ocupa silla. Cambia el contrato de
`CotizarSalida`: requiere a `experto-turismo` antes de implementar.

## Pendiente de CI
Las e2e (necesitan Neon) y `database:test` no se corrieron en local.
