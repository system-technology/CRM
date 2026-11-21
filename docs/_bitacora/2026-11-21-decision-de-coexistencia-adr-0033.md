# 2026-11-21 — El propietario decide la coexistencia: ADR-0033 aceptado

El borrador del ADR-0033 llevaba en «Propuesto» desde las 00:28, cuando entró el PR #365 con la
verificación en Meta. Era camino crítico: bloqueaba conectar el número real de la agencia piloto.

## Qué decidió

**Opción B — coexistencia en el número actual con salvaguardas**, con las dos precisiones que el
borrador dejaba abiertas:

- **Sin historial.** No se pide el historial de 180 días ni se suscriben `history` ni
  `smb_app_state_sync`. Era lo que pedía `auditor-seguridad`, y la ventana para pedirlo son las
  primeras 24 h, así que la decisión es firme: no se pide.
- **La exclusión descarta**, no guarda aparte con otro régimen. Un chat excluido no deja fila de
  negocio, ni media, ni `outbox`, ni log. Lo que no entra no hay que custodiarlo, auditarlo ni
  borrarlo después.

**C (número separado) sigue siendo la salida** si falla alguna condición previa.

## Por qué B y no las otras

Lo escribió el borrador y la decisión lo confirma: con **C**, la mayoría de los clientes seguiría
escribiendo al número viejo y el piloto no vería el tráfico real, que es justo lo que el piloto
existe para ver. Con **A** se guardan datos de terceros sin finalidad, y eso no se arregla después.

## Lo que esta decisión NO autoriza

Aceptar el ADR **no basta para conectar el número real**. Siguen en pie las condiciones previas, y
conviene no confundir de quién es cada una:

| Qué falta | De quién |
|---|---|
| **T-533**: lista de exclusión y filtro en el trabajador, con prueba de punta a punta | Equipo |
| Aviso de privacidad actualizado y contrato de encargo de JD Tours | Propietario |
| Que el dueño de JD Tours saque sus chats personales del número | Propietario |
| **T-080** (Tech Provider), del que depende **T-337** (elegibilidad real) | Propietario |
| **Quién habla con el dueño de JD Tours** — pregunta 4 del borrador | **Sin decidir** |

## Nota de método

Un ADR aceptado no se edita (CLAUDE.md §9). Este estaba en **«Propuesto — no aceptado: decide el
propietario»**, es decir, un borrador escrito para ser completado: rellenar su «Decisión» es cerrar
su ciclo, no reescribir historia. Si mañana hay que cambiar de B a C, eso sí será un ADR nuevo que
lo supersede.
