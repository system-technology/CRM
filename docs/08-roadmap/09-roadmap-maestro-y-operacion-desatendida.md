# Roadmap maestro del CRM completo y operación desatendida

| | |
|---|---|
| Fecha | 2026-11-21 |
| Origen | Petición del propietario: que el trabajo avance solo, sin depender de él, **hasta terminar el CRM, no solo el MVP** |
| Qué es | La cola ordenada de todo lo que falta (olas) y las **reglas con las que el orquestador y las sesiones trabajan sin supervisión** |
| Cómo se opera | Un **orquestador** (la sesión madre, despertada por una tarea programada) reparte trabajo a **sesiones de trabajo** y vigila las compuertas. Ver §3 |
| Qué manda | `roadmap/tasks.yaml` y `ESTADO.md` mandan sobre este documento. Este documento fija el **orden** y las **reglas** |
| Se apoya en | [`02-roadmap-producto-v3.md`](02-roadmap-producto-v3.md) (fases de producto), [`01-roadmap.md`](01-roadmap.md) (cimientos y «Definition of Ready for Production») y [`08-roadmap-jd-tours-reservas-cobros-y-navegacion.md`](08-roadmap-jd-tours-reservas-cobros-y-navegacion.md) |
| Lo que solo hace el propietario | [`../_contexto/PENDIENTES-DEL-PROPIETARIO.md`](../_contexto/PENDIENTES-DEL-PROPIETARIO.md) |

## 1. Qué significa «CRM completo»

El producto está completo cuando se cumplen los criterios de salida de las **cuatro fases** de
`02-roadmap-producto-v3.md` §3 y los cimientos de `01-roadmap.md` §2 (C1–C5) están en verde:

1. **Piloto utilizable:** un asesor de JD Tours atiende una jornada entera sin abrir el WhatsApp del celular.
2. **Mejor que HubSpot para turismo:** cotización compartible, archivo de viaje con cobros, cupos, pagos en COP, catálogo que entra solo.
3. **Automatización y crecimiento:** reglas de turismo sobre WhatsApp, reportes reales por nivel, captación, IA del asesor.
4. **Escala:** varias sedes, mayoristas, alta autoservicio, cinco agencias pagando.

Una ola **no se da por terminada** porque se codificó, sino cuando su criterio de salida se **demuestra** y
está integrado en `main` (R11).

## 2. Las olas, en orden

El orden manda: no se empieza una ola mientras la anterior tenga trabajo **listo** sin hacer, salvo lo
transversal. «Listo» es una tarea `ready` cuyas dependencias están `done`.

### Ola 0 — Presentable al cliente (ahora)

**Salida:** el criterio de salida del roadmap de JD Tours (§3) **más una URL desplegada** que el dueño puede abrir.

| Eje | Tareas |
|---|---|
| Demo desplegada (Neon + Render + Vercel) | T-079, T-239 y los secretos del propietario (ver la bandeja) |
| Navegación y móvil | T-316 a T-322 (T-313 a T-315 hechas) |
| Etiquetas en la bandeja | T-323 a T-326 |
| Cobros del viajero | T-328 a T-333 |
| Archivos de viaje como hoja | T-334 a T-336 |
| Ingreso por apodo | T-360 a T-374 (ADR-0031) |

### Ola 1 — Piloto con datos reales (v3 Fase 1 y cimientos C1–C5)

**Salida:** la jornada de 20 conversaciones con el número real y cotizaciones recibidas en el teléfono del cliente.

- **WhatsApp real:** T-080 (verificación de Meta y Tech Provider, del propietario), T-078 (plantilla de reapertura), T-081 (ensayo de jornada), coexistencia T-337 y T-338, T-276 y T-277.
- **Privacidad y ley:** T-090 (ADR de PII en mensajes), T-093, T-097, T-098 y T-267 (textos legales, requieren abogado).
- **Reportes por nivel:** T-339 a T-346 (asesor móvil y administración).
- **Producción:** cifrado con clave real cargada, despliegue de producción, respaldo y restauración **ensayados**, rotación de claves ensayada, observabilidad (`docs/06-operacion/`).
- **Cola de auditorías:** T-306, T-308 a T-312 y T-375 a T-377, T-284 a T-291.

### Ola 2 — Mejor que HubSpot para turismo (v3 Fase 2)

**Salida:** propuesta abierta en el móvil del cliente en menos de 5 minutos, anticipo pagado en sandbox, cupo que baja, catálogo cargado por la agencia.

- Cotización compartible y propuesta al viajero: T-261 a T-266.
- Catálogo por hoja, API pública e IA: T-052 a T-058.
- Cupo propio por salida (ADR-0029): decidir cupo controlado o informativo.
- Pagos en COP con pasarela (ADR de la pasarela; **la elección es del propietario**).
- Campos personalizados por agencia; multiidioma (T-152 a T-172, congelado hasta cerrar la Ola 1).

### Ola 3 — Automatización y crecimiento (v3 Fase 3)

**Salida:** dos semanas en la piloto con reportes calculados, un recordatorio automático que reabre una cotización y cero viajeros sin el recordatorio de víspera.

- Reglas sobre WhatsApp (cotización sin respuesta a las 48 h, recordatorio D-1), cada una con plantilla aprobada y apagable.
- Reportes avanzados: T-131 a T-151 (captura de historiales primero).
- Captación (click-to-WhatsApp), IA del asesor, exportar e importar contactos, API pública de lectura y webhooks salientes.

### Ola 4 — Escala (v3 Fase 4)

**Salida:** cinco agencias pagando y una agencia nueva que recibe su primer WhatsApp en un día, sin intervención.

- Registro autoservicio de agencias: T-267 a T-281 (ADR-0030; precondiciones T-281 y T-361).
- Varias sedes, mayoristas y receptivos, Instagram y Messenger, facturación del ERP, particiones, observabilidad y prueba de carga.

### Transversal (corre siempre, en paralelo a cualquier ola)

- **Auditoría integral** (`auditoria-integral`) al cerrar cada ola, y revisión de seguridad de todo lo que toque dinero, aislamiento, autenticación o datos personales.
- **Deuda y robustez:** el patrón de `pg_temp` en las demás funciones (T-306), pruebas de mutación en el CI, versión de Postgres de Neon documentada.
- **El hilo:** `ESTADO.md`, `DIARIO.md` y la bitácora al cerrar cada lote; la cola reconciliada con los PR integrados.

## 3. Cómo se trabaja sin supervisión

### 3.1 Los roles

- **Orquestador:** la sesión madre. Una **tarea programada** la despierta cada dos horas. Integra, reparte, audita y no escribe código de producto salvo arreglos pequeños de proceso.
- **Sesiones de trabajo:** como máximo **tres** a la vez, cada una con **un carril** (web, base de datos y API, o investigación) y **una tarea** a la vez.
- **Agentes de apoyo** (`auditor-seguridad`, `arquitecto`, `datos`, `qa`…): los lanzan las sesiones o el orquestador para una pasada concreta.

### 3.2 El ciclo del orquestador (cada despertar)

1. `git fetch`, estado de `main` y de cada PR abierto con `gh` (solo REST). **Verificar antes de afirmar.**
2. **Integrar** lo que está listo (§3.4) y actualizar con `main` las ramas atrasadas.
3. **Auditar** lo que lo exige y todavía no tiene veredicto.
4. **Repartir:** a cada sesión sin tarea, la siguiente tarea `ready` de la ola actual (orden: ola, prioridad P0 a P3, carril libre). Mandar el encargo por mensaje, con el criterio de aceptación.
5. **Reconciliar** `roadmap/tasks.yaml` con los PR integrados (cerrar tareas con su evidencia, desbloquear las que dependían).
6. **Registrar:** `CHECKPOINT.local.md` tras cada hito, y `DIARIO.md` y `ESTADO.md` al cerrar un lote.
7. **Actualizar la bandeja del propietario** (`PENDIENTES-DEL-PROPIETARIO.md`) con lo nuevo que solo él puede resolver.
8. Si nada avanzó en dos despertares seguidos, anotar la causa en la bandeja y no repetir lo mismo.

### 3.3 El ciclo de una sesión de trabajo

Tomar una tarea → `git fetch` y leer `main` antes de numerar migraciones, tareas o ADR → rama propia → ADR antes del código si cambia la estructura (R7) → implementar con pruebas → PR **sin auto-merge** si es web o ruta protegida → pedir auditoría cuando toque → reportar al orquestador → siguiente tarea. Si una tarea falla dos veces, se anota con la causa y se pasa a la siguiente.

### 3.4 Las compuertas (nada entra sin ellas)

| Compuerta | Exige |
|---|---|
| CI | Los **9 checks obligatorios** en verde (incluido `navegador`) y la rama al día |
| Web | `navegador` verde **antes** de integrar; sin auto-merge en `apps/web` |
| Seguridad | `auditor-seguridad` en todo lo que toque **aislamiento entre agencias, dinero, autenticación o datos personales**. En aislamiento no se recorta ninguna vuelta (R13); en lo demás, una pasada |
| Rutas protegidas | Migraciones, RLS, cifrado, ADR, `CLAUDE.md`, `AGENTS.md`, `scripts/`, `.github/` y dependencias: las **integra el orquestador**, con la delegación del propietario, **solo** con auditoría hecha y CI verde |
| Veracidad | «En verde», «integrado» o «listo» solo con evidencia de `gh`, `git` o navegador **del mismo turno**. Separar lo visto de lo supuesto |

### 3.5 Lo que NUNCA hacen solas (se anota en la bandeja y se sigue con otra cosa)

- Cargar, ver, pedir o escribir **secretos y credenciales**; tocar paneles de Neon, Render, Vercel, Meta o 21st.dev.
- Cambiar la **configuración del servidor** de GitHub (protección de rama, etiquetas que saltan una compuerta como `override-lane`, permisos).
- Cualquier **trámite o decisión del propietario**: Meta y Tech Provider, abogado y textos legales, la pasarela de pagos, precios, contador y temas fiscales.
- **Enviar mensajes a clientes reales** o usar el WhatsApp real.
- Poner **datos reales** de agencias o viajeros en el repositorio, que es público (Ley 1581).
- Integrar saltándose una compuerta, empujar a `main`, borrar ramas ajenas o cambiar su propia política de permisos.
- Dejar de **verificar**: si no se pudo comprobar, se dice «sin verificar» y no se simula.

### 3.6 Anticolisión y ritmo

- Un **carril por sesión**; dos sesiones no tocan el mismo archivo a la vez. Antes de numerar, `git fetch`.
- Tope de **tres sesiones de trabajo** a la vez; no se abren más sin retirar otra.
- **Cómo se detiene todo:** desactivar la tarea programada (lista de tareas programadas de la cuenta) o pedírselo al orquestador. El resto se queda quieto en cuanto termine su tarea.
- **Permisos:** una sesión que pida permiso y nadie conteste **se queda detenida**. Las sesiones de trabajo deben ir en **modo Auto**, y los comandos de solo lectura habituales se pueden permitir en `.claude/settings.json` (T-378).

## 4. Revisión de este documento

Se revisa al cerrar cada ola. Si una ola cambia de contenido, se anota aquí con la fecha y el porqué; el orden de
las olas solo lo cambia el propietario.
