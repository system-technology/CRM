---
name: ciclo-funcionalidad
description: El loop completo para construir una funcionalidad en ViajaPro, de la idea al código integrado — definición, diseño, validación de dominio, implementación, pruebas, auditoría y cierre del hilo. Úsalo siempre que se vaya a construir algo nuevo, para que ninguna etapa se salte y la documentación quede al día.
---

# Ciclo de funcionalidad

El camino obligatorio de una idea hasta código integrado. Siete etapas. **Ninguna se salta**, pero
varias se pueden recorrer en minutos cuando el cambio es pequeño: el valor está en no olvidarlas.

Antes de empezar, lee `ESTADO.md` y confirma que lo que se va a construir pertenece a la fase actual
del roadmap. Si no pertenece, dilo y pregunta antes de seguir.

---

## Etapa 1 — Definir (agente `analista-producto`)

**Entrada:** una idea en lenguaje suelto.
**Salida:** historia de usuario en `docs/01-producto/03-historias/HU-<contexto>-<n>.md`.

La historia no está lista hasta que tenga criterios de aceptación observables, casos borde, sección
de *fuera de alcance* y una métrica de éxito. Si la idea no se puede medir, cuestiona construirla.

**Compuerta:** el usuario aprueba el alcance. No se avanza sin eso.

---

## Etapa 2 — Validar el dominio (agente `experto-turismo`)

**Entrada:** la historia.
**Salida:** lista de correcciones al modelo de negocio, con severidad.

Esta etapa existe porque el error más caro no es técnico: es modelar el negocio de turismo como si
fuera un e-commerce. Pregunta siempre: ¿qué pasa con el *time limit*? ¿quién paga contra quién
viaja? ¿la tarifa es neta o comisionable? ¿en qué moneda y con qué tasa?

**Se salta solo si** la funcionalidad no toca el modelo de negocio (por ejemplo, un cambio de
infraestructura).

---

## Etapa 3 — Diseñar (agente `arquitecto`)

**Entrada:** historia validada.
**Salida:** nota de diseño, y un ADR si la decisión es estructural.

Debe responder: qué módulos toca, qué contratos cambian, qué eventos de dominio aparecen, qué
migraciones hacen falta, y qué se rompe si falla a la mitad.

Si toca datos de tenants, pasa por `auditor-seguridad` **antes** de implementar, no después.

**Compuerta:** diseño aprobado. Un ADR pendiente bloquea la implementación.

---

## Etapa 4 — Preparar los datos (agente `datos`)

Solo si hay cambios de esquema. Modelo Prisma + migración + política RLS + seed actualizado +
prueba de aislamiento entre tenants. Nada de esto es opcional, ni siquiera "por ahora".

---

## Etapa 5 — Implementar (agentes `backend`, `frontend`, `whatsapp`, `ingeniero-ia`)

Orden que evita trabajo en vano:

1. Contratos en `packages/contracts` — es el acuerdo entre las dos mitades.
2. Dominio y casos de uso en `apps/api`.
3. Adaptadores de infraestructura.
4. Interfaz HTTP o manejadores de cola.
5. Web, contra los contratos ya existentes.

Backend y frontend pueden ir en paralelo **una vez que el contrato está cerrado**. Antes, no:
es la causa número uno de retrabajo.

---

## Etapa 6 — Verificar (agentes `qa`, `auditor-codigo`, `auditor-seguridad`)

En este orden, porque cada uno encuentra cosas distintas:

1. `qa` — lista de casos borde primero, pruebas después. Corre la suite y reporta el resultado real.
2. `auditor-codigo` — corrección, fronteras entre módulos, duplicación.
3. `auditor-seguridad` — **obligatorio** si la funcionalidad toca datos de tenants, dinero,
   credenciales o datos personales de viajeros.

Los hallazgos `bloqueante` y `CRÍTICO` se corrigen antes de integrar. Los demás van a
`ESTADO.md` como deuda explícita, con dueño. Deuda sin dueño es deuda olvidada.

---

## Etapa 7 — Cerrar el hilo (agente `documentador`)

- Actualizar `ESTADO.md`: qué se completó, qué sigue, qué quedó como deuda.
- Entrada en `docs/_bitacora/AAAA-MM-DD-<tema>.md`.
- Sincronizar los documentos de `docs/` que el cambio dejó desactualizados.
- Término nuevo del dominio → `docs/01-producto/02-lenguaje-ubicuo.md`.

**Una funcionalidad sin la etapa 7 no está terminada.** El código existe, pero la próxima sesión
no sabrá por qué.

---

## Ritmo según el tamaño

| Tamaño | Etapas completas | Ritmo típico |
|---|---|---|
| Corrección puntual | 5, 6 (solo `auditor-codigo`), 7 | Una sesión |
| Cambio pequeño | 1, 3 (breve), 5, 6, 7 | Una sesión |
| Funcionalidad | Las siete | Dos a cuatro sesiones |
| Capacidad nueva | Las siete, con ADR | Una fase del roadmap |

## Cómo reportas el avance

Al final de cada etapa, una línea: qué etapa cerró, qué salió, qué sigue, qué quedó bloqueado.
Sin narración de proceso. Si una compuerta requiere decisión del usuario, pídela de forma explícita
y detente ahí.
