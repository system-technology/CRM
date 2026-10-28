# Bitácora — Cotizaciones guardadas: versiones, reenvío por WhatsApp y duplicar (T-107)

**Fecha:** 2026-10-28  
**Autor:** Antigravity (`frontend`)  
**Tarea:** `T-107`  
**Rama:** `b/T-107-cotizaciones-guardadas-versiones`

---

## 1. Contexto y Objetivos

La tarea T-107 del roadmap v2 («Fase 1: Un CRM mostrable y endurecido») requería completar el flujo de ciclo de vida de cotizaciones guardadas:
1. Listado y detalle con sus versiones inmutables.
2. Botón para enviar por WhatsApp utilizando la lógica de composición y mensajes de T-074, con enlace profundo `wa.me`, previsualización en vivo y notificación de la regla de 24 horas de Meta.
3. Duplicar cotización completa (desde el listado) y duplicar versión específica (desde el detalle como versión N+1).
4. Cumplimiento estricto de la regla R10 y del ADR-0011: **cero fugas de información de neto y margen**. Quien no tenga el permiso `cotizacion.ver_neto_y_margen` no debe recibir ni ver en el DOM el panel de auditoría comercial de margen ni los importes netos unitarios.

---

## 2. Lo que se implementó

### Lógica de Dominio y Clientes API
- `apps/web/src/lib/cotizaciones-logica.ts`:
  - `generarMensajeWhatsAppCotizacion`: formatea una cotización para envío amigable por WhatsApp con destino, fechas, número de pasajeros y desglose de tarifas en COP.
  - `generarEnlaceWhatsApp`: construye el enlace directo a `https://wa.me/{telefono}?text=...`.
  - `duplicarVersionComoComposicion`: extrae la composición exacta requerida para solicitar al backend la creación de la versión siguiente.
  - `duplicarCotizacionComoEntrada`: adapta una cotización para registrar una nueva cabecera y versión inicial.
  - `calcularDesgloseMargen`: calcula la auditoría comercial en base a venta, neto y margen con redondeo; si `puedeVerNeto` es `false`, oculta y enmascara de manera estricta los importes de costo.
- `apps/web/src/lib/cotizaciones-api.ts`:
  - `cambiarEstadoCotizacionApi`: `POST /api/v1/cotizaciones/:id/estado`.
  - `duplicarVersionCotizacionApi`: duplica la versión especificada generando la versión N+1 inmutable.
  - `duplicarCotizacionApi`: clona una cotización entera como borrador nuevo.

### Componentes de Interfaz
- `apps/web/src/components/cotizaciones/modal-enviar-whatsapp-cotizacion.tsx`:
  - Selector de versión a enviar.
  - Vista previa en tiempo real del mensaje.
  - Botón de copiado al portapapeles.
  - Aviso de ventana de 24 horas de Meta.
  - Botón para abrir y enviar por WhatsApp (`window.open` con `wa.me`) y marcar la cotización como `ENVIADA`.
- `apps/web/src/app/cotizaciones/page.tsx`:
  - Botones de acción rápida en tarjetas móviles y tabla de escritorio para enviar por WhatsApp y duplicar cotización.
  - Feedback visual con banners de notificación accesibles.
- `apps/web/src/app/cotizaciones/[id]/page.tsx`:
  - Integración del hook `usePermisos` y evaluación de `puedeVerNetoYMargen`.
  - Panel «Auditoría Interna de Margen Comercial (ADR-0011)» renderizado condicionalmente y omitido al 100% del DOM para usuarios sin permiso.
  - Columnas de «Neto Unit.» y «Margen Unit.» restringidas exclusivamente a usuarios autorizados.
  - Acciones de cabecera: «Enviar por WhatsApp», «Modificar (Nueva Versión)» y «Duplicar versión».

---

## 3. Calidad y Verificación

- `pnpm --filter @viajapro/web test`: 100 archivos de prueba pasando, 800 pruebas unitarias en verde.
- `pnpm typecheck`: Limpio en los 5 paquetes del monorepo (`@viajapro/api`, `@viajapro/contracts`, `@viajapro/database`, `@viajapro/domain`, `@viajapro/web`).
- `pnpm lint`: Limpio (0 errores / advertencias).
- `pnpm test:hooks`: 59/59 casos de política de rama, 19/19 guardianes de secretos y 6/6 fronteras de módulos aprobados.
