# 2026-11-22 — T-090: borrador del ADR de supresión, exportación y retención

**Qué se hizo.** Se escribió [ADR-0037](../03-adr/0037-supresion-exportacion-y-retencion-del-titular.md),
en estado **Propuesto**, como borrador para que el propietario decida. No decide nada por su cuenta:
las once decisiones pendientes están numeradas (D1–D11) en §10, con opciones y consecuencias, y
marcadas `[legal]`, `[producto]`, `[riesgo]` o `[coste]`.

**Qué no se hizo, a propósito.** No se fijó ningún plazo de retención, ninguna ventana de respaldo
ni ningún plazo de respuesta al titular. No se revisaron ADR-0014 ni ADR-0015: el cifrado está
decidido y este ADR parte de ahí.

**Lo que se verificó en el código** (y no en la documentación), resumido en §1.1 del ADR:

- El cifrado de ADR-0015 está implementado (`apps/api/src/shared/cifrado/`), y la lectura de PII ya
  deja `LECTURA_DATOS_SENSIBLES` en `registros_auditoria`.
- **No existe** ningún caso de uso de supresión ni de exportación por contacto en `crm`.
- Redis no ve PII: las colas y el bus pub/sub transportan solo identificadores.
- `purgar_payloads` existe en la base desde la migración `20261007140100` y **ningún trabajo la
  invoca**.
- Un `DELETE` del contacto **falla** si tiene cotización (`RESTRICT`), archivo de viaje o pago
  (`NO ACTION`). Ese es el obstáculo real de la supresión, y no es técnico: es el choque con la
  obligación contable.
- Todavía no se guarda pasaporte ni fecha de nacimiento: `pasajeros` solo tiene nombre, tipo y edad.

**Lo que quedó abierto y hay que mirar.** Si `mensajes.wamid` lleva el teléfono del interlocutor
codificado (§11.1 del ADR). Es el único punto que podría ser bloqueante, y lo tiene que comprobar el
agente `whatsapp` contra un `wamid` real.

**Qué desbloquea.** T-097 (derechos del titular, P1) en cuanto se cierren D1, D2, D4 y D6. T-098
(contrato de encargo) necesita además D3.
