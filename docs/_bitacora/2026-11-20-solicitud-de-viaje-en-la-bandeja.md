# 2026-11-20 — Solicitud de viaje en la bandeja y datos del viaje en el pipeline (T-259)

Puntos 4 y 5 de la auditoría UX (I1 e I2). Rama `feat/web-solicitud-de-viaje`.

- La conversación abre con la solicitud de viaje arriba del panel: destino, salida, pasajeros,
  plazo, cotización vigente y file, con un solo «Cotizar». Los campos personalizados bajan, plegados.
  Se quitan «Nueva cotización» (encabezado) y «Crear cotización» (pie del panel); «Enviar cotización»
  del redactor es otra acción (manda una ya guardada).
- El cotizador lee `destino`, `adultos`, `ninos`, `infantes` y `oportunidadId` de la URL.
- Filas de la bandeja y tarjetas del pipeline: «destino · mes · pasajeros» y plazo; el pipeline
  cambia el porcentaje por la fecha de salida.
- Sin N+1: la bandeja pide una vez el tablero y los archivos; el detalle de la cotización vigente se
  pide solo para la conversación abierta.
- Demo coherente: Juan es Cancún (diciembre, 2+2), Ana es Curazao, Felipe tiene el file 1043 de
  San Andrés (2+1); las fechas son «la próxima vez que llegue ese día» y no caducan.
- Límite conocido: sin archivo, la fila no tiene pasajeros (T-260, API).
