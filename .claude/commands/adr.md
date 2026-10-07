---
description: Redacta un nuevo registro de decisión de arquitectura (ADR).
argument-hint: <decisión a documentar>
---

Actúa como el agente `arquitecto` y escribe un ADR sobre:

**$ARGUMENTS**

Pasos:

1. Revisa `docs/03-adr/` para el siguiente número disponible y para detectar si esta decisión
   **supersede** alguna existente. Si la supersede, la nueva lo declara y la antigua se marca como
   superseded — pero su contenido **no se edita**: el registro histórico es el valor del ADR.
2. Usa `docs/03-adr/0000-plantilla.md`.
3. Nombra la **fuerza real** que motiva la decisión. Si no hay una presión concreta —volumen,
   acoplamiento, latencia, cumplimiento, velocidad del equipo— la respuesta correcta probablemente
   sea "no hagas nada todavía", y eso también es un ADR válido.
4. Documenta **las alternativas que se descartaron y por qué**. Esa sección es la que de verdad se
   lee dentro de un año, cuando alguien proponga exactamente lo que ya se descartó.
5. Declara las consecuencias negativas con honestidad. Un ADR que solo lista ventajas no fue pensado.
6. Actualiza `ESTADO.md` si la decisión cambia la cola de trabajo.
