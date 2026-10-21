# ADR-0014 — Cifrado del texto de los mensajes

- **Estado:** Aceptado por el propietario (2026-10-20), con la opción (a): cifrar y buscar solo por
  metadatos. **Queda pendiente de `auditor-seguridad`**, y no se implementa hasta su veredicto
- **Fecha:** 2026-10-20
- **Decide:** el propietario, con el veredicto de `auditor-seguridad` (toca datos de tenants)
- **Consultados:** `arquitecto` (autor). Pendientes: `auditor-seguridad`, `datos` (migración),
  `dueno-de-producto` (pérdida de la búsqueda por contenido)
- **Origen:** auditoría externa del 2026-10-20, hallazgo **AUD-001 (P1)**. Relacionados: AUD-002
  (supresión) y AUD-005 (rotación de claves)
- **Plazo duro:** antes del primer mensaje de producción

---

## Contexto

`mensajes.texto` es la mayor superficie de PII del producto: el viajero escribe ahí su número de
pasaporte, la fecha de nacimiento de un menor o una condición de salud. Hoy se guarda **en claro**,
bajo RLS forzada, con el índice `mensajes_texto_trgm_idx`. Hay además una **segunda copia** que la
auditoría no nombra: `conversaciones.ultimo_mensaje_texto` (los primeros 200 caracteres), también en
claro.

La decisión de no cifrar vive en un comentario de la migración
`20261011090000_inbox_conversaciones_mensajes_y_plantillas` (líneas 56–83). El propio comentario dice
que «esto no cierra el asunto» y que exige un ADR. Este es ese ADR.

**La fuerza es el cumplimiento, no el volumen.** R10 exige que la PII de viajeros esté cifrada y con
acceso auditado (Ley 1581 de 2012). RLS separa agencias, pero no protege de quien lee la base **sin
pasar por la API**, y ese lector existe:

1. **Una credencial de rol de aplicación filtrada.** `viajapro_app` fija `app.current_tenant` con
   `set_config`; quien tiene su `DATABASE_URL` puede recorrer todas las agencias, una a una. RLS
   protege del bug de `WHERE`, no de la credencial.
2. **Copias de la base:** ramas de Neon, restauraciones puntuales (PITR), volcados para depurar.
3. **El rol propietario** (`neondb_owner`) y la consola de Neon.

El cifrado en reposo del proveedor no cubre ninguno de los tres: descifra para cualquiera que entre
por el protocolo de PostgreSQL.

**Un dato que rebaja el coste de cifrar:** la búsqueda actual (`conversaciones.prisma.ts:145`) usa
`contains` con `mode: 'insensitive'` de Prisma, que genera `texto ILIKE '%…%'` sobre la columna
cruda. El índice está construido sobre `inmutable_unaccent(lower(COALESCE(texto, '')))`, una
expresión distinta, así que **es muy probable que el índice no se use hoy**. Hay que confirmarlo
con `EXPLAIN` antes de cerrar el ADR. Si se confirma, «perder el índice» no cuesta rendimiento: la
búsqueda ya recorre todos los mensajes de la agencia.

**Por qué ahora:** no hay mensajes de producción. Cambiar el tipo de una columna sin filas reales es
una migración más; con dos años de conversaciones es un recifrado masivo con la bandeja en marcha.

## Opciones consideradas

Lo que comparten todas: el outbox y Redis siguen **sin el texto**. Lo prueban
`inbox-tiempo-real-redis.e2e-spec.ts` («el texto del viajero y su teléfono NO pasan por Redis») e
`inbox-visibilidad.e2e-spec.ts` («el evento del outbox lleva solo identificadores»).

### A — AES-256-GCM a nivel de aplicación, con versión de clave

Es el patrón de `payload-sellado.ts` aplicado a `mensajes.texto` y a
`conversaciones.ultimo_mensaje_texto`. Cada columna en claro se reemplaza por cuatro: cifrado, nonce,
etiqueta y versión de clave, con `CHECK (num_nonnulls(...) IN (0, 4))` como en `cuentas_whatsapp`.
- **Búsqueda:** se pierde la búsqueda por subcadena dentro del texto. Siguen el nombre y el teléfono
  del contacto, que tienen su propio índice. Buscar dentro del hilo abierto se hace en el cliente,
  que ya tiene el texto descifrado.
- **Tiempo real:** sin cambios de forma. La API ya lee el mensaje bajo RLS antes de emitir. Ahora
  además descifra en memoria, del orden de microsegundos por mensaje. El trabajador cifra al
  escribir, en `procesar-change.ts`.
- **Rotación (AUD-005):** cada fila lleva su versión. Se leen la versión vigente y la anterior. Un
  trabajo del trabajador recifra por lotes, agencia por agencia y bajo RLS. Una versión se retira
  cuando `count(*) WHERE clave_version = vieja` llega a cero, que es una consulta verificable.
- **Supresión (AUD-002):** borrar o anular las cuatro columnas. No hay copias derivadas que perseguir.
- **Gana:** cierra los tres lectores del contexto. Es el mismo código y el mismo criterio que ya
  auditamos. **Cuesta:** la búsqueda por contenido y un trabajo de recifrado que hay que escribir.
  **Cierra:** cualquier consulta SQL sobre el texto: informes, analítica o `LIKE` desde la base.

### B — Cifrar el texto y mantener un índice ciego aparte

Igual que A, y además una tabla `mensajes_tokens (tenant_id, mensaje_id, token)` con
`token = HMAC(clave_índice_tenant, normalizar(fragmento))`, también bajo RLS.
- **Búsqueda:** para buscar por subcadena hay que indexar trigramas con hash. Buscar por palabra
  entera solo da coincidencias exactas.
- **Fuga:** el índice revela qué mensajes comparten un fragmento y con qué frecuencia. Con trigramas,
  un análisis de frecuencias dentro de una agencia reconstruye buena parte del texto: es casi tan
  legible como el claro. Con palabras enteras, revela que el mismo pasaporte aparece en tres
  conversaciones, que es justo el dato que se quería proteger.
- **Tiempo real:** cada mensaje entrante escribe además entre 10 y 200 tokens. Eso amplifica las
  escrituras del trabajador.
- **Rotación:** hay que rehacer el índice entero con la clave nueva, más el recifrado de A.
- **Supresión:** hay que borrar también los tokens. Olvidarlos deja una huella consultable.
- **Gana:** conserva algo de búsqueda. **Cuesta:** una tabla nueva, la más grande del sistema, con
  una fuga difícil de acotar ante un auditor. **Cierra:** poco, pero compromete un esquema caro.

### C — Cifrar solo lo que parezca PII sensible

Un detector marca pasaportes, documentos y fechas, y cifra esos fragmentos o esos mensajes. El
resto queda en claro.
- **Búsqueda:** se conserva sobre la parte en claro, que es la mayoría.
- **Tiempo real:** el texto vuelve a armarse a partir de partes en claro y partes cifradas.
- **Rotación:** igual que A, pero sobre un subconjunto.
- **Supresión:** igual que A, más la parte en claro.
- **Por qué no:** los falsos negativos son el caso normal. «Mi hijo nació el 3 de mayo», un
  pasaporte con espacios, una alergia o una foto del pasaporte transcrita: nada de eso lo atrapa una
  expresión regular. Da una garantía falsa, la peor posición ante la SIC: declarar que se cifra la
  PII cuando no se cifra. Además pone lógica de clasificación en el camino de escritura.
- **Cierra:** la posibilidad de afirmar «el texto del viajero está cifrado».

### D — Dejarlo en claro, con cifrado del proveedor y RLS

Lo de hoy, ratificado.
- **Búsqueda, tiempo real, rotación:** sin cambios. No hay clave que rotar.
- **Supresión:** `DELETE` o `UPDATE`. Es lo más simple.
- **Por qué no:** no protege de ninguno de los tres lectores del contexto. Contradice R10 tal como
  está escrita («cifrado y acceso auditado»). Habría que cambiar la regla, y no hay fuerza de
  producto que lo justifique, porque la búsqueda probablemente ya no usa el índice.
- **Cierra:** nada técnico. Abre una exposición legal.

## Decisión

**Opción A.** Es la única que convierte una credencial de base filtrada o una copia de Neon en
bytes ilegibles. Reutiliza un patrón ya auditado (`payload-sellado.ts`). Su coste real, la búsqueda
por subcadena, es menor de lo que dice el comentario de la migración, porque esa búsqueda no está
usando el índice. B se descarta porque su fuga es casi equivalente al claro. C se descarta porque
promete lo que no cumple.

Concreciones obligatorias:

1. **Clave por agencia, derivada:** `clave = HKDF-SHA256(MENSAJES_TEXTO_KEY_v<n>, info = tenant_id)`.
   Un criptograma copiado a otra agencia no descifra, aunque falle RLS. No hace falta ninguna tabla
   de claves.
2. **AAD = `tenant_id ‖ mensaje_id ‖ nombre de columna`.** Ata el criptograma a su fila y a su
   columna, como el `recepcion_id` en el payload.
3. **Sin respaldo:** sin `MENSAJES_TEXTO_KEY`, la API y el trabajador abortan al arrancar, con el
   mismo criterio que `resolverClavePayload`. La web no recibe la clave.
4. **Un solo punto de cifrado:** un adaptador en `inbox/infrastructure`. Ni los casos de uso ni los
   controladores ven bytes cifrados.
5. **Se elimina** `mensajes_texto_trgm_idx`. El contrato `ConsultarBandeja.buscar` pasa a buscar
   solo por el nombre y el teléfono del contacto. Lo debe aceptar `dueno-de-producto`.
6. **Lo que falla al descifrar se registra como error `Clase:código`, sin contenido.** No se emite
   ni se devuelve a medias.
7. **Prueba de aislamiento nueva**, que debe verse en rojo antes del arreglo: con el rol de
   aplicación y SQL directo, ninguna columna de `mensajes` ni de `conversaciones` contiene el texto
   sembrado. Es el análogo de «lo guardado va cifrado» en `inbox-webhook.e2e-spec.ts`.

## Consecuencias

### Positivas
- Un `DATABASE_URL` filtrado, una rama de Neon o un volcado ya no exponen lo que escribieron los
  viajeros.
- R10 se cumple tal como está escrita para el texto de los mensajes.
- La supresión de un mensaje es completa: no queda ningún índice ni copia derivada.

### Negativas
- **Se pierde la búsqueda por contenido en la bandeja.** Un asesor que recuerda «el que preguntó por
  Cartagena» tiene que buscar por el contacto.
- No se puede hacer analítica SQL sobre el texto. La futura IA del producto lee por la aplicación,
  no por la base.
- Hay que escribir el trabajo de recifrado y ensayarlo antes de la primera rotación. Hoy no existe
  ni para la pimienta (tarea 4c).
- Hay un secreto más que custodiar por entorno. Si se pierde `MENSAJES_TEXTO_KEY`, se pierde el
  historial: tiene que estar en el gestor de secretos con copia fuera de Render.
- **No protege de un compromiso del proceso de la API**, que tiene la clave. Contra eso protegen
  RLS, la sesión y la visibilidad, no este ADR.
- Siguen en claro las notas internas, `contactos.preferencias` y el nombre y el teléfono del
  contacto. Quedan fuera de este ADR y van a la cola de `ESTADO.md`, con `datos` y
  `auditor-seguridad` como dueños.

### Qué habría que cambiar para revertir esto
- Una migración que descifre por lotes de vuelta a `texto`, con el trabajo de recifrado como base, y
  que vuelva a crear el índice. Es reversible, pero cuesta más cuanto más historial haya.

## Cuándo revisar esta decisión

- Si dos o más agencias piloto piden la búsqueda por contenido como bloqueante de compra, se
  evalúa B **solo con palabras enteras** y clave HMAC por agencia, en un ADR nuevo que mida su fuga.
- Si el volumen de una agencia hace que el recifrado por lotes no termine en una ventana razonable.
- Si la revisión legal (pendiente del propietario) concluye que el cifrado del proveedor basta. En
  ese caso, primero se reescribe R10.
