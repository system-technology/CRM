# Runbooks

> **Documento pendiente.** Marcador para que ningun enlace quede roto y para que se vea
> con claridad que falta por escribir.

| | |
|---|---|
| **Que debe contener** | Qué hacer cuando suena cada alerta. Una entrada por alerta; sin runbook no hay alerta. |
| **Agente responsable** | `devops` |
| **Cuando se escribe** | Fase 1 |

Al completarlo: eliminar este aviso, actualizar `ESTADO.md` y dejar entrada en `docs/_bitacora/`.

---

## Entradas escritas

### El trabajador no late (`/salud/listo` informa `trabajador` distinto de `ok`)

**Sintoma.** `GET /salud/listo` responde 200 con `"estado":"degradado"` y `trabajador` en `viejo`,
`sin_latido` o `sin_verificar`. La sonda de staging (`deploy-staging.yml`) falla por eso.

**Que significa.** El trabajador escribe `viajapro:trabajador:latido` en Redis cada 15 s (caduca a
los 60 s; se considera viejo pasados 45 s). Sin latido, los mensajes de WhatsApp entran y se guardan
pero **nadie los procesa**: la bandeja no se actualiza y los envios no salen.
- `viejo` / `sin_latido`: el proceso murio, esta reiniciando, o no alcanza Redis.
- `sin_verificar`: es la API la que no alcanza Redis (o el valor es ilegible). Mirar Redis primero.

**Que hacer.**
1. Render, servicio `viajapro-worker-staging`: estado y registros. Si no arranca, el mensaje de
   salida dice por que (rol de base de datos equivocado, secreto ausente: muere ruidoso a proposito).
2. Si esta vivo pero no late: comprobar `REDIS_URL` del trabajador y que el Redis (`viajapro-redis-staging`) responde.
3. Reiniciar el trabajador (deploy hook o boton de Render). Al volver, el barrido (30 s) recupera lo
   que quedo guardado sin encolar: no hay que reenviar nada a mano.
4. Verificar: `/salud/listo` vuelve a `"estado":"ok"` en menos de 20 s.

**Por que no tumba la API.** La ruta es la sonda de la API en Render; un trabajador caido no debe
impedir un despliegue ni sacar la API de rotacion. Se informa, no se bloquea.
**En local:** `pnpm dev:nube` arranca el trabajador; con `pnpm dev` solo, y con `REDIS_URL` puesta, el
estado sale `degradado` hasta arrancar `pnpm --filter @viajapro/api worker`.
