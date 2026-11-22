# ADR-0037 — Supresión, exportación y retención de los datos de un titular

- **Estado:** **Propuesto.** Nada de este ADR se implementa hasta que el propietario cierre la
  sección §10 («Lo que tiene que decidir el propietario») y un abogado valide los plazos. Este
  documento es un **borrador para decidir en una sentada**, no una decisión tomada
- **Fecha:** 2026-11-22
- **Decide:** el propietario, con revisión legal (Ley 1581 de 2012 y Decreto 1074 de 2015) y el
  veredicto de `auditor-seguridad`, porque toca datos de tenants
- **Consultados:** `arquitecto` (autor del borrador). **Pendientes:** abogado de protección de datos,
  `auditor-seguridad`, `datos` (migraciones), `dueno-de-producto` (pantalla y plazos visibles),
  `experto-turismo` (qué se puede anonimizar sin romper la operación de un archivo de viaje)
- **No supersede nada.** **Parte de** [ADR-0014](0014-cifrado-del-texto-de-mensajes.md) y
  [ADR-0015](0015-cifrado-de-campos-sensibles.md), ya Aceptados e implementados (T-212), y **no los
  revisa**: aquí no se discute qué se cifra ni con qué clave
- **Origen:** AUD-002 (supresión) de la auditoría del 2026-10-20; tarea **T-090**. Desbloquea
  **T-097** (derechos del titular, P1) y da base a **T-098** (contrato de encargo)
- **Desarrolla y sustituye en autoridad a:** `docs/05-seguridad/10-retencion-supresion-y-respaldo.md`
  (v0.1, borrador, hoy «pendiente de aprobación del propietario y de revisión legal» —
  **comprobado el 2026-11-22: sigue en ese estado**)

---

## 1. Contexto: la fuerza

**Cumplimiento, no volumen.** No hay carga, ni latencia, ni acoplamiento que empuje esto. Lo que
empuja es que **R10 promete algo que el sistema hoy no puede cumplir**: la Ley 1581 de 2012 da al
titular el derecho de conocer, actualizar, rectificar y suprimir, y `docs/05-seguridad/02-proteccion-de-datos.md`
§4 ya lo escribe como obligación del producto. Hoy no hay ni un caso de uso que lo ejecute.

Hay además una fuerza de calendario real y verificable: **el 2026-11-22 un cliente del propietario
inició sesión en staging** (T-594, T-600). En el momento en que un viajero real escriba por WhatsApp,
este ADR deja de ser prevención y pasa a ser deuda legal.

Y una tercera, la del ADR-0014: **es más barato ahora.** Diseñar la supresión con cero conversaciones
reales cuesta un caso de uso; diseñarla con dos años de historial cuesta una migración con la bandeja
en marcha.

### 1.1 Estado real del código, verificado el 2026-11-22

No lo que dice la documentación, sino lo que hay:

| Hecho | Dónde se comprobó |
|---|---|
| **El cifrado de ADR-0015 está implementado.** Cinco columnas en cuatro partes cada una (`*_cifrado`, `*_nonce`, `*_tag`, `*_clave_version`), con clave derivada por agencia y columna y AAD con el id de la fila | `apps/api/src/shared/cifrado/cifrado-de-campos.ts`, `puerto-de-cifrado.ts` |
| **La lectura de PII ya se audita.** Acción `LECTURA_DATOS_SENSIBLES` en `registros_auditoria`, con nombres de columna e ids de fila, **nunca el valor** | `apps/api/src/shared/cifrado/lectura-auditada.ts` |
| **No existe ningún caso de uso de supresión ni de exportación por contacto.** En `crm` solo hay borrado lógico (`eliminado_en`) usado como filtro de lectura | `apps/api/src/modules/crm/**` (revisado entero) |
| **Redis no ve PII.** La cola de envíos transporta `{tenantId, mensajeId}`; la de `changes`, `{recepcionId, indice}`; el bus pub/sub publica eventos de dominio con ids | `cola-de-envios.bullmq.ts`, `cola-de-changes.bullmq.ts`, `bus-de-eventos.redis.ts` |
| La única clave de Redis que ata algo a un mensaje es la reserva `viajapro:envio-reservado:<mensajeId>`, TTL 7 días; y los `jobId` `envio-<mensajeId>` y `<recepcion hex>-<indice>` | `cola-de-envios.bullmq.ts` |
| `recepciones_webhook` guarda el cuerpo crudo **cifrado** y se anula al clasificar. La función `purgar_payloads` existe (migración `20261007140100`) pero **ningún trabajo la invoca**: no aparece en `apps/` | Migración + búsqueda en `apps/` |
| **Un `DELETE` del contacto no siempre es posible.** `consentimientos_contacto`, `oportunidades`, `notas_internas`, `seguimientos` y `conversaciones` son `ON DELETE CASCADE`; **`cotizaciones` es `RESTRICT`; `travel_files` y `pagos.pagador_id` son `NO ACTION`** | `schema.prisma` líneas 1399, 1441, 1648, 1700, 1837, 2339, 2579, 2940 |
| **Todavía no guardamos pasaporte ni fecha de nacimiento.** `pasajeros` tiene `nombre`, `tipo`, `edad_al_viaje` y nada más. No hay tabla `TravelerDocument` ni media en S3 implementada | `schema.prisma` 2717-2745 |
| Un contacto borrado deja ids colgando en `outbox` y en `registros_auditoria`: ninguna de las dos tiene clave foránea al contacto, ni trabajo de purga | `schema.prisma` 1733-1805 |
| `enrutamiento_canales` indexa el HMAC del **canal de la agencia**, no del teléfono del viajero. La purga del directorio (M2.4) **no es** parte de la supresión de un titular | `schema.prisma` 215-243 |

**Lectura de todo esto:** la superficie de supresión de hoy es más pequeña de lo que cualquiera
supondría leyendo la documentación, y el obstáculo real no es técnico (Redis está limpio, el cifrado
está hecho) sino **el choque entre el derecho de supresión y las claves foráneas de `cotizaciones`,
`travel_files` y `pagos`**, que es exactamente donde vive la obligación contable.

### 1.2 Lo que este ADR **no** decide

- No revisa ADR-0014 ni ADR-0015. El cifrado está decidido.
- No decide el contrato de encargo ni el RNBD: eso es T-098.
- No diseña la pantalla: eso es T-097 con `dueno-de-producto` y `diseno-ux`.
- No fija ningún plazo. **Los números de este documento son casillas vacías, no decisiones.**

---

## 2. Qué significa «suprimir» cuando el dato está cifrado

El problema no es borrar: es que el mismo dato vive en **cuatro sitios con reglas distintas** —la
fila de Postgres, el criptograma, los respaldos (ramas de Neon y PITR) y las colas—. Ninguna opción
los cubre los cuatro.

### S-A — Borrado físico: `DELETE` de la fila del contacto, en cascada

- **Gana:** es lo que la gente entiende por «suprimir», y lo que `docs/05-seguridad/02-proteccion-de-datos.md`
  §4 promete hoy («borrado real, no lógico»). La cascada ya existe en el esquema y se lleva
  consentimientos, oportunidades, notas, seguimientos, conversaciones, mensajes y adjuntos.
- **Cuesta:** **falla** si el contacto tiene una cotización (`RESTRICT`), un archivo de viaje o un
  pago (`NO ACTION`). Es decir: funciona con el curioso que escribió una vez y **no funciona con el
  cliente que compró**, que es justo quien más datos nos dejó. Obliga a decidir D2 antes de poder
  prometer nada.
- **Cierra:** la trazabilidad. Un archivo de viaje sin contacto no se puede reconstruir, y la
  agencia pierde la evidencia de una venta que la DIAN sí le va a pedir.

### S-B — Anulación: la fila se queda, el dato se va

Se anulan las cuatro columnas de cada campo cifrado (`texto_cifrado`, `texto_nonce`, `texto_tag`,
`texto_clave_version` → `NULL`, que el `CHECK ... IN (0,4)` ya permite) y se sobrescriben
`contactos.nombre`, `telefono_e164` y `correo` con un valor estable y sin información
(`+000000000000` o `suprimido-<uuid>`, para no romper el `@@unique([tenantId, telefonoE164])`).

- **Gana:** funciona **siempre**, con cliente o sin cliente, porque no toca ninguna clave foránea.
  Deja la contabilidad en pie y la persona fuera. Es un `UPDATE` por tabla, idempotente por
  construcción (anular lo ya anulado no hace nada), que es lo que R5 pide de cualquier operación que
  se pueda reintentar.
- **Cuesta:** la fila sobrevive. Quedan metadatos: que hubo una conversación, cuándo, cuántos
  mensajes, con qué asesor. Hay que decidir si eso es «suprimido» a efectos de la ley —**esto no lo
  decide el arquitecto** (D1).
- **Cierra:** poder decir «la fila no existe». Hay que decir «el dato no existe».

### S-C — *Crypto-shredding* por titular: borrar la clave, no el dato

Clave aleatoria de 32 bytes por titular, envuelta con la maestra de la agencia y guardada en una
fila propia. Suprimir = borrar esa fila. El criptograma queda, ilegible para siempre, **también en
los respaldos y en las ramas de Neon**.

- **Gana:** es la **única** opción que alcanza el respaldo sin tocarlo (§3). Y es la única que
  convierte «esperamos a que caduque el PITR» en «ya es ilegible».
- **Cuesta:** contradice de frente la concreción 1 de ADR-0015, que deriva la clave de la maestra
  con HKDF y por eso **no se puede borrar una a una** (lo dice su concreción 8). Implantarlo exige
  una tabla de claves envueltas, un recifrado de todo lo existente y revisar la rotación. Es un
  proyecto, no una tarea.
- **Cierra:** la simplicidad de ADR-0015. Y abre un modo de fallo nuevo y silencioso: perder una
  fila de claves por accidente es perder un historial sin que nada avise.

### Propuesta del arquitecto

**S-B como mecanismo, con S-A solo cuando ninguna clave foránea lo impida, y S-C fuera del alcance
de hoy.** Razón: S-B es la única que da el mismo resultado para todos los titulares —y una política
que funciona con unos clientes y no con otros no es una política—; S-A queda como optimización donde
es gratis; S-C es la respuesta correcta al problema de los respaldos pero su precio es rehacer
ADR-0015, y eso necesita una fuerza que hoy no existe (ninguna agencia real lo ha pedido, y el PITR
de producción ni siquiera está configurado).

**Es una propuesta, no la decisión: va como D1.**

### 2.1 Qué toca la supresión, sitio por sitio

Esto sí es ingeniería y no admite opinión legal; se escribe aquí para que la decisión se tome con el
alcance a la vista.

| Sitio | Qué se hace | Por qué |
|---|---|---|
| `contactos` | Anular `preferencias_*`; sobrescribir `nombre`, `telefono_e164`, `correo`; vaciar `etiquetas` y `campos_personalizados` | Son el titular. `campos_personalizados` es jsonb libre: ADR-0015 lo dejó en claro y la agencia pudo meter ahí cualquier cosa |
| `mensajes` | Anular `texto_*`. **Y decidir qué se hace con `wamid`** (ver riesgo abierto §8) | Es la mayor superficie de PII |
| `conversaciones` | Anular `ultimo_mensaje_texto_*` | Es una copia del anterior |
| `notas_internas` | Anular `texto_*` | Lo que el asesor anotó del viajero |
| `adjuntos` | Anular `nombre_archivo_*`, borrar el objeto de S3 por `clave_objeto` y anularla | `clave_objeto` es opaca por `CHECK`, pero el objeto de S3 sí es el pasaporte fotografiado |
| `consentimientos_contacto` | **Conservar la fila revocada, anular `prueba` y `texto_mostrado`** | La prueba de que hubo consentimiento y de que se revocó es lo que defiende a la agencia. El texto del aviso es de la agencia, no del titular |
| `oportunidades`, `cotizaciones`, `travel_files`, `pagos` | **No se tocan, se desvinculan o se anonimizan** | D2. Aquí manda la obligación contable, no nosotros |
| Redis | Borrar `viajapro:envio-reservado:<mensajeId>` de los mensajes alcanzados | Son ids, no PII, pero no cuesta nada y C5 exige «cero coincidencias» |
| BullMQ | Nada que borrar: los trabajos llevan ids y caducan (`removeOnComplete` 1 h, `removeOnFail` 7 días) | Verificado en el código |
| `recepciones_webhook` | Nada por titular: el payload se anula al clasificar y vive minutos | Pero **falta el trabajo que ejecute `purgar_payloads`** para las que nunca se clasificaron. Va a la cola, no bloquea |
| `outbox`, `registros_auditoria` | Nada: solo ids | §5 |
| Logs | Nada que borrar **si T-099 se cumple**. Hoy T-099 está en `backlog` | El acceso a logs es por retención, no por titular |

---

## 3. El problema de los respaldos

Un respaldo contiene el dato suprimido. Es el punto donde casi todas las políticas de privacidad
mienten, y conviene no mentir aquí.

### R-A — Se espera a que el respaldo caduque, y se dice así

La supresión alcanza la base viva. Las ramas de Neon y el PITR siguen teniendo el criptograma, que
es legible mientras exista la maestra de su versión (ADR-0015, concreción 8). Caducan solos cuando
pasa la ventana de retención del plan contratado.

- **Gana:** es verdad, es barato y se puede escribir en el contrato de encargo sin exagerar.
- **Cuesta:** **hay que poner un número y ese número es un compromiso.** Hoy no existe: `RS1` dice
  «la ventana la fija el propietario según el plan contratado» y el estado real dice «PITR de
  producción: no verificado, no hay producción». **El número va en D3** — y es también una decisión
  de coste, porque en Neon la ventana de PITR se paga.
- **Cierra:** poder prometer supresión inmediata y total. La frase honesta es: «el dato deja de ser
  accesible de inmediato y desaparece de nuestras copias en N días».

### R-B — Restaurar el respaldo, suprimir y volver a respaldar

- **Gana:** sobre el papel, cierra la ventana.
- **Cuesta:** es inviable y además **lo prohíbe RS4** (ningún respaldo de producción se restaura
  fuera de producción). Y cada restauración es una copia más de la base entera: aumenta la
  exposición en vez de reducirla.
- **Cierra:** nada que valga la pena. **Se descarta aquí**, sin pasar por el propietario.

### R-C — *Crypto-shredding* (S-C de §2)

- **Gana:** el respaldo queda ilegible sin tocarlo. Es la respuesta de verdad.
- **Cuesta:** rehacer ADR-0015 (§2, S-C).
- **Cierra:** nada, pero no se paga hoy.

### Propuesta del arquitecto

**R-A, con el número escrito y comunicado.** Y una regla que sí es de ingeniería: **la ventana de
PITR de producción y el plazo que se le promete al titular son el mismo número, o el segundo es
mayor.** Si se prometen 30 días y el PITR guarda 35, la promesa es falsa y es demostrable que lo es.

---

## 4. Exportación por titular

Dos preguntas separadas: **qué se exporta** y **cómo se entrega**. Solo la primera es difícil.

### 4.1 La conversación tiene dos personas

Un hilo de WhatsApp contiene mensajes del viajero y respuestas del asesor. El asesor también es
titular de datos, y lo que escribe es además información comercial de la agencia (precios netos,
márgenes, comentarios internos). Tres alcances posibles:

| | Qué se exporta | Qué implica |
|---|---|---|
| **E-A** | El hilo completo, entrantes y salientes | Lo más parecido a «lo que el titular vivió». Entrega al titular el nombre del asesor y texto redactado por la agencia. Un titular malintencionado obtiene con esto el guion comercial completo |
| **E-B** | Solo los mensajes `ENTRANTE` | Es estrictamente «sus datos». Deja una exportación incomprensible: preguntas sin respuestas. Un regulador puede leerlo como exportación incompleta |
| **E-C** | El hilo completo, con el asesor seudonimizado («Asesor 1») y las `notas_internas` fuera | Punto medio defendible: el titular ve la conversación entera, la agencia no entrega la identidad de su personal ni sus notas |

**Esto no lo decide el arquitecto.** Es D4. Lo que sí es de ingeniería: las tres son igual de fáciles
de implementar, porque `mensajes.direccion` ya distingue entrante de saliente y `notas_internas` es
otra tabla. **No hay razón técnica para preferir ninguna**, así que la decisión es puramente legal.

### 4.2 Qué más entra

Lo que existe y es del titular: contacto (incluidas `preferencias` y `campos_personalizados`),
consentimientos con su historial, oportunidades asociadas, cotizaciones que se le enviaron, archivos
de viaje y pasajeros donde figure, pagos que hizo, adjuntos que envió. **Fuera:** márgenes, tarifas
netas, comisiones y motivos de pérdida — describen la venta de la agencia, no al titular.

### 4.3 Formato

- **F-A — Un `.zip` con `datos.json` + los adjuntos originales.** Legible por máquina, que es lo que
  pide la portabilidad; ilegible para una persona normal.
- **F-B — Un PDF.** Legible para la persona; inútil para portabilidad y caro de generar.
- **F-C — Las dos cosas en el mismo `.zip`.** Es lo que hacen los grandes. Cuesta un generador de PDF
  que hoy no existe en el repositorio.

**Propuesta del arquitecto: F-A ahora, F-C cuando exista el generador de PDF** (que `quoting` va a
necesitar igualmente para las propuestas). Va como D5 porque es decisión de producto.

### 4.4 Cómo se entrega — esto sí es ingeniería y no se negocia

1. **La exportación descifra PII en masa.** Es, con diferencia, la lectura sensible más grande que
   el sistema va a hacer. Deja su fila `LECTURA_DATOS_SENSIBLES` con el usuario que la pidió, igual
   que cualquier otra lectura (`lectura-auditada.ts` ya sirve).
2. **Nunca por correo adjunto.** Objeto en S3 bajo el prefijo del tenant, URL firmada de vida corta,
   y el objeto se borra al caducar. Un `.zip` con el historial completo de una persona en la bandeja
   de Gmail de un asesor es exactamente el incidente que esto pretende evitar.
3. **Idempotente y por cola** (R5): es una operación larga; dos clics no generan dos exportaciones.
   La clave de idempotencia es `(tenant, contacto, solicitud)`.
4. **La web nunca tiene la clave de cifrado** (ADR-0015, concreción 4): la exportación se arma en la
   API o en el trabajador, jamás en el cliente.

---

## 5. Auditar un borrado sin guardar lo borrado

La paradoja aparente: hay que poder demostrar que se suprimió a Fulano sin guardar «Fulano».

No es tal paradoja, porque **el identificador opaco no es el dato**. `registros_auditoria` ya tiene
la forma exacta que hace falta (`entidad`, `entidad_id`, `detalle` jsonb, `usuario_id`, `ocurrido_en`,
bajo RLS de la agencia), y `lectura-auditada.ts` ya demuestra el patrón: nombres de columna e ids de
fila, nunca valores.

| | Qué se guarda | Qué permite y qué cuesta |
|---|---|---|
| **A-1** | `accion = SUPRESION_DE_TITULAR`, `entidad = Contacto`, `entidad_id = <uuid>`, `detalle = {tablas: {mensajes: 412, adjuntos: 7, ...}, modo: "anulacion", version_politica: "..."}` | La agencia demuestra qué hizo, cuándo y quién. El uuid no dice nada de la persona. **No permite** responder «¿borraron el número +57…?» sin conservar el número |
| **A-2** | A-1 más `HMAC(pimienta, telefono_e164)` | Permite confirmar que *ese* número fue suprimido. **Pero un teléfono E.164 tiene un espacio de búsqueda pequeño: si la pimienta se filtra, el HMAC es reversible por fuerza bruta en minutos.** Es la misma debilidad que ADR-0008 ya aceptó a sabiendas en `enrutamiento_canales`, y allí hay un motivo de funcionamiento que aquí no existe |
| **A-3** | Solo conteos, sin `entidad_id` | Irrefutablemente limpio e irrefutablemente inútil: no demuestra nada sobre una solicitud concreta |

**Propuesta del arquitecto: A-1.** La constancia que la agencia le entrega al titular es el id de la
solicitud, no un dato suyo. A-2 añade una fuga real a cambio de una comodidad.

**Lo que sí es decisión y no es nuestra (D8):** qué pasa con los registros de auditoría **anteriores**
a la supresión. `registros_auditoria` guarda, por diseño, los ids de las filas de un titular que
ahora ya no existe, y su retención declarada es de **5 años**. Purgarlos destruye la trazabilidad que
la misma ley exige; conservarlos conserva un rastro del titular. Las dos cosas no se pueden tener.

Una nota de ingeniería para esa decisión: hoy `registros_auditoria` **no tiene ninguna purga ni
trabajo de retención**, así que «5 años» tampoco es cierto todavía (RT2: un plazo sin trabajo que lo
ejecute no es una política).

---

## 6. El plazo de retención: ¿por agencia o invariante?

**Argumento, con R12 en la mano:** el plazo de retención de conversaciones **es política de negocio
de cada agencia, no invariante del dominio.** Cada agencia es *responsable del tratamiento*
(§7): su aviso de privacidad declara **su** plazo, con **su** finalidad, y ese aviso ya existe antes
de que nos contrate. Fijarlo nosotros en un `enum` o en una constante significaría imponerle a la
agencia una declaración que ella ya firmó distinta, y es exactamente el caso que R12 describe: «lo
que cada agencia define distinto es tabla por tenant».

**Pero no es parametrización libre**, y aquí R12 corta por el otro lado. La forma correcta es
**parámetro acotado**:

- **Un techo que nosotros imponemos** y la agencia no puede subir. «Para siempre» no es un plazo
  (`02-proteccion-de-datos.md` §4 ya lo dice: es ausencia de política, y multiplica el daño de
  cualquier incidente). Nosotros somos encargados: el riesgo del dato que guardamos de más es
  nuestro también.
- **Un suelo donde la ley lo impone** —archivos de viaje por obligación contable— que la agencia no
  puede bajar, porque bajarlo la pondría a ella en infracción.
- **Un valor por defecto** para la agencia que no configura nada, que es el caso normal.
- **Un plazo por tipo de dato**, no uno solo: conversación, documentos de viaje, archivo de viaje,
  media, auditoría. La tabla de `02-proteccion-de-datos.md` §4 ya los separa así.

**Los tres números —techo, suelo y defecto, por cada tipo de dato— los decide el propietario con el
abogado. Esto no lo decide el arquitecto.** Es D6. Lo que este ADR fija es la **forma**: tabla
`parametros_de_retencion` por tenant, con `CHECK` de rango, en la línea de `parametros_de_cobro` y
`parametros_del_registro`, que ya existen.

Y una condición sin la cual el parámetro es decorativo: **el trabajo programado que lo aplica se
escribe antes o a la vez que el parámetro** (RT2). Hoy no existe ninguno — ni siquiera el que
invoque `purgar_payloads`, que lleva desde octubre esperando.

---

## 7. ¿Se tokenizan los documentos detectados en los mensajes?

La pregunta de T-090. Conviene separarla del cifrado, porque son cosas distintas: el texto **ya está
cifrado** (ADR-0015). Tokenizar sería, además, **detectar** un número de documento dentro del texto,
sacarlo a una fila propia y dejar en su lugar una referencia.

### T-A — No tokenizar

- **Gana:** cero código nuevo en el camino de escritura del webhook, que es el camino más caliente y
  el que no puede fallar. Coherente con ADR-0015, que **ya descartó la opción C** por lo mismo: un
  detector tiene falsos negativos como caso normal («mi hijo nació el 3 de mayo», un pasaporte con
  espacios) y **da una garantía falsa ante la SIC**.
- **Cuesta:** suprimir un documento concreto obliga a anular el mensaje entero. Y no se puede
  responder «¿qué documentos tenemos de esta persona?» sin leer todo el hilo.
- **Cierra:** nada que esté abierto hoy.

### T-B — Tokenizar solo lo que el asesor marca a mano

El asesor señala un fragmento del mensaje y dice «esto es el pasaporte del pasajero». El valor va a
la tabla de documentos del viajero (cifrada desde que nazca, como manda ADR-0015 §«Cuándo revisar»)
y el mensaje **no se toca**.

- **Gana:** no hay detector, no hay falso negativo, y el dato queda donde la operación lo necesita —
  que es el sitio del que el agente de viajes lo va a sacar para emitir el tiquete.
- **Cuesta:** depende de una tabla `TravelerDocument` que **no existe** (`pasajeros` hoy solo tiene
  nombre, tipo y edad). No es tokenización en sentido estricto: es captura estructurada.
- **Cierra:** nada.

### T-C — Detección automática y tokenización

- **Gana:** cobertura sin esfuerzo del asesor.
- **Cuesta:** un clasificador en el camino de escritura y, sobre todo, **la misma garantía falsa que
  ADR-0015 ya rechazó**. Si se promete «detectamos y protegemos los documentos», hay que responder
  por el que no se detecte.
- **Cierra:** la posibilidad de decir «no inspeccionamos el contenido de los mensajes», que hoy es
  cierta y es un argumento de venta frente a una agencia desconfiada.

### Propuesta del arquitecto

**T-A hoy, T-B cuando nazca `TravelerDocument`, T-C nunca sin una fuerza nueva.** Rechazar la
detección automática por los mismos motivos por los que ADR-0015 rechazó su opción C es lo
consistente; proponer lo contrario seis semanas después sería reabrir una decisión cerrada sin que
nada haya cambiado. **Va como D7 porque es una aceptación de riesgo, y esa es del propietario.**

---

## 8. Responsable y encargado: quién le responde al titular

`docs/05-seguridad/02-proteccion-de-datos.md` §2 ya lo escribe y conviene traerlo aquí porque
**cambia el diseño, no solo el papeleo**:

- **La agencia es el responsable del tratamiento.** Es su relación con el viajero y su finalidad.
- **ViajaPro es el encargado.** Tratamos por cuenta de la agencia y siguiendo sus instrucciones.

Cinco consecuencias de arquitectura que se siguen de ahí, y que no son opinables:

1. **No existe un punto de entrada público para el titular.** Nada de `/mis-datos` ni de un correo
   nuestro de ARCO. El titular le escribe a **su agencia**; el producto le da a la agencia un botón.
   Si construyéramos ese punto de entrada nos estaríamos comportando como responsables, que es
   precisamente lo que el contrato de encargo dirá que no somos.
2. **Toda supresión y toda exportación las ejecuta un usuario de la agencia, bajo su RLS y con su
   `usuario_id` en la auditoría.** Nunca un proceso nuestro, nunca el propietario, nunca un agente.
3. **El plazo de respuesta corre contra la agencia, no contra nosotros.** La pantalla de T-097 debe
   mostrarle a la agencia su fecha límite. El número del plazo es legal: **esto no lo decide el
   arquitecto** (D11).
4. **Al terminar el contrato con una agencia hay que devolver y suprimir todo su tenant** (RT3
   propone 30 días, sin aprobar). Eso **no es la supresión de un titular**: es otra operación, por
   agencia, y es el único caso donde el *crypto-shredding* por tenant tendría un retorno claro
   —borrar una clave en vez de recorrer veinte tablas— y donde ADR-0015 concreción 8 duele de
   verdad. Va como D10.
5. **Si una agencia nos pide suprimir algo que la ley la obliga a conservar, el conflicto es suyo y
   el producto debe hacerlo visible**, no resolverlo en silencio: la operación avisa de qué filas no
   se pueden tocar (cotización, archivo de viaje, pago) y le pide que confirme con base legal, que
   queda en `detalle`.

---

## 9. Consecuencias

### Positivas
- T-097 queda desbloqueada el día que se cierre §10: ya no hay que descubrir el alcance, solo
  escribirlo.
- Queda escrito y verificado dónde está hoy la PII de verdad (§1.1), que es información que la
  documentación no tenía y que hace que la prueba de C5 se pueda escribir sin adivinar.
- La promesa que la agencia le hace al titular pasa a ser una promesa que el sistema puede cumplir,
  incluida la parte incómoda de los respaldos.

### Negativas
- **Este ADR no cierra nada por sí mismo.** Sin §10 decidida, no habilita ni una línea de código, y
  T-097 sigue bloqueada. Es deliberado, pero es un coste real.
- Si se elige S-B, hay que decirle a la agencia que la fila sobrevive anonimizada. Alguna lo leerá
  como «no lo borraron».
- El trabajo de retención (§6) y el de `purgar_payloads` son código nuevo que nadie ha presupuestado,
  y sin ellos los plazos que se decidan en D6 serán, otra vez, documentación que el sistema no
  cumple.
- Queda abierto el **riesgo de `mensajes.wamid`**: es un identificador de Meta que, por el formato
  que Meta usa, podría contener el teléfono del interlocutor codificado. **No se ha verificado**
  (§11). Si se confirma, anular el texto y dejar el `wamid` sería dejar el teléfono en claro en la
  tabla más grande del sistema — y `wamid` sostiene la unicidad que da la idempotencia de R5, así
  que no se puede borrar sin más. Es el único punto de este ADR que podría ser **bloqueante** en vez
  de cola.

### Qué habría que cambiar para revertir esto
Poco: es un ADR de diseño sin migración. Lo que sí es caro de revertir es lo que se decida en D1 y
D6, porque el primero define la forma de las filas y el segundo entra en el esquema (§6). El esquema
es el activo más caro de cambiar.

## 10. Lo que tiene que decidir el propietario

**Esta es la sección que importa.** Cada punto va con sus opciones y con la consecuencia de cada una.
Las marcadas `[legal]` **no las decide el arquitecto**: necesitan abogado. Las marcadas `[coste]`
tienen factura.

| # | Decisión | Opciones | Qué implica elegir cada una |
|---|---|---|---|
| **D1** `[legal]` | **Qué es «suprimir»** | **S-A** borrado físico · **S-B** anulación de las columnas cifradas y sobrescritura de los identificadores · **S-C** *crypto-shredding* por titular | S-A no funciona con quien compró (claves foráneas de `cotizaciones`, `travel_files`, `pagos`) → la política tendría dos clases de titular. S-B funciona siempre, deja la fila y los metadatos → hay que poder defender ante la SIC que eso es supresión. S-C es el único que alcanza respaldos → exige rehacer ADR-0015 y un recifrado completo. *Propuesta del arquitecto: S-B, con S-A donde no haya FK que lo impida.* |
| **D2** `[legal]` | **Qué pasa con lo que hay que conservar** (cotización, archivo de viaje, pago) | **(a)** conservar íntegro con base legal declarada · **(b)** conservar anonimizado respecto del titular · **(c)** suprimir también, asumiendo el riesgo contable | (b) es lo que SU3 propone hoy sin aprobar, y es lo que `experto-turismo` tiene que validar: un archivo de viaje sin nombre de pasajero puede ser inoperable. (c) expone a la agencia ante la DIAN, no a nosotros. Sin esta decisión, D1 no se puede cerrar |
| **D3** `[legal][coste]` | **Ventana de respaldos, y qué se le promete al titular** | Ventana de PITR de Neon: **__ días** · Plazo prometido de desaparición total: **__ días** (≥ el anterior) | Es el número que hoy no existe (`RS1`: «la ventana la fija el propietario según el plan»). Más ventana = más coste en Neon y más exposición; menos ventana = menos capacidad de recuperarse de un incidente. **Si el plazo prometido es menor que la ventana real, la promesa es falsa y es demostrable** |
| **D4** `[legal]` | **Alcance de la exportación de una conversación con dos personas** | **E-A** hilo completo · **E-B** solo mensajes entrantes · **E-C** hilo completo con el asesor seudonimizado y sin notas internas | E-A entrega al titular el guion comercial de la agencia. E-B puede leerse como exportación incompleta. E-C es el punto medio. **Las tres cuestan lo mismo de implementar: la decisión es puramente legal** |
| **D5** `[producto]` | **Formato de la exportación** | **F-A** `.zip` con `datos.json` + adjuntos · **F-B** PDF · **F-C** ambos | F-A es portabilidad real y hoy es gratis. F-B/F-C necesitan un generador de PDF que no existe en el repositorio (`quoting` lo va a necesitar igual) |
| **D6** `[legal]` | **Plazos de retención: techo, suelo y defecto, por tipo de dato** | Conversaciones **__** · Documentos de viaje **__** · Archivos de viaje **__** · Media **__** · Auditoría **__**. Y: ¿configurable por agencia dentro de un rango, o fijo? | La tabla de `02-proteccion-de-datos.md` §4 propone 24 meses / 12 / 5 años / 12 / 5 años, **sin aprobar y sin abogado**. *Argumento del arquitecto: configurable por agencia dentro de un rango acotado por nosotros (§6), porque cada agencia es responsable y su aviso de privacidad ya declara su plazo.* **El número sigue siendo suyo** |
| **D7** `[riesgo]` | **Tokenizar documentos detectados en mensajes** | **T-A** no · **T-B** solo captura marcada por el asesor, cuando exista `TravelerDocument` · **T-C** detección automática | T-C reabre la opción C que ADR-0015 ya rechazó, y obliga a responder por cada documento no detectado. T-A mantiene cierta la frase «no inspeccionamos el contenido». *Propuesta: T-A hoy, T-B después* |
| **D8** `[legal]` | **Qué se conserva en auditoría de un titular suprimido** | **(a)** purgar los `LECTURA_DATOS_SENSIBLES` que lo mencionan · **(b)** conservarlos los 5 años declarados · **(c)** conservarlos sin los ids de fila | (a) destruye la trazabilidad que la propia ley exige. (b) conserva un rastro del titular (ids opacos, pero rastro). No se pueden tener las dos. Nota: hoy **no existe ninguna purga de auditoría**, así que los «5 años» tampoco son ciertos todavía |
| **D9** `[producto]` | **Quién dispara la supresión y si hay vuelta atrás** | Rol que puede ejecutarla (¿`PROPIETARIO` de la agencia solamente?) · ¿ventana de arrepentimiento de N días antes de ejecutar, o inmediata? | Inmediata es más limpia legalmente y no perdona un clic equivocado sobre un cliente con 400 mensajes. Una ventana es más amable y significa que durante N días el dato **sigue ahí** |
| **D10** `[legal][coste]` | **Supresión al terminar el contrato con una agencia** | Plazo (RT3 propone **30 días**, sin aprobar) · ¿se financia *crypto-shredding* por agencia para que alcance respaldos? | Es el único caso donde el *crypto-shredding* tiene retorno claro. Sin él, la respuesta a una agencia que se va es la misma que a un titular: «caduca con el PITR» |
| **D11** `[legal]` | **Plazo de respuesta al titular que la pantalla debe mostrar** | Días para consulta: **__** · Días para reclamo: **__** · ¿prorrogable? | La Ley 1581 fija plazos concretos; **no los escribo aquí de memoria porque un plazo legal equivocado en el código es peor que ninguno**. Que los confirme el abogado y entren como constantes del contrato |

### Dependencias entre decisiones

D2 antes que D1. D3 antes de poder redactar el contrato de encargo (T-098). D6 antes de tocar el
esquema. D1, D2, D4 y D6 cerradas → T-097 desbloqueada.

## 11. Lo que no se pudo verificar

Se escribe para que nadie lo tome por verificado:

1. **Si `mensajes.wamid` contiene el teléfono del interlocutor codificado.** Es plausible por el
   formato que usa Meta y no se comprobó contra un `wamid` real. **Lo tiene que mirar el agente
   `whatsapp` con un mensaje de verdad.** Si se confirma, es lo único de este ADR que podría ser
   bloqueante, porque `wamid` sostiene la idempotencia de R5.
2. **La ventana de PITR de Neon y el plan contratado.** No hay producción; `RS1` lo deja al
   propietario y nunca se fijó.
3. **Si la restauración de un respaldo funciona.** `RS3` pide una prueba trimestral; el estado real
   dice «nunca».
4. **Qué hay hoy en los logs de Render.** T-099 (no registrar teléfonos ni documentos) está en
   `backlog`, así que no se puede afirmar que la supresión no deje rastro ahí.
5. **Plazos legales concretos de la Ley 1581 y del Decreto 1074.** Deliberadamente sin citar: los
   confirma el abogado (T-098), no este documento.
6. Nada se ejecutó contra la base: todo §1.1 sale de leer el esquema, las migraciones y el código.

## 12. Cuándo revisar esta decisión

- **En cuanto se decida §10:** este ADR queda Propuesto para siempre. Lo que se decida se escribe en
  un ADR nuevo que lo supersede, con las opciones elegidas y sin casillas vacías. **Este no se
  edita** (R7, CLAUDE.md §9).
- Si se confirma el riesgo de `wamid` (§11.1): entra antes, y puede cambiar D1.
- Cuando nazcan `TravelerDocument` y la media en S3: la superficie de supresión crece y D7 se
  reabre.
- Si una agencia opera con viajeros europeos: el RGPD añade el derecho de oposición y plazos más
  cortos, y D4, D6 y D11 se vuelven a mirar enteras.
- Si llega a haber volumen suficiente para que anular por lotes no termine en una ventana razonable,
  S-C deja de ser un lujo y pasa a ser la opción barata.
