# 2026-10-20 — Visibilidad de conversaciones, implementada (backend)

**Qué pasó:** se implementó `docs/01-producto/12-visibilidad-de-conversaciones.md` (CA1-CA17) en la
rama `feat/inbox-visibilidad`. No hizo falta esquema nuevo: `conversaciones.asignado_a_id` ya existía.

**Lo que no existía y se construyó.** La API de la bandeja no tenía rutas REST (solo el webhook y el
socket), así que «aplicar la regla en la bandeja, los mensajes, las notas, la media, la búsqueda y los
contadores» exigió crearlas: `api/v1/conversaciones` (lista con búsqueda, contadores, detalle,
mensajes, notas, adjunto, responder, nota, leída, estado, asignación). Responder guarda el mensaje
como `PENDIENTE`; el envío real por la Cloud API sigue siendo de `whatsapp`.

**La regla vive en un solo sitio:** `apps/api/src/shared/autorizacion/visibilidad-de-conversaciones.ts`
(`puedeVer`, `filtroDeVisibilidad`, `quienesVen`). Está en `shared/` porque `crm` también la necesita
(R4). El repositorio (`conversaciones.prisma.ts`) parte de `ambito(tenantId, visibilidad)` en toda
consulta; los casos de uso sacan la visibilidad del contexto y no filtran nada. Conversación ajena e
inexistente son indistinguibles (`null` → `404 CONVERSACION_NO_ENCONTRADA`).

**Socket: filtro antes de emitir, por la sala `usuario:<id>`.** No se emite a `tenant:<id>`. Al
procesar cada evento se calcula, en ese instante, quién ve la conversación (asignación + permiso
`ver_todas` leídos de la base) y se emite a las salas de esos usuarios. Se descartó «una sala por
conversación» porque habría que mover sockets de sala al reasignar o editar un rol; calculando al
emitir, CA16 (rol cambiado sin reconectar) sale gratis. Al reasignar, quien la veía y ya no, recibe un
evento nuevo `CONVERSACION_RETIRADA` (contrato) para que su bandeja quite la fila.

**Latencia de CA11 (< 5 s).** Las acciones de la API escriben el evento en el outbox, y el relay vive
en el trabajador con barrido de 15 s. Para no esperar al barrido, la API publica un aviso por Redis
(`viajapro:aviso-relay`, solo el id de la agencia) y el trabajador lo convierte en la pista del relay.
El outbox sigue siendo la verdad; si el aviso se pierde, el barrido lo encuentra.

**Dar de baja.** Ruta nueva `POST api/v1/identidad/miembros/:id/baja` (`usuarios.administrar`): en una
transacción desactiva al miembro, suelta sus conversaciones (puerto `PuertoConversacionesDeMiembro`,
implementado por `inbox`) y escribe `identity.acceso_revocado`.

**Contrato tocado (`packages/contracts`):** evento `CONVERSACION_RETIRADA`; `limite` con `coerce`;
esquemas nuevos `ContadoresBandeja`, `PaginaMensajes`, `ListaDeNotas`, `ConsultarMensajes`,
`AdjuntoDeConversacion`, `NotaDeConversacion` y los cuerpos `*Cuerpo`. **El frontend** debe tratar
`CONVERSACION_RETIRADA` (quitar la fila, cerrar el hilo abierto).

**Pruebas:** unitarias (`visibilidad-de-conversaciones.spec.ts`, `emitir-eventos-en-vivo.spec.ts`,
`bandeja-visibilidad.use-case.spec.ts`, `asignacion-de-conversacion.spec.ts`) y e2e
`inbox-visibilidad.e2e-spec.ts`, una prueba por CA con su número, dos agencias y, en una, dos asesores y
un dueño. Las e2e no se corrieron en local (Neon compartido): las valida el CI.

**Cola (no bloquea):**
- Un disparador en `usuarios` que suelte las conversaciones al desactivar por cualquier vía (hoy solo
  lo hace la ruta de baja) — `datos`.
- La descarga de media a S3 (`GET` del contenido del adjunto y su URL firmada) — `whatsapp`/`backend`.
- Notas de automatización (autor nulo) no salen en el detalle: el contrato exige autor — `backend`.
- `unirse`/sala `tenant:<id>` quedan solo como pertenencia; si nadie las usa, retirar — `backend`.
- Quitar `ver_todas` a un rol no empuja `CONVERSACION_RETIRADA` a quien ya no ve (pasa en su
  siguiente petición); cuando exista la administración de roles, emitirlo — `backend`.
