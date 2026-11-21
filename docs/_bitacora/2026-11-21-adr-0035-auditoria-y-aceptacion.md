# 2026-11-21 — ADR-0035: auditoría de seguridad y aceptación (T-340)

**Problema.** El ADR-0035 estaba en `main` como «Propuesto» y ya estaba implementado (T-341, T-342, T-343): una violación de R7.

**Qué se hizo.** Se recorrió la lista de §9 contra el código de `main`, no contra el texto. No hubo
hallazgo bloqueante; el ADR pasa a **Aceptado** con la constancia de quién lo hizo y bajo qué
autorización (sesión de arquitectura y auditoría, orquestada bajo la autorización expresa del
propietario). El detalle, punto por punto, está en el propio ADR («Aceptación y auditoría»).

**Honestidad.** No se ejecutaron las pruebas en esta sesión; se apoya en el CI de `main`. Tampoco fue el
agente `auditor-seguridad` ni una persona. En `main`, el check `navegador` aparece en rojo: no se investigó
aquí y no tiene relación demostrada con este ADR.

**Pendiente, sin bloquear:** `experto-turismo` (T-493) y las tareas de cola que proponga la sesión madre.
