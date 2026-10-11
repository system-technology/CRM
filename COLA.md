# Cola de trabajo — Antigravity

> **Flujo continuo y sincronización con Jira:**
> Tarea 0d completada y verificada bajo las 5 compuertas (test 9/9 en verde, typecheck limpio, lint limpio, build limpio, format limpio).
> Conforme a la instrucción del propietario («cuando te quedes sin tareas toma de Jira y lo colocas en el archivo para que lo trabajes y Claude sepa pero nunca te quedes sin trabajar pero tampoco inventes trabajos»), se toma de Jira (Epic VC-3 / Fase 2 — CRM y pipeline) y de `COLA-DESPUES.md §0c.3` la siguiente pantalla oficial del roadmap:
> **Pantalla de Pipeline de Oportunidades (`/pipeline`) — Tablero Kanban**.

**Siempre:** solo tocas `apps/web/`. Nunca escribes en `main`. No tocas `ESTADO.md`. Cero tipos
redefinidos: todo de `@viajapro/contracts` — si falta un campo, **para y dilo**. `lint`, `typecheck`, `test`, `build` y `format:check` en verde
**ejecutados**, no supuestos, antes de escribir `ENTREGA.md`. Y funciona a 375 px.

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
- **Estado:** Entregado en `feat/bandeja-web` (Commits `685ec53` y `10f5a96`). Comentario formal registrado en Jira con evidencia de las 5 compuertas.
- **Próximas tareas en Jira identificadas para Frontend:**
  1. Pantalla de Pipeline (`/pipeline`) — Tablero Kanban de Oportunidades contra contratos de `crm.ts` (`TableroPipeline`, `Oportunidad`), según `viajapro_diseno_ui_ux.json`.
  2. [VC-21] Carrera de `turbo` entre `build` y `typecheck` de la web: evitar falso rojo en CI.
