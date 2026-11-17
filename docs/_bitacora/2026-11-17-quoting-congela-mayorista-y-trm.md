# 2026-11-17 — quoting congela el mayorista por línea y la TRM (T-241, cierre)

**Participantes:** agente `backend`. **Alcance:** ADR-0024 §2, la parte de `quoting`. Las columnas `trm_*`
y el disparador de alta ya estaban en `main` (migración 20261118090000); no se escribió ninguna migración.

## Qué se hizo

- **Mayorista por línea.** Al guardar una cotización o añadir una versión, `recalcular` lee el
  `mayorista_id` de cada tarifa de las líneas (consulta aparte, con el predicado de tenant, dentro de la
  misma transacción) y lo congela en el JSON de `lineas`. Una tarifa sin mayorista congela `null`: la
  reserva nace «por definir». El cálculo (`CotizacionDeSalida`) no cambia: el mayorista no es parte de lo
  que ve quien cotiza.
- **TRM.** `ComposicionDeVersion` admite `trm?: { valor, fecha, fuente }` (R3, `packages/contracts`). El
  servidor pone origen = moneda de la versión y destino = `tenants.moneda_iso`; `valor` es decimal exacto
  en texto (6 decimales). Sin `trm` la versión queda sin TRM: no se inventa una tasa, aunque su moneda no
  sea la de la agencia (la migración tampoco la exige). Con `trm` en una versión ya en la moneda de la
  agencia: `TRM_INNECESARIA` (422), en vez de dejar que lo rechace el CHECK.
- **Lectura.** `VersionDeCotizacion.trm` (nullable, opcional) devuelve la TRM congelada. El `mayoristaId`
  de las líneas **no sale por la API** (ni con margen): el mapeador lo quita; solo lo lee `booking` por el
  puerto.
- **Pruebas.** Unitarias de `congelar-en-la-version` y del mapeador; el e2e `booking-apertura.e2e-spec.ts`
  gana tres casos (dos mayoristas + TRM abre un archivo con dos reservas y la TRM; sin TRM no se inventa;
  TRM sobrante da 422).

## Pendiente

- El e2e nuevo no se pudo correr localmente (sin Postgres con roles); lo corre el CI.
- La web aún no ofrece dónde escribir la TRM (contrato listo; el frontend depende de `trm` en
  `ComposicionDeVersion`). Consultar la TRM oficial a un tercero sigue fuera (ADR-0024 §2).
