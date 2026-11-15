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
  /** Una edad por niño, si la cotización las recogió (T-179). Sin ellas, la edad se desconoce. */
  readonly edadesNinos?: readonly number[] | undefined;
  /** Una edad por infante, si se recogió. */
  readonly edadesInfantes?: readonly number[] | undefined;
  /** Cuántos infantes ocupan silla propia, si se recogió. Sin dato, se desconoce. */
  readonly infantesConSilla?: number | undefined;
}

/** Un pasajero con lo que se sabe de él; `null` es «no se recogió», nunca un valor supuesto. */
interface Pasajero {
  readonly tipo: 'ADT' | 'CHD' | 'INF';
  readonly edad: number | null;
  readonly silla: boolean | null;
}

/**
 * Expande la composición a pasajeros. Un adulto no tiene edad recogida (`null`) y ocupa silla; un
 * niño ocupa silla; un infante ocupa silla solo si se dijo cuántos la ocupan (los primeros
 * `infantesConSilla`; el orden entre infantes no cambia el conteo).
 */
function pasajeros(c: Composicion): Pasajero[] {
  const lista: Pasajero[] = [];
  for (let i = 0; i < c.adultos; i++) lista.push({ tipo: 'ADT', edad: null, silla: true });
  for (let i = 0; i < c.ninos; i++) {
    lista.push({ tipo: 'CHD', edad: c.edadesNinos?.[i] ?? null, silla: true });
  }
  for (let i = 0; i < c.infantes; i++) {
    lista.push({
      tipo: 'INF',
      edad: c.edadesInfantes?.[i] ?? null,
      silla: c.infantesConSilla === undefined ? null : i < c.infantesConSilla,
    });
  }
  return lista;
}

const delTipo = (t: CondicionDeCobro, c: Composicion): Pasajero[] =>
  pasajeros(c).filter((p) => t.tipoPasajero === null || p.tipo === t.tipoPasajero);

const exigeEdad = (t: CondicionDeCobro): boolean => t.edadMinima !== null || t.edadMaxima !== null;

/** Falta un dato que la condición necesita para este pasajero. */
const lePasaDato = (t: CondicionDeCobro, p: Pasajero): boolean =>
  (exigeEdad(t) && p.edad === null) || (t.ocupaSilla !== null && p.silla === null);

/** ¿Este pasajero cumple las condiciones de edad y silla? Solo con datos presentes. */
function cumple(t: CondicionDeCobro, p: Pasajero): boolean {
  if (t.edadMinima !== null && (p.edad === null || p.edad < t.edadMinima)) return false;
  if (t.edadMaxima !== null && (p.edad === null || p.edad > t.edadMaxima)) return false;
  if (t.ocupaSilla !== null && p.silla !== t.ocupaSilla) return false;
  return true;
}

/** ¿La tarifa distingue pasajeros por tipo, edad o silla (y no solo cuenta cabezas)? */
const filtraPasajeros = (t: CondicionDeCobro): boolean =>
  t.tipoPasajero !== null || exigeEdad(t) || t.ocupaSilla !== null;

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
 * **A cuántos de este grupo se les cobra esta tarifa.**
 *
 * Una tarifa sin `tipoPasajero` es para todos; una con `ADT` solo para los adultos. Esta función
 * es la que faltaba: sin ella, la condición decidía si la tarifa estaba disponible pero no a
 * quién se le aplicaba.
 */
export function pasajerosQueCubre(t: CondicionDeCobro, c: Composicion): number {
  if (!filtraPasajeros(t)) return totalDePasajeros(c);
  // Con un dato que falta, el pasajero cuenta como cubierto: así `condicionNoEvaluable` ve que hay
  // a quién preguntarle y responde con error tipado, en vez de decir «no hay pasajeros».
  return delTipo(t, c).filter((p) => lePasaDato(t, p) || cumple(t, p)).length;
}

const ORDEN_ACOMODACION = ['SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE'];

/** Las acomodaciones que traen las tarifas, en orden de ocupación y sin repetir. */
export function acomodacionesDisponibles(tarifas: readonly CondicionDeCobro[]): string[] {
  const set = new Set<string>();
  for (const t of tarifas) if (t.acomodacion !== null) set.add(t.acomodacion);
  return [...set].sort((a, b) => ORDEN_ACOMODACION.indexOf(a) - ORDEN_ACOMODACION.indexOf(b));
}

/**
 * Pasajeros a los que NINGUNA de las tarifas por persona dadas cubre (T-216), descritos para el
 * asesor. Quien llama pasa solo las tarifas ya cobradas (aplicables, no suplementos).
 */
export function pasajerosSinTarifa(
  cobradas: readonly CondicionDeCobro[],
  c: Composicion,
): string[] {
  const porPersona = cobradas.filter((t) => t.unidad === 'POR_PERSONA');
  const sin: string[] = [];
  const contador = { ADT: 0, CHD: 0, INF: 0 };
  const nombre = { ADT: 'adulto', CHD: 'niño', INF: 'infante' };
  for (const p of pasajeros(c)) {
    contador[p.tipo] += 1;
    const cubierto = porPersona.some(
      (t) => (t.tipoPasajero === null || t.tipoPasajero === p.tipo) && cumple(t, p),
    );
    if (cubierto) continue;
    const edad = p.edad === null ? '' : ` (${p.edad} años)`;
    sin.push(`${nombre[p.tipo]} ${contador[p.tipo]}${edad}`);
  }
  return sin;
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
 * Detecta si una condición no se puede evaluar con la entrada actual.
 *
 * Devuelve el mensaje explicativo si la tarifa pide edad o silla de un pasajero del que la
 * cotización no recogió ese dato (T-179: sin `edadesNinos`/`edadesInfantes`/`infantesConSilla`, y
 * siempre para los adultos, de quienes no se pregunta la edad). Devuelve `null` si la condición es
 * evaluable o si el motivo es simplemente «no hay pasajeros de ese tipo».
 */
export function condicionNoEvaluable(t: CondicionDeCobro, c: Composicion): string | null {
  const candidatos = delTipo(t, c);
  // Si no hay pasajeros del tipo que cubre la tarifa, el motivo habitual es más claro.
  if (candidatos.length < 1) return null;
  if (!candidatos.some((p) => lePasaDato(t, p))) return null;

  if (exigeEdad(t) && candidatos.some((p) => p.edad === null)) {
    const desde = t.edadMinima ?? 0;
    const hasta = t.edadMaxima ?? 99;
    return `Aplica a pasajeros de ${desde} a ${hasta} años y la cotización no recoge la edad de cada pasajero`;
  }

  const verbo = t.ocupaSilla ? 'ocupan' : 'no ocupan';
  return `Aplica a pasajeros que ${verbo} silla y la cotización no recoge ese dato`;
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
  // Una tarifa de grupo con tipo, edad o silla se mide contra ESE subgrupo, no contra todos.
  const base = pasajerosQueCubre(t, c);
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
    return pasajerosQueCubre(t, c) > 0 ? null : motivoSinPasajeros(t, c);
  }

  if (!Number.isInteger(t.cubrePasajeros) || t.cubrePasajeros < 1) {
    return 'La tarifa de grupo no declara a cuántos cubre';
  }
  const base = pasajerosQueCubre(t, c);
  if (base < 1 && filtraPasajeros(t)) return motivoSinPasajeros(t, c);
  if (base < t.cubrePasajeros) {
    return `Aplica a grupos de ${t.cubrePasajeros} y van ${base}`;
  }
  if (base % t.cubrePasajeros !== 0) {
    return `Aplica a grupos de ${t.cubrePasajeros}; sobra${base % t.cubrePasajeros === 1 ? '' : 'n'} ${base % t.cubrePasajeros}`;
  }
  return null;
}

function motivoSinPasajeros(t: CondicionDeCobro, c: Composicion): string {
  // Si ni siquiera viaja alguien de ese tipo, ese es el motivo claro; la edad o la silla, después.
  if (delTipo(t, c).length < 1) return `No hay pasajeros del tipo ${t.tipoPasajero ?? 'requerido'}`;
  if (exigeEdad(t)) {
    const rango = `${t.edadMinima ?? 0} a ${t.edadMaxima ?? 99} años`;
    return `Ningún pasajero${t.tipoPasajero ? ` ${t.tipoPasajero}` : ''} tiene de ${rango}`;
  }
  if (t.ocupaSilla !== null) {
    return `Ningún pasajero ${t.ocupaSilla ? 'ocupa' : 'va sin'} silla`;
  }
  return `No hay pasajeros del tipo ${t.tipoPasajero ?? 'requerido'}`;
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
