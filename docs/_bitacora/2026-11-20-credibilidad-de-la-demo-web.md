# 2026-11-20 — Credibilidad de la demo de la web (T-258)

**Participantes:** agente `frontend`. **Origen:** auditoría UX, puntos 1 y 2 aprobados.

## Qué se hizo
- **Restos de desarrollo:** fuera los IDs de tarea (T-0xx), RLS, «Uptime 99.9%», TravelFile y «1 niños»;
  el ingreso apunta a la agencia minorista. Alternar API real, «Estrés (500 cot.)» y «(Usar API real)»
  solo con `NEXT_PUBLIC_HERRAMIENTAS_DEV=true`. El distintivo de demo queda uno por pantalla.
- **Datos de demo:** el ×100 era del mock (`unidades` en centavos para COP; el formateo estaba bien y
  ahora hay prueba). El mensaje del cliente «enviado por el asesor» era del mock (dirección alternada
  por índice con textos de cliente); el componente estaba bien. Fichas por contacto distintas, fechas
  relativas a hoy, contadores de Inicio calculados de la bandeja, time limit del file 1043 único,
  nombre de agencia único («Viajes El Sol»), maqueta de Reportes y del canal de WhatsApp con el
  contrato (R3), campo de fecha dd/mm/aaaa.

## Pendiente (cola)
- Otros `<input type="date">` (cotizador, oportunidades, seguimientos) siguen con el formato del navegador.
- Con 500 conversaciones de prueba, «Conversaciones pendientes» muestra 270.
