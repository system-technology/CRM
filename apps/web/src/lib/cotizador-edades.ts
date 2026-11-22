/**
 * Edades de niños e infantes del cotizador (T-179).
 *
 * Las tarifas de menor traen rango de edad y las de infante, si ocupa silla: sin esos datos el
 * servidor responde `TARIFAS_CON_CONDICION_NO_EVALUABLE`. Aquí se arma lo que se envía y solo
 * cuando está COMPLETO: una edad a medias no se manda, porque el contrato exige una por pasajero
 * y la pantalla no inventa la que falta.
 *
 * Conforme a @viajapro/contracts (CotizarSalida: edadesNinos, edadesInfantes, infantesConSilla).
 */

/** Edad aún sin responder = `null`. */
export type EdadesIncompletas = readonly (number | null)[];

export const EDAD_MAXIMA_NINO = 17;
export const EDAD_MAXIMA_INFANTE = 5;

/** Ajusta la lista a `n` posiciones: conserva lo escrito y rellena con «sin responder». */
export function ajustarLongitud(edades: EdadesIncompletas, n: number): (number | null)[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => edades[i] ?? null);
}

/** Interpreta lo tecleado: vacío o fuera de rango es «sin responder», nunca un valor supuesto. */
export function interpretarEdad(texto: string, maxima: number): number | null {
  if (texto.trim() === '') return null;
  const n = Number(texto);
  if (!Number.isInteger(n) || n < 0 || n > maxima) return null;
  return n;
}

export interface EntradaEdades {
  ninos: number;
  infantes: number;
  edadesNinos: EdadesIncompletas;
  edadesInfantes: EdadesIncompletas;
  /** Una casilla por infante: `true` si ocupa silla propia. */
  infantesConSilla: readonly boolean[];
}

export interface EdadesAEnviar {
  edadesNinos?: number[];
  edadesInfantes?: number[];
  infantesConSilla?: number;
}

const completas = (edades: EdadesIncompletas, n: number): number[] | null => {
  const lista = ajustarLongitud(edades, n);
  return lista.every((e): e is number => e !== null) ? lista : null;
};

/**
 * Lo que se añade a la petición. Sin niños no hay `edadesNinos`; con edades a medias tampoco (la
 * cotización sigue como antes y, si el tarifario las necesita, el servidor lo dirá). Con infantes,
 * `infantesConSilla` se envía siempre: la casilla visible es la respuesta de la asesora.
 */
export function edadesParaEnviar(e: EntradaEdades): EdadesAEnviar {
  const salida: EdadesAEnviar = {};
  if (e.ninos > 0) {
    const ninos = completas(e.edadesNinos, e.ninos);
    if (ninos) salida.edadesNinos = ninos;
  }
  if (e.infantes > 0) {
    const infantes = completas(e.edadesInfantes, e.infantes);
    if (infantes) salida.edadesInfantes = infantes;
    salida.infantesConSilla = e.infantesConSilla.slice(0, e.infantes).filter(Boolean).length;
  }
  return salida;
}

/** ¿Falta alguna edad por responder? Sirve para avisar, no para bloquear. */
export function faltanEdades(e: EntradaEdades): boolean {
  return (
    (e.ninos > 0 && completas(e.edadesNinos, e.ninos) === null) ||
    (e.infantes > 0 && completas(e.edadesInfantes, e.infantes) === null)
  );
}

export interface EntradaComposicion extends EntradaEdades {
  adultos: number;
  /** Solo decide si se pregunta QUIÉNES viajan (edades); cuántos viajan se manda siempre. */
  pideComposicion: boolean;
}

/**
 * La composición de la petición, para cotizar Y para guardar (T-321). Los números van siempre:
 * sin `adultos` la API cotiza para 1 mientras la barra dice «2 adt». Solo las edades dependen de
 * `pideComposicion`. Una sola función, para que los dos caminos no vuelvan a divergir.
 */
export function composicionDeLaPeticion(e: EntradaComposicion): {
  adultos: number;
  ninos: number;
  infantes: number;
} & EdadesAEnviar {
  return {
    adultos: e.adultos,
    ninos: e.ninos,
    infantes: e.infantes,
    ...(e.pideComposicion ? edadesParaEnviar(e) : {}),
  };
}
