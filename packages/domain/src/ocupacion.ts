/**
 * Acomodación y composición de pasajeros.
 *
 * Aquí vive la trampa que un modelo hecho desde fuera del turismo siempre pasa por alto:
 *
 *   **El precio de un paquete depende de la ACOMODACIÓN, no solo de cuántos viajan.**
 *
 * Cuatro personas en dos habitaciones dobles no cuestan lo mismo que cuatro en una cuádruple.
 * El tarifario del mayorista da precio *por persona en acomodación X*, y ese precio baja cuanto
 * más gente comparte la habitación. Guardar «precio por pasajero» a secas está mal, y se descubre
 * con el primer cliente real.
 *
 * Ver `docs/01-producto/02-lenguaje-ubicuo.md`.
 */

import { InvariantError } from './errors.js';

/** Tipo de pasajero. Son los códigos del sector, no inventados. */
export const TIPOS_PASAJERO = ['ADT', 'CHD', 'INF'] as const;
export type TipoPasajero = (typeof TIPOS_PASAJERO)[number];

/** Cuántas personas comparten la habitación. El nombre es el del tarifario. */
export const ACOMODACIONES = {
  SENCILLA: 1,
  DOBLE: 2,
  TRIPLE: 3,
  CUADRUPLE: 4,
} as const;

export type Acomodacion = keyof typeof ACOMODACIONES;

export function personasPorHabitacion(acomodacion: Acomodacion): number {
  return ACOMODACIONES[acomodacion];
}

export class ComposicionInvalidaError extends InvariantError {
  readonly code = 'COMPOSICION_INVALIDA';
}

export class AcomodacionInvalidaError extends InvariantError {
  readonly code = 'ACOMODACION_INVALIDA';
}

/**
 * Cuántos pasajeros van, por tipo.
 *
 * Los infantes (INF) **no ocupan plaza de alojamiento ni asiento**: van en brazos y comparten
 * la cama. Por eso no cuentan para calcular habitaciones, aunque sí para el archivo de viaje
 * y para la documentación del vuelo.
 */
export class ComposicionPasajeros {
  private constructor(
    readonly adultos: number,
    readonly ninos: number,
    readonly infantes: number,
  ) {}

  static crear(params: { adultos: number; ninos?: number; infantes?: number }): ComposicionPasajeros {
    const adultos = params.adultos;
    const ninos = params.ninos ?? 0;
    const infantes = params.infantes ?? 0;

    for (const [nombre, valor] of Object.entries({ adultos, ninos, infantes })) {
      if (!Number.isInteger(valor) || valor < 0) {
        throw new ComposicionInvalidaError(`${nombre} debe ser un entero no negativo, no '${valor}'`);
      }
    }

    if (adultos < 1) {
      throw new ComposicionInvalidaError(
        'Toda reserva necesita al menos un adulto: un menor no puede viajar sin acompañante responsable',
      );
    }

    if (infantes > adultos) {
      throw new ComposicionInvalidaError(
        `${infantes} infantes con ${adultos} adultos: un infante viaja en brazos de un adulto, ` +
          'no puede haber más infantes que adultos',
      );
    }

    return new ComposicionPasajeros(adultos, ninos, infantes);
  }

  /** Pasajeros que ocupan plaza de alojamiento. Los infantes no. */
  get queOcupanPlaza(): number {
    return this.adultos + this.ninos;
  }

  /** Todos los que viajan, para el archivo y la documentación. */
  get total(): number {
    return this.adultos + this.ninos + this.infantes;
  }

  /** Forma compacta para mostrar: "2 ADT · 1 CHD". */
  toString(): string {
    const partes = [`${this.adultos} ADT`];
    if (this.ninos > 0) partes.push(`${this.ninos} CHD`);
    if (this.infantes > 0) partes.push(`${this.infantes} INF`);
    return partes.join(' · ');
  }
}

export interface Habitacion {
  readonly acomodacion: Acomodacion;
  readonly ocupantes: number;
}

export interface DistribucionHabitaciones {
  readonly habitaciones: readonly Habitacion[];
  /** Cuántas plazas quedan pagadas y vacías. Hay que mostrarlo: el cliente las paga. */
  readonly plazasSinUsar: number;
}

/**
 * Reparte a los pasajeros en habitaciones de la acomodación elegida.
 *
 * Dos reglas del negocio que el cálculo tiene que respetar:
 *
 * 1. **Los infantes no cuentan** para las plazas: van con un adulto.
 * 2. **Las plazas sobrantes se pagan igual.** Tres personas en acomodación doble son dos
 *    habitaciones: una doble completa y otra con una plaza vacía que el cliente paga. Devolver
 *    ese dato es obligatorio — es la pregunta que el viajero hace siempre y el asesor tiene que
 *    poder responder sin calcular a mano.
 */
export function distribuirEnHabitaciones(
  composicion: ComposicionPasajeros,
  acomodacion: Acomodacion,
): DistribucionHabitaciones {
  const porHabitacion = personasPorHabitacion(acomodacion);
  const aAlojar = composicion.queOcupanPlaza;

  const cantidadHabitaciones = Math.ceil(aAlojar / porHabitacion);
  const plazasTotales = cantidadHabitaciones * porHabitacion;

  const habitaciones: Habitacion[] = [];
  let restantes = aAlojar;

  for (let i = 0; i < cantidadHabitaciones; i++) {
    const ocupantes = Math.min(restantes, porHabitacion);
    habitaciones.push({ acomodacion, ocupantes });
    restantes -= ocupantes;
  }

  return { habitaciones, plazasSinUsar: plazasTotales - aAlojar };
}

/**
 * Acomodaciones que permiten alojar a esta composición **sin plazas sobrantes**.
 *
 * Es lo que el cotizador ofrece primero al asesor: las opciones que no obligan al cliente a pagar
 * una cama vacía. Las demás siguen estando disponibles, pero con el costo extra a la vista.
 */
export function acomodacionesExactas(composicion: ComposicionPasajeros): Acomodacion[] {
  const aAlojar = composicion.queOcupanPlaza;
  return (Object.keys(ACOMODACIONES) as Acomodacion[]).filter(
    (acomodacion) => aAlojar % personasPorHabitacion(acomodacion) === 0,
  );
}
