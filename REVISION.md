# Revisión — `7ebc2be` — 2026-10-10

## Veredicto

**PASA.** Sin bloqueantes. El criterio difícil —la idempotencia— está cumplido y **demostrado en
pantalla**, que es más de lo que se pedía.

## Bloqueante (está roto hoy)

Ninguno.

## A la cola (no bloquea — regla R13)

| Qué | Por qué no bloquea |
|---|---|
| **`ENTREGA.md` llegó con la codificación corrompida** — «Vacéo», «EnvÁo», «navegació>», caracteres coreanos sueltos. Comprobé el código fuente y **está limpio**: es solo el informe | No afecta al producto. Pero el informe es el canal por el que se revisa tu trabajo, y uno ilegible cuesta tiempo. Escribe `ENTREGA.md` en UTF-8 sin BOM |
| La clave de idempotencia se muestra **truncada a 8 caracteres** (`973f8a72…`) | Para un asesor real está bien — la clave completa sería ruido. Pero para verificar, dos UUID distintos podrían compartir prefijo. Pon el valor completo en un atributo `title` |
| **Hiciste parte de la tarea 2 sin marcarla.** `1e7e6a3` trae `useInboxRealtime` y el renderizado de todos los tipos de contenido | Trabajo bueno y bienvenido. Pero la cola dejó de reflejar la realidad, y es justo lo que la cola existe para evitar. Marca lo que haces |

## Lo que verifiqué, y cómo

Abriendo la página en un navegador real con Playwright, contra `7ebc2be`.

**Compuertas:** `lint` 7/7 · `typecheck` 7/7 · `format:check` limpio.

**La idempotencia, que era el criterio difícil:**

| Paso | Resultado |
|---|---|
| Activé «Simular fallo de envío», escribí un mensaje y lo envié | Entró al hilo y falló, marcado en rojo |
| Clave mostrada antes de reintentar | `973f8a72…` |
| Pulsé «Reintentar envío» | |
| Clave después del reintento | **`973f8a72…` — la misma** |
| Mensajes en el hilo | **Uno.** No se duplicó |

Eso es lo que impide que el viajero reciba el mensaje dos veces. Y el detalle que lo hace
comprobable sin abrir el código —la clave visible en pantalla y el botón que dice «reutiliza
clave»— no estaba en el encargo. Es la clase de decisión que conviene que sigas tomando.

**El evento desconocido:** `use-inbox-realtime.ts:27` usa `EventoBandeja.safeParse`, no `.parse`.
Correcto, y era el punto delicado: el contrato promete ignorar en silencio lo desconocido, y con
`.parse` habría lanzado. El servidor publicará tipos nuevos antes de que la web sepa pintarlos.

**Accesibilidad del hilo:** `role="log"` presente, y la caja de redacción habilitada solo con la
ventana abierta.

## Siguiente bloque

**Termina la tarea 2 y haz la 4.** La 3 —conectar con la API real— se queda esperando: el backend
todavía no expone los endpoints.

### Primero: cierra el tiempo real

Ya tienes `useInboxRealtime` con los tres eventos. Faltan **las dos reglas de producto**, que no
son de interfaz:

- **Un mensaje nuevo no debe robar el desplazamiento.** Si el asesor está leyendo más arriba en
  el hilo, la vista no se mueve: aparece un aviso de «hay mensajes nuevos» en el que puede pulsar.
  Si ya estaba al final, sigue al final. Saltar la vista mientras alguien lee es de las cosas que
  hacen abandonar una herramienta.
- **La fila de la lista se reordena, pero no bajo el cursor.** Si el ratón está encima de una
  fila, se difiere el reordenamiento hasta que salga. Reordenar bajo el cursor hace que el asesor
  abra una conversación que no quería — y en una bandeja con 500, eso pasa todo el día.

Y marca la tarea 2 en `COLA.md` cuando esté.

### Después: la tarea 4, los casos que nadie prueba

Existen el vacío y el error de la lista, pero no se han visto con datos reales. Comprueba y
arregla:

- Buscar algo que no existe entre 500 conversaciones.
- Filtro `SLA_VENCIDO` cuando ninguna lo está.
- **Un contacto sin nombre, sin etiquetas y sin último mensaje**: la fila más pobre posible.
- **Un último mensaje de 4.000 caracteres sin un solo espacio** — que no rompa la fila.
- Un nombre de contacto larguísimo a 390 px.

Son los casos que un asesor encuentra el primer día y que nadie prueba porque los datos simulados
siempre son razonables.

**Criterios:** las cuatro compuertas en verde, cero tipos redefinidos, funciona a 390 px, y
**cada caso de la lista comprobado en navegador** — no deducido del código.
