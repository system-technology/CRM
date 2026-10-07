---
description: Lanza la auditoría integral multi-agente (seguridad, calidad, dominio, pruebas, operación, documentación).
argument-hint: [completa | incremental] [ámbito opcional]
---

Ejecuta la skill `auditoria-integral`.

Perímetro solicitado: **$ARGUMENTS**
(si no se indicó nada, usa `incremental` sobre lo cambiado desde la última auditoría en
`docs/_auditorias/`, o `completa` si no existe ninguna).

Lanza las seis dimensiones en paralelo, verifica cada hallazgo antes de consolidarlo —descartando
los que no puedas reproducir con un escenario concreto—, y entrega el informe en
`docs/_auditorias/AAAA-MM-DD-auditoria.md`.

El veredicto va primero y responde una pregunta directa: **¿este sistema se puede poner frente a
clientes hoy?** Sí o no, con el porqué en dos frases.

Termina convirtiendo los hallazgos en trabajo: críticos y altos a corregir ya; medios y bajos a
`ESTADO.md` como deuda con dueño y fecha de revisión.
