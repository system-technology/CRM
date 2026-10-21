# 2026-10-20 — Decisión del propietario: despliegue (ADR-0013)

El propietario quería desplegar en Vercel. Tras saber que la API, con Socket.IO, y el trabajador de
BullMQ no pueden correr en las funciones de Vercel, preguntó qué se recomendaba. La recomendación fue
llevarlo todo a Render, región Ohio. Luego respondió en su sesión a una pregunta cerrada sobre el
ADR-0013. Su respuesta, literal:

> «Acepto, solo staging primero»

## Qué queda decidido

- Render, región Ohio, junto a la base de Neon en `us-east-2`. Allí corren la web, la API con
  Socket.IO, el trabajador y Redis gestionado (Key Value con `noeviction`).
- **Solo staging por ahora**, a unos USD 51 al mes. Producción, a unos USD 142–177 al mes, se monta
  cuando la agencia piloto vaya a usarlo de verdad.
- Las migraciones se aplican desde GitHub Actions, con un SHA de `main` y el rol propietario, que nunca
  está en Render.

## Qué sigue

- `devops` prepara lo que no depende de cuentas: el blueprint de Render, las imágenes y el workflow
  de despliegue.
- El propietario sigue los pasos del ADR-0013:
  1. comprar el dominio neutro;
  2. abrir la cuenta de Render con tarjeta;
  3. crear la rama de staging en Neon, solo con el esquema;
  4. guardar los secretos por servicio;
  5. configurar los Environments de GitHub;
  6. configurar el DNS;
  7. hacer el Paso 2 de Meta.
