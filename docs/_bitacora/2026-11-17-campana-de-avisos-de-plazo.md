# 2026-11-17 — Campana de avisos de plazo en la web (T-255)

**Participantes:** agente `frontend`.
**Alcance:** mostrar en la campana de la barra lateral las notificaciones en la aplicación de T-254
(`GET /api/v1/notificaciones`, `POST .../:id/lectura`).

## Qué se hizo

- **Se reutilizó la campana existente** (`BarraModulos` + `PanelNotificaciones`) en vez de crear otra:
  los avisos del servidor se mezclan con las notificaciones locales (mensajes, seguimientos,
  cotizaciones), con un filtro nuevo «Plazos». El punto rojo pasó a contador numérico (`99+`).
- `lib/avisos-plazo-api.ts`: cliente validado con `ListaDeNotificaciones` (R3, sin tipos a mano). En demo
  (`estaUsandoApiReal()` falso) devuelve dos avisos de ejemplo con la forma del contrato y marcar leída es
  solo local.
- `lib/avisos-plazo-logica.ts`: compone el texto («Time limit del file 1043: vence en 3 horas (sáb 3 oct
  2026, 10:00 a. m.)») con la zona de `/agencia/ajustes` (R9); enlaza a `/viajes?id=<archivoId>`.
- `lib/use-avisos-de-plazo.ts`: refresco cada 3 minutos solo con la pestaña visible, y al abrir el
  desplegable solo si el dato tiene más de 15 s; marcar leída es optimista y, si el servidor falla, se
  vuelve a pedir la lista. Sin websockets nuevos.
- Panel: esqueleto al cargar, error con qué hacer y botón «Reintentar», estado vacío; en un aviso, el
  botón principal lo marca leído y abre Reservas, y «Marcar leída» lo marca sin navegar. «Descartar» no
  borra avisos del servidor (no hay endpoint): los marca leídos.

## Verificación

`pnpm --filter @viajapro/web typecheck`, `lint` y `test` (160 archivos / 1288 pruebas) en verde.
**No corrido:** la campana contra la API real en un navegador, ni el caso con 500 avisos (la API limita
a 100 por página; la lista del panel no está virtualizada).

## Pendiente (no bloquea)

- «Marcar todas leídas» dispara un POST por aviso no leído; un endpoint masivo lo evitaría.
- El contador mezcla `noLeidas` del servidor con las no leídas locales.
