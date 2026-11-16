# Auditoría competitiva — ViajaPro frente al sector turismo (2026-11-16)

> Pedido del propietario: «compáralo con lo que debe tener un CRM que quiere competir en turismo,
> dinámico y adaptable para agencias de viajes, de turismo y todo el sector; si ya existen
> soluciones, compara lo que tenemos y qué nos falta para ser 100% competitivos».
>
> Insumos, con su detalle y sus fuentes:
> - [Competencia](2026-11-16-competencia-insumo.md) (agente `investigador`).
> - [Capacidades por segmento](2026-11-16-capacidades-por-segmento-insumo.md) (agente `experto-turismo`).
> - Inventario del código contrastado con `ESTADO.md`, sobre `main` en `788857e`.
>
> **Límite honesto.** Ninguna cifra de precio de la competencia se verificó en una página oficial,
> porque la red de la sesión no abre los sitios de los proveedores. Viene de buscadores y de
> terceros, y hay contradicciones que se reportan sin promediar. Las brechas de mercado son
> inferencias: que no encontráramos evidencia no prueba que la función no exista.

## 1. Veredicto

ViajaPro ya tiene la **base que casi ningún competidor tiene junta**:
- WhatsApp oficial como canal nativo;
- un cotizador turístico de verdad, por pasajero, con edades, vigencias y neto oculto;
- aislamiento estricto entre agencias;
- datos de viajeros cifrados.

Eso es **la primera mitad de la venta**, del primer mensaje a la cotización enviada.

Falta casi entera **la segunda mitad**, la que hace que una agencia deje sus hojas de Excel:
- **archivo de viaje:** pasajeros, reservas por proveedor y vouchers;
- **cobros:** plan de pagos, abonos y pasarela;
- **cupos propios por salida;**
- **postventa:** recordatorios y encuestas;
- **comisiones de las asesoras;**
- **facturación**, o al menos su exportación al ERP.

Sin eso, ViajaPro es hoy un «CRM con buen cotizador», no la herramienta en la que una agencia
opera. Y está sin desplegar.

**Grado de competitividad estimado para el foco inicial**, agencias minoristas y receptivas
pequeñas y medianas de Colombia (S1+S3): **alrededor del 40 %** de lo imprescindible. Para el
sector completo, sumando mayoristas, actividades con aforo y corporativo o MICE: **alrededor del 15 %**.

## 2. Mapa del sector: segmentos

| Segmento | Quién es | Foco de ViajaPro |
|---|---|---|
| S1 Minorista | Vende paquetes, vuelos y hoteles de terceros; asesoras por WhatsApp | **Sí** (JD Tours) |
| S3 Receptivo / DMC / turismo local | Pasadías, excursiones, salidas con cupo propio, guías, transporte | **Sí** (catálogo real sembrado) |
| S2 Mayorista / operador | Arma paquetes, publica tarifas netas, vende a agencias, allotments | Después |
| S4 Actividades con venta directa | Turnos con aforo, reservas web, check-in, OTAs (Viator, GetYourGuide) | Después |
| S5 Corporativo / MICE / grupos | Cotización de grupos, rooming list, pago por participante, aprobadores | Después; los grupos de ocio, antes |

**Hallazgo de dominio que cambia una decisión:** el ADR-0009 supone que el cupo es informativo
(«la disponibilidad es del mayorista»). Vale para S1, pero **no para S3**: el receptivo es dueño de
su lancha de 40 sillas, y la silla 41 se convierte en un problema en el muelle. Si S3 es foco,
el **cupo propio que se descuenta al vender** es bloqueante. Decide el `arquitecto` con un ADR.

## 3. Lo que tenemos frente a lo que exige el sector (S1+S3)

| Capacidad | Exigencia | ViajaPro hoy | Competencia |
|---|---|---|---|
| Bandeja WhatsApp oficial: asignación, notas, tiempo real, ventana de 24 h | Imprescindible | **Real** (Graph API falsa; sin celular real todavía) | Solo los genéricos de LatAm (Kommo, Leadsales); los verticales no la muestran |
| Plantillas oficiales de WhatsApp / reapertura fuera de 24 h | Imprescindible | **Maqueta** (T-078) | Genéricos sí |
| Instagram, Facebook, correo entrante, chat web | Diferencial (S1), imprescindible (S4) | **No existe** | Genéricos sí |
| Contactos, embudo con etapas configurables, seguimientos, motivos de pérdida | Imprescindible | **Real** | Universal |
| Campos personalizados, respuestas rápidas | Imprescindible | **Solo pantalla** (localStorage) | Universal |
| Catálogo: paquetes, vigencias, tarifas, edades, ocupación, salidas | Imprescindible | **Real en la API**; la pantalla aún mezcla datos de maqueta | Verticales sí; genéricos no |
| Suplementos, tarifa por grupo, acomodación opcional | Imprescindible | **Parcial** | Verticales de gama alta |
| Cotizador por pasajero con neto oculto y versiones | Imprescindible | **Real** (fortaleza) | Verticales sí; genéricos no |
| Pieza o PDF de cotización con marca, RNT y ESCNNA | Imprescindible | **Parcial** (impresión del navegador, datos de la agencia de maqueta) | Universal en verticales (itinerario visual) |
| Enlace o portal del viajero | Diferencial | **No existe** | Casi universal en verticales (Travefy, Tern) |
| **Archivo de viaje**: pasajeros, reservas por proveedor, confirmación parcial, vouchers | **Bloqueante** | **Maqueta** (`/viajes`) | Verticales sí |
| **Time limit** de reserva con alerta (S1) | **Bloqueante** | No existe | Verticales |
| **Cupo propio por salida**, con bloqueo mientras se paga (S3) | **Bloqueante** | No existe (ADR-0009 lo supone informativo) | Bókun, Rezdy y FareHarbor (S4) |
| **Manifiesto**, hora y punto de recogida (S3) | **Bloqueante** | No existe | Operadores de actividades |
| **Plan de pagos y abonos** con su soporte (el pantallazo de la transferencia) | **Bloqueante** | No existe | Verticales de EE. UU. con Stripe |
| Pasarela colombiana (Wompi, PayU, ePayco, Bold) | Importante | No existe | Ningún vertical con evidencia local |
| Proveedores, neto, margen por archivo, cuentas por pagar | Importante | **Parcial** (neto y margen protegidos; sin proveedores ni cuentas por pagar) | Verticales |
| Penalidades y saldos a favor | Importante | No existe | Verticales de gama alta |
| Multi-moneda con TRM congelada (cotizado en USD, abonado en COP) | Importante | **Parcial** (monedas sí; TRM no, ADR-0024 propuesto) | Contradictorio en las fuentes |
| Comisión de la asesora sobre el margen, liquidada al cobrar | Importante | No existe | Tern y Travefy sí |
| Postventa: recordatorios antes del viaje, encuesta después | Importante | No existe | Universal (automatizaciones) |
| Automatizaciones | Importante | No existe | Universal |
| Reportes: margen por asesora o destino, cartera, ocupación | Importante | **Parcial** (margen real con permiso; sin cartera ni ocupación) | Universal |
| Facturación electrónica DIAN (o exportación al ERP, ingreso propio frente a ingreso para terceros) | Importante | **Diseño** (ADR-0023 sin verificar) | **Ningún** producto turístico con evidencia: brecha de mercado |
| IA: intención desde el chat, ingesta del tarifario | Diferencial | No existe (el sugeridor es por sinónimos) | Tern (con tope); genéricos (con recortes) |
| Lectura de cédula o pasaporte desde una foto; formulario de acompañantes | Diferencial | No existe | Poco visto |
| Cumplimiento: Ley 1581, PII cifrada y auditada, ESCNNA, contrato aceptado | Bloqueante (legal) | **Parcial**: cifrado y lectura auditada reales; ESCNNA, contrato y derechos del titular no (T-093, T-097, T-098) | Nadie lo menciona: diferencial |
| Usuarios, roles, permisos; multi-agencia estricta | Imprescindible | **Real** (fortaleza) | Universal (sin evidencia de aislamiento fuerte) |
| App móvil | Diferencial | No existe (web adaptable) | Varios; Lemax criticado en móvil |
| Despliegue y servicio vivo | Imprescindible | **No existe** (sin URL) | — |

## 4. Competencia: dónde gana cada uno y dónde entramos

Detalle, precios y fuentes en el [insumo de competencia](2026-11-16-competencia-insumo.md).
Confianza media-baja en los precios.

| Grupo | Ejemplos | Gana en | Pierde en (para una pyme colombiana) |
|---|---|---|---|
| Verticales de EE. UU. | Travefy, Tern, TravelJoy | Itinerario visual, portal del viajero, comisiones, pagos con Stripe | Sin WhatsApp; cobran en USD; sin DIAN; pensados para asesores independientes |
| Verticales de gama alta | Tourplan, Lemax, Kaptio, Tourwriter | Operación completa de mayorista o DMC | Caros (Lemax desde unos USD 10.000), implantación de 6 a 12 meses; sobran para 3 asesoras |
| Actividades | Bókun, Rezdy, FareHarbor | Aforo, motor de reservas, OTAs | Comisión por reserva; no son CRM ni manejan paquetes |
| LatAm | SIGMMA, Toogo, Travel Ibex | Back-office local | Sin evidencia de WhatsApp oficial ni de DIAN; precio no visible |
| Genéricos con WhatsApp | Kommo, Leadsales, Clientify, HubSpot, Treble | WhatsApp, automatizaciones, embudo | Sin cotizador por pasajero, sin archivo de viaje, sin neto ni margen; Kommo cobra semestral por adelantado |

**Brechas de mercado que ViajaPro puede ocupar** (son inferencias, a validar con demos):
1. Vertical turístico y WhatsApp oficial en un solo producto.
2. Facturación DIAN ligada a la venta turística, o su exportación al ERP con el reparto ingreso propio / ingreso para terceros.
3. Precio y cobro locales: COP, PSE, mensual.
4. Pequeño y listo para usar en un día.
5. Datos de viajeros cifrados y auditados por defecto.

## 5. Qué falta para ser competitivos, por fases

### Fase 0 — Que exista (semanas, sobre todo del propietario)
- Despliegue: Neon, la web en Vercel y la API en un solo proceso; a falta de un ADR que lo confirme (pregunta abierta).
- Prueba con Meta real (T-080) y plantillas de reapertura (T-078).
- Quitar los últimos datos de maqueta de catálogo, cotizador, impresión, configuración, respuestas rápidas y campos personalizados.

### Fase 1 — Mínimo para que una agencia S1+S3 deje el Excel (bloqueantes)
1. **Archivo de viaje** (contexto `booking`, hoy sin código): la cotización aceptada se convierte en archivo con pasajeros, reservas por proveedor y estado. Lleva confirmación parcial, vouchers y time limit con alerta. Cubre la continuación tras `ACEPTADA` (A17).
2. **Cupo propio por salida** (S3), con bloqueo mientras se paga, mínimo para operar, estado de la salida y manifiesto con punto de recogida. Requiere un ADR que modifique el ADR-0009.
3. **Plan de pagos y abonos** (contexto `payments`): registro manual del abono con su soporte, saldo, cartera por cobrar y TRM congelada (ADR-0024).
4. **Cumplimiento visible**: pieza o PDF de cotización con RNT y ESCNNA; contrato y condiciones aceptados; derechos del titular (T-097); aviso de privacidad (T-093).
5. **Plantillas oficiales de WhatsApp** (T-078) para escribir después de las 24 horas: cobros, recordatorios.

### Fase 2 — Paridad competitiva (importantes)
- Pasarela colombiana con enlace de pago (Wompi, PayU, Bold o ePayco; ADR y adaptador detrás de un puerto).
- Proveedores con cuentas por pagar; penalidades y saldos a favor.
- Comisiones de las asesoras, liquidadas al cobrar.
- Postventa y automatizaciones: recordatorios antes del viaje y encuesta después, por plantilla.
- Reportes de cartera, ocupación por salida y margen por asesora o destino.
- Exportación contable al ERP, separando ingreso propio e ingreso para terceros (ADR-0023, con contador).
- Campos personalizados y respuestas rápidas reales en la base.

### Fase 3 — Diferenciales (dónde ganamos)
- IA: intención de viaje desde el chat, ingesta del tarifario del mayorista (T-053 a T-058) y respuestas sugeridas.
- Enlace o portal del viajero, con formulario de acompañantes y lectura de documentos desde una foto.
- Instagram y Facebook en la misma bandeja.

### Fase 4 — Abrir otros segmentos
| Segmento | Qué hace falta |
|---|---|
| Grupos de ocio | Rooming list, participantes, pago fraccionado por participante |
| S2 Mayorista | Cuenta B2B de agencia revendedora (comisión, crédito, bloqueo por mora); tarifas netas o comisionables publicadas; extranet; allotments con release |
| S4 Actividades | Turnos con aforo en tiempo real, motor de reservas web, QR y check-in, OTAs |
| S5 Corporativo / MICE | Cuenta corporativa con aprobador y centro de costo; cotización por escalas y liberados; attrition; GDS |

## 6. Decisiones que este informe pide

| # | Decisión | Quién |
|---|---|---|
| D1 | ¿S3 (receptivo con cupo propio) es foco inicial junto a S1? Si sí, hay que modificar el ADR-0009 | Propietario, `jefe-de-producto`, `arquitecto` |
| D2 | ¿ViajaPro emite factura electrónica o exporta al ERP? Recomendación: **exportar**; emitir requiere ser proveedor tecnológico o integrarse con uno | Propietario, con su contador (ADR-0023) |
| D3 | Pasarela de pagos local para la Fase 2 | Propietario, `investigador` |
| D4 | Validar las brechas de mercado con demos reales de SIGMMA, Toogo, Kommo y Travefy antes de usarlas como argumento comercial | `jefe-de-producto` |
| D5 | Topología de despliegue: Neon, la web en Vercel y la API en un solo proceso (pregunta abierta en la sesión) | Propietario, `arquitecto` |

## 7. Normativa sin verificar

Hay que confirmarla con el `investigador` y con un asesor:
- facturación DIAN de la agencia como intermediaria (mandato);
- documento soporte por compras a no obligados a facturar;
- exención de IVA por exportación de servicios turísticos;
- RNT en piezas y cotizaciones;
- alcance de la obligación ESCNNA;
- permiso de salida para menores;
- seguro de asistencia;
- normas técnicas de turismo de aventura;
- contribución parafiscal a FONTUR;
- PQR y derecho de retracto;
- reportes estadísticos.

Lista completa en el §6 del [insumo de capacidades](2026-11-16-capacidades-por-segmento-insumo.md).
