# Flujos críticos

| | |
|---|---|
| Fecha | 2026-11-20 |
| Tarea | T-313 (N0 del [roadmap JD Tours](../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md)) |
| Autor | `analista-producto`; las decisiones de menú, como `dueno-de-producto` |
| Estado | **Propuesta.** Las decisiones D1 a D4 esperan la confirmación del propietario |
| Personas | [`03-personas.md`](../00-vision/03-personas.md): Valentina (asesora) y Gloria (dueña) |
| Fuentes | [Auditoría de navegación](../_auditorias/2026-11-20-auditoria-de-navegacion.md) §2 y §4.1, [`06-diseno-y-ux.md`](06-diseno-y-ux.md) §2 |

Dos recorridos que deben funcionar siempre. Los otros que pedía el marcador original (cierre,
operación del viaje, post-venta) quedan para cuando el eje C esté integrado: escribirlos antes sería
diseñar pantallas que no existen.

Todos los nombres son del [lenguaje ubicuo](02-lenguaje-ubicuo.md). Las rutas no cambian (auditoría §6):
`/viajes` sigue siendo la URL aunque la pantalla se llame «Archivos de viaje». Los datos de los
ejemplos son ficticios.

## Criterio de «a dos clics»

Se cuentan, no se estiman (principio 2 de `06-diseno-y-ux.md`):

| Qué | Escritorio | Móvil (390 px) |
|---|---|---|
| **Ir** de cualquier pantalla de trabajo a cualquier módulo del menú | ≤ 2 clics | ≤ 2 toques |
| **Saltar** entre piezas del mismo hilo (conversación ↔ cotización ↔ archivo ↔ contacto) | 1 clic, desde un enlace visible | ≤ 2 toques |
| **Hacer** una acción frecuente (responder, cotizar, registrar un pago, marcar un seguimiento) | ≤ 3 clics desde la pantalla donde nace | ≤ 3 toques |
| Ir desde «Hoy» al objeto de cada aviso | 1 clic | 1 toque |

Escribir y Enter cuentan 0 clics. Abrir la paleta (Ctrl+K) cuenta 1. Una pantalla sin barra o sin
salida es un fallo del criterio aunque los clics cuadren.

---

## Flujo 1 — Primer contacto → cotización → archivo de viaje → cobro

**Quién:** Valentina, en escritorio. **Disparador:** un viajero escribe por WhatsApp «hola, precio
para San Andrés en diciembre, somos 2 adultos y 2 niños».

| # | Paso | Pantalla (ruta) | Clics | Hoy en `main` |
|---|---|---|---|---|
| 1 | Ve el chat nuevo con contador de sin leer y lo abre | Conversaciones (`/bandeja` → `/bandeja/[id]`) | 1 | Existe |
| 2 | Responde; el sistema crea el **contacto** y la **conversación** | Conversación | 0 | Existe |
| 3 | Crea la **oportunidad** desde el panel del viajero (nace de la conversación) | Conversación, panel derecho | 1 | Existe |
| 4 | Pulsa «Cotizar» en «Solicitud de viaje»: el cotizador se abre con paquete, fecha y ocupación cargados **y dice para quién cotiza y desde qué chat** | Cotizador (`/cotizador`), sin ítem propio en el menú (D2) | 1 | Abre prellenado; **falta el contexto** (T-321) |
| 5 | Guarda la cotización: versión 1, con el mismo total que vio | Detalle de cotización (`/cotizaciones/[id]`) | 2 | Existe; **el total difiere** (T-321) |
| 6 | «Enviar por WhatsApp» y vuelve al chat | Conversación | 1–2 | Existe |
| 7 | El viajero acepta. Valentina marca la cotización aceptada y **abre el archivo de viaje** («File 1044») | Detalle de cotización → Archivos de viaje (`/viajes?id=`) | 2 | Existe |
| 8 | Pide los cupos al mayorista: cada **reserva** dentro del archivo, con su *time limit* y su fecha de pago total | Archivo de viaje | ≤ 3 por reserva | Existe |
| 9 | El viajero transfiere el **anticipo**. Valentina **registra el pago en el archivo**; el saldo se recalcula | Archivo de viaje | ≤ 3 | **No existe** (T-330, T-331) |
| 10 | El archivo aparece como «Saldo pendiente» en la vista de cobros; cuando el saldo llega a cero, «Al día» | Archivos de viaje, filtro de cobros | — | **No existe** (T-332) |

**Reglas de este flujo**

- **El estado de pago es del archivo, no del contacto.** Un mismo viajero puede tener un archivo al
  día y otro con saldo. La etiqueta «Pago pendiente» del chat (eje B) es una ayuda visual, no la
  fuente del saldo: el saldo lo calcula el servidor a partir de los pagos registrados.
- Un pago del viajero no confirma ninguna reserva; la confirma el mayorista (lenguaje ubicuo, *Anticipo*).
- «Abono» es lo que la agencia paga al mayorista; lo que entra del viajero es **pago** o **anticipo**.
  No se mezclan en la misma columna.
- En cualquier paso, la conversación, la cotización y el archivo están a 1 clic entre sí.

**Casos borde**

- El viajero pide cambios: nueva **versión** de la cotización; la que vio no cambia.
- Escribe un segundo viajero del mismo grupo: es otra conversación; el archivo es uno solo [S: lo
  confirma `experto-turismo`].
- El mayorista no confirma o vence el *time limit*: la reserva queda **caída**, el archivo sigue y
  sus pagos también (no se borra dinero recibido).
- Se registra dos veces el mismo pago (doble clic, red lenta): queda uno (R5, idempotencia).
- Fuera de la ventana de 24 h: el envío de la cotización exige plantilla (aviso existente).

**Cómo sabemos que funcionó**

- Prueba e2e del N7: chat → Cotizar → guardar → enviar → de vuelta en el chat en **≤ 6 clics** y con
  el mismo total. Línea base de la auditoría: 6 clics, totales distintos.
- Tiempo de conversación a propuesta enviada **< 5 minutos** (objetivo de `06-diseno-y-ux.md`). Sin
  línea base: se mide en el piloto.
- Porcentaje de archivos con al menos un pago registrado en el CRM a 30 días del piloto. Si JD Tours
  sigue llevando los pagos en su hoja, el eje C no sirvió.

**Fuera de alcance**

- Cotizador como panel dentro del chat (auditoría §6: decisión de alcance aparte, en la cola).
- Pasarela de pagos, cobro en línea y recordatorio de saldo por WhatsApp (roadmap §5).
- Plan de cuotas con fechas, hasta que el dueño responda si lo usa (roadmap §4).

---

## Flujo 2 — «Qué hay que hacer hoy»

**Quién:** Valentina al empezar el día y cada vez que vuelve de atender. Gloria, con la misma
pantalla, ve lo de toda la agencia.

| # | Paso | Pantalla (ruta) | Clics |
|---|---|---|---|
| 1 | Ingresa y cae en **Hoy** (D1) | Hoy (`/`) | 0 |
| 2 | Ve, en este orden (de lo que más dinero cuesta a lo que menos): | Hoy | 0 |
| | a. *Time limits* y fechas de pago total al mayorista de las próximas 48 h y vencidos | | |
| | b. Archivos con **cobro del viajero vencido** (cuando exista el eje C, T-333) | | |
| | c. Conversaciones con SLA de respuesta vencido | | |
| | d. Seguimientos de hoy y vencidos | | |
| | e. Cotizaciones por vencer | | |
| 3 | Abre un aviso y llega al objeto: el archivo, la conversación, la cotización | Archivo / Conversación / Cotización | 1 |
| 4 | Resuelve (registra, responde, reprograma) y vuelve a Hoy por el menú; el contador baja | Hoy | 1 |

**Criterios de aceptación**

- [ ] Dado que tiene un *time limit* en 30 horas, cuando ingresa, entonces lo ve en Hoy sin desplazarse
  a 1440×900 y lo abre en 1 clic.
- [ ] Dado que está en cualquier pantalla de trabajo, cuando quiere volver a Hoy, entonces está a 1 clic
  (menú en escritorio, barra inferior en móvil) y su contador es visible.
- [ ] Dado un aviso en la campana, entonces la cifra de la campana, la de Hoy y la de la pantalla de
  destino coinciden (hoy no: 45 frente a 6, auditoría T3).
- [ ] Dado un aviso cuyo archivo no existe o no es de su agencia, entonces no aparece (nunca un enlace a
  «No se pudo abrir el archivo»).
- [ ] Dado que no tiene `conversaciones.ver_todas`, entonces Hoy solo muestra lo suyo; con ese permiso,
  lo de la agencia, con filtro «Míos».

**Casos borde**

- Nada pendiente: Hoy lo dice («Nada vence hoy») y ofrece ir a Conversaciones. No es una pantalla en blanco.
- La API no responde: Hoy dice qué falló y deja ir a Conversaciones; los avisos no se inventan.
- Husos: «hoy» y «48 h» se calculan en la zona horaria de la agencia (R9); en la base todo es UTC.

**Cómo sabemos que funcionó**

- Reservas caídas por *time limit* vencido sin que nadie lo tocara: línea base, la que dé el piloto el
  primer mes; objetivo, cero.
- Seguimientos vencidos al cierre del día. Hoy Inicio muestra 0 y la campana 1: primero hay que medir bien.

**Fuera de alcance**

- Reglas configurables de qué entra en Hoy (es política, R12, pero no en este lote).
- Notificaciones push o por correo.
- Asignar trabajo a otra asesora desde Hoy.

---

## Decisiones de menú para validar

> **Decisiones propuestas por el `dueno-de-producto`, sujetas a confirmación del propietario.**
> Hasta que el propietario las confirme, T-317 no se cierra. Criterio de prioridad declarado:
> impacto en la conversión de la agencia × frecuencia de uso ÷ costo.

### D1. «Hoy» es el destino tras ingresar — **Propuesta: sí, para todos los roles**

- **Por qué:** lo que más dinero cuesta (*time limit*, pago al mayorista, cobro vencido) no está en la
  bandeja; hoy la asesora arranca en 270 chats sin su lista de compromisos (auditoría §3.1). Conversaciones
  queda a 1 clic y Hoy incluye los chats con SLA vencido, así que responder no se retrasa.
- **Cómo:** el ingreso, el logo y la miga raíz llevan a `/`. Si el ingreso trae `?redirigir=` (enlace
  profundo de un aviso), se respeta ese destino.
- **Riesgo aceptado:** una asesora que solo atiende chats da un clic más al empezar. Si en el piloto lo
  pide, la preferencia «empezar en Conversaciones» va a la cola; no se construye antes.

### D2. El cotizador deja de ser módulo y pasa a ser la acción «Cotizar» — **Propuesta: sí**

- **Por qué:** una cotización sin viajero no se puede enviar ni convertir en archivo; el módulo suelto
  invita a cotizar sin contexto (auditoría T1). Lo que la asesora busca después es la **cotización**,
  y su listado hoy no está en ningún menú.
- **Cómo:** el menú muestra **Cotizaciones**. «Cotizar» está en la conversación, la oportunidad, el
  catálogo, un botón «+ Cotizar» en Cotizaciones (2 clics desde cualquier pantalla) y un comando de la
  paleta. `/cotizador` sigue existiendo como ruta y marca activo «Cotizaciones».
- **Fuera:** meter el cotizador dentro del chat (auditoría §6).

### D3. ¿La asesora ve Reportes y Configuración? — **Propuesta: no, por permiso**

- **Por qué:** son de otro usuario y otro ritmo (`06-diseno-y-ux.md` §1); ocupan sitio fijo en una
  herramienta de 40 chats al día.
- **Cómo, en este lote (T-317):** se muestran solo a quien tenga `usuarios.administrar` (el rol `DUENO`
  sembrado). Es una **regla provisional de presentación**: ocultar un ítem no es control de acceso, y la
  API sigue siendo la que autoriza.
- **A la cola:** un permiso propio `reportes.ver` (toca el `CHECK` de la base: ruta protegida) y, si
  el piloto lo pide, «Mis números» para la asesora. Ninguno bloquea T-317.
- **Supuesto [S]:** las asesoras de JD Tours no ven hoy los números de la agencia. Si el dueño dice
  que sí, se le da el permiso a su rol; no cambia el diseño.

### D4. Barra inferior en móvil — **Propuesta: Hoy · Conversaciones · Archivos · Buscar · Más**

- **Por qué:** en el celular se responde y se consulta (quién pagó, cuándo vence), no se arma un paquete
  completo [S]. Oportunidades, Cotizaciones y Cotizar quedan en «Más» y en la conversación, a ≤ 2 toques.
- **Supuesto [S]:** se confirma con el uso móvil real de JD Tours; si cotizan desde el teléfono,
  «Cotizar» sustituye a «Archivos».

### Menú resultante (escritorio)

Hoy · Conversaciones · Oportunidades · Cotizaciones · Archivos de viaje · Seguimientos · Contactos ·
Catálogo · *(separado, según permiso)* Reportes · Configuración.

---

## Supuestos que dependen del dueño de JD Tours

Se cierran con las preguntas del roadmap §4; ninguno bloquea la navegación (Fase 1):

- [S] Cobra por **archivo**, no por pasajero, y con pagos libres, no con cuotas fechadas.
- [S] Registra los pagos la asesora que lleva el archivo.
- [S] Moneda principal COP; algunos archivos en USD. Cada pago, con su moneda (R8).
- [S] Sus asesoras no ven los reportes de la agencia (D3) y desde el móvil no cotizan (D4).

## Pendiente fuera de este documento

- El [lenguaje ubicuo](02-lenguaje-ubicuo.md#nombres-en-la-interfaz) aún dice que el módulo se llama
  «Reservas». El roadmap y la auditoría lo llaman «Archivos de viaje» para no chocar con *Reserva*
  (`Booking`). Hay que corregir esa tabla en un PR aparte (`documentador`); este documento ya usa
  «Archivos de viaje».
