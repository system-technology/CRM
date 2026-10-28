# Bitácora — Estados de sistema consistentes: 404, error global, sin conexión y sesión expirada (T-109)

**Fecha:** 2026-10-28  
**Autor:** Antigravity (`frontend`)  
**Tarea:** `T-109`  
**Rama:** `b/T-109-estados-sistema-consistentes`

---

## 1. Contexto y Objetivos

La tarea T-109 del backlog («Fase 1: Un CRM mostrable y endurecido») requería dotar a la plataforma web de estados del sistema consistentes, comprensibles y con la identidad visual de turismo:
1. `not-found.tsx`: ruta 404 personalizada cuando una página o recurso no existe.
2. `error.tsx`: captura de errores globales y React Error Boundaries con clasificación honesta.
3. Aviso de sin conexión en tiempo real ante caídas de red wifi o datos móviles.
4. Conservación de la ruta de destino al expirar la sesión mediante el flujo `/ingresar?redirigir=...&motivo=sesion_expirada`.
5. Pruebas unitarias de la lógica de clasificación de errores y sanitización de seguridad contra open redirects.

---

## 2. Lo que se implementó

### Lógica de Clasificación de Errores
- `apps/web/src/lib/errores-sistema.ts`:
  - `clasificarErrorSistema`: mapea cualquier fallo o código HTTP hacia un objeto estructurado (`InfoErrorSistema`) con título, mensaje amigable, sugerencia de acción, código de incidencia y flag `puedeReintentar`.
  - `esErrorSinConexion`: detecta `navigator.onLine === false`, `Failed to fetch`, `ECONNREFUSED`, `ETIMEDOUT` o mensajes de desconexión.
  - `esErrorSesionExpirada`: detecta respuestas 401, códigos `NO_AUTENTICADO` o tokens JWT expirados.
  - `esErrorNoEncontrado`: detecta respuestas 404 o códigos `NO_ENCONTRADO`.
  - `construirUrlRedireccionIngreso` & `sanitizarRutaRedireccion`: normaliza y sanitiza rutas relativas para evitar vulnerabilidades de redirección abierta (open redirect).

### Componentes de Interfaz
- `apps/web/src/app/not-found.tsx`:
  - Cabecera náutica con brújula animada e insignia 404.
  - Título «Esta ruta no está en nuestro mapa».
  - Botón principal de retorno a la Bandeja de WhatsApp (`/bandeja`) y accesos directos a `/cotizador`, `/catalogo` y `/pipeline` con touch targets `>= 44 px`.
- `apps/web/src/app/error.tsx`:
  - Error Boundary de Next.js (`'use client'`).
  - Muestra el ícono y contenido contextual según el fallo detectado (WifiOff, Lock, AlertTriangle).
  - Ofrece botón «Iniciar Sesión» (si expiró la sesión) o «Reintentar» invocando `reset()` (para fallos de servidor o red).
  - Incluye `error.digest` para soporte técnico sin filtrar stack traces ni datos sensibles (R6).
- `apps/web/src/components/comun/aviso-sin-conexion.tsx`:
  - Escucha los eventos `offline` y `online` del navegador.
  - Muestra un banner ámbar superior fijo cuando se pierde la conexión, con botón para comprobar la red manualmente.
  - Presenta un aviso flotante de confirmación cuando se restablece la conexión.
  - Integrado en `RootLayout` (`apps/web/src/app/layout.tsx`).
- `apps/web/src/components/auth/formulario-ingreso.tsx`:
  - Lee los parámetros `redirigir` y `motivo` de la URL mediante `useSearchParams`.
  - Muestra aviso de advertencia si la sesión expiró indicando la ruta hacia la cual se continuará.
  - Redirige al destino conservado al ingresar con éxito.

---

## 3. Calidad y Verificación

- `pnpm --filter @viajapro/web test`: 104 archivos de prueba, 832 pruebas unitarias pasando al 100%.
- `pnpm typecheck`: Limpio en los 5 paquetes del monorepo (`@viajapro/api`, `@viajapro/contracts`, `@viajapro/database`, `@viajapro/domain`, `@viajapro/web`).
- `pnpm lint`: Limpio (0 errores / advertencias).
- `pnpm test:hooks`: 59/59 casos de política de rama, 19/19 guardianes de secretos y 6/6 fronteras de módulos aprobados.
