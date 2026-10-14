/**
 * Qué tarifas aplican a un grupo, y cuántas veces se cobra cada una.
 *
 * Vive en `domain/` y no dentro del caso de uso porque **aquí es donde se van a esconder los
 * defectos de precio**. Un error de una línea en `vecesQueSeCobra` cobra de menos y nadie lo nota
 * hasta que alguien cuadra las ventas del mes. Separado, se prueba con un `expect` y sin base de
 * datos.
 *
 * Cero dependencias de framework y cero dinero: esto decide **qué** se cobra y **cuántas veces**.
 * Multiplicar importes es de `Money`.
 */

/** Lo mínimo que hace falta saber de una tarifa para decidir si aplica. */
export interface CondicionDeCobro {
  readonly unidad: 'POR_PERSONA' | 'POR_GRUPO';
  readonly cubrePasajeros: number;
  readonly aditiva: boolean;
  readonly acomodacion: string | null;
  readonly tipoPasajero: string | null;
  readonly edadMinima: number | null;
  readonly edadMaxima: number | null;
  readonly pasajerosMinimo: number | null;
  readonly pasajerosMaximo: number | null;
  readonly ocupaSilla: boolean | null;
}

/**
 * ¿Esta tarifa obliga a conocer la composición de pasajeros?
 *
 * **Eje 3 de ADR-0009.** La pantalla pregunta la composición si el tarifario lo pide, y no
 * si alguien encendió un interruptor: una bandera que puede contradecir al dato es un defecto
 * esperando su turno. Así, la agencia de pasadías nunca ve una pantalla de acomodación sin haber
 * configurado nada, y la de paquetes con hotel la ve siempre.
 *
 * `pasajerosMinimo` y `pasajerosMaximo` **no** cuentan: para saber cuántos van basta un número,
 * no hace falta desglosarlo en adultos, niños e infantes.
 */
export function exigeComposicion(t: CondicionDeCobro): boolean {
  return (
    t.acomodacion !== null ||
    t.tipoPasajero !== null ||
    t.edadMinima !== null ||
    t.edadMaxima !== null ||
    t.ocupaSilla !== null
  );
}

/** ¿Cabe este grupo en el rango de pasajeros que la tarifa admite? */
export function aplicaAlGrupo(t: CondicionDeCobro, pasajeros: number): boolean {
  if (pasajeros < 1) return false;
  if (t.pasajerosMinimo !== null && pasajeros < t.pasajerosMinimo) return false;
  if (t.pasajerosMaximo !== null && pasajeros > t.pasajerosMaximo) return false;
  return true;
}

/**
 * Cuántas veces se cobra la tarifa para este grupo. `null` significa **no se puede cobrar**.
 *
 * Una tarifa de grupo **solo aplica si el grupo es múltiplo exacto** de lo que cubre: una promo
 * de pareja no sirve para tres personas. Cobrar «una pareja y media» sería inventarse un precio
 * que la agencia no publicó, y cobrar dos parejas para tres viajeros, cobrarle de más a alguien
 * que no viaja.
 */
export function vecesQueSeCobra(t: CondicionDeCobro, pasajeros: number): number | null {
  if (!aplicaAlGrupo(t, pasajeros)) return null;
  if (t.unidad === 'POR_PERSONA') return pasajeros;
  if (!Number.isInteger(t.cubrePasajeros) || t.cubrePasajeros < 1) return null;
  if (pasajeros % t.cubrePasajeros !== 0) return null;
  return pasajeros / t.cubrePasajeros;
}

/**
 * Un suplemento se cobra **una vez** y se ofrece aparte, nunca se suma solo.
 *
 * El de habitación sencilla depende de cómo duerman, y eso no lo sabe el tarifario: lo sabe el
 * viajero. Sumarlo por nuestra cuenta encarecería la cotización sin que nadie lo pidiera.
 */
export function esSuplemento(t: CondicionDeCobro): boolean {
  return t.aditiva;
}
