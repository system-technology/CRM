# 2026-10-28 — T-110: Notificaciones en la web con Socket.IO, preferencias de asesor y confidencialidad R10

- **Tarea:** `T-110` (roadmap/tasks.yaml)
- **Tipo:** `feature`
- **Carril:** `b` (Frontend / Web)
- **Rama:** `b/T-110-notificaciones-web`

## Contexto y Necesidad
En una agencia de viajes, los asesores gestionan múltiples conversaciones de WhatsApp, tareas de seguimiento y cotizaciones con fechas límite de validez. Se requería:
1. Campana con contador dinámico y panel desplegable accesible.
2. Invariante de consentimiento: sonido de campana y notificaciones de escritorio desactivados por defecto; solo se emiten si el asesor los activa explícitamente en sus preferencias.
3. Invariante R10 (confidencialidad de datos personales): cero PII en el título de las notificaciones de escritorio (ningún nombre de pasajero, teléfono ni correo electrónico).
4. Canal en tiempo real mediante Socket.IO (`inboxSocketManager`) y sincronización con pendientes del CRM.

## Solución Implementada

### 1. `preferencias-notificaciones.ts`
- Almacenamiento local persistente (`viajapro_preferencias_notificaciones`) con valores por defecto seguros (`sonidoHabilitado: false`, `navegadorHabilitado: false`).
- Generador de audio nativo mediante Web Audio API con oscilador senoidal dual suave (523.25 Hz Do5 y 659.25 Hz Mi5), sin requerir archivos multimedia externos ni dependencias pesadas.
- Solicitud de permisos del navegador con `Notification.requestPermission()`.
- Títulos canónicos y seguros sin datos de personas (`TITULOS_SEGUROS_NOTIFICACION`).

### 2. `notificaciones-web.ts`
- Modelo unificado `NotificacionWeb` que abarca mensajes nuevos de WhatsApp (`'mensaje_nuevo'`), seguimientos comerciales vencidos (`'seguimiento_vencido'`), cotizaciones próximas a vencer (`'cotizacion_por_vencer'`) y alertas operativas (`'alerta_operativa'`).
- Procesador de eventos de Socket.IO (`MENSAJE_NUEVO` entrante).
- Generador de notificaciones iniciales integrando `obtenerPendientesDelDiaApi` y cotizaciones pendientes.
- Operaciones inmutables de lectura, descarte y marcado de notificaciones.

### 3. `PanelNotificaciones.tsx`
- Panel accesible con trampas de teclado (cierre con Escape), selector de filtros por categoría (Todas, WhatsApp, Seguimientos, Cotizaciones, Operativas), tarjetas con severidad cromática y acciones de navegación contextual rápida.
- Bloque de preferencias de aviso para el asesor con botón «Probar sonido» e interruptores de campana y notificaciones de escritorio.

### 4. `BarraModulos.tsx`
- Integración en tiempo real en la barra lateral de módulos (escritorio expandido y colapsado) y botón de acceso rápido en el diálogo de perfil para dispositivos móviles.

## Verificación de Calidad
- 4 suites específicas con 48 tests pasando.
- 107 suites y 863 tests totales en `@viajapro/web`.
- `pnpm typecheck` limpio en todos los paquetes del monorepo.
- `pnpm lint` con 0 errores y advertencias.
- `pnpm test:hooks` con 59/59 políticas de rama y 19/19 secretos validados.
