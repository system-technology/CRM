# 2026-10-28 — T-027: Equipo e invitaciones: invitar asesores, asignar rol y ver quién tiene acceso

## Contexto
Tarea T-027 del roadmap (Fase 1: Un CRM mostrable y endurecido):
- Configuración › Equipo lista usuarios y roles de la agencia desde la API y permite invitar por correo con un rol.
- Los errores de la API (código ya usado, límite de envíos, rol inválido) se muestran en español con qué hacer.
- Tests de componente; usable a 375 px (touch targets >= 44 px, sin desbordamiento horizontal).

## Implementación

1. **Capa API de Equipo y Manejo de Errores (`apps/web/src/lib/equipo-api.ts`)**:
   - Funciones tipadas: `listarMiembrosEquipoApi`, `listarRolesAgenciaApi`, `invitarMiembroApi`.
   - Soporte para consumo de `/api/v1/equipo` real con fallback a caché local resiliente cuando no hay conexión.
   - Traducción semántica con orientación activa en español: `interpretarErrorInvitacion` asigna mensajes comprensibles y un bloque «Qué hacer» explícito para `CODIGO_INVALIDO`, `DEMASIADOS_INTENTOS`, `INVITACION_INVALIDA`, `PERMISO_DENEGADO`, `SIN_SESION`, `CORREO_INVALIDO`, y `ROL_INVALIDO`.
   - Pruebas unitarias completas en `apps/web/src/lib/equipo-api.spec.ts` (8 pruebas).

2. **Componente `BloqueEquipo` en Configuración**:
   - Ubicación: `apps/web/src/components/configuracion/bloque-equipo.tsx`.
   - Montado en `apps/web/src/app/configuracion/page.tsx` en la pestaña `equipo`.
   - Tarjetas métricas: Total Usuarios, Dueños Activos, Asesores Comerciales e Invitaciones Pendientes.
   - Tabla responsiva de miembros con estados visuales (`ACTIVO`, `INVITADO`, `SUSPENDIDO`), teléfonos y fecha formateada para Colombia (`es-CO`).
   - Modal accesible de invitación (`useFocoModal`, WCAG 2.1) con selección de rol (`DUENO`, `ASESOR`, `OPERACIONES`), validación de correo y visualización de errores con recomendación «Qué hacer».
   - Totalmente adaptado para pantallas móviles de 375 px con botones y selectores táctiles >= 44 px.
   - Pruebas unitarias de componente en `apps/web/src/components/configuracion/bloque-equipo.spec.tsx` (5 pruebas).

3. **Pruebas y Verificación**:
   - `apps/web/src/lib/equipo-api.spec.ts`: 8 tests en verde.
   - `apps/web/src/components/configuracion/bloque-equipo.spec.tsx`: 5 tests en verde.
   - Total `@viajapro/web`: 72 suites, 602 pruebas unitarias en verde.
   - Typecheck (9/9), Linter (7/7) y Compilación Next.js (18 rutas) en verde.
   - Compuertas de hooks y fronteras (`pnpm test:hooks`): 59/59, 19/19, 6/6 en verde.
