# 2026-10-20 — El contador del barrido pasa a la base

Agente: `backend`. Rama `fix/inbox-barrido-contador-en-base`, desde `origin/main` (v0.32.0+).

- `PuertoPendientes` gana `contarReencolado` y `listar(…, maxReencolados)`. `PendientesPrisma` llama a
  `contar_reencolado_barrido` y pasa el tercer argumento de `listar_changes_pendientes`.
- Fuera: el contador de Redis (`BarridoBullmq.contarReencolado`, TTL) y su método en
  `PuertoCoordinacionDelBarrido`. Quedan en Redis solo el turno y la cola.
- e2e del barrido: un change con 11 reencolados contados en la base deja de listarse (con tope 10, el
  décimo todavía sale una última vez: la función usa `<=`, a propósito).
- Tarea 2 (baja de cuenta da de baja sus canales): NO hecha. No existe en `apps/api` ningún caso de uso
  que dé de baja una cuenta (nada escribe `cuentas_whatsapp.estado`). El disparador
  `propagar_estado_cuenta` solo toca filas WABA del directorio, no `canales`. Dueño: el caso de uso
  llegará con la tarea de onboarding/identidad; entonces debe revocar `canales` en la misma
  transacción con RLS. Una cascada en base sería cambio de esquema (`datos`).
