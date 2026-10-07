# ViajaPro — Documentación general del proyecto

**Versión:** 1.0  
**Fecha:** octubre de 2026  
**Tipo:** entregable de orientación

> ⚠️ **Esto es una fotografía, no una fuente.**
>
> Sintetiza la documentación del repositorio **en la fecha indicada**. Los documentos fuente
> cambian; este no. Si algo aquí contradice a `docs/`, **manda `docs/`** y este documento está
> desactualizado.
>
> **Para qué sirve:** orientar a alguien de fuera —un inversionista, un aliado, una persona que
> entra al equipo— sin obligarle a leer treinta documentos.
> **Para qué no:** tomar decisiones técnicas ni de producto. Para eso están las fuentes.
>
> Procedencia detallada al final. Índice completo: [`docs/README.md`](../README.md).

## 1. Resumen ejecutivo
ViajaPro es un CRM vertical para agencias de turismo que nace alrededor de WhatsApp y conecta la conversación comercial con todo el ciclo del viaje: oportunidad, cotización, reserva, pagos y post-venta. La tesis del producto es convertir conversaciones en viajes reales.

## 2. El problema que resuelve
Las agencias objetivo operan con WhatsApp distribuido entre celulares, Excel para cotizar, correo para confirmar y memoria individual para hacer seguimiento. Esto provoca pérdida de conversaciones, falta de trazabilidad, cotizaciones lentas y errores, dependencia de personas, poca visibilidad del margen y baja capacidad de recompra.

## 3. Oportunidad y diferenciación
El hueco identificado está entre herramientas de WhatsApp, CRM genéricos y back offices turísticos. ViajaPro une el canal donde ocurre la venta —WhatsApp— con el sistema donde ocurre el negocio —el archivo de viaje— usando el lenguaje propio del turismo.
La defensa del producto es la combinación: canal nativo, conocimiento del dominio, cotización, operación del viaje, margen e IA. El historial acumulado de conversaciones, cotizaciones y viajes también aumenta el costo de migración y permite mejorar las sugerencias.

## 4. Usuarios objetivo
El foco inicial son agencias minoristas de turismo de 3 a 50 empleados con volumen real de WhatsApp y dolor operativo por Excel y herramientas fragmentadas. La cabeza de playa prioriza agencias que revenden paquetes armados por mayoristas.
No son foco inicial el turismo corporativo puro, grandes cadenas con back office consolidado ni agencias de un solo asesor sin volumen suficiente.

## 5. Flujo principal
**Consulta → Registro → Cotización → Seguimiento → Reserva → Viaje → Post-venta → Recompra**
La reserva no es el final del ciclo. El historial del viajero, sus preferencias y viajes anteriores deben convertirse en capacidad de recompra.

## 6. Capacidades principales
1. **Inbox compartido de WhatsApp:** conversaciones, asignación, notas, SLA, historial y plantillas.
2. **CRM y pipeline:** contactos, viajeros, oportunidades, etapas, actividades y motivos de pérdida.
3. **Cotizador e itinerarios:** opciones, tarifas netas, markup/comisión, impuestos, margen, multi-moneda, TRM congelada, versiones y PDF.
4. **Reservas, pagos y post-venta:** archivo de viaje, pasajeros, documentos, reservas, time limits, cuotas, conciliación y vouchers.
5. **Automatización e IA:** extracción de intención, lead scoring, respuestas sugeridas, resúmenes y seguimientos.

## 7. Dominio de negocio
El modelo distingue **Contact**, **Traveler** y **Passenger**. Una cotización enviada no se modifica: las ediciones crean versiones nuevas. Los ítems distinguen tarifa neta, tarifa de venta, markup, comisión y margen.
**TravelFile / Archivo de viaje** es el agregado central. Dentro de él viven pasajeros, reservas, documentos, pagos, itinerario y operación. **timeLimit** es crítico porque su vencimiento puede significar la pérdida de una reserva.

## 8. WhatsApp
La integración usa WhatsApp Cloud API bajo el modelo de Tech Provider. Una aplicación sirve a múltiples tenants y cada agencia aporta su WABA y número.
El webhook valida la firma HMAC sobre el cuerpo crudo, encola el payload y responde rápidamente. Los mensajes se deduplican por wamid y el tenant se resuelve por phone_number_id.
La ventana de servicio de 24 horas se aplica en servidor y se muestra al asesor. Fuera de ella, el producto ofrece las plantillas disponibles.

## 9. Arquitectura técnica
La solución está planteada como un **monolito modular en TypeScript** desplegado como tres procesos:
- api: HTTP, WebSocket y webhooks.
- worker: colas, IA, PDFs y trabajos programados.
- web: Next.js.
La plataforma usa PostgreSQL 16 con RLS por tenant, Redis para colas/caché/pub-sub y S3 para media, PDFs y documentos.
La comunicación entre módulos se basa en eventos de dominio mediante outbox y puertos explícitos. Los módulos no deben importarse directamente entre sí.

## 10. Multi-tenancy y seguridad
El aislamiento se sostiene en cinco capas: petición, aplicación, base de datos, caché y objetos.
- El tenant_id se deriva de la sesión, nunca del cliente.
- PostgreSQL aplica Row Level Security.
- Redis usa claves con prefijo de tenant.
- S3 usa prefijo por tenant y URLs firmadas.
- Los números de documentos y tokens de integración requieren cifrado a nivel de aplicación.
- Los accesos sensibles quedan auditados.
- No se deben registrar mensajes, documentos ni tokens en logs.

## 11. IA
La primera capacidad es **extracción de intención**: transformar lenguaje natural en destino, fechas, pasajeros y presupuesto.
Después siguen lead scoring con justificación, respuestas sugeridas, resúmenes y secuencias. La IA debe evaluarse, controlar presupuesto por tenant y degradar de forma segura.
En v1 las salidas de IA hacia el cliente requieren revisión humana. No se plantea un bot autónomo que cierre ventas.

## 12. Alcance v1
El alcance aprobado comprende cuatro bloques:
- Inbox + pipeline.
- Cotizador + itinerarios.
- Reservas + pagos + post-venta.
- Automatización + IA.
Quedan fuera de v1 la integración con GDS, app móvil nativa, portal del viajero, contabilidad/facturación como reemplazo de ERP, turismo corporativo y marca blanca completa de la interfaz.

## 13. Roadmap
El roadmap contempla:
1. Fundaciones.
2. Inbox + WhatsApp.
3. CRM + pipeline.
4. Cotizador.
5. Reservas + pagos.
6. Automatización + IA.
7. Analítica + escala.
La documentación estima entre 8 y 11 meses para el alcance completo con un equipo de 3 a 4 personas. La estrategia prioriza una rebanada vertical y una agencia piloto real antes de expandir el producto.

## 14. Métricas
La métrica central es la **tasa de conversión de conversación a viaje**.
También importan: tiempo de primera respuesta, conversión por etapa, tiempo de cotización, margen por archivo, productividad por asesor, retención y recompra.
El objetivo de 12 meses documentado es 50 agencias pagando y retención mensual superior al 95%.

## 15. Principios
- El asesor primero.
- WhatsApp es el centro.
- El margen es la métrica.
- La IA sugiere; la persona decide.
- Multi-tenant desde el primer día.
- Parametrización por agencia.
- Seguridad y auditoría como propiedades del sistema.
- Honestidad sobre lo que el producto no hace.

## 16. Estado y decisiones abiertas
La documentación identifica como decisiones relevantes la agencia piloto, la pasarela de pagos, el nombre comercial y el presupuesto mensual de IA. Colombia figura como mercado base confirmado.
También queda pendiente definir el alcance definitivo de campañas. Si entran, la orientación es que sean de reactivación segmentada y no de difusión masiva.

## 17. Visión de largo plazo
El horizonte es convertir ViajaPro en **el sistema operativo de una agencia de turismo**.
Entre las extensiones futuras aparecen portal del viajero, integraciones con GDS/ERP, campañas de reactivación, benchmarking anónimo, calificación compartida de proveedores y una red entre agencias.
Estas capacidades son horizonte y no deben confundirse con compromisos de v1.

## 18. Fuentes internas
Este documento sintetiza la documentación fuente del repositorio, especialmente:
- Visión de producto.
- Norte del producto.
- Alcance de v1.
- Lenguaje ubicuo.
- Arquitectura general.
- Contextos delimitados.
- Modelo de datos.
- Integración WhatsApp.
- Protección de datos.
- Roadmap.
Las decisiones marcadas como pendientes en las fuentes se mantienen como pendientes en este documento.