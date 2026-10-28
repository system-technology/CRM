# Bitácora — 2026-10-28 — T-101: Lista de seguimientos del asesor con vencidos, de hoy y próximos, y acción de completar

## Contexto
El asesor de turismo requiere gestionar su agenda diaria de compromisos comerciales: tareas vencidas que ameritan seguimiento urgente, llamadas y acuerdos programados para el día en curso, compromisos a futuro y registro de tareas ya completadas con clientes y cotizaciones.

## Qué se construyó

1. **Pantalla `/seguimientos`:**
   - Consumo de `GET /api/v1/crm/seguimientos` y `POST /api/v1/crm/seguimientos/:id/completar` con sincronización en tiempo real y fallback de demostración.
   - 4 tarjetas KPI con contadores en vivo para tareas Vencidas (en alerta `rose-700`), Para Hoy (`amber-700`), Próximas (`teal-700`) y Completadas (`emerald-700`). Cada tarjeta filtra la vista de inmediato.
   - Pestañas de filtrado rápido, cuadro de búsqueda por texto (descripción, contacto u oportunidad) y selector de asesor comercial.
   - Modal interactivo accesible para agendar nuevos seguimientos comerciales con fecha y hora.
   - Estados de carga (esqueleto animado), error accionable (`AvisoErrorAccionable` con reintento) y vacío (`AvisoVacio`).

2. **Componente de Tarjeta de Seguimiento (`TarjetaSeguimiento`):**
   - Resaltado prominente de compromisos vencidos con indicación del retraso acumulado y alerta visual.
   - Botón de acción para completar tarea con actualización optimista y soporte de accesibilidad teclado y lector de pantalla.
   - Enlaces contextuales a la Ficha 360 del contacto (`/contactos/[id]`), la oportunidad en el Pipeline (`/pipeline`) y el chat de WhatsApp (`/bandeja/[id]`). Touch targets `>= 44 px`.

3. **Módulo de Lógica Pura y Conexión de Vistas:**
   - Creado `apps/web/src/lib/seguimientos-logica.ts` con funciones puras para clasificar estados temporales (R9), calcular métricas consolidadas y ordenar según urgencia.
   - Enlazado `BloqueSeguimientosDia` en el dashboard de inicio con acceso directo a `/seguimientos`.

## Verificación de Compuertas
- Pruebas unitarias de la web: 81 suites, 653 pruebas en verde (`page.spec.tsx` con 9 pruebas y `seguimientos-logica.spec.ts` con 14 pruebas).
- Typecheck: 9 paquetes monorepo en verde; Next.js compiló 23 rutas exitosamente.
- Linter: 7 paquetes limpios sin advertencias ni variables huérfanas.
- Ganchos y fronteras (`pnpm test:hooks`): 59/59 política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.
