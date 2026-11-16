# Competencia: insumo para `02-mercado-y-competencia.md`

**Consultado:** 2026-11-16 · **Investigador:** agente `investigador`

Estado del documento: es un **insumo**, no el documento de mercado (`docs/00-vision/02-mercado-y-competencia.md` sigue
siendo un marcador pendiente). Complementa `docs/_investigacion/2026-10-26-hubspot.md`, que ya cubre HubSpot y
da precios de Tern, TravelJoy, Travefy, itinovo y Vedain (no se repiten salvo para actualizar).

## Limitaciones del método (leer primero)

- **WebFetch no pudo abrir ningún sitio de proveedor** (`tern.travel`, `sigmma.com`: el host no resuelve en esta sesión; hace
  falta permitirlos en la red de la sesión). Todo lo de abajo viene de **WebSearch (resúmenes de resultados)**, no de
  la lectura directa de páginas de precios. Ninguna cifra es «V» (verificada en página oficial) salvo donde se dice.
- **No pude abrir G2 ni Capterra directamente**: las reseñas son lo que los resultados reproducen. Hay pocas reseñas
  de turismo en LatAm.
- Confianza: **M** = fuente de tercero concordante o del proveedor vía búsqueda; **B** = una sola fuente, de proveedor
  competidor o con contradicción; **SV** = sin verificar.
- Las contradicciones se reportan, no se promedian.

## 1. Tabla resumida

Precios en USD salvo indicación. «WA» = WhatsApp. Todos por búsqueda, 2026-11-16.

### A. Verticales de turismo globales

| Producto | Segmento / región | Funciones clave | Modelo y precio público | Confianza |
|---|---|---|---|---|
| Travefy | Asesores independientes y agencias pequeñas; EE. UU. | CRM, itinerarios, facturas, comisiones, portal del cliente, pagos/depósitos con Stripe, correo conectado, 200+ integraciones de proveedores (dicho por el proveedor). WA: no aparece. Multi-moneda: **contradicción** (Roverd dice una moneda por negocio; SoftwareSuggest dice que sí) | Core 39/usuario/mes anual (49 mensual); Premium 59 anual; Agency a cotizar; usuario extra 20/39. **Contradicción**: Capterra/Software Advice aún muestran Basic 31; TrustRadius Pro 39; otra fuente «desde 25» | B-M |
| TravelJoy | Asesores en solitario; EE. UU. | CRM, itinerarios, pagos (según HubSpot-doc de 2026-10-26) | Desde 19 (agiled) frente a 30 (G2). **Contradicción**. G2: 1 reseña, de enero 2022: no sirve como señal | B |
| Tern | Asesores y host agencies; EE. UU. | CRM, itinerarios (más básicos que los de un constructor dedicado, según una reseña), reconciliación de comisiones y pagos a proveedores, IA con límite mensual compartido desde 2026-07-01, reserva de tours desde el itinerario (feb-2026), bandeja inteligente (T2 2026, fuente débil). Travel Planners International reemplaza su back-office por Tern | 35/asiento anual, 49 mensual (1-2 asesores); ~25-33 en agencias de 3-24 (reseña de tercero). Coincide con el doc de HubSpot | M |
| Tourwriter | DMC/operadores a medida, proveedores múltiples; Nueva Zelanda, global | Cotización y armado de viajes complejos con proveedores | Desde 99/usuario/mes (Capterra, Software Advice, G2); Pro 149 anual (Enterprise DNA); TrustRadius 99-299. Un listado dice 39: descartado como incoherente | M |
| Tourplan | DMC y mayoristas; global | Funciones especializadas de operador | Cotización. GetApp muestra 900 de entrada. Implementación de **6 a 12 meses** (lo dice Tourwriter, competidor directo): sesgado | B |
| Lemax | Operadores y DMC grandes; global | Reservas, paquetes (sin detalle verificado) | GetApp: desde 10.000. Capterra: 4,3 con 14 reseñas, facilidad de uso 4,1 (mar-2026); su front móvil sigue en camino | M |
| Kaptio | Operadores de varios días; sobre Salesforce | Cotización, itinerarios, reservas, back-office | Sin precio público. Un competidor (Softrip) afirma que cada usuario necesita licencia de Salesforce y de Kaptio: sin verificar. G2: 1 reseña; Capterra: 0 | B |
| Bókun (Tripadvisor) | Actividades y tours; global | Motor de reservas, canales (Viator), pagos | START 49/mes + 1,5%; PLUS 149 + 1,25%; PREMIUM 499 + 1%; Bókun Pay 2,5% (según TrekkSoft/Captainbook, competidores) | B |
| Rezdy | Actividades y tours; global | Reservas y canales | Entre 49 y 249/mes (Findstack) o 0 + hasta 6% por reserva (TrekkSoft). **Contradicción** | B |
| FareHarbor | Actividades; EE. UU. | Reservas | Sin suscripción; comisión de 6-8% o hasta 6% (**contradicción**, ambas de competidores) | B |
| Toogo | DMC, agencias, operadores; con un usuario en Perú | Generador de viajes, presupuestos, CRM, reservas, logística, finanzas, CMS; multi-moneda e idioma | Capterra Chile: desde 189. Appvizer: a cotizar. **Contradicción**. Capterra España: 4,8 con 40 reseñas (un directorio) | B-M |

### B. LatAm / España

| Producto | Segmento / región | Funciones | Precio | Confianza |
|---|---|---|---|---|
| SIGMMA / SIGMMA.net | ERP de gestión integral para agencias; Argentina, Paraguay, Uruguay, Chile, Colombia, México (más de 300 agencias, dicho por la ficha de ComparaSoftware) | Gestión comercial, operativa y administrativa; frontend B2B, informes, dashboard financiero. **Sin evidencia** de CFDI, DIAN ni WA | Plan «Profesional [Mensual]» sin monto visible en México; .net a cotizar | M para existencia; SV para el resto |
| TravelWorks | Contabilidad y gestión en nube; Capterra México | Se integra con GDS; 5.000 usuarios (dicho por Capterra) | SV | B |
| Travellect | Argentina y otros | Motores de contratación y reserva (vuelos, hoteles, paquetes, traslados) | SV | B |
| Travel Ibex (Costa Rica Virtual) | Agencias; Costa Rica y LatAm | Itinerarios, clientes, prospectos. WA nativo: **no aparece** | Desde 19 (unidad de cobro no clara) | B |
| TravelCompositor | Agencias y TMC; España, oficinas en Miami y México | Itinerarios dinámicos, paquetes | Prueba gratis; sin precio | B |
| Orbis (Pipeline Software) | Agencias; España | Back-office | Capterra: desde 223,50 €; ComparaSoftware España: a cotizar. **Contradicción** | B |
| Juniper, Orion, Gestour, Odysseus, Travelgate | — | — | **No pude verificarlos** (no aparecieron fuentes útiles; Travelgate solo como adquisición de 2026 dentro de Travelsoft) | SV |

### C. CRMs genéricos con WhatsApp usados en turismo

| Producto | Región | Funciones clave | Precio público | Confianza |
|---|---|---|---|---|
| Kommo | Global, fuerte en LatAm. Caso Kommo de SmarTravel (Cali): marketing del proveedor, cifras no verificadas | WA API incluido en la suscripción (los mensajes los cobra Meta aparte), chatbot e IA | Desde 2026-09-01, español: Básico 20, Avanzado 30 (nuevos); inglés/terceros: 25/35/45 por usuario. **Contradicción** (precio regional). Pro 45, Enterprise a cotizar. Pago mínimo de 6 meses por adelantado (según terceros). Desde 2026-06-01 los nuevos de Básico no tienen agente de IA | M |
| Leadsales | México/LatAm | CRM conversacional WA, WA API desde Profesional, créditos | MXN 2.362,92 / 3.239,88 / 6.016,92 al mes (captura de su web citada en su blog) frente a USD 97 / 133 / 247 (otro artículo suyo). **Contradicción**. Todo de la propia empresa | B-M |
| Clientify | España/LatAm | CRM único, integración WA en Basic, marketing por WA en plan superior; tiene sección y recursos para agencias de viajes | 39 € al mes con 1 usuario + 15 € por usuario adicional (según su blog); prueba de 7 o 14 días (**contradicción**) | B |
| Treble.ai | Bogotá, desde 2017; clientes como Rappi y Platzi | Automatización conversacional en WA | A cotizar. Dupple: 500/mes de entrada; Hackceleration: plan gratis de 5 conversaciones; Softwares.com: sin plan gratis. **Contradicción** | B |
| Cliengo | LatAm | Chatbot IA, pipeline por destino, anuncios a WA (según su propia guía de turismo) | Sin precio 2026 verificado | SV |
| HubSpot | Global | Ver `docs/_investigacion/2026-10-26-hubspot.md` | Ver ese documento | M |
| Zoho CRM / Bitrix24 | Global | WA por conectores de terceros (p. ej. Eazybe) | Zoho: de gratis a 50 por usuario (otra fuente: 14 de entrada); Bitrix24: de 0 a 399 por organización. Cifras de comparadores, **contradictorias** | B |
| Trengo, SleekFlow, Aurora Inbox | Global (Trengo: socio oficial de WA, integra Rezdy, FareHarbor, TourCMS; dicen integrar Sabre y Amadeus) | Bandeja WA con página específica para turismo | SV | B |

Productos citados en la búsqueda, **sin estudiar**: PHPTravels (CRM de viajes con versión open source autoalojada), CRM Travel (desde 10 al mes
para 5 empleados, según Leadsales), Datacrm, itinovo, Vedain (ya en el doc de HubSpot). PROTRAVEL/ClientBase, Sabre y Amadeus: **no pude verificarlos** en esta pasada.

## 2. Qué dicen las reseñas (puntos débiles)

Todo es de segunda mano; poco volumen. No hay un solo dato de reseñas de usuarios de LatAm para turismo.

| Producto | Punto débil citado | Fuente | Confianza |
|---|---|---|---|
| Travefy | Coste alto para negocios pequeños; precios impresos solo anuales y la tarifa de agencia por ventas; facilidad de configuración es su peor nota (7,7 de 10 con 5 reseñas en G2) | TrustRadius; reseña de saascrmreview; G2 | B |
| Tern | Un solo tope mensual de IA, vigente desde 2026-07-01, que según críticos provoca fuga entre usuarios intensivos | saascrmreview | B |
| Lemax | Front móvil no terminado | Capterra | B |
| Kommo | Planes con cobro semestral adelantado; recortes de IA y de números de WA en planes bajos (2026-06-01) | Kommo, setsmart | M |
| Kaptio | Pocas reseñas; modelo dependiente de Salesforce (afirmación de competidor) | G2, Capterra, Softrip | B |
| HubSpot | Ver doc de 2026-10-26 (precio, saltos de plan, incorporación) | — | — |
| Proveedores de WA en LatAm | Todos suman las tarifas de Meta encima de la suscripción | Hackceleration, Kommo | M |

## 3. Capacidades que casi todos los relevantes tienen (mesa de entrada)

Inferencia mía a partir de lo anterior (I):
1. CRM de contactos y pipeline por etapas.
2. Cotizador/itinerario enviable (en verticales); en genéricos, cotización como PDF o enlace.
3. Portal o enlace del viajero con aprobación (verticales de asesores).
4. Pagos y seguimiento de depósitos y comisiones (verticales de EE. UU.: Stripe, no COP).
5. Automatizaciones y plantillas; IA como producto con **topes o créditos** (Tern, Kommo, HubSpot).
6. Reportes y panel de ventas.
7. Multi-usuario con precio por asiento.
8. WhatsApp como canal: en los genéricos de LatAm es el centro; en los verticales de EE. UU. no aparece.

## 4. Brechas de mercado (agencia pequeña de LatAm)

Inferencia (I); el respaldo es la ausencia de evidencia, no una demostración:
1. **Vertical + WhatsApp oficial en el mismo producto.** Los verticales con evidencia (Travefy, Tern, Travel Ibex) no muestran WA nativo; los
   genéricos con WA (Kommo, Leadsales, Clientify) no traen cotizador por pasajero ni archivo de viaje. Los buscadores solo devuelven blogs de proveedores para esta combinación.
2. **Facturación electrónica colombiana (DIAN) o CFDI conectada a la venta.** No encontré ningún producto turístico con evidencia de esto; Siigo aparece solo como tangencial.
3. **Precio y cobro local.** Los verticales cobran en USD; Kommo exige 6 meses por adelantado; pagos en COP/PSE no aparecieron en ninguno.
4. **Producto pequeño y listo para usar.** Los de gama alta (Tourplan 6-12 meses de implementación, Lemax desde 10.000, Kaptio sobre Salesforce) no sirven a una agencia de 3 asesores; los baratos (Travefy, TravelJoy) están pensados para el mercado de EE. UU.
5. **Datos de viajeros con cifrado y auditoría por defecto**: ninguna fuente lo menciona en los productos encontrados (ausencia de evidencia, no prueba de ausencia).

## 5. Lo que NO se pudo verificar

- Precios y funciones desde las páginas oficiales (WebFetch bloqueado). Todas las cifras necesitan una segunda pasada directa.
- PROTRAVEL/ClientBase, Sabre y Amadeus agency tools, Juniper, Orion, Gestour, Odysseus, Mercately (turismo), Zoho y Bitrix24 con detalle turístico.
- Si TravelJoy, Travefy y Tern siguen activos con esos precios: Tern y Travefy mostraron lanzamientos en 2026; TravelJoy solo tiene señales de 2026 por segundas fuentes, ninguna noticia oficial.
- WA oficial vs no oficial en Travel Ibex, Toogo y SIGMMA.
- Facturación electrónica y moneda local de cada solución de LatAm.
- Reseñas reales de G2/Capterra para Tern, TravelJoy, SIGMMA, Toogo (en Colombia).
- Cuota de mercado de cualquiera de ellos.

## 6. Implicación para ViajaPro

1. La hipótesis de posicionamiento (vertical + WA nativo + COP) **se sostiene con lo encontrado, sin estar demostrada**: es ausencia de evidencia en una búsqueda superficial. Debe contrastarse con demos reales de SIGMMA, Toogo, Kommo y Travefy antes de convertirla en argumento comercial.
2. Los competidores directos a vigilar en LatAm son SIGMMA y Toogo (verticales de la región) y Kommo (el genérico que usan las agencias, con caso en Cali).
3. No cambia nada en el alcance del MVP. Sí obliga a confirmar si ViajaPro entrega la facturación electrónica o la delega (decisión del `jefe-de-producto`).

## Fuentes (consulta 2026-11-16, vía WebSearch)

- https://go.travefy.com/blog-post/best-travel-agency-software · https://travefy.com/crm · https://www.capterra.com/p/148927/Travefy-Agent/pricing/ · https://www.trustradius.com/products/travefy/pricing · https://www.g2.com/compare/bokun-vs-trytn-vs-travefy · https://www.roverd.com/travefy-review-alternatives
- https://saascrmreview.com/?p=17438 (Tern) · https://help.tern.travel/en/articles/14141693-what-we-launched-at-the-q1-2026-webinar · https://www.travelagentcentral.com/your-business/travel-planners-international-announces-expanded-partnership-tern · https://www.hostagencyreviews.com/travel-agency-software/tern
- https://www.capterra.com/p/39473/TourWriter/pricing/ · https://tourwriter.com/tourplan-reviews-alternatives/ · https://www.capterra.com/p/150034/Kaptio-Travel/ · https://www.g2.com/products/kaptio · https://www.softrip.com/?p=4133 · https://www.getapp.ca/software/108791/itravel
- https://www.captainbook.io/blog/fareharbor-pricing-fees-explained · https://www.trekksoft.com/en/blog/8-best-rezdy-alternatives-2026-comparison-guide · https://www.capterra.com/p/122690/Rezdy/pricing/
- https://www.capterra.cl/software/160230/toogo · https://www.appvizer.es/ocios/agencia-viajes/toogo · https://www.comparasoftware.com/sigmmanet · https://www.comparasoftware.com/agencia-de-viajes · https://www.capterra.mx/software/135112/travelworks · https://www.capterra.com.ar/software/1061147/travellect · https://www.capterra.mx/software/1020883/travel-ibex · https://www.capterra.es/software/189409/travelc · https://www.capterra.es/software/1028470/orbis
- https://www.kommo.com/es/blog/actualizacion-precios-kommo/ · https://setsmart.io/blog/kommo-precios · https://www.kommo.com/es/casos/crm-para-agencias-de-turismo-smartravel/ · https://leadsales.io/blog/whatsapp-business-api-cuanto-cuesta/ · https://clientify.com/blog/crm/precio-de-un-crm · https://hackceleration.com/es/labs/treble-precio · https://dupple.com/tools/trebleai · https://lanotaeconomica.com.co/movidas-empresarial/conozca-el-emprendimiento-colombiano-que-lidera-la-monetizacion-de-whatsapp-en-latam/ · https://guiawabusiness.cliengo.com/whatsapp-viajes-turismo · https://trengo.com/es/industrias/travel
- https://costbench.com/compare/bitrix24-vs-zoho-crm/ · https://eazybe.com/es/pricing
- Colombia (contexto): https://www.mincit.gov.co/minturismo/analisis-sectorial-y-promocion/guias-legales-de-los-prestadores-de-servicios-turi/agencias-de-viajes-y-oficinas-de-representacio-1.aspx · https://www.portafolio.co/negocios/empresas/el-problema-no-es-vender-es-cobrar-agencias-de-viajes-enfrentan-desfase-de-hasta-60-dias-entre-pagos-y-recaudos-488133
