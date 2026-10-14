# ENTREGA.md — Tarea 0c.16: El catálogo REAL en pantalla

- **Rama:** `feat/bandeja-web`
- **Fecha:** 2026-10-13
- **Tarea completada:** `0c.16. El catálogo REAL en pantalla` (ADR-0009)

---

## 1. Qué construí

1. **Cliente de API para Catálogo Real y Cotizaciones (`apps/web/src/lib/catalogo-api.ts`):**
   - Tipos 100 % inferidos de los contratos Zod de `@viajapro/contracts` (R3): `SalidaPublicada`, `CotizarSalida`, `CotizacionDeSalida`.
   - Conexión a `GET /api/v1/catalogo/salidas` con soporte para filtros (`desde`, `hasta`, `paqueteId`, `limite`).
   - Conexión a `POST /api/v1/catalogo/cotizar` con payload validado.
   - Manejo tipado de errores con la clase `CatalogoApiError` para capturar códigos de dominio (`SIN_VIGENCIA`, `VIGENCIAS_EMPATADAS`, `PAQUETE_NO_ENCONTRADO`, `SIN_SESION`).

2. **Catálogo de Salidas Publicadas (`apps/web/src/app/catalogo/page.tsx` y `tarjeta-salida-publicada.tsx`):**
   - Listado de salidas reales de André's Tours sembradas en Neon (ej. «Parque del café», «Piangüita + Ballenas», «Puebleando en el Quindío», «Parque Consotá»).
   - Visualización de fecha amigable, noches («Pasadía», «1 noche», «2 noches»), número de tarifas asociadas y precio "Desde $XXX.XXX COP".
   - Filtros de búsqueda en tiempo real por texto (nombre/destino) y selector de destinos únicos derivados.
   - Enlace directo a `/cotizador` transmitiendo `paquete` y `fecha`.
   - Integración con el interruptor `NEXT_PUBLIC_USE_REAL_CRM`: si está apagado, mantiene fallback a datos de demostración con distintivo visible; si falta tenant, despliega `AvisoConfiguracionTenant`.

3. **Cotizador de Salidas Armadas (`apps/web/src/app/cotizador/page.tsx` y `desglose-cotizacion-salida.tsx`):**
   - **Total protagonista:** Importe total visible en tipografía destacada con formato de moneda en pesos colombianos (R8). Botón de copiar cotización formateada para WhatsApp en un clic.
   - **Líneas desglosadas por pasajero:** Renderiza cada línea individual (ej. 2 Adultos a $410.000 + 1 Niño a $250.000 = $1.070.000 COP en Puebleando en el Quindío 2026-10-03).
   - **Tarifas alternativas de grupo:** Panel informativo de tarifas que reemplazarían al armado (ej. Promo pareja), marcando `Más económica` según el contrato (`masBarata`). No se aplican solas para no sobrepasar condiciones del mayorista.
   - **Tarifas no aplicables con motivo:** Si una tarifa no aplica (ej. Promo pareja para 3 adultos en Parque Consotá), muestra explícitamente el motivo: «Aplica a grupos de 2; sobra 1».
   - **Respeto a `pideComposicion`:** Si el tarifario devuelve `pideComposicion: false`, la interfaz oculta/desactiva los selectores de desglose por edad.
   - **Aviso «Bajo consulta de cupo»:** Si `deSalidaProgramada === false`, destaca advertencia ámbar indicando que la cotización procede de una vigencia abierta y no de una fecha garantizada.
   - **Errores de dominio 409 honestos:** Intercepta `SIN_VIGENCIA` y `VIGENCIAS_EMPATADAS` con explicaciones claras sin mensajes genéricos.

4. **Lógica pura y propuesta WhatsApp (`catalogo-logica.ts` y `cotizador-logica.ts`):**
   - `formatearNochesLabel`, `extraerDestinosDeSalidas`, `filtrarSalidasPublicadas`.
   - `generarTextoPropuestaWhatsAppSalida`: arma la propuesta en texto markdown para WhatsApp con total protagonista, desglose por pasajero, nota de estado de cupo y alternativas, omitiendo estrictamente costos netos o márgenes internos (R10).
   - `interpretarErrorCotizacion`: clasifica los errores en problemas de búsqueda vs errores de datos de la agencia.

5. **Aislamiento y Concurrencia en Compuertas:**
   - Detectada y resuelta contienda de concurrencia en Neon entre `api:test` y `database:test` configurando `--concurrency=1` en `scripts/compuertas.mjs`.
   - Terminados procesos observadores en segundo plano que retenían bloqueos transaccionales en Neon.

---

## 2. Pruebas y Verificación

- **Nuevas pruebas unitarias en Web:**
  - `apps/web/src/lib/catalogo-logica.spec.ts`: 13 pruebas (incluyendo formateo de noches, extracción de destinos y filtrado de salidas publicadas).
  - `apps/web/src/lib/cotizador-logica.spec.ts`: 9 pruebas (incluyendo validación con Zod de `CotizacionDeSalida`, formato de texto WhatsApp para salidas armadas, protección R10 de márgenes e interpretación de errores 409).
- **Total pruebas en `apps/web`:** 123 pasadas en 16 archivos de pruebas.
- **Total pruebas en `apps/api`:** 208 pasadas en 14 archivos de pruebas.
- **Total pruebas en `packages/database`:** 39 pasadas (suite completa de aislamiento).

---

## 3. Estado de las Cinco Compuertas (`node scripts/compuertas.mjs`)

```
══════════════════════════════════════════════════════════════════════
  ✓ build          verde     0.5s
  ✓ lint           verde     0.4s
  ✓ typecheck      verde     0.5s
  ✓ test           verde     126.4s
  ✓ format:check   verde     3.0s

  Las cinco en verde. Ejecutadas, no supuestas.
```
