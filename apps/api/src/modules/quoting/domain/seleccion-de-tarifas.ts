/**
 * Qué tarifas aplican a un grupo, a quién se le cobra cada una y cuántas veces.
 *
 * Vive en `domain/` y no dentro del caso de uso porque **aquí es donde se esconden los defectos
 * de precio**. Un error de una línea cobra de menos y nadie lo nota hasta que alguien cuadra las
 * ventas del mes. Separado, se prueba con un `expect` y sin base de datos.
 *
 * **Reescrito el 2026-10-13 tras el dictamen de `experto-turismo`, que encontró una mina.** La
 * primera versión preguntaba la composición de pasajeros y después la ignoraba: `tipoPasajero`,
 * `edadMinima`, `edadMaxima` y `ocupaSilla` solo servían para decidir SI preguntar, nunca para
 * decidir A QUIÉN se le cobra. Una tarifa de menor se habría cobrado a todo el grupo —adultos
 * incluidos— y, por ser la más barata, habría salido marcada como la recomendada.
 *
 * Con una tarifa de menor a $280.000 y una de adulto a $389.000, una familia de dos adultos y un
 * niño se habría cotizado en $840.000 cuando lo correcto son $1.058.000. Con el margen del 20 %
 * del ADR-0009 eso es **vender por debajo del costo**: la agencia paga por llevarlos.
 *
 * No disparaba porque el tarifario real del piloto son pasadías sin tarifa de menor. Habría
 * disparado con el primer paquete con hotel.
 */

/** Lo mínimo que hace falta saber de una tarifa para decidir si aplica y a quién. */
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

/** Quiénes viajan. Los tres códigos son los del sector, no inventados. */
export interface Composicion {
  readonly adultos: number;
  readonly ninos: number;
  readonly infantes: number;
}

export function totalDePasajeros(c: Composicion): number {
  return c.adultos + c.ninos + c.infantes;
}

/**
 * ¿Esta tarifa obliga a conocer la composición de pasajeros?
 *
 * **Eje 3 de ADR-0009.** La pantalla pregunta la composición si el tarifario lo pide, y no si
 * alguien encendió un interruptor: una bandera que puede contradecir al dato es un defecto
 * esperando su turno.
 *
 * `pasajerosMinimo` y `pasajerosMaximo` **no** cuentan: para saber cuántos van basta un número,
 * no hace falta desglosarlo. Esa es la línea entre «cuántos» y «quiénes».
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

/**
 * ¿Esta tarifa tiene una condición que la entrada actual NO permite evaluar?
 *
 * La entrada trae conteos de adultos, niños e infantes, no la edad de cada uno ni si el infante
 * ocupa silla. Una tarifa con `edadMinima`, `edadMaxima` u `ocupaSilla` no se puede cobrar a
 * ciegas: una tarifa infantil de 2 a 11 años contaría a todos los niños, y la de «infante con
 * silla» no distingue al que va en brazos. Se excluye de la selección automática y se enseña
 * con su motivo, en vez de aplicarse en silencio con un precio que puede estar mal.
 *
 * Solo importa si la tarifa cubriría a alguien: sin pasajeros de ese tipo, el motivo de siempre
 * («no hay pasajeros del tipo…») es el más claro.
 *
 * Siguiente paso (ver bitácora): modelar la edad por pasajero, que cambia el contrato.
 */
export function condicionNoEvaluable(t: CondicionDeCobro, c: Composicion): string | null {
  if (pasajerosQueCubre(t, c) < 1) return null;
  if (t.edadMinima !== null || t.edadMaxima !== null) {
    const rango =
      t.edadMinima !== null && t.edadMaxima !== null
        ? `de ${t.edadMinima} a ${t.edadMaxima} años`
        : t.edadMinima !== null
          ? `desde ${t.edadMinima} años`
          : `hasta ${t.edadMaxima} años`;
    return `Aplica a pasajeros ${rango} y la cotización no recoge la edad de cada pasajero`;
  }
  if (t.ocupaSilla !== null) {
    return `Aplica a pasajeros ${t.ocupaSilla ? 'que ocupan' : 'que no ocupan'} silla y la cotización no recoge ese dato`;
  }
  return null;
}

/**
 * **A cuántos de este grupo se les cobra esta tarifa.**
 *
 * Una tarifa sin `tipoPasajero` es para todos; una con `ADT` solo para los adultos. Esta función
 * es la que faltaba: sin ella, la condición decidía si la tarifa estaba disponible pero no a
 * quién se le aplicaba.
 */
export function pasajerosQueCubre(t: CondicionDeCobro, c: Composicion): number {
  switch (t.tipoPasajero) {
    case 'ADT':
      return c.adultos;
    case 'CHD':
      return c.ninos;
    case 'INF':
      return c.infantes;
    default:
      return totalDePasajeros(c);
  }
}

/** ¿Cabe este grupo en el rango de pasajeros que la tarifa admite? */
export function aplicaAlGrupo(t: CondicionDeCobro, c: Composicion): boolean {
  const total = totalDePasajeros(c);
  if (total < 1) return false;
  if (t.pasajerosMinimo !== null && total < t.pasajerosMinimo) return false;
  if (t.pasajerosMaximo !== null && total > t.pasajerosMaximo) return false;
  return true;
}

/**
 * Cuántas veces se cobra la tarifa. `null` significa **no se puede cobrar**.
 *
 * - `POR_PERSONA`: una vez por cada pasajero **que la tarifa cubre**, no por cada pasajero.
 * - `POR_GRUPO`: solo si el grupo es **múltiplo exacto** de lo que cubre. Una promo de pareja no
 *   sirve para tres: partirla en «pareja y media» inventa un precio que la agencia no publicó, y
 *   redondear a dos parejas le cobra a alguien que no viaja.
 *
 * Que una promo no aplique a tres personas **no es el final de la venta**: el asesor vende «dos
 * en promo y uno suelto», que es combinar dos tarifas y no partir una. Por eso quien llama debe
 * usar `motivoNoAplica` y enseñarlo, en vez de esconder que la promo existe.
 */
export function vecesQueSeCobra(t: CondicionDeCobro, c: Composicion): number | null {
  if (!aplicaAlGrupo(t, c)) return null;
  if (condicionNoEvaluable(t, c) !== null) return null;

  if (t.unidad === 'POR_PERSONA') {
    const cubiertos = pasajerosQueCubre(t, c);
    return cubiertos > 0 ? cubiertos : null;
  }

  if (!Number.isInteger(t.cubrePasajeros) || t.cubrePasajeros < 1) return null;
  // Una tarifa de grupo con tipo de pasajero se mide contra ESE subgrupo, no contra todos.
  const base = t.tipoPasajero === null ? totalDePasajeros(c) : pasajerosQueCubre(t, c);
  if (base < t.cubrePasajeros || base % t.cubrePasajeros !== 0) return null;
  return base / t.cubrePasajeros;
}

/**
 * Por qué NO aplica, en palabras que el asesor pueda leer. `null` si sí aplica.
 *
 * **Esto es coherencia con el propio ADR-0009.** Cuando dos vigencias empatan, el sistema no
 * elige en silencio: devuelve el error. Lo mismo aquí. Una promo que desaparece sin explicación
 * acaba aplicándose con la calculadora del celular, por fuera del sistema, y entonces el informe
 * de margen nunca cuadra.
 */
export function motivoNoAplica(t: CondicionDeCobro, c: Composicion): string | null {
  const total = totalDePasajeros(c);
  if (total < 1) return 'No hay pasajeros';

  if (t.pasajerosMinimo !== null && total < t.pasajerosMinimo) {
    return `Aplica desde ${t.pasajerosMinimo} pasajeros y van ${total}`;
  }
  if (t.pasajerosMaximo !== null && total > t.pasajerosMaximo) {
    return `Aplica hasta ${t.pasajerosMaximo} pasajeros y van ${total}`;
  }

  const noEvaluable = condicionNoEvaluable(t, c);
  if (noEvaluable !== null) return noEvaluable;

  if (t.unidad === 'POR_PERSONA') {
    return pasajerosQueCubre(t, c) > 0
      ? null
      : `No hay pasajeros del tipo ${t.tipoPasajero ?? 'requerido'}`;
  }

  if (!Number.isInteger(t.cubrePasajeros) || t.cubrePasajeros < 1) {
    return 'La tarifa de grupo no declara a cuántos cubre';
  }
  const base = t.tipoPasajero === null ? total : pasajerosQueCubre(t, c);
  if (base < t.cubrePasajeros) {
    return `Aplica a grupos de ${t.cubrePasajeros} y van ${base}`;
  }
  if (base % t.cubrePasajeros !== 0) {
    return `Aplica a grupos de ${t.cubrePasajeros}; sobra${base % t.cubrePasajeros === 1 ? '' : 'n'} ${base % t.cubrePasajeros}`;
  }
  return null;
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
