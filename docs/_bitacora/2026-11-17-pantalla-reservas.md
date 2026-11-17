# 2026-11-17 — Pantalla Reservas (T-243)

**Participantes:** agente `frontend`.
**Alcance:** ADR-0024 Fase 4. `/viajes` deja de ser la maqueta (`mock-viajes.ts`) y habla con
`/api/v1/archivos` (T-242, T-248).

## Qué se hizo

- **Lista** (`components/reservas/lista-archivos.tsx`): por cada archivo, la reserva viva con el plazo
  más próximo, su mayorista, el semáforo (texto + icono, no solo color) y el plazo en la zona de la
  agencia. Orden del servidor. Búsqueda por file, destino, paquete o mayorista; filtro
  abiertos / cancelados / todos.
- **Detalle**: reservas por mayorista (localizador, time limit, pago total, motivo de caída, nota),
  pasajeros y avisos. Neto del mayorista solo si la clave `netoUnidades` viene en la respuesta; `null`
  se muestra como «incompleto», ausente no se muestra nada.
- **Mutaciones**: avanzar estado con los campos del paso (time limit al confirmar, pago total al
  abonar, motivo al caer; localizador y nota siempre), «corregir datos», editar pasajeros (lista
  completa) y cancelar el archivo. Cada respuesta trae el archivo ya actualizado.
- **Errores del dominio**: `archivos-logica.ts` traduce cada código (409/422) a una frase en español
  y nunca muestra el texto crudo del servidor.
- **Zona horaria (R9)**: los `datetime-local` se escriben y se muestran en la zona de la agencia
  (`/agencia/ajustes`, por defecto Bogotá) y viajan en UTC. Dinero con `formatearDinero` (R8).
- **Maqueta vs real**: igual que el CRM, `estaUsandoApiReal()`. En demo la lectura sale de
  `mock-archivos.ts` (en la forma del contrato) y las mutaciones se rechazan con `MODO_DEMO`: un
  cambio que no se guarda no debe parecer guardado.
- **Pruebas**: `archivos-logica.spec.ts`, `archivos-api.spec.ts`, `app/viajes/page.spec.tsx` (lista,
  cargando, vacío, error, 500 archivos, detalle, avance con validación, 409, pasajeros, cancelación,
  archivo cancelado). Caso `/viajes` añadido al recorrido de `e2e/03-paginas.e2e-spec.ts`.

## Decisiones que conviene revisar

- **Sin TanStack Query.** Las pantallas reales de hoy (pipeline, cotizaciones, bandeja) usan
  `useEffect` + cliente propio y el paquete no está instalado en `apps/web`; se mantuvo la coherencia
  y no se añadió una dependencia.
- **`SIGUIENTES_ESTADOS`** duplica el mapa de transiciones del dominio solo para decidir qué botones
  ofrecer. Manda el servidor: un rechazo se muestra tal cual en lenguaje claro.
- **Formularios sin react-hook-form** (tampoco instalado): estado local y los esquemas Zod de
  `packages/contracts` para validar el cuerpo.
- `mock-viajes.ts` y `viajes-logica.ts` siguen en el repositorio porque los consumen el buscador
  global y las notificaciones de demostración; no son parte de `/viajes`.
- La navegación sigue diciendo «Archivos de Viaje»; el título de la pantalla es «Reservas».

## Pendiente (no bloquea)

- T-252: e2e que acepta una cotización y abre Reservas (no hay hoy un paso de UI para aceptar en la
  suite), virtualizar la lista si 500 filas superan 100 ms, y ocultar mutaciones sin `archivo.operar`
  tras T-249.
- No se corrió Playwright en esta sesión (el caso añadido a `03-paginas` no está probado contra un
  servidor real) ni se probó la pantalla contra la API real.
