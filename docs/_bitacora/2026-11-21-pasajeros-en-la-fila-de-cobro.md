# 2026-11-21 — Pasajeros en la fila de cobro (T-582, carril a)

## Qué se hizo

La pantalla de cobros se entregó sin pasajeros. Este carril (contrato + API) añade a `FilaDeCobro`
(`packages/contracts/src/cobros.ts`) un campo `pasajeros: { adultos, ninos, infantes, total }`.

**Decisión de dominio (R10): solo el recuento, no los nombres.**

- `GET /api/v1/cobros` lo exige `cobro.ver`, que tienen DUENO, ASESOR y OPERACIONES
  (migración `20261121140000`). Los nombres y edades de los pasajeros (menores incluidos) exigen
  `archivo.ver` (ADR-0024 §3.7). Traer nombres a la vista de cobros le daría a quien solo tiene
  `cobro.ver` un dato que hoy no puede leer: una escalada de lectura.
- Esa vista acaba en un CSV exportable. Lo que sale en un CSV deja de estar bajo RLS, permisos y
  auditoría; no hay forma de saber a dónde llega ni cómo se borra. No hay respuesta honesta a «qué
  pasa cuando el CSV sale de la agencia», así que se elige el recuento.
- El recuento sale de `travel_files.adultos/ninos/infantes`: sin `JOIN`, sin migración, sin N+1. El
  dominio de `booking` obliga a que la lista de pasajeros cuadre con esa composición.
- El campo es opcional en el esquema (la web existente compila); la API lo envía siempre.

**Pregunta abierta (no bloquea):** ¿quiere la agencia ver el nombre del titular en cobros? Exigiría
decidir con el propietario si el CSV lo incluye, y probablemente `archivo.ver` además de `cobro.ver`
para la columna. Tampoco hay nombre del contacto en la fila; es un dato de CRM distinto y queda fuera.

## Pendiente: carril b (lo encola la sesión madre)

Columna «Pasajeros» en `apps/web/src/app/(app)/cobros/page.tsx` y en el CSV
(`apps/web/src/lib/exportar-csv.ts`), leyendo `fila.pasajeros` (ej. «2 adultos, 1 niño»); decidir
si el campo pasa a obligatorio en el contrato; mocks y pruebas de la web. Si se quiere el nombre
del contacto o del titular, es otra tarea con su decisión de PII.
