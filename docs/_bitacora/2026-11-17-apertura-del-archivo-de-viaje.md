# 2026-11-17 — Apertura del archivo de viaje (T-241, parte backend)

**Participantes:** agente `backend`. La parte de datos (migraciones 20261117120000, 20261118090000 y
20261118090100) ya estaba en `main`.
**Alcance:** ADR-0024 §1 y §3.1: del evento de aceptación al archivo de viaje abierto.

## Qué se hizo

- **Evento.** `quoting` escribe `quoting.cotizacion_aceptada` (v1, solo identificadores) en el outbox
  dentro de la transacción de `ENVIADA → ACEPTADA`, después del UPDATE y de la fila de historial. El
  esquema vive en `packages/contracts/src/eventos.ts` (R3): lo importan productor y consumidor.
- **Despachador** (`apps/api/src/shared/eventos/`). Un `DespachadorDeConsumidor` por consumidor, en el
  contenedor de la API (`AppModule`, vale para `unico` y `escalado`). Descubre agencias con
  `tenants_con_eventos_por_entregar`, y por cada evento reclama la entrega en `entregas_de_eventos`
  (`INSERT … ON CONFLICT DO UPDATE … WHERE entregado_en IS NULL`) y corre el consumidor con el mismo
  `tx`. El fallo revierte todo, suma `intentos` y guarda solo el código del error; a los 10 se abandona.
  El `PlanificadorDeDespacho` lo despierta con el aviso en memoria (camino normal) y con un barrido al
  arrancar y cada `DESPACHO_INTERVALO_MS` (60 min por defecto).
- **Módulo `booking`.** Consumidor `booking.abrir_archivo` → `AbrirArchivoDeViajeUseCase` → `TravelFile`
  con su número de file (`max + 1` bajo candado de transacción por agencia) y un `Booking` `PENDIENTE`
  por mayorista (o «por definir»). Pide la versión aceptada a `quoting` por `PuertoVersionAceptada`
  (`shared/puertos/puertos-hacia-quoting.ts`).
- **Pruebas.** Unitarias de dominio, caso de uso, consumidor, despachador y evento; `fronteras-del-modulo.spec.ts`
  (R4, sin vías de plataforma); e2e `booking-apertura.e2e-spec.ts` con dos agencias.

## Pendiente (no bloquea)

- `quoting` aún no congela `mayoristaId` por línea ni la TRM en la versión (ADR-0024 §2): las columnas y
  el disparador ya existen, falta que el cotizador las llene. Hasta entonces toda reserva nace «por
  definir» y `travel_files.trm_*` queda nulo. El puerto ya lee ambos si vienen.
- Un fallo se reintenta en la siguiente pasada (60 min por defecto): 10 intentos son horas. Ajustable por
  entorno; si hace falta reintento rápido, es una decisión de operación.
- `crm.ganar_oportunidad` (T-191) usará el mismo despachador: basta registrar otro consumidor.
