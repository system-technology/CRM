# ADR-0036 — La idempotencia de cobros compara todo el cuerpo, texto libre incluido

- **Estado:** Propuesto
- **Fecha:** 2026-11-21
- **Decide:** propietario, a propuesta de `backend`
- **Consultados:** la auditoría independiente de #410 (T-331), que levantó el defecto.
  Pendientes: `auditor-seguridad` (toca el libro de cobro: el propietario pidió auditoría
  independiente antes de integrar) y `experto-turismo` (§4)
- **Tarea:** T-516
- **Enmienda:** [ADR-0034](0034-pagos-del-viajero-mvp-de-registro-manual.md), **solo §4 paso 2**
  (qué se compara al reintentar con la misma clave). Lo demás de 0034 sigue vigente tal cual:
  el orden de la transacción, el candado, el `ON CONFLICT` como red y las reglas de dominio no
  cambian. No supersede nada
- **Base verificada:** `origin/main` en `e16f5499` (#410). `pnpm typecheck` y `pnpm lint` en verde;
  las pruebas unitarias de `apps/api`, en verde. **Las e2e y el `build` no se ejecutaron**: la
  sesión que escribe esto no puede levantar Postgres

---

## Contexto

ADR-0034 §4 paso 2 dice, literalmente, qué se compara cuando llega un reintento con una
`clave_idempotencia` ya usada:

> comparar el contenido (tipo, archivo, monto, moneda, fecha, medio, pagador, `reverso_de_id`);
> igual → `200` con la fila existente; distinto → `409` tipado.

La lista deja fuera **todo el texto libre**: `referencia`, `nota` y `motivo`. Y el código la seguía
al pie de la letra (`mismoContenido`, `apps/api/src/modules/payments/domain/movimiento.ts`).

El caso que lo saca a la luz es corriente, no exótico. La asesora registra un pago, ve que escribió
mal la nota o pegó una referencia equivocada, la corrige **en el mismo formulario** y vuelve a
enviar. El formulario reutiliza la clave que generó al abrirse (es lo que lo hace idempotente), así
que el servidor ve un reintento, responde **`200` con la fila original** y **descarta la corrección
sin decir nada**. La asesora cree que corrigió. No corrigió.

Lo que hace que esto importe más de lo que parece: **ella no puede deshacerlo**. Registrar un pago
es `cobro.registrar`; corregir el libro —reversar y volver a registrar— es `cobro.corregir`, y eso
es del dueño (ADR-0034 §2). El libro es inmutable: no hay `UPDATE` ni `DELETE` en ninguna ruta. La
nota equivocada queda escrita hasta que el dueño intervenga.

## Decisión

**La comparación cubre todo lo que el cliente manda.** Al dinero —tipo, archivo, monto, moneda,
fecha, medio, pagador, `reverso_de_id`— se le suman **`referencia`, `nota` y `motivo`**. Si algo
difiere, el servidor responde **`409 CLAVE_DE_IDEMPOTENCIA_REUTILIZADA`** y **no escribe nada**.
En el reverso, cuyo único campo escrito por el cliente es el `motivo`, ese motivo también cuenta.

Un reintento **idéntico** sigue respondiendo `200` con la misma fila y sin crear un segundo
movimiento. Esa es la garantía que impide cobrar dos veces al viajero y no se toca.

**Excepción, una sola:** en una fila **tachada** (§2.4 de ADR-0034: la base vacía `nota` y
`referencia` y fija `nota_tachada_en`) el texto libre no cuenta en la comparación. Lo vació la base
a propósito, no el cliente; compararlo le devolvería `409` a un reintento honesto por algo que no
hizo. El resto del contenido se compara igual.

## Por qué rechazar y no «aceptar y avisar»

T-516 admitía dos salidas: rechazar el reintento con datos distintos, o aceptarlo diciéndolo en la
respuesta. Lo único inadmisible era el silencio. Se elige **rechazar**:

1. **Lo que queda escrito no está al alcance de quien lo escribió.** Con «acepto y aviso», la nota
   equivocada queda en el libro y la asesora depende del dueño para quitarla. Con `409` no se
   escribe nada nuevo y el problema se resuelve **antes** de ensuciar el libro.
2. **Una sola semántica en la misma ruta.** `409` es ya la respuesta cuando el reintento cambia el
   monto, la fecha o el pagador. Partir el cuerpo en «campos que dan 409» y «campos que dan 200 con
   aviso» obliga a mantener dos idempotencias en el mismo endpoint y a que el cliente sepa cuál
   aplica a cada campo.
3. **Una clave denota una operación.** Si el cuerpo cambió, no es el mismo movimiento: es otro, y
   le toca su propia clave. Es también lo que hacen las pasarelas de pago ante una clave reutilizada
   con otra carga.
4. **El coste de rechazar es bajo.** El `409` no impide cobrar: el pago entró en el primer intento.
   Solo informa de que la edición no entró, que es exactamente lo que faltaba.

El contra-argumento considerado —«el texto libre no es dinero; bloquear por una nota es excesivo»—
se descarta porque el daño no está en el dinero sino en la **creencia falsa** de haber corregido.
Un `200` con un aviso en el cuerpo solo lo arregla si alguien lee el aviso; el `409` ya lo lee la
web, porque es el camino de error que esa pantalla maneja desde #410.

## Consecuencias

- **Para el cliente:** un reintento debe repetir el cuerpo **idéntico**. Para cambiar el texto hay
  que reversar y volver a registrar, que es `cobro.corregir`. Queda escrito en el contrato
  (`packages/contracts/src/cobros.ts`, junto a `ClaveDeIdempotencia`).
- **Para la web:** ninguno hoy. #410 genera una clave por formulario y no reedita con la misma, y
  ya maneja el `409` de esta ruta. Si en el futuro se quiere «corregir la nota» en la pantalla, es
  una funcionalidad de corrección, no un reintento.
- **Lo que no cambia:** el orden de la transacción, el candado consultivo, el `ON CONFLICT DO
  NOTHING`, las reglas de dominio, el esquema y los permisos. Sin migración.
- **La excepción de la fila tachada no es un riesgo abierto: ya está fijada en la base.** El
  `CHECK pagos_tachado_sin_texto` de la migración `20261121140000_pagos_del_viajero_libro_de_cobro`
  (línea 237) declara `nota_tachada_en IS NULL OR (nota IS NULL AND referencia IS NULL)`, así que
  **no puede existir** una fila tachada que conserve texto, y `aislamiento.spec.ts` rechaza un
  tachado que vacíe solo `referencia`. La suposición de la que depende la excepción está impuesta
  por una restricción y cubierta por una prueba, no por una convención.

  Corregido por la auditoría independiente de este PR: la primera redacción lo daba por no fijado y
  abría T-522 para fijarlo. Esa tarea sobraba y no se abre.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **`200` con un aviso en el cuerpo** («se ignoró tu edición») | Deja escrita la nota equivocada en un libro que la asesora no puede corregir, y parte la ruta en dos semánticas de idempotencia |
| **Aplicar la edición sobre la fila existente** | El libro de cobro es inmutable por diseño (ADR-0034 §5: `pagos` solo admite `SELECT,INSERT`, con disparadores que lo imponen). Corregir es reversar y registrar |
| **Dejarlo como está y documentarlo** | Es el silencio que T-516 prohíbe. Lo que se pierde no es un detalle de presentación: es la referencia bancaria con la que se concilia un pago |
| **Comparar solo `referencia` y dejar `nota` fuera** | La nota también se pierde en silencio, y la distinción sería arbitraria para quien usa el formulario |
