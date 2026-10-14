# Cola de trabajo — Antigravity

> **¿Sesión nueva, sin contexto?** Lee **`ARRANQUE.md`** primero. Está escrito para eso y es
> suficiente: no necesitas que nadie te cuente nada.

**Siempre:** solo tocas `apps/web/`. Nunca escribes en `main`. No tocas `ESTADO.md`. Cero tipos
redefinidos: todo de `@viajapro/contracts` — si falta un campo, **para y dilo**. Y funciona a
375 px.

> **Las cinco compuertas son una sola orden: `pnpm compuertas`.** Ejecutadas, no supuestas, antes
> de escribir `ENTREGA.md`. Va sin tuberías a propósito —una orden con `|` o `;` te hace pedir
> permiso casi siempre— y pone `build` delante del resto, que es lo que evita que compiles contra
> un `dist` viejo de los contratos.

---

> ### Aviso del 2026-10-13, tarde — error mío, no tuyo
>
> Te dije que `PoliticaDePrecio` y los demás contratos nuevos estaban «ya publicados en
> `@viajapro/contracts`». **Están en mi rama, que todavía no se ha integrado a `main`**, así que
> en tu árbol no existen. Vi que has tenido que recrearlos para poder compilar: eso es
> exactamente lo que pasa cuando te doy una referencia que no puedes alcanzar.
>
> **Qué hacer:** sigue con lo que tengas hecho; no deshagas nada. Cuando el `integrador` meta mi
> rama en `main`, haz `git merge main` y **quédate con la versión de `main`** de
> `packages/contracts/` y `packages/domain/`: son los mismos conceptos, y la fuente de verdad es
> la que venga integrada (R3). Si al mezclar ves una diferencia que te parece un error mío,
> **dilo en `ENTREGA.md` en vez de arreglarla por tu cuenta**.

## [x] 0c.15. La política de precio de la agencia, en `/configuracion`

**Esto ya no espera a nadie.** El contrato `PoliticaDePrecio` existe y está publicado en
`@viajapro/contracts`; corre `pnpm build` antes de importarlo.

**De qué va.** ADR-0009 quedó firmado el 13 de octubre con la regla del propietario: el precio de
venta sale del **neto del mayorista más un 20 %**. Y lo interesante es que «margen del 20 %» tiene
**dos lecturas** que dan precios distintos sobre el mismo neto de un millón:

| Valor de `base` | Cómo lo dice una agencia | Venta |
|---|---|---|
| `SOBRE_EL_NETO` | «le subo el 20 %» | **$1.200.000** |
| `SOBRE_LA_VENTA` | «me deja el 20 %» | **$1.250.000** |

Cincuenta mil pesos por silla. En un bus de cuarenta, dos millones por salida. **El dueño de la
agencia tiene que poder ver cuál de las dos está aplicando, y entender la diferencia sin que nadie
se la explique.** Esa es la tarea.

**0c.15.1 — La sección.** En `/configuracion`, un bloque «Cómo se forma el precio» con los cuatro
campos del contrato: `porcentaje`, `base`, `origenDeLaVenta` y `redondeoVenta`. Más
`admiteMargenPorTarifa`.

**0c.15.2 — El ejemplo vivo, que es lo que de verdad enseña.** Al lado de los campos, un ejemplo
que se recalcula mientras se tocan: «con un neto de $1.000.000, su precio de venta sería
**$1.200.000**». Cambiar `base` de una lectura a la otra tiene que mover ese número delante de
los ojos. Un texto explicando la diferencia se lee una vez y no se entiende; el número cambiando
se entiende solo.

**0c.15.3 — Cuidado con la aritmética, y no la escribas tú.** `calcularVenta` y `calcularMargen`
están **ya hechos y probados** en `@viajapro/domain` (`precio-de-venta.ts`, 20 pruebas). Impórtalos.
Si reimplementas la fórmula en el navegador tendremos dos versiones del mismo cálculo separándose
con el tiempo, y además `SOBRE_LA_VENTA` no es una multiplicación: es `neto / (1 − p)`.

**0c.15.4 — Qué NO hacer.** No guardas nada todavía: la API no expone la ruta de escritura. La
pantalla lee, enseña y calcula; el botón de guardar queda deshabilitado con un motivo honesto, o
no está. **Y aplica 0c.14 también aquí:** si los valores son simulados, que lo diga.

**Criterio de aceptación:** cambiar `base` en la pantalla mueve el ejemplo de $1.200.000 a
$1.250.000. Hay prueba que lo fija. El cálculo viene de `@viajapro/domain` y no de código tuyo.
Funciona a 375 px.


---

## [x] 0c.16. El catálogo REAL en pantalla

- **Completado y verificado:**
  - **0c.16.1 — `/catalogo` contra la API real (`listarSalidasApi`):** Conexión a `GET /api/v1/catalogo/salidas`. Lista las salidas reales sembradas de André's Tours («Parque del café», «Piangüita + Ballenas», «Puebleando en el Quindío», etc.) con fecha en formato amigable, etiqueta de noches («Pasadía», «1 noche», «2 noches»), contador de tarifas y precio "Desde $XXX.XXX". Búsqueda y filtrado por destino único extraído de las salidas reales. Enlace directo al cotizador con parámetros pre-cargados. Si el interruptor `NEXT_PUBLIC_USE_REAL_CRM` está apagado, mantiene fallback honesto con distintivo de datos de demostración; si falta tenant, enseña la guía `AvisoConfiguracionTenant`.
  - **0c.16.2 — Cotización ARMADA como protagonista (`POST /api/v1/catalogo/cotizar`):**
    - **Total protagonista:** El importe total en COP a gran escala, listo para transferir o copiar a WhatsApp.
    - **Líneas desglosadas por tipo de pasajero:** Muestra cada línea con multiplicador y precio unitario (ej. Puebleando en el Quindío 2026-10-03 con 2 adultos + 1 niño = 2 adultos a $410.000 c/u + 1 niño a $250.000 = **$1.070.000 COP**).
    - **Tarifas alternativas de grupo:** Muestra tarifas alternativas (ej. Promo pareja) con badge `Más económica` sin aplicarlas a ciegas.
    - **Tarifas no aplicables con motivo honesto:** Si una tarifa no aplica para el grupo (ej. Parque Consotá 2026-10-11 con 3 adultos), explica el motivo («Promo pareja: Aplica a grupos de 2; sobra 1») evitando cálculos por fuera en calculadora manual.
    - **Gobierno por tarifario (`pideComposicion`):** Si `pideComposicion === false` (ej. pasadía sin tarifas diferenciadas por edad), la pantalla bloquea o simplifica las entradas de menores/infantes.
  - **0c.16.3 — Tratamiento transparente de errores 409 (`interpretarErrorCotizacion`):** Diferencia `SIN_VIGENCIA` («No hay precio ni salida disponible para esa fecha») de `VIGENCIAS_EMPATADAS` («El tarifario tiene dos ventanas de vigencia solapadas (error de datos de la agencia)»).
  - **0c.16.4 — «Bajo consulta de cupo»:** Si `deSalidaProgramada === false`, avisa visiblemente en la tarjeta de cotización y en la propuesta comercial de WhatsApp que la cotización deriva de una vigencia abierta y no de una salida garantizada.
  - **0c.16.5 — Responsivo y Accesibilidad:** Adaptado a anchos desde 375 px, objetivos táctiles >= 44 px, soporte modo claro/oscuro.
  - **Cinco compuertas en verde (`pnpm compuertas`):** build (0.5s), lint (0.4s), typecheck (0.5s), test (126.4s, 123 pruebas en web, 208 en api, 39 en database), format:check (3.0s).

**Esta ya no depende de mí: las rutas existen, están probadas y responden.** Hoy
`/catalogo` y `/cotizador` pintan datos simulados; en la base hay **34 paquetes, 98 vigencias y
125 tarifas** del tarifario de Agencias André's Tours.

```
GET  /api/v1/catalogo/salidas?desde=AAAA-MM-DD[&hasta=][&paqueteId=][&limite=]
POST /api/v1/catalogo/cotizar   { paqueteId, fecha, adultos?, ninos?, infantes? }
```

**0c.16.1 — `/catalogo` contra la API.** Lista de salidas publicadas con su fecha y su «desde».
Mismo interruptor y mismo distintivo de datos simulados que ya hiciste en 0c.14: si está apagado,
sigue con el simulado y que lo diga.

**0c.16.2 — El cotizador devuelve una cotización ARMADA, no un precio.** Esto es lo que más
importa y es nuevo, así que léelo entero. La respuesta trae:

- `lineas` — una por tipo de pasajero: «Adulto ×2 → $778.000», «Menor ×1 → $292.000»
- `total` — **el número que el asesor copia y pega en WhatsApp**. Ese es el protagonista de la
  pantalla, en grande
- `alternativas` — tarifas de grupo que **reemplazan** al armado, con `masBarata` marcada. Se
  enseñan, **no se aplican solas**: llevan condiciones que el sistema no conoce
- `noAplicables` — lo que no aplica **con su motivo**: «Promo pareja — aplica a grupos de 2;
  sobra 1». **Enséñalo.** Si lo escondes, el asesor hace la cuenta por fuera con la calculadora
  del celular y el informe de margen deja de cuadrar
- `pideComposicion` — **si viene `false`, NO preguntes adultos/niños/infantes.** Lo decide el
  tarifario, no un ajuste: un pasadía no tiene tarifa de menor y preguntarlo es ruido

**0c.16.3 — Los dos errores que la pantalla tiene que saber leer.** Llegan como 409 con código
estable: `SIN_VIGENCIA` («no hay precio para esa fecha — prueba otra o pídesela a la agencia») y
`VIGENCIAS_EMPATADAS` (el tarifario tiene dos ventanas solapadas: es un error de datos de la
agencia y hay que decirlo así, no como «error del servidor»).

**0c.16.4 — «Bajo consulta de cupo».** Si `deSalidaProgramada` viene `false`, el precio salió de
una vigencia abierta y **no hay fecha publicada**. Dilo. Prometer una fecha que la agencia no
publicó es lo que hace que un cliente llegue al punto de encuentro y no haya bus.

**Lo que NO hay y no esperes:** rutas de escritura. No se puede crear ni editar una tarifa desde
la web todavía. El catálogo solo se carga con `pnpm db:seed`.

**Criterio de aceptación:** con el interruptor encendido, `/catalogo` enseña salidas de André's
Tours —«Parque del café», «Piangüita + Ballenas»— y no «Curazao». Cotizar «Puebleando en el
Quindío» el 2026-10-03 con 2 adultos y 1 niño enseña dos líneas y un total de **$1.070.000**.
Cotizar «Parque Consotá» el 2026-10-11 con 3 adultos enseña el motivo por el que la promo de
pareja no aplica. Funciona a 375 px.

---

## [x] 0c.14. Que la pantalla diga con qué datos está hablando

- **Completado y verificado:**
  - **0c.14.1 — Distintivo honesto y discreto (`DistintivoDatosDemo`):** Etiqueta pequeña `«datos de demostración»` en cabecera cuando una pantalla opera en modo simulado o fallback offline. Si conecta contra la API real con tenant válido, no se muestra nada («lo normal no se anuncia»). Presente en `/pipeline`, `/contactos`, `/bandeja`, `/catalogo`, `/cotizador`, `/reportes`, `/viajes` y `/configuracion`.
  - **0c.14.2 — Manejo resiliente de error de configuración de tenant (`AvisoConfiguracionTenant`):** Si `NEXT_PUBLIC_USE_REAL_CRM=true` pero falta `NEXT_PUBLIC_DEV_TENANT_ID` o la API responde 401 `SIN_SESION`, la pantalla ya no queda en blanco. Muestra una tarjeta clara indicando los 3 pasos de resolución: correr `pnpm db:seed` para obtener el UUID de André's Tours, configurarlo en `.env` y reiniciar dev server. Proporciona además la opción de "Ver con datos de demostración".
  - **0c.14.3 — Error de hidratación del pipeline corregido:** Identificada disparidad de caracteres de espacio no separable (`\u202f` vs `\u00a0` vs `\u0020`) producida por implementaciones dispares de `Intl` entre Node (servidor) y navegador en `es-CO`. Función determinista `formatearFechaTarea` con fijación de zona a `America/Bogota` (R9) y normalización regex de espacios. Base temporal estable en `mock-pipeline.ts` redondeada a la hora para erradicar desfases de segundos. Fijado con pruebas unitarias dedicadas.
  - **Honestidad en el panel de sugerencias (observación REVISION.md):** Reemplazada la denominación engañosa de "Copilot IA" por "Sugerencias Automáticas — Reglas Heurísticas" y "Sugerencias" en el botón de redactor, evitando prometer un modelo generativo que aún no está conectado.
  - **Cinco compuertas en verde (`pnpm compuertas`):** build (22.1s), lint (9.9s), typecheck (4.9s), test (105.2s, 109 pruebas en web y 112 en api), format:check (3.6s).

Arranqué las dos aplicaciones hoy y abrí `/pipeline`. Se ve como un producto terminado. Las
tarjetas decían «Curazao All Inclusive» y «Circuito Europa 15 días» — datos inventados, no los
que hay sembrados. El panel de red: **cero peticiones a la API**.

No es culpa tuya: el interruptor `NEXT_PUBLIC_USE_REAL_CRM` viene apagado y hasta hoy no estaba
ni documentado. Pero el efecto es grave: **el producto parece completo, no habla con nada, y
nada en la pantalla lo dice.** Delante del piloto, eso es una bomba.

**0c.14.1 — Un distintivo honesto, visible y discreto.** Cuando una pantalla esté pintando
datos simulados, que lo diga: una etiqueta pequeña, en la cabecera, del tipo «datos de
demostración». No un banner que estorbe; algo que un asesor no note y que a nadie en una demo se
le pueda escapar. Y cuando esté contra la API real, **no aparece nada**: lo normal no se anuncia.

**0c.14.2 — Que el interruptor encendido sin tenant no deje la pantalla rota.** Si
`NEXT_PUBLIC_USE_REAL_CRM` es `true` pero falta `NEXT_PUBLIC_DEV_TENANT_ID`, la API responde 401
y hoy la pantalla se queda en blanco sin explicar nada. Que diga qué falta y cómo se arregla —
el valor lo imprime `pnpm db:seed` al terminar—. Un error de configuración tiene que leerse como
un error de configuración, no como un producto roto.

**0c.14.3 — El error de hidratación del pipeline.** Lo vi hoy en consola: el servidor y el
navegador generan la misma fecha de forma distinta —«13 de oct, 09:09 p. m.» contra el mismo
texto— y React regenera el árbol entero. Es formateo de fecha con `Intl` en servidor y cliente.
Arréglalo donde esté y añade una prueba que lo fije.

**Criterio de aceptación:** con el interruptor apagado se ve el distintivo; encendido y con
tenant, desaparece y las tarjetas traen los datos de la base —los de André's Tours, no
«Curazao»—; encendido y sin tenant, un mensaje que explica qué falta. Y cero errores de
hidratación en consola al abrir `/pipeline`.

**Cuéntalo en `ENTREGA.md` con la salida real.** Si no puedes encender el interruptor porque no
puedes escribir `.env` —no puedes, lo bloquea un hook—, dilo y verifica lo que sí puedas.

---

## [x] 0c.13. Auditoría Responsiva a 375 px, Touch Targets >= 44 px, Navegación Móvil y Accesibilidad WCAG AA en Todas las Pantallas

Origen: Jira Story `VC-42` (Epic `VC-3` — CRM y Pipeline) · `viajapro_diseno_ui_ux.json` (§`responsive_and_accessibility` y §`validation_checklist`) · `DISENO-BANDEJA.md` (defecto táctil de chips < 44 px).

**Objetivo:** Garantizar que las 8 pantallas de ViajaPro funcionen perfectamente a 375 px de ancho (móvil real), con navegación inferior optimizada para móviles, chips y botones con área táctil >= 44 px, foco visible en navegación por teclado y contraste AA tanto en tema claro como en tema oscuro.

**Criterios de aceptación:**
1. **Touch Targets >= 44 px:** Chips de filtro de la bandeja y botones clave en interfaces móviles ajustados con altura táctil mínima de 44 px (`min-h-[44px]`) en pantallas táctiles, cumpliendo WCAG 2.5.5.
2. **Navegación Móvil:** `BarraModulos` adaptada para móviles con barra inferior táctil (`bottom bar`) en resoluciones < 768 px, liberando los 56 px laterales para maximizar el ancho útil a 375 px sin provocar scroll horizontal involuntario.
3. **Flujo de Pantallas a 375 px:** Cada una de las 8 pantallas (`/bandeja`, `/pipeline`, `/cotizador`, `/viajes`, `/contactos`, `/catalogo`, `/reportes`, `/configuracion`) validada contra overflow horizontal, con paddings adecuados y lectura nítida.
4. **Foco visible y teclado:** Elementos interactivos con estilos `focus-visible:ring-2 focus-visible:ring-acento-600` y navegación accesible.
5. **Pruebas y Compuertas:** Nuevas pruebas unitarias en Vitest para validar los contratos de diseño responsivo y accesibilidad, pasando las 5 compuertas (`test`, `typecheck`, `lint`, `build`, `format:check`).

---

## [x] 0c.12. Asistente Copilot IA en la Bandeja: Extractor de Oportunidades, Resumen Ejecutivo y Respuestas Sugeridas con Aprobación Humana

Origen: `viajapro_diseno_ui_ux.json` (§`interaction_patterns.ai` y §`states_and_business_rules.human_approval_required_for_ai_outbound: true`) · Jira Epics VC-6 (Fase 5 — Automatización e IA) y VC-13 (Bandeja Web) · Regla R8 (dinero en enteros de COP sin flotantes), R9 (UTC) y R10 (PII protegida).

**Objetivo:** Construir el asistente Copilot IA para la bandeja de WhatsApp (`/bandeja/[id]`) que permita a los asesores extraer variables de viaje (destino, fechas, pax, presupuesto) directamente de la conversación, generar resúmenes ejecutivos en segundos y recibir respuestas sugeridas contextuales que requieren aprobación/edición humana antes de enviarse.

**Invariantes y criterios:**
1. **Motor Heurístico y de Extracción IA (`asistente-ia-logica.ts`):**
   - `extraerDatosViajeDeMensajes`: detecta destinos (Cancún, San Andrés, Punta Cana, Cartagena, Orlando, etc.), número de adultos/niños, fechas tentativas y presupuesto en COP (R8).
   - `generarResumenConversacion`: resume necesidades, preguntas clave del viajero y siguiente acción recomendada en 3 viñetas breves.
   - `sugerirRespuestaComercial`: genera borrador personalizado en tono comercial cálido y profesional adaptado a agencias colombianas.
   - `calificarLead`: calcula puntuación objetiva (`ALTA`, `MEDIA`, `BAJA`) según intención, destino y presupuesto.
2. **Invariante de Aprobación Humana Obligatoria (`human_approval_required_for_ai_outbound`):**
   - La respuesta generada por IA **nunca** se despacha sola al viajero: se inserta en el compositor de texto (`input`) del asesor para que este la revise, modifique y envíe explícitamente.
3. **Integración en la UI de la Bandeja (`bandeja/[id]/page.tsx`):**
   - Botón interactivo "✨ Asistente IA" en la barra de herramientas del chat junto al selector de plantillas y notas.
   - Tarjeta contextual colapsable con las 3 herramientas:
     - 🎯 **Extraer Datos para Oportunidad / Cotización:** Muestra datos detectados y botón "Cotizar este viaje" con parámetros prellenados.
     - 📋 **Resumen del Hilo:** Vista rápida del estado actual de la consulta.
     - 💬 **Sugerir Respuesta:** Botón que inserta el texto generado directamente en el área de redacción.
4. **Pruebas Automatizadas en Vitest (`asistente-ia-logica.spec.ts`):**
   - Validación completa de extracción de parámetros, formato de respuestas, resúmenes y calificación de leads.
5. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` 100% en verde.

---

## [x] 0c.11. Centro de Búsqueda Global Omnicanal (Cmd+K) y Centro de Alertas Operativas Críticas

Origen: `viajapro_diseno_ui_ux.json` (§`interaction_patterns.global_search` y §`interaction_patterns.notifications`) · Jira Epics VC-1 (Fundaciones) y VC-2 / VC-13 (Bandeja Web e Integración) · Criterios de usabilidad ("Responder un mensaje requiere tres clics o menos", "SLA, time limits y pagos pendientes son visibles").

**Objetivo:** Construir el buscador global accesible desde teclado (`Cmd+K` / `Ctrl+K`) en cualquier pantalla y el centro interactivo de alertas y notificaciones operativas en la barra de módulos para enlazar todas las áreas del CRM (conversaciones, contactos, pipeline, expedientes, catálogo).

**Invariantes y criterios:**
1. **Motor de Búsqueda Global Unificado (`buscador-global-logica.ts`):**
   - Búsqueda en tiempo real indexando 5 categorías:
     - 💬 Conversaciones (cliente, último mensaje, canal WhatsApp).
     - 📇 Contactos (nombre, teléfono, ciudad).
     - 📊 Oportunidades (título, etapa, monto en COP - R8).
     - ✈️ Archivos de Viaje (código, titular, destino, estado).
     - 📦 Paquetes del Catálogo (destino, mayorista, precio base).
   - Acciones rápidas (Navegar a Bandeja, Nuevo Contacto, Ir a Cotizador, Ver Reportes).
   - Soporte de teclado completo: `Escape` para cerrar, flechas arriba/abajo para selección, `Enter` para navegar.
2. **Centro de Notificaciones Operativas (`notificaciones-logica.ts`):**
   - Agregación y detección reactiva de alertas:
     - Alerta de SLA de WhatsApp vencido (> 15 min sin respuesta del asesor).
     - Alerta de Time limit de mayorista/aerolínea próximo a vencer (< 24 horas).
     - Alerta de saldo pendiente en viajes con fecha de salida próxima.
     - Alerta de documentación faltante (pasaportes sin adjuntar).
   - Clasificación por severidad (`CRITICA`, `ADVERTENCIA`, `INFORMATIVA`).
   - Acciones directas ("Abrir chat", "Ver expediente", "Resolver").
3. **Integración en la Barra de Módulos (`barra-modulos.tsx`):**
   - Botón interactivo de Búsqueda (`Search` con pista visual `⌘K`).
   - Botón interactivo de Campana con contador numérico de alertas pendientes no leídas.
   - Popover accesible para el centro de alertas.
4. **Pruebas Automatizadas en Vitest:**
   - Cobertura completa de filtrado, indexación, alertas y conteos.
5. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` 100% en verde.

---

## [x] 0c.10. Expediente Operativo y Archivo de Viaje (`/viajes`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P1: `travel_file` Archivo de viaje) · `docs/01-producto/02-lenguaje-ubicuo.md` (`TravelFile`, `Booking`, `timeLimit`, `recordLocator`, `Supplier`) · Regla R8 (Dinero en enteros de COP), R9 (Fechas UTC) y R10 (PII sensible de viajeros enmascarada y auditada).

**Objetivo:** Construir la pantalla del expediente operativo en `/viajes` para centralizar el seguimiento de una venta confirmada: itinerario, pasajeros con documentación, reservas individuales con proveedores (*bookings* con su *time limit* y localizador), y balance de pagos (total, pagado, saldo pendiente).

**Invariantes y criterios:**
1. **Resumen Operativo y Financiero (`summary_fields`):**
   - Titular del viaje, destino turístico, fechas de salida y regreso.
   - Estado del expediente (`CONFIRMADO`, `EN_OPERACION`, `VIAJANDO`, `COMPLETADO`, `CANCELADO`).
   - Balance en COP (R8): Total venta, total recaudado y saldo pendiente visible de un vistazo.
2. **Alertas Críticas Visibles (que cuestan dinero si se olvidan):**
   - Alerta destacada de **Time limit** de mayorista/aerolínea próximo a vencer con cálculo de horas restantes.
   - Alerta de pago/abono pendiente antes de fecha límite.
   - Alerta de documentación faltante (pasaportes sin cargar).
3. **Pestañas del Expediente:**
   - **Pasajeros y Documentos (R10):** Lista de pasajeros (Adultos, Niños, Infantes), documento con número enmascarado para proteger PII (`CC-***842`, `PA-***912`), estado de voucher y pasaporte.
   - **Reservas por Proveedor (`Booking`):** Mayorista/aerolínea/hotel, localizador (`recordLocator` / PNR), fecha límite de emisión (`timeLimit`) y estado de confirmación.
   - **Historial de Pagos y Abonos:** Pagos recibidos con fecha, método (Transferencia, Wompi, Efectivo) y comprobante.
   - **Itinerario Operativo:** Cronograma día por día con traslados, check-in de hotel, vuelos y excursiones.
4. **Filtro y Selección de Expedientes:**
   - Barra lateral o selector para alternar entre archivos de viaje activos de la agencia, con soporte de parámetro de URL (`?id=...`) para navegación directa desde la Ficha del Contacto en la Bandeja.
5. **Habilitación en Navegación Lateral:**
   - Activar el módulo en `BarraModulos` (`disponible: true`, indicador de ruta activa para `/viajes`).
6. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` 100% en verde.

---

## [x] 0c.9. Conexión de API Real del CRM: Tablero Pipeline, Movimiento de Etapas y Ficha de Contacto

Origen: Instrucción directa de arquitectura en `COLA.md` por Claude · Endpoints verificados en `apps/api/src/modules/crm/interface/crm.controller.ts` (`GET /api/v1/crm/tablero`, `PATCH /api/v1/crm/oportunidades/:id/etapa`, `GET /api/v1/crm/contactos/:id/ficha`, `GET /api/v1/crm/contactos`).

**Objetivo:** Construir el cliente `apps/web/src/lib/crm-api.ts` con validación Zod bidireccional estricta, conectar el tablero Kanban de `/pipeline`, el movimiento de oportunidades con motivo de pérdida, la ficha del panel lateral en `/bandeja` y el directorio de `/contactos`, con soporte de interruptor y fallback resiliente.

**Invariantes y criterios:**
1. **Cliente de API Robusto (`crm-api.ts`):**
   - Endpoints:
     - `GET /api/v1/crm/tablero` -> Valida con `TableroPipeline.parse`.
     - `PATCH /api/v1/crm/oportunidades/:id/etapa` -> Valida entrada con `MoverOportunidad` y salida con `Oportunidad.parse`.
     - `GET /api/v1/crm/contactos/:id/ficha` -> Valida con `FichaDeContacto.parse`.
     - `GET /api/v1/crm/contactos?buscar=...` -> Valida con `PaginaContactos.parse`.
   - Headers: Inyecta `x-dev-tenant-id` en desarrollo local cuando esté configurado.
   - Resiliencia: Fallback transparente a mocks si el backend NestJS no está disponible, para mantener la UI operativa en pruebas estáticas y demostraciones desconectadas.
2. **Integración en UI:**
   - `apps/web/src/app/pipeline/page.tsx`: Carga el tablero real vía `obtenerTableroPipeline` y persiste cambios de etapa vía `moverOportunidadDeEtapa`.
   - `apps/web/src/components/bandeja/ficha-cliente.tsx`: Consume `obtenerFichaContacto` cuando se abre una conversación.
3. **Pruebas Unitarias:**
   - `apps/web/src/lib/crm-api.spec.ts` con cobertura para llamadas exitosas, errores de red y validación de esquemas Zod.
4. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` 100% en verde.

---

## [x] 0c.8. Pantalla de Equipo y Configuración de Agencia (`/configuracion`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P1: Equipo y configuración `settings_team`) · ADR-0006 (Nivel 1 de parametrización en v1) · Jira Epics VC-1 (Fundaciones / Roles), VC-2 (WhatsApp Cloud API / WABA) y VC-3 (CRM y Pipeline).

**Objetivo:** Construir la pantalla integral de configuración en `/configuracion` para administrar miembros del equipo, roles de acceso, etapas del pipeline, SLA de respuesta en WhatsApp, salud de conexión WABA y parámetros de marca/moneda de la agencia.

**Invariantes y criterios:**
1. **Miembros y Roles de Agencia:**
   - Listado de asesores y dueños con estado (Activo, Invitado), correo, teléfono E.164 y rol (`DUENO`, `ASESOR`).
   - Invariante de seguridad: Debe existir siempre al menos un usuario activo con rol `DUENO` en la agencia.
2. **Canal WhatsApp Cloud API (WABA):**
   - Estado de salud de la conexión (Conectado / Webhook activo / Calidad del número Verde / Media / Baja).
   - Identificadores oficiales: Phone Number ID, WABA ID y número E.164 verificado (+57...).
   - Token de Meta cifrado en reposo (R6: nunca expuesto en texto plano).
3. **Parámetros de SLA de Atención:**
   - Tiempo límite de primera respuesta (ej. 15 minutos) y umbral de alerta preventiva (ej. 5 minutos).
   - Horario laboral de atención comercial y cálculo de vencimiento.
4. **Etapas del Pipeline:**
   - Visualización y orden de etapas comerciales (`NUEVO_LEAD`, `EN_COTIZACION`, `EN_NEGOCIACION`, `GANADA`, `PERDIDA`) con probabilidad estimada.
5. **Marca y Moneda Base:**
   - Razón social, NIT colombiano con formato de validación, moneda base ISO-4217 (COP) y huso horario (UTC-5 / America/Bogota).
6. **Habilitación en Navegación:**
   - Activar `id: 'configuracion'` en `BarraModulos` con enlace funcional a `/configuracion`.
7. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` 100% en verde.

---

## [x] 0c.7. Pantalla de Reportes, Métricas y Cierres (`/reportes`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P1: Reportes) · Jira Epic VC-7 (Fase 6: Analítica y escala) · Reglas del lenguaje ubicuo y R8 (Dinero en enteros de COP).

**Objetivo:** Construir el panel gerencial y operativo de reportes en `/reportes` para dar al dueño y asesores una lectura rápida de resultados comerciales, cuellos de botella en el embudo y cumplimiento de metas de cierre.

**Invariantes y criterios:**
1. **KPIs Clave con Definiciones Visibles y Comparación:**
   - Ventas totales en COP (`.cifra`), comparadas con el período anterior (% cambio).
   - Cantidad de oportunidades creadas en el período.
   - Tasa de conversión formal (ganadas / cerradas).
   - Tiempo promedio de primera respuesta (SLA de atención en WhatsApp).
   - Margen acumulado (Venta − Costo neto) con porcentaje sobre ventas.
2. **Visualizaciones de Rendimiento:**
   - Distribución de ventas por destino turístico con barras proporcionales.
   - Embudo de conversión por etapas (`NUEVO_LEAD`, `EN_COTIZACION`, `EN_NEGOCIACION`, `GANADA`, `PERDIDA`).
   - Tabla de rendimiento por asesor (conversaciones, oportunidades cerradas, tiempo medio de respuesta).
3. **Filtros Temporales y Vistas:**
   - Selector de rango de tiempo: «Últimos 30 días», «Este mes», «Último trimestre», «Año 2026/2027».
   - Conmutador entre «Vista Gerencial (Dueño)» y «Vista Operativa (Asesor)» para separar métricas de margen de las de gestión diaria.
4. **Habilitación en Navegación Lateral:**
   - Activar el módulo en `BarraModulos` (`disponible: true`, indicador de ruta activa para `/reportes`).
5. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.

---

## [x] 0c.6. Cotizador Comercial, Despacho a WhatsApp y Navegación (`/cotizador`)

Origen: Jira Epic VC-4 (Fase 3: Cotizador) · `viajapro_diseno_ui_ux.json` (Pantalla 2: Cotizador de paquetes) · `@viajapro/contracts` (`CotizarPaquete`, `CotizacionCalculada`, `Paquete`).

**Objetivo:** Conectar el cotizador con la navegación general (`BarraModulos`), permitir preselección desde el catálogo vía query param (`?paqueteId=...`), incorporar generador de propuesta comercial formateada para WhatsApp con copiado al portapapeles y motor de cálculo offline verificado contra el esquema oficial Zod (R3).

- **Completado y verificado al 100%:**
  - **Navegación Unificada (`BarraModulos`):** Integración fluida del cotizador en la barra de módulos con indicador de ruta activa y soporte para modo oscuro.
  - **Recepción de Parámetros (`?paqueteId=...`):** Conexión con el catálogo de paquetes mediante `useSearchParams` en `<Suspense>` para cotización inmediata en <5 minutos.
  - **Despacho Comercial a WhatsApp (`generarTextoPropuestaWhatsApp`):** Botón para copiar propuesta comercial al portapapeles y enlace directo a `/bandeja` para enviar al cliente.
  - **Protección de Confidencialidad (R10):** Las propuestas para el cliente excluyen estrictamente tarifas netas y margen comercial interno de la agencia.
  - **Motor de Cálculo Simulado y Offline:** Soporte resiliente con `calcularCotizacionMock` cuando la API backend no esté disponible localmente, validado al 100% contra el esquema Zod `CotizacionCalculada` de `@viajapro/contracts` (R3).
  - **Pruebas automáticas (5/5 en `cotizador-logica.spec.ts`):** 41/41 pruebas totales en verde en Vitest.

---

## [x] 0c.5. Catálogo de Paquetes y Tarifarios de Mayoristas (`/catalogo`)

- **Completado y verificado al 100%:**
  - **Directorio de Paquetes en `/catalogo`:** Catálogo interactivo de paquetes prearmados de mayoristas aliados, buscador reactivo en tiempo real (por destino, nombre, mayorista o inclusión), selector de plan de alimentación, selector de destinos y filtro por tarifarios vigentes.
  - **Ficha de Detalle y Matriz de Tarifas (`FichaDetallePaquete`):** Panel modal con selector de temporadas, desglose completo de matriz de tarifas por acomodación (`SENCILLA`, `DOBLE`, `TRIPLE`, `CUADRUPLE`) y tipo de pasajero (Adulto, Niño e Infante con edades de corte comercial), desglose de precios neto/venta y advertencias de vigencia.
  - **Gestión de Mayoristas y Time Limits:** Visualización de mayoristas proveedores con información de contacto y conteo regresivo de time limit (`diasTimeLimit`) para proteger cupos antes de liberación.
  - **Conexión Directa al Cotizador:** Enlaces de acción directa «Cotizar este paquete ahora» hacia `/cotizador` para garantizar cotización de propuesta comercial en <5 minutos.
  - **Cero Tipos Redefinidos (R3):** Basado 100% en esquemas Zod de `@viajapro/contracts` (`Paquete`, `Mayorista`, `Temporada`, `Precio`, `PlanAlimentacion`, `Acomodacion`, `TipoPasajero`).
  - **Habilitación en Barra Lateral:** Activado el módulo de Catálogo en `BarraModulos` (`disponible: true`, indicador de ruta activa para `/catalogo`).
  - **Pruebas automáticas (8/8 en `catalogo-logica.spec.ts`):** 36/36 pruebas totales en verde en Vitest.

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P0: Catálogo de paquetes) · Jira Epic VC-4 (Fase 3: Cotizador) & VC-10 · `@viajapro/contracts` (`Paquete`, `Mayorista`, `Temporada`, `Precio`, `PlanAlimentacion`, `Acomodacion`, `TipoPasajero`).

**Objetivo:** Construir la pantalla y panel de detalle del catálogo de paquetes turísticos en `/catalogo` para encontrar, auditar y operar los paquetes de mayoristas que la agencia revende, con desglose de temporadas, matriz de tarifas por acomodación y tipo de pasajero, y enlace rápido al cotizador.

**Invariantes y criterios:**
1. **Directorio y Búsqueda en Tiempo Real:**
   - Buscador reactivo por nombre del paquete, destino o mayorista.
   - Filtro dinámico por plan de alimentación (`TODO_INCLUIDO`, `DESAYUNO`, `MEDIA_PENSION`, etc.).
   - Filtro por estado de vigencia del tarifario (tarifas vigentes vs vencidas).
2. **Tarjeta de Paquete Responsiva:**
   - Visualización de destino, duración (`X días / Y noches`), plan de alimentación, mayorista responsable y días de time limit (`diasTimeLimit`).
   - Precio de referencia «Desde» por persona en clase `.cifra`.
   - Badges de temporadas y fechas de vigencia (`desde` y `hasta`).
   - Inclusiones destacadas.
3. **Ficha de Detalle del Paquete (`FichaDetallePaquete`):**
   - Modal/drawer con desglose exhaustivo de temporadas.
   - Matriz transparente de tarifas por tipo de pasajero (Adulto, Niño, Infante con edades de corte) y acomodación (`SENCILLA`, `DOBLE`, `TRIPLE`, `CUADRUPLE`).
   - Inclusiones y exclusiones detalladas.
   - Datos del mayorista y política de time limit.
4. **Acción Comercial Directa:**
   - Botón «Cotizar este paquete» que vincula directamente a `/cotizador` para cumplir la meta de cotización en menos de 5 minutos.
5. **Cero Tipos Redefinidos (R3):** Uso estricto de `Paquete`, `Mayorista`, `Temporada`, `Precio`, `PlanAlimentacion` de `@viajapro/contracts`.
6. **Habilitación en barra lateral:** Activar el módulo en `BarraModulos` (`disponible: true`, activo en `/catalogo`).
7. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.

---

## [x] 0c.4. Directorio de Contactos y Viajeros (`/contactos`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P0: Contactos y viajeros) · Epic VC-3 (Fase 2: CRM) · `@viajapro/contracts` (`Contacto`, `Consentimiento`, `PaginaContactos`).

**Objetivo:** Construir el directorio y panel de detalle de contactos en `/contactos` para conservar el historial comercial asociado a la persona correcta, distinguiendo formalmente entre Contacto, Viajero y Pasajero.

**Invariantes y criterios:**
1. **Directorio navegable y búsqueda en tiempo real:**
   - Lista y tabla de contactos con búsqueda por nombre, teléfono o correo y filtrado por etiquetas (`VIP`, `Familia`, `Corporativo`).
2. **Ficha de detalle del contacto:**
   - Visualización de datos de identidad (nombre, teléfono E.164, correo, avatar determinista).
   - Preferencias de viaje para atención y recompra (asientos, aerolíneas favoritas, notas de viaje).
   - Consentimientos explícitos (`TRANSACCIONAL`, `PROMOCIONAL`) conforme a la Ley 1581 de 2012 y normativas de Meta.
3. **Acciones directas:**
   - Enlace directo a abrir conversación en `/bandeja`.
   - Enlace a cotizar o ver oportunidades en `/pipeline`.
4. **Cero tipos redefinidos (R3):** Uso estricto de `Contacto`, `Consentimiento` y `PaginaContactos` de `@viajapro/contracts`.
5. **Habilitación en barra lateral:** Activar el módulo en `BarraModulos` (`disponible: true`).
6. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.
- **Completado y verificado al 100%:**
  - **Directorio comercial en `/contactos`:** Búsqueda en tiempo real (por nombre, teléfono E.164 o correo), selector de etiquetas de negocio (`VIP`, `Familia`, `Cancún`, etc.) y filtrado por consentimientos.
  - **Ficha de detalle del contacto (`FichaDetalleContacto`):** Panel drawer con avatar determinista, identidad, preferencias de viaje (asientos, aerolíneas, requerimientos), métricas y acciones directas (Chat en `/bandeja`, Cotización en `/cotizador`, Pipeline en `/pipeline`).
  - **Consentimientos de datos (Ley 1581 / Meta):** Distinción explícita de consentimiento `TRANSACCIONAL` y `PROMOCIONAL` con badges visuales de cumplimiento.
  - **Cero tipos redefinidos (R3):** Conforme 100% a los esquemas Zod `Contacto`, `Consentimiento` y `PaginaContactos` de `@viajapro/contracts`.
  - **Habilitación en navegación:** Activado el enlace y estado activo de Contactos en `BarraModulos`.
  - **Pruebas automáticas (6/6 en `contactos-logica.spec.ts`):** 28/28 pruebas totales en verde en Vitest.


---
## [x] 6. La ventana de 24 horas, de verdad

Origen: Jira (VC-13) · `COLA-DESPUES.md §6` · `packages/contracts/src/plantillas.ts` (`PlantillaWhatsApp`, `EnviarPlantilla`, `PlantillasDisponibles`).

**Objetivo:** Transformar el estado «24h Cerrada» de una etiqueta pasiva a una restricción activa del producto con soporte completo para plantillas aprobadas por Meta.

**Invariantes y criterios:**
1. **Restricción estricta:** Con la ventana cerrada, el campo de texto libre se deshabilita y se activa el selector de plantillas.
2. **Aviso preventivo (<2h):** Mostrar claramente cuánto falta cuando quedan menos de 2 horas (tiempo decisivo para que el asesor escriba antes del cierre).
3. **Preservación de borrador:** Si la ventana se cierra mientras hay un texto escrito, no se pierde; se avisa y se permite reutilizarlo.
4. **Cero tipos redefinidos (R3):** Utilizar `PlantillaWhatsApp`, `EnviarPlantilla` y `PlantillasDisponibles` de `@viajapro/contracts`.
5. **Formulario de variables interactivo:** Permitir rellenar `{{1}}`, `{{2}}`... validando que ningún hueco quede vacío antes de enviar (`EnviarPlantilla.superRefine`).
6. **Idempotencia (R5):** Generación de `claveIdempotencia` UUID v4 en cada envío.
7. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.
- **Completado y verificado al 100%:**
  - **Restricción estricta:** Con la ventana cerrada, el redactor de texto libre se bloquea completamente con icono de candado y aviso de políticas de Meta.
  - **Aviso preventivo (<2h):** Banner ámbar visible en la parte superior del chat cuando quedan menos de 120 minutos, alertando al asesor para responder antes del cierre.
  - **Preservación de borrador:** Si el asesor tenía texto escrito al momento de vencer la ventana o abrir el selector, el borrador se conserva y se muestra en el modal como referencia.
  - **Cero tipos redefinidos (R3):** Uso estricto de `PlantillaWhatsApp`, `EnviarPlantilla` y `PlantillasDisponibles` de `@viajapro/contracts`.
  - **Formulario de variables interactivo:** Formulario dinámico para variables `{{1}}`, `{{2}}`... con validación Zod (`EnviarPlantilla.superRefine`) que impide enviar huecos vacíos.
  - **Idempotencia (R5):** Clave UUID v4 única generada para cada intento de envío.
  - **Pruebas automáticas (6/6 en `plantillas-logica.spec.ts`):** 22/22 pruebas totales en verde en Vitest.


---
## [x] 0c.3. Pantalla de Pipeline de Oportunidades (`/pipeline`)

Origen: Jira (Epic VC-3 / Fase 2 — CRM y pipeline) · `COLA-DESPUES.md §0c.3` · `viajapro_diseno_ui_ux.json` (Pantalla 2) · Contratos en `@viajapro/contracts` (`TableroPipeline`, `ColumnaPipeline`, `Oportunidad`, `MoverOportunidad`, `EtapaPipeline`).

**Objetivo:** Construir el tablero Kanban de oportunidades de venta en `/pipeline` con 5 columnas (`NUEVO_LEAD`, `EN_COTIZACION`, `EN_NEGOCIACION`, `GANADA`, `PERDIDA`).

**Invariantes y criterios no opcionales:**
1. **El total de la columna viene del servidor y no se suma en el navegador:**
   - La API / simulador entrega `totalValor` denormalizado por columna. Si hay paginación o filtros, la suma visible no encoge falsamente.
2. **Arrastrar necesita alternativa por teclado:**
   - Soporte para mover tarjeta entre columnas con teclado (menú accesible o acción rápida).
3. **Soltar o mover una tarjeta a «PERDIDA» abre un diálogo obligatorio:**
   - Exige `motivoPerdida` (`PRECIO_ALTO`, `COMPRO_A_COMPETENCIA`, `DESTINO_NO_DISPONIBLE`, `FECHAS_NO_COINCIDEN`, `SIN_RESPUESTA`, `OTRO`).
   - Si el motivo es `OTRO`, exige explicación en `notaPerdida` según el contrato `exigirMotivoDePerdida`.
4. **Montos monetarios formateados con `.cifra` y tokens visuales acordes a `DISENO-BANDEJA.md` y `globals.css`.**
5. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.
- **Completado y verificado al 100%:**
  - Tablero Kanban de 5 columnas en `/pipeline` (`NUEVO_LEAD`, `EN_COTIZACION`, `EN_NEGOCIACION`, `GANADA`, `PERDIDA`) conforme a `TableroPipeline` y `Oportunidad` de `@viajapro/contracts`.
  - **Invariante 1 cumplido:** Los totales monetarios de columna se reciben denormalizados del servidor y se muestran en clase `.cifra`, sin recálculo engañoso en el cliente.
  - **Invariante 2 cumplido:** Alternativa accesible de teclado mediante menú contextual («Mover a...») en cada tarjeta con navegación por flechas y teclado.
  - **Invariante 3 cumplido:** Diálogo accesible obligatorio (`ModalMotivoPerdida`) al mover tarjetas a `PERDIDA` exigiendo `MotivoPerdida` y nota explicativa si es `OTRO` (garantizado por el refinement `exigirMotivoDePerdida` del contrato Zod).
  - **Vistas duales:** Selector entre «Tablero Kanban» y «Tabla compacta» según `viajapro_diseno_ui_ux.json`.
  - **Pruebas automáticas (7/7 en `pipeline-logica.spec.ts`):** 16/16 pruebas en verde en Vitest.


---

## [x] 0d. La ficha del viajero, atada a SU conversación

- **Completado y verificado.**
- `obtenerMockFichaDeContacto(conversacionId)` atada al ID: Juan Pérez devuelve `+573000012345` y Ana Martínez devuelve `+573000024690`.
- Prueba 7 en `apps/web/src/lib/bandeja-comportamiento.spec.ts`:
  - **Roja antes:** `AssertionError: expected '+573001234567' not to be '+573001234567'`.
  - **Verde después:** Pasan 9/9 pruebas.
- Subsanadas las observaciones no bloqueantes de `REVISION.md`:
  - Creado `apps/web/src/app/icon.svg` eliminando el 404 de favicon.
  - Tiempos de ventana variados en `mock-inbox.ts` para visibilizar urgentes (<1h), medios y cerrados.
  - Eliminado texto `(Próximamente)` en el botón de archivo de viaje.

---
## [x] 0b. El diseño — todo esto va antes que cualquier funcionalidad nueva

El propietario abrió la aplicación y dijo que la experiencia de usuario está por el suelo. Tiene
razón, y la causa fue mía: esta cola nunca mencionó el diseño acordado. El `diseno-ux` auditó la
bandeja contra `docs/_assets/diseno/01-bandeja.png` y dejó la corrección completa en
**`DISENO-BANDEJA.md`**, en esta misma rama. Léelo entero antes de empezar; aquí va el orden y lo
que no puedes saltarte.

**0b.1 — Sacar el instrumental de desarrollo de la pantalla.** Una hora, y es lo que más cambia.
Hoy un asesor de agencia lee «Mock Simulador», «Guard R5/UI», «Simular fallo de envío (Prueba
R5)» y «v0.1.0». Eso no es una pantalla de producto, es un banco de pruebas. Detrás de un
`process.env.NODE_ENV !== 'production'`, o fuera.

Y en `[id]/page.tsx:730`, la selección de plantillas —**la acción más cara del producto**, la
única forma de reabrir una conversación fuera de la ventana de 24 h— es un `alert()` del
navegador. Eso no se queda así ni un día más.

**0b.2 — El armazón de tres columnas.** Medio día, y va **antes** que lo demás: hoy cada página
es una pantalla completa con su propio `h-screen`, su cabecera y su scroll, y construir la ficha
del cliente dentro de esos cascarones es construirla para tirarla. Un `app/bandeja/layout.tsx`
con la rejilla; la lista vive en el layout, el hilo en `[id]/page.tsx`. Abrir una conversación
deja de ser navegar a otra página y perder la lista.

Condición para que lo demás llegue por partes sin rehacer nada: **las piezas nuevas reciben props
y no son dueñas ni de su layout ni de su scroll.**

**0b.3 a 0b.9 — El resto, en el orden del documento** y repartibles una vez puesto el armazón:
barra lateral de módulos con la meta de cierres · ficha del cliente a la derecha · iconos en vez
de emoji · cabecera con cuenta atrás de 24 h, SLA y «Nueva cotización» · tarjetas de cotización
en el hilo · acciones de cierre · móvil a 375 px, que incluye un defecto real de accesibilidad:
los chips miden unos 24 px de alto y el mínimo táctil son 44.

**Tres cosas del diseño que NO se construyen**, y el documento explica cada una: la cotización
como tipo de mensaje —`TipoContenido` solo admite lo que Meta entrega; hace falta un cambio de
contrato que pido yo—, «Detalles del viaje» como campos de `inbox` —pertenece a `crm`, se maqueta
simulado—, y el selector que duplica `FiltroBandeja`, donde gana el contrato.

**Sobre `packages/ui`, que hoy solo tiene un README:** hay 1 678 líneas de Tailwind en línea entre
dos archivos, el mismo badge escrito seis veces, y dos contadores de 24 h distintos cuyas reglas
de color no coinciden —la lista avisa a los 60 minutos y el hilo no avisa—. Extrae los tres
primitivos que propone el documento según los necesites. Moverlos a `packages/ui` después es
cambiar una ruta de importación.

---

---

## 📌 Sincronización Jira Cloud — Proyecto VIAJAPRO CRM (VC)

- **Ticket de Frontend activo:** [VC-13] (5 — Bandeja de conversaciones en la web).
- **Estado:** Entregado en `feat/bandeja-web`. Verificado y auditado favorablemente.
- **Tareas entregadas recientemente:**
  - **[VC-21] Carrera de `turbo` entre `build` y `typecheck` de la web:** RESUELTO. Integradas dependencias de paquete en `turbo.json` (`@viajapro/web#typecheck` y `@viajapro/database#typecheck` dependen de su propio `#build`). Cero carreras entre reescritura de `.next/types` y `tsc`.
  - **0c.17 — El «desde» con su condición:** RESUELTO. Tarjeta de salida muestra advertencia comercial destacada cuando `desdeEsDeGrupo` es `true` («por persona · en promo grupal»); propuesta WhatsApp avisa condición grupal explícitamente; nuevo helper `formatearCondicionDesde` probado.
  - **Copiloto heurístico:** Nombres honestos en UI («Asistente de Cotización (Heurístico)») sin prometer modelos LLM externos inexistentes.
- **Próxima tarea:**
  1. Pantalla de Pipeline (`/pipeline`) — Tablero Kanban de Oportunidades contra contratos de `crm.ts` (`TableroPipeline`, `Oportunidad`), según `viajapro_diseno_ui_ux.json` (0c.3 en `COLA-DESPUES.md`).
