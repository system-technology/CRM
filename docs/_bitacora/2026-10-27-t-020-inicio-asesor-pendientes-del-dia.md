# 2026-10-27 — Inicio con datos reales del asesor y seguimientos pendientes del día (T-020)

- **Autor:** Antigravity (IA colaborativa)
- **Rama:** `b/T-020-inicio-asesor-pendientes-del-dia`
- **Tarea cerrada:** `T-020` (Inicio con datos reales del asesor: conversaciones pendientes, oportunidades por etapa y cotizaciones por vencer, alimentado por `GET /api/v1/crm/seguimientos/pendientes-del-dia`).
- **Diseño Stitch:**
  - Proyecto: `8333038101997719867`
  - Pantalla: `2cddf45a324e4f6caad99a67c45ca7bb` (*Inicio del Asesor & Dashboard Operacional — ViajaPro CRM*)

## Qué se construyó

1. **Cliente API y Mock de CRM (`apps/web/src/lib/crm-api.ts` y `mock-crm.ts`):**
   - Implementado `obtenerPendientesDelDiaApi(asesorId?: string): Promise<PendientesDelDia>` que consulta `GET /api/v1/crm/seguimientos/pendientes-del-dia` con soporte de cabeceras de sesión de tenant (`x-tenant-id`, `x-asesor-id`).
   - Implementado `completarSeguimientoApi(id: string): Promise<Seguimiento>` que envía `POST /api/v1/crm/seguimientos/:id/completar`.
   - Mock data completo y validado contra el esquema Zod `PendientesDelDia` del contrato `@viajapro/contracts` en `mock-crm.ts`, con casos para `vencidos` y `deHoy` asociados a contactos, oportunidades, paquetes turísticos cotizados y canales WhatsApp.

2. **Lógica de Agregación y Métricas (`apps/web/src/lib/inicio-logica.ts` y `.spec.ts`):**
   - `calcularMetricasSeguimientos`: computa totales de pendientes, cantidad de vencidos, de hoy y de alta prioridad.
   - `clasificarUrgenciaSeguimiento`: categorización estricta (`VENCIDO`, `HOY`, `FUTURO`).
   - `calcularRetrasoSeguimiento`: texto en es-CO con cálculo amigable del desfase temporal («hace X horas», «hace X días», «hoy», «en X horas»).
   - `formatearHoraSeguimiento`: formato localizado con `Intl.DateTimeFormat`.
   - 8/8 pruebas unitarias pasando en `inicio-logica.spec.ts`.

3. **Componente de Seguimientos Diarios (`apps/web/src/components/inicio/bloque-seguimientos-dia.tsx` y `.spec.tsx`):**
   - Filtros por pestañas (`TODOS`, `VENCIDOS`, `HOY`) con badges numéricos.
   - Tarjetas de compromiso con badges de urgencia diferenciados (rojo para vencido, ámbar para hoy), datos del contacto, canal, motivo y enlace a la conversación (`/bandeja/[id]`) o al pipeline (`/pipeline`).
   - Acción directa de completar seguimiento en un clic con microanimación y feedback táctil accesible (touch targets >= 44 px).
   - Estados de carga (skeleton animado), error con botón de reintento y estado vacío ilustrado cuando no hay tareas pendientes.
   - 6/6 pruebas unitarias pasando en `bloque-seguimientos-dia.spec.tsx`.

4. **Integración en la Página Principal (`apps/web/src/app/page.tsx` y `page.spec.tsx`):**
   - Integrado `obtenerPendientesDelDiaApi` junto a `obtenerConversacionesBandeja`, `obtenerOportunidadesPipeline` y `obtenerCotizacionesApi` usando el tenant de sesión.
   - Las tres tarjetas principales enlazan a sus pantallas filtradas (`/bandeja`, `/pipeline`, `/cotizaciones`) y reflejan datos reales con estados cargando, error y vacío.
   - Manejo del estado local para actualizar instantáneamente la lista de pendientes cuando un asesor completa un seguimiento desde el dashboard sin requerir recargar la página.
   - 8/8 pruebas unitarias pasando en `page.spec.tsx`.

5. **Pruebas y Verificación:**
   - 54 archivos de prueba en `@viajapro/web` con 454/454 pruebas en verde.
   - Cero violaciones de fronteras entre módulos (`verificar-fronteras.mjs`) y estricto respeto del carril frontend `b` (`check-ownership.mjs`).
   - `typecheck`, `lint` y `test:hooks` 100% en verde.
