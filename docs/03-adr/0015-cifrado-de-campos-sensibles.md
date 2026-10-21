# ADR-0015 — Cifrado de las columnas con PII sensible de viajeros

- **Supersedes:** [ADR-0014](0014-cifrado-del-texto-de-mensajes.md). Este ADR mantiene **entera** la
  decisión del 0014 y amplía su alcance. El 0014 ya está en `main` y aceptado, así que no se edita
  (CLAUDE.md §9 y la plantilla): solo cambia su línea de estado a
  `Superseded por ADR-0015`.
- **Estado:** Propuesto
- **Fecha:** 2026-10-20
- **Decide:** el propietario, con el veredicto de `auditor-seguridad`, porque toca datos de tenants
- **Consultados:** `arquitecto` (autor). Pendientes: `auditor-seguridad`, `datos` (migración),
  `dueno-de-producto` (la búsqueda) y `experto-turismo` (qué escribe un asesor en cada campo)
- **Origen:** auditoría externa, **AUD-001 (P1)**; auditoría integral del propietario
  (`docs/_auditorias/2026-10-20-auditoria-integral.md`), sobre `contactos.preferencias`.
  Relacionados: AUD-002 (supresión) y AUD-005 (rotación)
- **Plazo duro:** antes del primer mensaje de producción

---

## Contexto

`mensajes.texto` es la mayor superficie de PII del producto. El viajero escribe ahí su pasaporte, la
fecha de nacimiento de un menor o una condición de salud. Hoy se guarda **en claro**, bajo RLS
forzada, con el índice `mensajes_texto_trgm_idx`. Hay una **segunda copia**,
`conversaciones.ultimo_mensaje_texto` (200 caracteres), también en claro. La decisión de no cifrar
vivía en un comentario de la migración `20261011090000_inbox_conversaciones_mensajes_y_plantillas`
(líneas 56–83), que exigía un ADR.

**`contactos.preferencias`** (`schema.prisma:1039-1047`) tiene el mismo problema. El contrato la
describe como «alergias, asiento, aerolínea», y una alergia es un **dato de salud**, que la Ley 1581
trata como sensible. Su comentario la deja en claro por el coste de pintarla. Ese coste no existe:
se lee de una fila por apertura de conversación y nadie la busca.

**La fuerza es el cumplimiento, no el volumen.** R10 exige cifrado y acceso auditado. RLS separa
agencias, pero no protege de quien lee la base **sin pasar por la API**:

1. **Una credencial de rol de aplicación filtrada.** `viajapro_app` fija `app.current_tenant` con
   `set_config`, así que quien tiene su `DATABASE_URL` recorre todas las agencias.
2. **Copias de la base:** ramas de Neon, PITR y volcados para depurar.
3. **El rol propietario** (`neondb_owner`) y la consola de Neon.

El cifrado en reposo del proveedor no cubre ninguno de los tres.

**Un dato que rebaja el coste:** la búsqueda (`conversaciones.prisma.ts:145`) genera
`texto ILIKE '%…%'` sobre la columna cruda, y el índice es de otra expresión. **Es muy probable que
hoy no se use.** Hay que confirmarlo con `EXPLAIN`.

**Por qué ahora:** no hay datos de producción. Las filas de local, del CI y de Neon de desarrollo son
semillas y fixtures. La migración las anula y se vuelven a sembrar cifradas, sin un paso de claro a
cifrado.

## Opciones consideradas

En todas, el outbox y Redis siguen **sin texto** (`inbox-tiempo-real-redis.e2e-spec.ts` e
`inbox-visibilidad.e2e-spec.ts`).

### A — AES-256-GCM a nivel de aplicación, con versión de clave
Es el patrón de `payload-sellado.ts`: cada columna en claro pasa a cuatro (cifrado, nonce, etiqueta y
versión), con `CHECK (num_nonnulls(...) IN (0, 4))`.
- **Búsqueda:** se pierde la búsqueda por subcadena en el texto. Siguen el nombre y el teléfono del
  contacto. En el hilo abierto se busca en el cliente.
- **Tiempo real:** sin cambios de forma. **Tienen la clave la API y el trabajador; la web, nunca.**
  La API descifra al leer y emitir y cifra lo que escribe. El trabajador cifra los entrantes en
  `procesar-change.ts`.
- **Rotación (AUD-005):** versión por fila y lectura de la vigente y la anterior. Un trabajo recifra
  por lotes, agencia por agencia, bajo RLS. Una versión se retira cuando `count(*)` llega a cero.
- **Supresión (AUD-002):** anular las cuatro columnas en la base viva. **No alcanza las ramas de Neon
  ni el PITR** (concreción 8).
- **Gana:** cierra los tres lectores, con código ya auditado. **Cuesta:** la búsqueda por contenido y
  un trabajo de recifrado. **Cierra:** las consultas SQL sobre el contenido cifrado.

### B — Cifrar y mantener un índice ciego aparte
A más `mensajes_tokens (tenant_id, mensaje_id, HMAC(fragmento))`. Revela qué mensajes comparten un
fragmento. Con trigramas, el análisis de frecuencias reconstruye el texto. Con palabras, delata que
el mismo pasaporte aparece en tres conversaciones. Es la tabla más grande del sistema y hay que
rehacerla al rotar y borrarla al suprimir. **Se descarta**: su fuga es casi la del claro.

### C — Cifrar solo lo que parezca PII sensible
Los falsos negativos son el caso normal: «mi hijo nació el 3 de mayo», un pasaporte con espacios,
una alergia. Da una garantía falsa ante la SIC. **Se descarta.**

### D — Dejarlo en claro, con cifrado del proveedor y RLS
No protege de ninguno de los tres lectores y contradice R10. **Se descarta.**

## Decisión

**Opción A**, aplicada a las columnas que marca «Cifrar» la tabla de alcance.

### Alcance: inventario de columnas en claro que pueden llevar PII de viajeros

Revisión completa de `schema.prisma` en `main` el 2026-10-20. **No existe todavía la tabla de
pasajeros**: el `Viajero` del glosario solo aparece como valor del enum `EntidadPersonalizable`.

| Columna | Qué puede llevar | Decisión | Por qué |
|---|---|---|---|
| `mensajes.texto` | Pasaporte, menores, salud | **Cifrar** | Lo escribe el viajero sin restricción |
| `conversaciones.ultimo_mensaje_texto` | Lo mismo, en 200 caracteres | **Cifrar** | Es una copia del anterior |
| `contactos.preferencias` | Alergias, es decir, salud | **Cifrar** | Dato sensible por definición. Nadie la busca y se lee de una fila |
| `notas_internas.texto` | Lo que el asesor anota del viajero: documento, salud, menores | **Cifrar** | Texto libre de 2.000 caracteres, sin búsqueda en el código |
| `adjuntos.nombre_archivo` | «pasaporte_AB123456.jpg» | **Cifrar** | Lo elige el viajero, nadie lo busca y cuesta lo mismo |
| `contactos.campos_personalizados` y `oportunidades.campos_personalizados` (jsonb) | Lo que la agencia defina, incluido un campo «pasaporte» | **No, por ahora** | Tiene índice GIN para filtrar. Pasaporte y fecha de nacimiento tienen su sitio en `Viajero`, que nacerá cifrado. **Riesgo en cola:** una marca `sensible` en `definiciones_campo_personalizado` que cifre esos valores |
| `contactos.etiquetas` | «Celíaco», «Diabético» | **No** | Es un filtro de segmentación y se muestra en listados. La guía de producto: la salud va en `preferencias`. **Riesgo aceptado**, revisable |
| `oportunidades.nota_perdida` (500) y `proxima_tarea_descripcion` (200) | Estado comercial; ocasionalmente «falta pasaporte del niño» | **No** | Describen la venta, no al viajero, y se pintan en el tablero. **Riesgo aceptado** |
| `contactos.nombre`, `telefono_e164` y `correo` | PII ordinaria, no sensible | **No** | Son la llave del canal y de la búsqueda. Su cifrado no lo exige R10 |
| `registros_auditoria.detalle` y `outbox.payload` | Nada, por invariante | **No** | El texto no entra ahí. Se prueba en `inbox-visibilidad.e2e-spec.ts` |
| `consentimientos_contacto.prueba`, `mensajes.motivo_fallo` y `plantillas_whatsapp.cuerpo` | Evidencia, códigos de Meta y texto de la agencia | **No** | No son PII del viajero |
| `sesiones.ip` y `agente_usuario`; `usuarios` e `identidades` | Datos de asesores | **No** | Fuera de R10 (viajeros) |
| Media en S3 (pasaportes fotografiados) | Documentos completos | **Fuera de alcance** | No está implementado. Su propio ADR, con cifrado del lado del servidor y una clave por agencia |

### Concreciones obligatorias

1. **Una maestra, claves derivadas por agencia y por columna:** `HKDF-SHA256(ikm =
   CAMPOS_SENSIBLES_KEY_v<n>, sal = una constante de 32 bytes fijada y documentada en el
   adaptador, info = etiqueta ‖ tenant_id)`. La etiqueta es `"viajapro/<tabla>.<columna>/v<n>/"`,
   por ejemplo `viajapro/mensajes.texto/v1/` o `viajapro/contactos.preferencias/v1/`. Un
   criptograma no descifra en otra agencia ni en otra columna. Rotar la maestra cambia todas las
   derivadas, y lo cubre el recifrado.
2. **IV aleatorio de 96 bits por cifrado y tope de 2^32 cifrados por clave derivada** (agencia,
   etiqueta y versión). Cada `UPDATE` cuenta como un cifrado. Se rota antes de 2^31, con la cuenta
   sacada de la base. Lo que fuerza la rotación es ese tope, no el calendario.
3. **AAD de campos de longitud fija:** etiqueta ‖ `tenant_id` (16 bytes) ‖ id de la fila dueña
   (16 bytes) ‖ código de columna (1 byte). En `ultimo_mensaje_texto` va el id de la conversación y
   en `preferencias`, el del contacto. **Todo id de una fila cifrada se genera en la aplicación
   antes del `INSERT`**, nunca por `DEFAULT`.
4. **Sin respaldo:** sin `CAMPOS_SENSIBLES_KEY`, la API y el trabajador abortan al arrancar. La web
   y su entorno nunca la tienen.
5. **Una primitiva compartida y un adaptador por módulo:** el sellado vive en
   `apps/api/src/shared/cifrado/`, sin dominio. `inbox` y `crm` lo usan desde su `infrastructure/`,
   así que R4 no se rompe. Ni los casos de uso ni los controladores ven bytes cifrados. Se quita
   `mensajes_texto_trgm_idx`, y `ConsultarBandeja.buscar` busca por el nombre y el teléfono del
   contacto. Lo acepta `dueno-de-producto`.
6. **Un fallo al descifrar se registra como `Clase:código`, sin contenido.** No se devuelve a
   medias.
7. **Prueba de aislamiento nueva**, vista en rojo antes del arreglo: con el rol de aplicación y SQL
   directo, ninguna de las cinco columnas cifradas contiene el texto sembrado. Una segunda
   aserción falla si aparece en el esquema una columna `text` o `varchar` nueva en una tabla con
   tenant que no esté en una lista declarada. Así la tabla de alcance no envejece en silencio.
8. **Sin *crypto-shredding* por agencia.** Las claves derivadas no se borran una a una. Las ramas
   y el PITR guardan criptogramas legibles mientras exista la maestra. El borrado de verdad exige
   claves aleatorias por agencia, envueltas y borrables: un ADR futuro, ligado a AUD-002.

## Consecuencias

### Positivas
- Un `DATABASE_URL` filtrado, una rama o un volcado ya no exponen lo que escribió el viajero, ni su
  salud, ni lo que el asesor anotó de él.
- R10 se cumple tal como está escrita en las cinco columnas, y la tabla de alcance deja escrito qué
  queda fuera y por qué.

### Negativas
- **Se pierde la búsqueda por contenido en la bandeja.**
- No se puede hacer analítica SQL sobre las columnas cifradas. La IA del producto lee por la
  aplicación.
- Hay que escribir y ensayar el trabajo de recifrado, que hoy no existe ni para la pimienta (tarea
  4c).
- **Si se pierde `CAMPOS_SENSIBLES_KEY`, se pierde todo lo cifrado:** va al gestor de secretos con
  copia fuera de Render.
- No protege de un compromiso de la API ni del trabajador. La supresión no alcanza las ramas ni el
  PITR (concreción 8).
- Quedan riesgos aceptados y escritos: los campos personalizados, las etiquetas y los textos de la
  oportunidad. Van a la cola de `ESTADO.md`, con `datos` y `auditor-seguridad` como dueños.

### Qué habría que cambiar para revertir esto
- Una migración que descifre por lotes de vuelta al claro, con el trabajo de recifrado como base.
  Es reversible, pero cuesta más cuanto más historial haya.

## Cuándo revisar esta decisión

- Si dos o más agencias piloto piden la búsqueda por contenido como bloqueante de compra: evaluar B
  **solo con palabras enteras**, en un ADR nuevo que mida su fuga.
- Cuando se diseñe `Viajero` o la media en S3: nacen cifradas, y la tabla de alcance se amplía.
- Si una agencia usa campos personalizados para documentos o salud: se adelanta la marca
  `sensible`.
- Si la revisión legal concluye que el cifrado del proveedor basta: primero se reescribe R10.
