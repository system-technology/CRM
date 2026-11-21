# Lo que este manual no cubre

Un manual que describe una maqueta como si funcionara es peor que no tener manual. Esta página dice qué
quedó fuera y por qué. La fuente es la sección «Es real» y «Es maqueta» de [`ESTADO.md`](../../ESTADO.md).

## Se ve en la pantalla, pero no funciona de verdad

| Qué | Por qué no está en el manual |
|---|---|
| **SLA y tiempos** (Configuración) | Solo se guarda en el navegador de quien lo cambia; no hay servidor detrás |
| **Plantillas oficiales de WhatsApp** | No hay endpoint de plantillas; la pantalla es una maqueta |
| **Campos personalizados** (por ejemplo, pasaporte del viajero) | Solo se guardan en el navegador. **Por eso mismo no se debe escribir ahí un pasaporte real**: el cifrado de datos sensibles de viajeros aún no cubre estos campos |
| **Respuestas rápidas**, **filtros guardados**, **preferencias de notificación**, **Asistente de inicio** | Solo en el navegador |

## Falta el botón

| Qué | Estado |
|---|---|
| **Marcar una cotización como «Aceptada»** | El servidor lo sabe hacer (y eso abre el archivo de viaje), pero la web solo llega hasta «Enviada». Ver [paso 7 del asesor](01-recorrido-del-asesor.md#7-cuando-el-viajero-acepta) |
| **Corregir un pago** (devolver, ajustar, reversar) | Existe el permiso del dueño y el libro, no la pantalla |
| **Ingreso con código de 6 dígitos por correo** | La pantalla lo marca como «próximamente» |
| **Registrarse como agencia nueva** | Existe la base de datos, sin API ni pantalla: hoy nadie puede darse de alta solo |
| **Verificar el RNT** de la agencia | Lo marca el equipo de ViajaPro; sin verificar, la propuesta sale sin RNT |

## Todavía no existe

- **Cobros con tarjeta, PSE u otra pasarela.** «Registrar pago» anota lo recibido, no cobra.
- **Automatizaciones** (recordatorios y flujos sin intervención).
- **Facturación electrónica ante la DIAN.**
- **Propuesta para el viajero en PDF**: se construyó en una sesión aparte; este manual no la recorre.

## Sin comprobar contra el mundo real

- **WhatsApp:** el envío y la recepción se probaron con el número de prueba de Meta y con una API
  simulada. **Ningún mensaje de un celular real ha entrado** y no se ha enviado nada a
  `graph.facebook.com` de producción.
- **Las pantallas de archivos de viaje, la campana de avisos y las capturas de este manual** se vieron
  solo con datos de demostración, no contra la API real en un navegador.
- **Celulares:** probado en pantalla emulada de 390 px; tablet y escritorio sin auditoría de adaptación
  todavía.
- **Nada está desplegado.** Ninguna agencia lo usa.

## Cómo se mantiene este manual

Si cambia una pantalla, cambia el manual **en el mismo PR** (regla R14 del proyecto). Cuando una de las
carencias de arriba se cierre, se mueve la fila al recorrido correspondiente y se vuelve a capturar la
pantalla.
