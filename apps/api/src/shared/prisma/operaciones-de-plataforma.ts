/**
 * Las operaciones que legítimamente corren **sin tenant fijado**, declaradas una por una.
 *
 * **El problema que resuelve, y que es de señal, no de registro.** `sinTenantPorqueEsPlataforma`
 * escribe un `warn` cada vez que se usa. Es deliberado: el ADR-0003 quiere que esa vía de escape
 * sea incómoda y que cada aparición llame la atención en una revisión. Funciona mientras se use
 * tres veces al día en un alta de agencia.
 *
 * Deja de funcionar en el webhook. Ahí la ausencia de tenant **es el estado normal** —entre la
 * validación de la firma y la resolución del tenant no se sabe todavía de qué agencia es el
 * mensaje, que es justo lo que el ADR-0008 §4 existe para resolver—, así que el aviso saldría
 * una vez por mensaje recibido. A volumen real, el módulo más activo del sistema inundaría el
 * registro con un aviso que no avisa de nada, y alguien acabaría bajándole el nivel. **Ése es el
 * verdadero daño:** a partir de ese momento el aviso deja de verse también en el alta de
 * agencias, que es donde sí significaba algo. El ADR-0008 lo dice con todas las letras: «el
 * aviso que emite por cada mensaje obligaría a silenciarlo: a partir de ahí la señal se pierde
 * para todo el proyecto».
 *
 * **La salida no es callar el aviso: es mover el momento en que se pide atención.** En vez de
 * gritar en cada ejecución, se exige **declarar la operación aquí**. Añadir una línea a este
 * archivo es un cambio visible en una revisión, que es exactamente la propiedad que se quería
 * conservar — pero ocurre una vez, cuando se decide, y no un millón de veces después.
 *
 * La lista es un tipo cerrado: lo que no esté aquí **no compila**. Y `sinTenantPorqueEsPlataforma`
 * sigue existiendo, igual de ruidosa, para todo lo que nadie se ha parado a declarar.
 */

export const OPERACIONES_DE_PLATAFORMA = {
  'inbox/registrar-recepcion':
    'El POST de Meta se guarda cifrado antes de saber de qué agencia es. La tabla no lleva RLS ' +
    'a propósito y el contenido se descifra en el trabajador, con otra clave y otro rol. ' +
    'ADR-0008 §4.',
} as const;

/** El nombre de una operación declarada arriba. Cualquier otra cosa es un error de tipos. */
export type OperacionDePlataforma = keyof typeof OPERACIONES_DE_PLATAFORMA;

/** El porqué declarado, para que el registro de depuración diga algo útil sin ir al código. */
export function motivoDeclarado(operacion: OperacionDePlataforma): string {
  return OPERACIONES_DE_PLATAFORMA[operacion];
}
