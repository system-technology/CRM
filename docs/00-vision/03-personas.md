# Personas y trabajos por resolver

| | |
|---|---|
| Fecha | 2026-11-20 |
| Tarea | T-313 (N0 del [roadmap JD Tours](../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md)) |
| Autor | `analista-producto` (pendiente de contraste con `experto-turismo` y `diseno-ux`) |
| Fuentes | [`06-diseno-y-ux.md`](../01-producto/06-diseno-y-ux.md) §1, [auditoría de navegación](../_auditorias/2026-11-20-auditoria-de-navegacion.md) §2, audios del dueño de JD Tours resumidos en el roadmap §0 |
| Flujos | [`04-flujos-criticos.md`](../01-producto/04-flujos-criticos.md) |

Dos personas. Son **arquetipos**, no personas reales: los nombres y cifras son ficticios y el
repositorio es público (R10). Lo que viene de un solo cliente (JD Tours) está marcado **[JD]**: es un
dato de un solo piloto, no una regla del sector. Lo que suponemos sin confirmar está marcado **[S]**.

La tercera persona del producto, **el viajero**, no se escribe aquí: no usa la herramienta en este
roadmap (no hay portal ni pago en línea). Se escribe cuando exista algo que el viajero toque.

---

## 1. Valentina, asesora de ventas

| | |
|---|---|
| Rol en el sistema | `ASESOR` sembrado: `bandeja.operar`, `crm.escribir`, `cotizacion.escribir`, `archivo.ver`, `archivo.operar` [S: la agencia puede cambiarlo] |
| Volumen | **~40 conversaciones al día**, de 6 a 15 abiertas a la vez; unos 270 chats en su bandeja histórica |
| Dispositivo | Escritorio en la oficina (mañana); **celular** en la tarde, en visitas y fuera de horario. El cliente escribe a las 9 p. m. y espera respuesta |
| Lleva | Entre 15 y 30 archivos de viaje vivos a la vez, con varios mayoristas cada uno [S] |

### Su día hoy, sin ViajaPro [JD]

- Atiende todo en **WhatsApp Business**. Marca cada chat con etiquetas («pagó», «pago pendiente»,
  «hacer seguimiento») y **archiva** el chat cuando el viaje termina.
- Cotiza en una calculadora o en una hoja, copia el total al chat y pega el PDF del mayorista.
- Lleva las reservas en **una hoja de Google** compartida con la dueña.
- Lo que olvida no está en ningún sitio: el *time limit* vive en el correo del mayorista y el
  «te escribo el lunes» en su memoria.

### Qué trata de lograr

1. **Responder rápido.** Si tarda 20 minutos, el cliente le pregunta a otra agencia.
2. **Que no se le caiga una reserva.** Un *time limit* vencido es un cupo perdido y una disculpa al
   cliente; es lo que más dinero cuesta (lenguaje ubicuo, *Time limit*).
3. **Saber quién le debe**, por viaje, para cobrar antes de pagarle al mayorista.
4. **Arrancar el día sabiendo qué hacer**, sin repasar 40 chats para reconstruirlo.

### Qué la hace abandonar la herramienta

- Que cotizar la saque del chat y al volver no sepa de quién era el cálculo (auditoría T1).
- Que en el celular no encuentre una pantalla (hoy tres módulos son inalcanzables en móvil).
- Tener que teclear dos veces lo que ya está en su hoja.
- Una cifra que no cuadra entre dos pantallas: deja de creerle a todas.

### Lo que **no** necesita ver

Reportes de la agencia, roles y permisos, conexión de WhatsApp, neto y margen si su rol no los tiene.
Ver la decisión D3 en [`04-flujos-criticos.md`](../01-producto/04-flujos-criticos.md#decisiones-de-menú-para-validar).

---

## 2. Gloria, dueña de la agencia

| | |
|---|---|
| Rol en el sistema | `DUENO` sembrado: todos los permisos, incluidos `cotizacion.ver_neto_y_margen`, `usuarios.administrar` y `conversaciones.ver_todas` |
| Equipo | 3 a 6 asesoras y, a veces, una persona de operaciones o administración [S] |
| Dispositivo | Escritorio para revisar y configurar; celular para preguntar «¿cómo vamos?» |
| Además | **También vende.** En una agencia pequeña la dueña atiende a sus clientes de siempre [JD: el dueño de JD Tours atiende chats] |

### Su día hoy, sin ViajaPro [JD]

- Mira la hoja de reservas para saber qué se vendió y **quién pagó y quién debe**.
- Pregunta a cada asesora por los viajes que vencen esta semana.
- Paga a los mayoristas con lo que entra de los clientes: si un cliente no pagó el anticipo, ella
  tiene que decidir si adelanta el abono o deja caer la reserva.

### Qué trata de lograr

1. **Caja:** saber cuánto se ha cobrado y cuánto falta, por archivo, sin preguntar a nadie.
2. **Que nada se caiga:** ver los *time limits* y pagos al mayorista de toda la agencia, no solo los suyos.
3. **Cómo va el mes:** ventas, margen y quién vende más, comparado con el mes anterior.
4. **Dejar la hoja** sin perder lo que ya tiene (importarla, roadmap eje D).

### Qué la hace abandonar la herramienta

- Que la vista de cobros no le diga lo mismo que su hoja. Si tiene que mantener las dos, vuelve a la hoja.
- Configurar algo y no encontrar dónde (hoy hay dos sitios para la conexión de WhatsApp).
- Que una asesora vea el margen de la agencia sin que ella lo haya decidido.

---

## 3. Dónde chocan

| Tema | Asesora | Dueña | Cómo se resuelve |
|---|---|---|---|
| Menú | Lo mínimo para atender y operar | Todo, incluidos Reportes y Configuración | Menú por permiso (D3) |
| «Hoy» | Sus seguimientos, sus archivos | Lo de toda la agencia | La misma pantalla, filtrada por `conversaciones.ver_todas` [S: el mismo criterio vale para archivos] |
| Margen | No lo necesita para vender [S] | Lo cuida | Ya existe: `cotizacion.ver_neto_y_margen` |
| Registrar un pago | Lo registra quien lo recibe [S] | Quiere controlarlo | Pregunta abierta al dueño (roadmap §4) |

## 4. Supuestos que dependen del dueño de JD Tours

Se confirman en las preguntas del roadmap §4, no aquí:

- [S] Quien registra los pagos es la asesora que lleva el archivo, no una persona de administración.
- [S] Cobra por **archivo** (grupo familiar), no por pasajero.
- [S] Las asesoras de JD Tours no ven los reportes de la agencia hoy (la hoja sí la ven).
- [S] El trabajo móvil es por las tardes y fuera de horario. **Resuelto por el propietario
  (2026-11-20):** desde el celular se hace **todo el flujo**, también cotizar y enviar.
