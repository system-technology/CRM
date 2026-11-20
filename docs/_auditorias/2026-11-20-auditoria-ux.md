# Auditoría UX/UI de ViajaPro — ¿se ve genérico? (2026-11-20)

Método: web sola en modo demo (`next dev -p 3456`, `NEXT_PUBLIC_USE_REAL_CRM=false`,
`NEXT_PUBLIC_USE_REAL_INBOX=false`, `NEXT_PUBLIC_AUTH_MAQUETA=true`, sin API), recorrida con Playwright
en 1440×900 y 390×844, deviceScaleFactor 1. Las 60 capturas no se versionan (se entregaron al propietario en la sesión); los nombres citados
(`04-bandeja-conversacion-escritorio.png`, etc.) son los de esa entrega. El botón «N» / «Issues» abajo a la izquierda es el
indicador de desarrollo de Next, no parte del producto.

**[V]** = verificado en captura. **[S]** = supuesto o inferido, no verificado.

---

## 1. Veredicto

1. **No es genérico en el contenido, pero sí en la forma.** El dominio de turismo está en los datos
   (file, mayorista, time limit, localizador, régimen, ADT/CHD/INF, ventana de 24 h); la estructura
   visual es la de cualquier SaaS hecho con Tailwind: tarjetas redondeadas, KPIs en cajas, píldoras de
   colores, un acento distinto en cada pantalla.
2. **Se siente «de turismo» en tres pantallas** —Catálogo, Reservas (/viajes) y el detalle de la
   cotización— y **CRM genérico en las dos que más se usan**: la bandeja y el pipeline, donde el viaje
   (destino, fechas, pasajeros, salida) no existe como dato estructurado junto al chat.
3. Antes que identidad hay **credibilidad**: montos 100 veces más grandes, conversación con el mensaje
   del cliente pintado como del asesor, plazos contradictorios entre pantallas, IDs de tareas internas
   (T-027…) a la vista y dos pantallas en error 500 en demo. Eso hace que se vea a medio hacer más que
   genérico.

---

## 2. Por pantalla

### Ingreso — `01-ingresar-escritorio.png`, `01b-ingresar-tras-enviar-escritorio.png`
- Funciona [V]: el titular «Convierte conversaciones en viajes reales» y la mención de COP y cupos
  dicen de qué va el producto. El aviso de modo demo y el éxito del ingreso se ven.
- Genérico o roto [V]:
  - Degradado azul con titular grande y chips: el patrón de cualquier landing SaaS.
  - El logo aparece dos veces, a izquierda y a derecha.
  - Afirma «Uptime 99.9% en vivo» cuando no hay servicio desplegado: es falso.
  - «Aislamiento RLS Multi-tenant» es jerga técnica que la asesora no entiende.
  - Dice «Diseñado para agencias mayoristas y receptivas» cuando el foco es la minorista (S1).
  - El modo demo pide «usa credenciales de prueba» sin decir cuáles.
  - El banner de cookies tapa la mitad inferior en la primera visita (`01-ingresar-escritorio.png`).

### Inicio — `02-inicio-escritorio-completa.png`, `02-inicio-movil.png`
- Funciona [V]:
  - Los seguimientos del día con cliente, paquete y botón «Chat».
  - La tarjeta de oportunidades desglosada por etapa.
- Genérico o roto [V]:
  - Saluda a «Asesor ViajaPro» en la agencia «Viajes El Sol», pero Configuración y el PDF dicen
    «ViajaPro Aventura». La agencia cambia de nombre según la pantalla.
  - «Conversaciones pendientes: 0» mientras la bandeja muestra varias con «SLA Vencido» y mensajes
    sin leer (`03-bandeja-escritorio.png`). El KPI contradice la bandeja.
  - La cuarta tarjeta, «Catálogo de excursiones — Pasadías & Tours», es un anuncio y no una métrica.
  - Los 7 seguimientos están en rojo, todos «vencido hace 23-24 d»: con todo en alarma, nada destaca.
  - Densidad baja: unas 5 filas por pantalla en escritorio.
  - En móvil, los KPIs ocupan casi dos pantallas antes de llegar al trabajo.

### Bandeja — `03-bandeja-escritorio.png`, `03-bandeja-movil.png`
- Funciona [V]:
  - Filtros Mías / Sin asignar / Sin leer / SLA vencido.
  - Contador de la ventana en cada fila.
  - Atajos de teclado visibles en el pie y en el estado vacío.
  - La lista en móvil se lee bien y tiene barra inferior.
- Genérico o roto [V]:
  - Cada fila muestra nombre, último texto y hora, como Kommo o WhatsApp Web. No dice destino, fechas,
    número de pasajeros ni etapa: nada de turismo.
  - «Ventana cerrada» va en verde, el color de «todo bien».
  - Los contadores («34 min», «11 h 59 min») no tienen etiqueta: no se sabe si es la ventana o el SLA.
  - El distintivo «datos de demostración» se parte en tres líneas y aprieta el encabezado.
  - Sin conversación abierta, el 70 % de la pantalla de escritorio queda vacío.
  - En escritorio, la bandeja no ocupa toda la altura: debajo asoma el pie legal de la app.
  - El ítem activo de la barra lateral va con anillo dorado mientras el acento de marca es azul.

### Conversación — `04-bandeja-conversacion-escritorio.png`, `04-bandeja-conversacion-movil.png`
- Funciona [V]:
  - El aviso «Ventana de Meta por cerrar: quedan 34 min» con enlace a plantillas, visible y
    accionable: es el mejor elemento del producto.
  - Nota interna diferenciada.
  - «Nueva cotización» presente en el encabezado.
- Genérico o roto [V]:
  - El mensaje del cliente, «Hola, quisiera cotizar un paquete a Cancún para 2 adultos y 2 niños en
    diciembre», aparece como enviado por «Asesor Actual»: burbuja azul, a la derecha, con doble check.
    La dirección está invertida en la maqueta.
  - El panel derecho, «Ficha del Viajero», lo ocupan los campos personalizados: pasaporte, una fecha en
    formato `mm/dd/yyyy` (de EE. UU.) y un segmento.
  - La oportunidad viva queda bajo el pliegue. El viaje que el cliente pide (Cancún, diciembre,
    2 ADT + 2 CHD) no aparece estructurado en ningún sitio.
  - Hay tres botones de cotizar compitiendo: «Nueva cotización» en el encabezado, «Enviar cotización»
    en el redactor y «Crear cotización» en el panel.
  - Las píldoras «TRANSACCIONAL / PROMOCIONAL» no tienen contexto.
  - Móvil: el encabezado se rompe. El nombre se trunca («Asesor A…»), Soltar y Reasignar se apilan en
    vertical y la acción de cotizar es un «+» sin texto.

### Pipeline — `05-pipeline-escritorio.png`, `05-pipeline-movil.png`
- Funciona [V]:
  - Las tarjetas abren con el destino y un pin.
  - Muestran valor, próxima tarea con vencimiento y total por etapa.
  - Hay vista de tabla y export.
- Genérico o roto [V]:
  - Es un kanban de HubSpot. Falta la fecha de viaje, la salida, los pasajeros y la vigencia de la
    cotización: lo que en turismo decide la prioridad.
  - La probabilidad en % es más jerga de CRM que de agencia.
  - Una tarea dice «Emitir TravelFile»: el nombre del código se filtra a la interfaz (en pantalla
    debería decir «archivo de viaje»).
  - Caben 2 tarjetas por columna en 900 px y la columna «Perdida» queda cortada.
  - En móvil, buscador y filtros ocupan el 40 % de la pantalla antes de la primera tarjeta.

### Contactos — `06-contactos-escritorio.png`
- Funciona [V]:
  - Tabla densa.
  - Consentimiento Ley 1581 visible por fila.
  - Etiquetas con destinos.
- Genérico o roto [V]:
  - Todas las filas dicen «ID: 00000000»: parece roto.
  - No hay columnas de próximo viaje ni último destino; los destinos van como etiquetas libres.
  - Es una tabla de contactos genérica.

### Ficha de contacto — `07-ficha-contacto-escritorio-completa.png`, `07b-ficha-contacto-juan-escritorio.png`
- Funciona [V]:
  - Línea de tiempo con archivos de viaje y versiones de cotización.
  - Preferencias del viajero en el encabezado.
  - Pestaña de consentimientos.
- Genérico o roto [V]:
  - **Oportunidad activa: $ 1.250.000.000 y cotizaciones por $ 2.350.000.000** para «Hotel Hard Rock +
    Vuelos Avianca (4 pax)». Mil doscientos cincuenta millones de pesos es inverosímil: huele al error
    de unidad mínima que R8 ya registra (×100) [S sobre la causa].
  - Ana Martínez y Juan Pérez muestran exactamente los mismos KPIs y la misma línea de tiempo: solo
    cambia el encabezado.
  - Aparece «Expediente operativo #00000000», y hay entradas duplicadas.
  - La consola registró «No existe o no fue posible cargar el contacto» en la primera carga.

### Catálogo — `08-catalogo-escritorio-completa.png`, `08-catalogo-movil.png`
- Funciona [V]: **la pantalla más «de turismo».**
  - Cada tarjeta trae destino, tipo de plan, 4D/3N, régimen (todo incluido, desayuno, media pensión),
    mayorista, vigencia, time limit del mayorista, inclusiones y tarifa «desde» por persona.
  - Botones «Ver tarifario» y «Cotizar» en cada tarjeta.
- Genérico o roto [V]:
  - La pestaña se llama «Plantillas CSV (T-030)»: un ID de tarea interna a la vista.
  - Hay una caja de desarrollador: «Datos simulados — Probar API Real».
  - Fechas en ISO (2027-06-15), cuando otras pantallas dicen «20 nov».
  - Sin una sola imagen ni color por destino: un catálogo de viajes que parece una hoja de cálculo
    con bordes.
  - En móvil, el primer paquete empieza a mitad de pantalla, debajo de 5 controles.

### Cotizador — `09-cotizador-escritorio-completa.png`, `09-cotizador-movil.png`
- Funciona [V]:
  - Selectores de pasajeros por edad (adultos, niños de 2 a 11, infantes), con la edad explicada.
  - Desglose por tipo de pasajero.
  - «Copiar para WhatsApp».
- Genérico o roto [V]:
  - No dice para quién es la cotización: no hay viajero ni conversación de origen.
  - La fecha de salida es un selector libre (`10/03/2026`, en el pasado, con formato ambiguo) y no la
    lista de salidas del paquete.
  - No se ven el neto ni el margen, cuando el documento de diseño los exige en todo momento.
  - Tres colores de acción en una pantalla: morado para «Guardar», verde para WhatsApp y azul en el
    resto de la app.
  - «Modo: Modo demostración (simulado) (Alternar)» queda como texto de depuración.
  - En móvil, el total y los botones quedan bajo el pliegue: la asesora ajusta pasajeros sin ver el
    precio.

### Cotizaciones y detalle — `10-cotizaciones-escritorio.png`, `11-cotizacion-escritorio-completa.png`
- Funciona [V]:
  - Versiones inmutables con su monto, comparables.
  - Líneas por tipo de pasajero y acomodación (TRIPLE).
  - «Enviar por WhatsApp» como acción principal en verde.
- Genérico o roto [V]:
  - La lista tiene un botón «Estrés (500 cot.)», herramienta de prueba en la interfaz del producto.
  - La cotización vence el 2026-10-24 y la salida es el 2026-10-25, ambas ya pasadas, pero el estado
    sigue «ENVIADA» sin ninguna marca de vencida.
  - El detalle tiene 6 botones de igual peso en la cabecera.
  - «Modificar» va en morado.

### Propuesta imprimible — `11b-cotizacion-imprimir-escritorio-completa.png`
- Funciona [V]:
  - Datos de la agencia con NIT.
  - Viajero, salida, grupo y acomodación.
  - Vigencia destacada.
  - Leyenda ESCNNA (leyes 679 y 1336).
  - «Vista de cliente (sin costos ni margen)».
- Genérico o roto [V]:
  - Es una factura con tabla de precios. No trae itinerario día a día, hotel, vuelos, inclusiones ni
    exclusiones, ni una sola imagen. Es la pieza que ve el viajero, y es donde Travefy o Tern ganan.
  - No se ve el RNT.
  - «PROPUESTA DE VIAJE · VERSIÓN» se parte y el «2» queda solo en otra línea.

### Reservas (/viajes) — `12-viajes-escritorio-completa.png`, `12b-viaje-detalle-escritorio-completa.png`, `12b-viaje-detalle-movil.png`
- Funciona [V]: **la segunda pantalla más «de turismo».**
  - Lista ordenada por el plazo que vence primero, con «Menos de 24 h» y «En plazo».
  - Reservas por mayorista con localizador y time limit.
  - Pasajeros con titular, tipo y edad.
  - Acciones del oficio: lista de espera, marcar como caída, registrar abono.
  - Bien en móvil.
- Genérico o roto [V]:
  - Ni el detalle ni la lista tienen enlace a la conversación ni al contacto.
  - Hay un botón «Registrar abono», pero no se ve saldo, abonos ni cuánto falta por cobrar.
  - Los 8 botones de acción tienen el mismo peso: no hay acción principal.
  - Errores de redacción: «2 adt, 1 niños, 0 inf.»
  - Con la lista vacía de selección, el panel derecho dice solo «Elige un archivo…».
  - La misma reserva da plazos distintos: en Reservas, File 1043 vence «en 9 horas (4:50 p. m.)»; en
    la campana, «en 3 horas (10:50 a. m.)» (`17-notificaciones-escritorio.png`).

### Reportes — `13-reportes-escritorio-completa.png`
- Roto en demo [V]: «No se pudo cargar el reporte. El servidor respondió con error 500».
  - Es la única pantalla de negocio sin datos de maqueta: llama a la API directamente
    (`apps/web/src/lib/reportes-api.ts`).
  - El mensaje no dice qué hacer, aparte de reintentar.

### Configuración — `14-configuracion-escritorio-completa.png`, `16-config-whatsapp-escritorio.png`
- Funciona [V]:
  - Miembros con rol y estado.
  - «WhatsApp Conectado» y NIT en la cabecera.
- Genérico o roto [V]:
  - Las pestañas llevan IDs de tareas (T-027, T-106, T-028, T-026, T-104) y hay un botón
    «Asistente de Inicio (T-105)».
  - Un aviso dice «RLS R1 y Permiso «usuarios.administrar»».
  - La subpantalla de WhatsApp falla con 500 en demo.
  - La cabecera dice «WhatsApp Conectado» mientras la subpantalla dice que no pudo cargar el estado.

### Seguimientos — `15-seguimientos-escritorio.png`
- Funciona [V]: cada tarea enlaza al contacto, al paquete y al chat.
- Genérico o roto [V]:
  - **La pantalla se muestra sin la barra lateral**, el único sitio de la app donde pasa.
  - Las tarjetas son altas y rosadas: caben 4 por pantalla.

### Campana — `17-notificaciones-escritorio.png`
- Funciona [V]:
  - Filtros por categoría: Plazos, WhatsApp, Seguimientos, Cotizaciones.
  - Avisos de time limit y pago vencido por file.
- Genérico o roto [V]:
  - «Nuevo mensaje de WhatsApp — Has recibido un nuevo mensaje» no dice de quién ni qué.
  - Casi todos los botones van en rojo sólido.
  - Muestra 52 pendientes: una cifra que nadie va a vaciar.
  - En móvil no hay campana en la barra inferior (Bandeja, Pipeline, Cotizar, Viajes, Buscar, Perfil).
    No verifiqué si está dentro de Perfil [S].

---

## 3. Diferenciación: dónde está el turismo y dónde se esconde

**Ya aparece en la interfaz [V]:**

| Concepto | Dónde |
|---|---|
| Ventana de 24 h de WhatsApp | Aviso en la conversación, contador en la lista de la bandeja |
| Paquete con régimen, noches, mayorista, vigencia y time limit | Catálogo |
| Pasajeros por edad (ADT/CHD/INF) y acomodación | Cotizador, detalle de cotización, impreso |
| File, reservas por mayorista, localizador, time limit, lista de espera, «caída» | Reservas |
| Versiones inmutables de la cotización | Detalle de cotización |
| Cumplimiento: Ley 1581, ESCNNA | Contactos, impreso |

**Escondido detrás de un CRM genérico [V]:**
- **Bandeja.** Es donde vive la asesora y no tiene ni una pieza de viaje estructurada:
  - la fila no dice adónde ni cuándo;
  - el panel prioriza campos personalizados sobre la solicitud de viaje;
  - no hay vista de «qué pide este cliente» (destino, mes, pax) ni de su cotización vigente.
  Los genéricos (Kommo, Leadsales) se ven igual; aquí debería estar la ventaja.
- **Pipeline.** Valor y probabilidad en %, como HubSpot. Faltan la fecha de salida y la vigencia de la
  cotización, que en turismo deciden la urgencia.
- **Contactos.** Tabla de CRM genérica: sin próximo viaje, sin historial de destinos y sin estado de
  documentos de los pasajeros.
- **Propuesta al cliente.** Tabla de precios sin itinerario ni imágenes. Es el entregable con el que
  compiten Travefy, Tern y TravelJoy (según la auditoría competitiva, su fuerte es el itinerario visual
  y el portal del viajero). Hoy la nuestra se ve como una factura.
- **Salidas.** El catálogo sabe de salidas programadas, pero el cotizador pide una fecha libre. La salida
  como objeto (fecha, cupo, estado) no se ve en ninguna pantalla.
- **Dinero del viaje.** Abonos, saldo y cartera no aparecen en ninguna pantalla, aunque «Registrar abono»
  ya está como botón.

**Frente a la competencia [S, según la auditoría competitiva]:**
- Los genéricos con WhatsApp tienen una bandeja igual o mejor. Hoy nuestra ventaja no se ve en la bandeja.
- Los verticales de EE. UU. ganan en la pieza para el viajero.
- Nuestro hueco visible es **WhatsApp + cotizador por pasajero + reservas por mayorista en un mismo
  flujo**, pero la interfaz no conecta las tres cosas:
  - la cotización no sabe de qué conversación viene;
  - la reserva no enlaza al chat;
  - el chat no muestra la reserva.

---

## 4. Problemas de usabilidad concretos

**Jerarquía**
- Hay demasiados botones primarios de distinto color: azul (marca), morado (Guardar, Modificar,
  Invitar), verde (WhatsApp), verde azulado (contacto, seguimientos), naranja y rojo (campana).
  No hay una acción principal clara por pantalla [V].
- Tres caminos para cotizar desde la conversación [V].
- El detalle de cotización y el de reserva ponen 6 a 8 botones del mismo peso [V].

**Densidad**
- En escritorio: tarjetas altas en inicio, seguimientos y pipeline (2 a 5 elementos por pantalla).
- En móvil: los filtros consumen media pantalla en pipeline y catálogo.
- Contrario al principio 5, «densidad sobre aire» [V].

**Estados**
- Bandeja sin selección y Reservas sin selección dejan grandes vacíos sin aprovechar [V].
- Los errores 500 de reportes y WhatsApp no dicen la causa ni qué hacer [V].
- La demo no cubre Reportes: un vendedor que haga una demo con la maqueta se encuentra un error [V].

**Móvil**
- Encabezado de la conversación roto [V].
- En el cotizador, el total queda bajo el pliegue [V].
- Sin campana visible [V].
- La barra inferior y el patrón lista → detalle de Reservas sí funcionan [V].

**Accesibilidad y contraste**
- Hay mucho texto pequeño gris claro (metadatos «Por Operaciones», «Carlos Asesor», marcadores de
  posición) y verde claro sobre verde claro en las píldoras. Probablemente baja de AA [S, no lo medí].
- El foco y el teclado no se auditaron en esta pasada [S].

**Consistencia**
- La agencia tiene dos nombres («Viajes El Sol» y «ViajaPro Aventura») [V].
- Las fechas salen en tres formatos (ISO, «20 nov», `mm/dd/yyyy`) [V].
- «Ventana cerrada» va en verde [V].
- Seguimientos se muestra sin barra lateral [V].
- En la conversación, «Ficha del Viajero»; en contactos, «Contactos y Viajeros» [V].

**Lenguaje**
- IDs de tareas a la vista: T-027, T-030, T-105, T-106 [V].
- Jerga técnica: «RLS», «Probar API Real», «Estrés (500 cot.)», «Modo demostración (simulado)
  (Alternar)» [V].
- Código en inglés: «TravelFile» [V].
- Concordancia: «1 niños» [V].
- Copia genérica: «Has recibido un nuevo mensaje» [V].

**Datos que destruyen la confianza [V]**
- $ 1.250.000.000 por un viaje de 4 pasajeros.
- Mensaje del cliente pintado como del asesor.
- «ID: 00000000».
- El mismo contacto clonado (Ana y Juan comparten KPIs y línea de tiempo).
- Time limit contradictorio entre Reservas y la campana.
- KPI de pendientes en 0 con la bandeja llena.

---

## 5. Propuesta priorizada

### Arreglos rápidos (credibilidad; sin esto la identidad no importa)

| # | Cambio | Esfuerzo | Pantallas |
|---|---|---|---|
| R1 | **Limpiar la interfaz de restos de desarrollo:** IDs de tareas, «Estrés (500 cot.)», «Probar API Real», «Modo… (Alternar)», «RLS», «Uptime 99.9%», «TravelFile». Un solo distintivo de demo, discreto, en la barra lateral | S | Configuración, Catálogo, Cotizaciones, Cotizador, Ingreso, Pipeline |
| R2 | **Corregir los datos de maqueta que mienten:** montos ×100 (revisar unidad mínima, R8), dirección del mensaje entrante, «ID: 00000000», contactos clonados, time limit coherente entre Reservas y campana, KPI de pendientes, un solo nombre de agencia, fechas futuras coherentes. Y una maqueta para Reportes y el estado de WhatsApp | S-M | Ficha de contacto, Conversación, Contactos, Campana, Inicio, Reportes, Config. WhatsApp |
| R3 | **Un solo sistema de acción y de estado:** un primario (azul de marca), un secundario y el verde solo para «enviar por WhatsApp». Rojo solo para lo vencido de verdad. «Ventana cerrada» en gris o ámbar. Un formato de fecha (`20 nov 2026`) en toda la app, y el selector de fecha en `dd/mm/aaaa` | M | Todas |

### Identidad del producto (lo que lo hace «de turismo»)

| # | Cambio | Esfuerzo | Pantallas |
|---|---|---|---|
| I1 | **«Solicitud de viaje» como cabecera del panel derecho de la conversación:** destino, mes o salida, pax ADT/CHD/INF, presupuesto, la cotización vigente con su vencimiento y el file si existe. Los campos personalizados bajan a una sección plegada. Un solo botón «Cotizar», que abre el cotizador ya rellenado con esos datos y el viajero | M | Conversación (escritorio y móvil) |
| I2 | **Filas de bandeja y tarjetas de pipeline con «ADN de viaje»:** una línea `Cancún · dic · 2+2` y la marca de lo que cuesta dinero (cotización por vencer, time limit, ventana). En el pipeline, cambiar la probabilidad en % por la fecha de salida y los días a la salida | M | Bandeja, Pipeline |
| I3 | **Propuesta al viajero que parezca un viaje:** portada con imagen del destino, itinerario día a día, hotel y régimen, vuelos, incluye / no incluye, condiciones y RNT, con la marca de la agencia. Es la pieza que el cliente reenvía a su familia por WhatsApp | L | Impreso de cotización (y un enlace web después) |
| I4 | **La salida como objeto visible:** en el cotizador, elegir entre las salidas del paquete (fecha, cupo o estado, precio) en lugar de un selector de fecha libre. El total queda fijo abajo en móvil, y se muestra el margen al asesor | M | Cotizador, Catálogo |
| I5 | **Cerrar el círculo chat ↔ cotización ↔ file:** cada reserva enlaza a su conversación y a su viajero; la conversación muestra el file con su time limit y su saldo; el file muestra abonos y saldo pendiente junto a «Registrar abono» | M | Reservas, Conversación, Ficha de contacto |

Orden sugerido: R1 → R2 → I1 → I2 → R3 → I4 → I5 → I3.
- R1 y R2 se hacen en días y quitan la sensación de maqueta.
- I1 e I2 convierten la pantalla más usada en la que ningún genérico tiene.
- I3 es la apuesta grande de imagen frente a los verticales de EE. UU.

Lo que no propongo [S]: fotos decorativas en la interfaz de trabajo o un «tema playa». La identidad de
turismo debe salir de la **información** (salidas, pax, plazos, mayoristas) y de una pieza al viajero
cuidada, no de adornos en una herramienta que se usa ocho horas.
