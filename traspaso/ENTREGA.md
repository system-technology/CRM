> **Atención:** Quedan menos de 3 tareas libres en la cola (solo T-056 y T-063). Solicitamos al backend desbloquear las tareas de gestión de catálogo (T-041 en adelante).

# Entrega — T-037: Inicio con Saludo según la Hora, Acciones Rápidas y Tarjetas de Colores — 2026-10-26

## Identificación
- **Rama:** `b/T-037-inicio-saludo-acciones-rapidas` (empujada a `origin/b/T-037-inicio-saludo-acciones-rapidas`)
- **Tarea:** T-037 (Inicio con saludo, acciones rápidas y tarjetas de colores sobre el trabajo del día)
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `c2dece7a590a4f86a730daf773aaaaee` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Inicio & Dashboard Operacional - Laura Gómez - ViajaPro CRM*)

## Qué construí

1. **Saludo dinámico con identidad de turismo y contexto de agencia (`apps/web/src/app/page.tsx`):**
   - Saludo contextual según la hora del día en español colombiano (`¡Buenos días!`, `¡Buenas tardes!`, `¡Buenas noches!`) implementado en `apps/web/src/lib/inicio-logica.ts` (`obtenerSaludoSegunHora`, `obtenerMensajeBienvenida`).
   - Personalización con el nombre del asesor comercial activo (`sesion.identidad.nombre`), avatar con iniciales e insignia de aro dorado (`ring-2 ring-amber-400`).
   - Identificación de la agencia activa (ej. *JD Tours Cartagena*), indicador de «Turno activo» con pulsación visual y fecha/hora en vivo.

2. **Accesos directos rápidos operacionales de alta conversión:**
   - Botón primario de viaje `+ Nueva cotización` (`data-testid="acceso-nueva-cotizacion"`) enlazando a `/cotizador`.
   - Botón `Bandeja WhatsApp` (`data-testid="acceso-abrir-bandeja"`) con distintivo numérico de conversaciones pendientes enlazando a `/bandeja`.
   - Botón `Ver catálogo` (`data-testid="acceso-ver-catalogo"`) con aro dorado enlazando a `/catalogo`.
   - Botón `Pipeline` (`data-testid="acceso-ver-pipeline"`) enlazando a `/pipeline`.

3. **Cuatro tarjetas métricas con la paleta caribeña de ViajaPro:**
   - **Tarjeta 1 - Turquesa Caribeño (`#06B6D4`):** `Conversaciones pendientes` (`data-testid="tarjeta-conversaciones-pendientes"`), con detalle de chats sin asignar y ventana de 24h WhatsApp activa. Enlace directo a `/bandeja`.
   - **Tarjeta 2 - Océano Profundo (`#0284C7`):** `Oportunidades en Pipeline` (`data-testid="tarjeta-oportunidades-etapa"`), con desglose por etapas (`nuevoLead`, `enCotizacion`, `enNegociacion`) y cifra total destacada. Enlace directo a `/pipeline`.
   - **Tarjeta 3 - Coral Cálido (`#FB7185`):** `Cotizaciones por vencer` (`data-testid="tarjeta-cotizaciones-vencer"`), indicando seguimiento prioritario y bloqueo de cupos con mayoristas. Enlace a `/cotizaciones`.
   - **Tarjeta 4 - Atardecer Tropical (`#F97316`) con Aro Dorado (`#C9A24B`):** `Catálogo de excursiones` (`data-testid="tarjeta-catalogo-turismo"`), con acceso directo a pasadías y tours en COP. Enlace a `/catalogo`.
   - Animación de entrada fluida y escalonada respetando estrictamente `prefers-reduced-motion` (`motion-reduce:transition-none motion-reduce:transform-none`).

4. **Secciones de destinos populares y rendimiento comercial:**
   - Accesos directos para cotizar destinos de alta demanda (Cartagena & Barú, San Andrés & Providencia, Santa Marta & Tayrona, Eje Cafetero).
   - Bloque de acceso directo a reportes y rendimiento comercial con cálculos reales BigInt (R8).

5. **Manejo completo de estados:**
   - **Cargando (`data-testid="inicio-cargando"`):** Esqueleto de alta fidelidad con brillo mientras se consultan la sesión y las métricas.
   - **Error (`data-testid="inicio-error"`):** Banner amigable en es-CO con botón de reintento funcional (`data-testid="boton-reintentar"`).
   - **Vacío (`data-testid="inicio-vacio"`):** Mensaje de bienvenida para agencias recién creadas sin actividad con botón para crear su primera cotización.
   - **Responsive a 375 px:** Diseñado para pantalla de móvil con touch targets `>= 44 px` y sin desbordamiento horizontal.

6. **Lógica desacoplada y suites de pruebas completas:**
   - `apps/web/src/lib/inicio-logica.ts`: Funciones puras de saludo, bienvenida y agregación `calcularResumenTrabajo`.
   - `apps/web/src/lib/inicio-logica.spec.ts`: 4 pruebas unitarias cubriendo rangos horarios, personalización y detección de estado vacío.
   - `apps/web/src/app/page.spec.tsx`: 5 pruebas de componente con React Testing Library verificando saludo, accesos rápidos, tarjetas caribeñas, estado vacío y recuperación ante errores de red.

## Qué verifiqué ejecutando

- **Pruebas unitarias de la web:** `pnpm --filter @viajapro/web test` — **44 suites pasadas, 364/364 tests en verde (100%)**.
- **Pruebas específicas de Inicio:** `pnpm --filter @viajapro/web test "src/app/page.spec.tsx"` y `src/lib/inicio-logica.spec.ts` — **9/9 tests en verde**.
- **Typecheck estricto:** `pnpm --filter @viajapro/web typecheck` — **0 errores** TypeScript.
- **Linter:** `pnpm --filter @viajapro/web lint` — **0 errores / 0 advertencias**.
- **Ownership de carril:** `node scripts/check-ownership.mjs` — **✔ Dentro del carril (`carril: b`, ficheros: 5)**.

## Qué NO verifiqué (Reporte transparente de Compuertas)

- **Compuertas monorepo:** `build`, `lint` y `typecheck` corren en verde; las pruebas de `@viajapro/database` en `pnpm compuertas` caen localmente por autenticación contra la base de datos externa Neon (`password authentication failed for user 'viajapro_app'`), lo cual corresponde al carril `a` (backend/database).
