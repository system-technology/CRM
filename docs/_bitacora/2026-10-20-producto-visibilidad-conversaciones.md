# 2026-10-20 — Visibilidad de conversaciones (dueno-de-producto)

**Qué pasó:** se decidió, en modo desatendido, la regla de visibilidad de conversaciones dentro de
una agencia, que bloqueaba dar de alta al primer asesor del piloto.

**Decisión:** sin `conversaciones.ver_todas` se ven las asignadas a uno y la cola común. Responder
la primera vez asigna. Al reasignar, el anterior deja de verla. Al dar de baja a un miembro, sus
conversaciones pasan a la cola común. «Todos ven todo» se obtiene con los permisos del rol, sin
ningún ajuste nuevo. Se rechazan para v1 el modo «solo las asignadas» y el reparto automático, y
queda escrita la condición para reconsiderarlos.

**Dónde:** `docs/01-producto/12-visibilidad-de-conversaciones.md`, con los criterios CA1-CA17.
Dos términos nuevos en el lenguaje ubicuo.

**Pendiente:** `backend` implementa la regla en REST y en el socket. `qa` convierte CA1-CA17 en
pruebas. El script de alta del piloto debe preguntar si la agencia quiere «todos ven todo».
