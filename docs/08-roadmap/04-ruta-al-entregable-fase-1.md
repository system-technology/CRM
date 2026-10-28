# Ruta al entregable: Fase 1, «Piloto utilizable» (JD Tours)

| | |
|---|---|
| Fecha | 2026-10-27 |
| Relación | Aterriza la Fase 1 de `02-roadmap-producto-v3.md` §3 en tareas de `roadmap/tasks.yaml`. No la sustituye |
| Estado vivo | `ESTADO.md` y `roadmap/tasks.yaml` mandan sobre este documento |

## Qué se entrega

Un asesor de JD Tours trabaja una jornada sin abrir el WhatsApp del celular. **Se demuestra** así,
en staging y con el número de prueba de Meta mientras C1–C5 no estén en verde: 20 conversaciones
atendidas, 5 cotizaciones enviadas desde ViajaPro que llegan a un teléfono, un seguimiento fechado
en cada conversación sin cerrar, y el asesor declara que no abrió el celular.

## Hitos, en orden

| Hito | Qué lo cierra | Tareas | Quién | Estado |
|---|---|---|---|---|
| **H1. Catálogo real cargable** | La agencia carga y edita su catálogo desde la pantalla | Backend T-040 a T-051 (**hecho**); pantallas T-028 a T-031 | Antigravity | Backend listo; pantallas pendientes |
| **H2. Cotizar excursiones** | Cotizador con opción de salida y cargos aparte; tarjeta y ficha de excursión | T-063 (PR #96), T-064 a T-066 (PR #98), T-017, T-018, T-019, T-051 | Agentes + Antigravity | En integración |
| **H3. Conversar** | Los mensajes entran y salen: Redis y trabajador, envío a Meta probado, contacto y oportunidad | T-079 (bloqueada: Render), T-075, T-076; envío ya construido (PR #44) | backend, whatsapp, devops | T-075 y T-076 sin empezar |
| **H4. Enviar la cotización** | Texto con formato desde la conversación, dentro de la ventana de 24 h | T-073, T-074 | backend, frontend | Sin empezar |
| **H5. Seguimiento** | Seguimientos con fecha e inicio del asesor con pendientes | T-077, T-020 | backend, Antigravity | Sin empezar |
| **H6. Pulir** | Plantilla de reapertura, equipo e invitaciones, es-CO y 375 px, identidad visual | T-078 (bloqueada: Meta), T-027, T-022, T-023, T-032 a T-036 | Antigravity, whatsapp | Pendiente |
| **H7. Ensayo de jornada** | La demostración completa | T-081 (bloqueada: depende de T-079) | propietario + todos | Al final |

## Camino crítico (lo que más tarda y no es código)

1. **Verificación del negocio en Meta (T-080).** Tarda semanas y no está iniciada. Es lo primero que
   debe arrancar el propietario: no consume desarrollo y es lo que más puede retrasar la entrega.
2. **Despliegue en Render con Redis y trabajador (T-079).** Sin esto no existe «staging» ni
   conversaciones reales. Toca `render.yaml` e `infra/`, que esperan la aprobación del propietario.
3. **Aprobación de la plantilla de reapertura (T-078).** Tiempo de aprobación no verificado.

## Reglas de convivencia

- Ninguna fase pone datos reales de viajeros en producción antes de C1–C5 (`01-roadmap.md` §2).
- Los datos de JD Tours viven fuera del repo y la demo es privada hasta tener su permiso escrito.
- Terminado = integrado en `main` (R11). Una pasada de revisión por tarea (R13); en aislamiento entre
  agencias no se recorta.
- Si hay que recortar, se recorta alcance antes que verificación: la plantilla de reapertura y
  las respuestas rápidas (H6) pueden salir después de la jornada de ensayo; H3 a H5 no.
