# 2026-11-20 - Un solo sistema visual y enlaces entre chat, cotización y file (T-282)

Puntos 3 y 7 de la auditoría UX (R3 e I5). Rama `feat/web-sistema-visual-y-enlaces`, sobre la de T-259.

## Punto 3: acción, color y fecha

- Una sola acción primaria: teal, morado y azul pasan al token `acento` (con sus tonos 200 a 950 en
  `globals.css`); clases `boton-primario` y `boton-secundario`. `BotonTurismo` en «mar» usa la misma.
  Verde solo en WhatsApp; el botón de la campana ya no es rojo, ámbar o verde según el aviso; «Confirmar
  pérdida» pasa a rojo; la tarjeta «por vencer» del inicio, a ámbar.
- Un solo formato de fecha en `lib/formato.ts`: «20 nov 2026» y «20 nov 2026, 10:30 a. m.» en la zona de la
  agencia (`fijarZonaAgencia`, que fija la barra de módulos al cargar los ajustes). Se retiran los
  `toLocale*` y los `Intl` sueltos y las fechas ISO a la vista.
- `CampoFecha` (dd/mm/aaaa) en el cotizador, la cotización guardada, las oportunidades y los seguimientos.
- Etiquetas en frase normal; las insignias de estado (ENVIADA, ACEPTADA…) conservan las mayúsculas.

## Punto 7: chat, cotización y file

- `EnlacesDelViaje` en el detalle de la cotización (conversación, contacto, file), en el detalle del file
  (conversación, contacto, cotización de origen) y en la ficha del contacto («Viaje vigente»).
- Sin endpoints nuevos ni una petición por fila: la conversación se busca en la bandeja por el teléfono del
  contacto y los files salen de una sola lista.
- La demo enlaza de verdad: el file 1043 apunta a la cotización de Felipe y el 1044, a una de Diana.

## Límites conocidos (T-283, backend)

- Ninguna cotización ni file trae `conversacionId`: la búsqueda por teléfono no ve conversaciones de otros
  asesores y es una petición más.
- No hay abonos ni saldo del archivo en los contratos: Reservas no muestra lo pagado (el botón «Registrar
  abono» es el cambio de estado de la reserva, no un pago).
- El campo de fecha y hora de Reservas (time limit, pago total) sigue siendo el del navegador.
