# Manual de usuario de ViajaPro

Este manual explica **lo que ViajaPro ya hace hoy**, pantalla por pantalla, con el lenguaje de una
agencia de viajes. No describe lo que está diseñado o por construir: eso vive en
[`ESTADO.md`](../../ESTADO.md) y en la [hoja de ruta](../08-roadmap/01-roadmap.md).

## Dos recorridos, porque son dos personas

| Si eres… | Lee | Qué cubre |
|---|---|---|
| **Asesor** | [El recorrido del asesor](01-recorrido-del-asesor.md) | Entrar, atender una conversación, cotizar, enviar la cotización, abrir el archivo de viaje, registrar un pago y ver tus números |
| **Dueño de la agencia** | [El recorrido del dueño](02-recorrido-del-dueno.md) | Todo lo del asesor, más equipo, etapas, catálogo, zona horaria y los reportes de toda la agencia |
| Cualquiera | [Lo que este manual no cubre](03-lo-que-no-cubre.md) | Qué es maqueta o no está probado, dicho sin adornos |
| Quien mantiene el manual | [Cómo regenerar las capturas](regenerar-capturas.md) | Preparar el entorno, entrar en modo demostración y retomar cada foto |

## Léelo con estas tres advertencias

1. **Las capturas son de la demostración, no de una agencia real.** Se tomaron con la insignia
   «datos de demostración» activa, que muestra una agencia inventada («Viajes El Sol») con
   contactos y cifras de muestra. **Ninguna captura sale de la API real**, y los nombres y montos
   no coinciden del todo de una pantalla a otra porque son datos de muestra independientes.
2. **Nada de esto está desplegado todavía** y ninguna agencia lo usa. El manual describe cómo se
   comporta el sistema en desarrollo.
3. **El canal de WhatsApp se probó con el número de prueba de Meta y con una API simulada**, nunca
   con un celular de un cliente real. Lo que el manual dice sobre enviar y recibir mensajes se
   apoya en esas pruebas.

## Palabras que usa el manual

Son las mismas que ve la pantalla. El diccionario completo está en el
[lenguaje ubicuo](../01-producto/02-lenguaje-ubicuo.md).

| Palabra | Qué es |
|---|---|
| **Conversación** | El chat de WhatsApp con un viajero |
| **Contacto** | La persona: teléfono, correo, preferencias y consentimientos |
| **Oportunidad** | Una intención de compra en el embudo; nace de una conversación y termina ganada o perdida |
| **Cotización** | La propuesta con precio; cada cambio guardado es una versión |
| **Archivo de viaje** | El expediente completo de un viaje vendido (lo que el sector llama «file») |
| **Reserva** | La confirmación con un mayorista dentro de un archivo de viaje; un archivo puede tener varias |
| **Time limit** | La fecha y hora límite para pagar o emitir antes de que el mayorista libere el cupo |
| **Mayorista** | El proveedor al que la agencia le compra el servicio |
