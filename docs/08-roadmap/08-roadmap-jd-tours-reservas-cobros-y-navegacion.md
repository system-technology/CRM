# Roadmap JD Tours: reservas, cobros y navegación

| | |
|---|---|
| Fecha | 2026-11-20 |
| Origen | Dos audios del dueño de JD Tours (la agencia piloto), transcritos por el propietario; auditoría de navegación del mismo día |
| Decide | El propietario fijó el énfasis: **la navegación es lo más importante**. Y, el mismo día: **los reportes se manejan por niveles de acceso** (ver Eje F) |
| Tareas | `roadmap/tasks.yaml`, T-313 a T-346 (campo `owner`) |
| Estado vivo | `ESTADO.md` y `roadmap/tasks.yaml` mandan sobre este documento |
| Fuentes | [`_auditorias/2026-11-20-auditoria-de-navegacion.md`](../_auditorias/2026-11-20-auditoria-de-navegacion.md), [`_investigacion/2026-11-20-coexistencia-whatsapp-business-app.md`](../_investigacion/2026-11-20-coexistencia-whatsapp-business-app.md) |

## 0. Qué pidió el cliente y qué hay hoy

El dueño pidió: **«un área donde queden todas las personas que ya tienen reserva asignada, que ya pagaron
o tienen algún pago pendiente»**. Hoy lo resuelve con tres cosas:

- **Etiquetas de WhatsApp Business** en cada chat: «pagó», «pago pendiente», «hacer seguimiento».
- **Archivar** el chat cuando termina.
- **Una hoja de Google** con todas las reservas.

| Lo que usa | Qué tenemos en `main` (verificado 2026-11-20) |
|---|---|
| Ver quién tiene reserva | Pantalla `/viajes` (archivos de viaje con pasajeros y reservas por mayorista), pero con **cuatro nombres** y difícil de encontrar |
| Quién pagó y quién debe | **Nada.** No existe modelo de pagos del viajero. «Abono» en el producto es lo que la agencia paga **al mayorista** |
| Etiquetas en el chat | `Contacto.etiquetas` libres, editables solo en el modal del contacto. **No se ven, ni se ponen, ni se filtran en la bandeja** |
| Su hoja de reservas | No hay tabla con sus columnas, ni exportar archivos de viaje, ni importar su hoja actual |
| Moverse por la herramienta | Cada pantalla monta su propia barra; faltan «Hoy», Cotizaciones y Seguimientos en el menú; móvil a medias (ver la auditoría) |

## 1. Principios de este roadmap

1. **La navegación va primero, y todo lo nuevo vive dentro de ella.** Cobros, etiquetas y la tabla de
   archivos son pantallas: si se construyen antes del marco común, nacen huérfanas como Seguimientos.
2. **El estado de pago es del viaje, no de la persona.** Un mismo cliente puede tener un viaje pagado y
   otro con saldo. Por eso vive en el **archivo de viaje**; las etiquetas del contacto quedan para otras
   cosas («VIP», «Luna de miel»).
3. **Dinero con rigor.** Enteros en la unidad mínima de la moneda más código ISO-4217 (R8); historial que
   no se edita; idempotente (R5); permiso propio; aislamiento entre agencias con auditoría de seguridad
   sin recortar vueltas (R13).
4. **Lo que el dueño ya hace, se parece a lo que le damos.** Etiquetas con color, un clic, filtro: es su
   WhatsApp Business de siempre. No se le pide aprender un modelo nuevo para la primera semana.
5. **Que pueda dejar su hoja.** Sin importar sus reservas actuales, tendría que volver a teclearlas y no
   adoptaría el CRM.
6. **Sin pasarela de pagos en este roadmap.** Registro manual de pagos. Cobrar en línea es otro ADR.
7. **Una decisión estructural, un ADR antes del código (R7):** el layout compartido (T-314), el contexto
   de pagos (T-328) y la coexistencia con WhatsApp Business (T-338).

## 2. Los cinco ejes y su orden

```text
Fase 0  decidir        N0 flujos y personas · ADR layout · C0 historia de cobros · preguntas al dueño
Fase 1  marco común    N1 layout compartido → N2 nombres y tabla de navegación → N3 «Hoy» y menú completo
Fase 2  lo que usa     B etiquetas en la bandeja  ‖  C cobros (ADR → base → API → pantalla)
Fase 3  su hoja        D tabla de archivos → exportar CSV → importar su hoja
Fase 4  pulido         N5 URL como estado · N6 paleta · N4 móvil · N7 contexto del cotizador · N8 campana
Fase 3b reportes        F por niveles: asesor (móvil primero) y administración (robusto); F0 y F1 corren en paralelo desde la Fase 0
Aparte  su número      E coexistencia (depende de T-080 y de verificar con Meta; ver §5)
```

### Eje N — Navegación (prioridad máxima)

Es el plan N0 a N8 de la auditoría de navegación; el detalle, las capturas y las pruebas por paso están
allí. Lo que se espera al terminar la Fase 1:

- **Ninguna pantalla sin barra lateral**; un solo layout compartido y una **tabla única de navegación**
  de la que leen menú, barra móvil, paleta, migas y título.
- **Menú por tarea del día** con los nombres del lenguaje ubicuo: Hoy · Conversaciones · Oportunidades ·
  Cotizaciones · Archivos de viaje · Seguimientos · Contactos · Catálogo · Reportes · Configuración.
- **«Hoy» existe** y es adonde llega la asesora al ingresar (lo confirma el `dueno-de-producto` en N0).

| Tarea | Paso | Dueño | Depende de |
|---|---|---|---|
| T-313 | N0: `04-flujos-criticos.md` y `03-personas.md` (hoy vacíos); validar el menú | `analista-producto`, `diseno-ux`, `experto-turismo` | — |
| T-314 | ADR del layout compartido `(app)` (contradice `CLAUDE.md` §5, «plano, sin (dashboard)») | `arquitecto` | — |
| T-315 | N1: layout compartido, fuera las 12 importaciones de `BarraModulos` | `frontend` | T-314 |
| T-316 | N2: tabla única de navegación y nombres de la propuesta | `diseno-ux`, `frontend` | T-315 |
| T-317 | N3: «Hoy», Cotizaciones y Seguimientos en el menú; destino tras ingresar | `frontend` | T-316, T-313 |
| T-318 | N5: la URL como estado (Atrás vuelve, `?id`, `?op`, `?pestana=`) | `frontend` | T-315 |
| T-319 | N6: la paleta busca en la misma fuente que cada pantalla | `frontend` | T-316 |
| T-320 | N4: móvil con barra de 5 y hoja «Más» | `frontend` | T-316 |
| T-321 | N7: contexto en el cotizador (para quién, desde qué chat) y un solo total | `diseno-ux`, `frontend` | T-316 |
| T-322 | N8: la campana cuenta lo que suma y el error de sesión ofrece salida | `frontend`, `auditor-seguridad` | T-315 |

### Eje B — Etiquetas en la bandeja

La forma en que el dueño trabaja hoy. Tabla **por agencia** (R12, no un `enum`), con color; sembradas
«Pagado», «Pago pendiente» y «Seguimiento»; se ponen y quitan con un clic desde el chat y se filtra la
bandeja por ellas. Se decide en T-323 si se asignan a la conversación, al archivo o a ambos.

| Tarea | Paso | Dueño | Depende de |
|---|---|---|---|
| T-323 | B0: diseño y alcance (a qué se asignan, colores, sembrado, relación con `Contacto.etiquetas`) | `analista-producto`, `diseno-ux` | — |
| T-324 | B1: migración de etiquetas por agencia y su asignación (RLS, R1) | `datos` | T-323 |
| T-325 | B2: API de etiquetas | `backend` | T-324 |
| T-326 | B3: chips con color, un clic y filtro en la bandeja | `frontend` | T-325, T-315 |

### Eje C — Cobros del viajero (quién pagó y quién debe)

Registro **manual** de pagos por archivo, saldo calculado en el servidor, y una vista «quién pagó y
quién debe». Antes de diseñar hay que cerrar las preguntas al dueño (ver §4).

| Tarea | Paso | Dueño | Depende de |
|---|---|---|---|
| T-327 | C0: historia de usuario y alcance mínimo; preguntas al dueño | `analista-producto`, `experto-turismo` | — |
| T-328 | C1: ADR del contexto de pagos (registro manual, estados, R8, R5, permiso) | `arquitecto` | T-327 |
| T-329 | C2: migración de pagos del viajero (insert-only, historial inmutable, RLS) y su permiso | `datos` | T-328 |
| T-330 | C3: API para registrar un pago y leer el saldo del archivo (idempotente). **Absorbe la mitad «abonos y saldo» de T-283** | `backend` | T-329 |
| T-331 | C4: registrar pago y ver saldo en el archivo | `frontend` | T-330, T-316 |
| T-332 | C5: vista «quién pagó y quién debe» (Al día, Saldo pendiente, Vencido) | `frontend` | T-331 |
| T-333 | C6: «Hoy» y la campana avisan los cobros vencidos; estado de pago visible en la bandeja | `backend`, `frontend` | T-332, T-317 |

### Eje D — Archivos de viaje como reemplazo de su hoja

| Tarea | Paso | Dueño | Depende de |
|---|---|---|---|
| T-334 | D1: tabla de archivos con las columnas de su hoja y filtros | `frontend` | T-316, T-327 |
| T-335 | D2: exportar a CSV (sin neto ni margen para quien no tenga el permiso) | `backend`, `frontend` | T-334 |
| T-336 | D3: importar su hoja actual (CSV, vista previa, sin duplicar, sin registrar datos personales en logs) | `backend`, `frontend`, `auditor-seguridad` | T-334, T-327 |

### Eje F — Reportes por niveles de acceso (asesor y administración)

**Decisión del propietario (2026-11-20):** los asesores ven los reportes **pertinentes a su operación** y
tienen su propio dashboard; el administrador tiene **todo el abanico** de reportes, consultas y dashboards
y un tablero más robusto. **Es probable que trabajen mucho desde el celular**, así que ambos dashboards se
diseñan **móvil primero** y se verifican a 390 px.

Esto **reemplaza D3** de `04-flujos-criticos.md` («la asesora no ve Reportes»): ahora «Reportes» está en el
menú de todos, y **lo que ve cada uno depende de su nivel**. Configuración sigue solo para quien tenga
`usuarios.administrar`. Se apoya en el roadmap de reportes ya escrito
([`06-roadmap-de-reportes.md`](06-roadmap-de-reportes.md), T-131 a T-151) y en T-141, que ya anticipaba el
problema («hoy cualquier miembro lee el resumen de toda la agencia»).

| Nivel | Ve | Cómo |
|---|---|---|
| **Asesor** | Lo suyo: sus conversaciones sin responder, sus cotizaciones abiertas por antigüedad, sus seguimientos vencidos, sus cierres del mes, sus cobros por cobrar | Dashboard corto, en «Hoy» y en Reportes, pensado para el celular |
| **Administrador** | Toda la agencia y a su equipo: embudo, ventas por moneda, destino y asesor, tiempos de respuesta, cobros, salidas próximas con pasajeros, margen (con su permiso aparte) | Dashboard robusto, consultas con filtros (periodo, asesor, moneda, origen), filtros guardados y exportación |

**Lo que no puede fallar:** el alcance (propio frente a toda la agencia) lo impone **el servidor** con la sesión,
nunca el cliente ni el menú: ocultar un ítem no es control de acceso. Dos asesores de la misma agencia no ven
lo del otro, y el margen sigue protegido por `cotizacion.ver_neto_y_margen`.

| Tarea | Paso | Dueño | Depende de |
|---|---|---|---|
| T-339 | F0: qué ve cada nivel (catálogo de reportes por rol), qué va en «Hoy» y qué en Reportes, móvil primero | `analista-datos`, `analista-producto`, `experto-turismo`, `diseno-ux` | — |
| T-340 | F1: ADR de los niveles de acceso a reportes (propio, equipo, agencia; permisos; cómo se impone en el servidor) | `arquitecto`, `auditor-seguridad` | T-339 |
| T-341 | F2: permisos de reportes en el catálogo de roles y su sembrado. **Absorbe T-141** | `datos` | T-340 |
| T-342 | F3: alcance propio o de toda la agencia en los endpoints de reportes, impuesto por el servidor | `backend` | T-341 |
| T-343 | F4: dashboard del asesor, móvil primero | `diseno-ux`, `frontend` | T-342, T-317 |
| T-344 | F5: dashboard de administración robusto | `diseno-ux`, `frontend` | T-342 |
| T-345 | F6: consultas del administrador: filtros, filtros guardados y exportar | `frontend`, `backend` | T-344 |
| T-346 | F7: revisión móvil de los dos dashboards (390 px) y pruebas de permisos entre asesores | `qa`, `frontend` | T-343, T-344 |

### Eje E — El número de JD Tours (aparte de los demás)

Responde a «si conecto mi número, ¿pierdo WhatsApp Business?». Hay un modo oficial (**coexistencia**) que
lo evita, pero **no está verificado con Meta**. No bloquea los otros ejes: el CRM funciona con el número
de prueba.

| Tarea | Paso | Dueño | Depende de |
|---|---|---|---|
| T-337 | E1: verificar con fuentes de Meta y con el número real (Colombia, requisitos, ecos, **si las etiquetas de WhatsApp Business se sincronizan**, exclusión de chats, tarifas) | `investigador`, propietario | T-080 |
| T-338 | E2: ADR de coexistencia y del tratamiento de chats de proveedores (Ley 1581) | `arquitecto`, `auditor-seguridad` | T-337 |

## 3. Criterio de salida («JD Tours puede dejar su hoja y sus etiquetas»)

Se considera cumplido cuando, en una agencia de prueba con datos de demo creíbles y **comprobado en un
navegador**:

1. Desde **cualquier** pantalla se llega a cualquier módulo en **dos clics o menos** (dos toques en
   móvil), con la barra siempre presente y el módulo activo marcado.
2. La asesora ingresa y ve **«Hoy»**: seguimientos, plazos y cobros vencidos.
3. Desde un chat se pone «Pago pendiente» con un clic y se filtra la bandeja por esa etiqueta.
4. En «Archivos de viaje» se ve la tabla con **total, pagado y saldo** por archivo, se filtra «Saldo
   pendiente» y se exporta a CSV.
5. Se registra un pago y el saldo cambia; el pago queda en un historial que no se edita.
6. Se importó una hoja de muestra de la agencia sin duplicar filas.
7. El aislamiento entre agencias pasó auditoría en cada pieza que toca dinero o datos de varias agencias.
8. Un asesor abre el celular y ve **su** dashboard sin desplazarse de lado; no ve lo de otro asesor; el
   administrador ve toda la agencia y puede filtrar por asesor, periodo y moneda.

## 4. Preguntas abiertas para el dueño (antes de T-327, T-323 y T-334)

- ¿Cobra por **archivo** (un grupo familiar) o por **pasajero**?
- ¿Pagos libres o un **plan de cuotas** con fechas?
- ¿Monedas y medios de pago (transferencia, efectivo, tarjeta)? ¿Guarda comprobantes?
- ¿Quién registra los pagos, el asesor o una persona de administración?
- ¿Quiere que el sistema recuerde su saldo al cliente por WhatsApp? (si sí, es otra tarea de cola, no está aquí)
- ¿Qué **etiquetas** usa exactamente, y de qué color?
- Reportes: ¿qué mira cada asesor para saber cómo va?, ¿qué quiere ver él como administrador?, ¿cuántos asesores tiene y cuántos trabajan desde el celular?
- Su hoja: **cuántas reservas** y **qué columnas**. Pedir una **muestra sin nombres ni teléfonos** (R10).

## 5. Riesgos y qué no se hace

- **Los dos audios son de un solo cliente.** Antes de generalizar, `experto-turismo` valida que el modelo
  de cobros sirve a otras agencias (R12: política por agencia, invariantes en el dominio).
- **Datos del cliente en documentos.** Los audios y la hoja traen datos personales: no se pegan en el
  repositorio, que es público (R10, Ley 1581).
- **Coexistencia sin verificar.** No se le promete nada al dueño más allá de «existe un modo oficial y lo
  confirmamos para tu caso» hasta cerrar T-337.
- **No se cambian las URL existentes**, solo etiquetas y nombres (la auditoría de navegación lista lo que
  no se toca).
- **Sin pasarela de pagos, sin IA y sin recordatorios por WhatsApp** en este roadmap.
- **Aislamiento entre agencias:** en pagos, etiquetas e importación no se recorta la auditoría (R13).
- **Visibilidad entre asesores:** en reportes, que un asesor no vea lo de otro es un requisito de seguridad, no de presentación; tiene auditoría y pruebas con dos asesores.

## 6. Cómo se trabaja este roadmap

- Un PR por tarea (1 a 3 días). Las tareas `docs` y los ADR salen primero.
- Rutas protegidas (migraciones, ADR, `CLAUDE.md`, `scripts/`, `.github/`) esperan la aprobación del
  propietario: la sesión que trabaja este roadmap pide esa aprobación a la sesión que la abrió.
- Cada tarea se cierra con evidencia (PR integrado y CI en verde), y al cerrar un lote se actualizan
  `ESTADO.md` y `docs/_contexto/DIARIO.md`.
