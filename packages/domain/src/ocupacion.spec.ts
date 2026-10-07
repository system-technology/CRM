import { describe, expect, it } from 'vitest';
import {
  acomodacionesExactas,
  ComposicionInvalidaError,
  ComposicionPasajeros,
  distribuirEnHabitaciones,
  personasPorHabitacion,
} from './ocupacion.js';

describe('ComposicionPasajeros', () => {
  it('acepta una familia típica', () => {
    const familia = ComposicionPasajeros.crear({ adultos: 2, ninos: 2 });
    expect(familia.total).toBe(4);
    expect(familia.toString()).toBe('2 ADT · 2 CHD');
  });

  it('exige al menos un adulto: un menor no viaja sin acompañante responsable', () => {
    expect(() => ComposicionPasajeros.crear({ adultos: 0, ninos: 2 })).toThrow(
      ComposicionInvalidaError,
    );
  });

  it('no admite más infantes que adultos: un infante viaja en brazos', () => {
    expect(() => ComposicionPasajeros.crear({ adultos: 1, infantes: 2 })).toThrow(
      ComposicionInvalidaError,
    );
    expect(() => ComposicionPasajeros.crear({ adultos: 2, infantes: 2 })).not.toThrow();
  });

  it('los infantes NO ocupan plaza de alojamiento, pero sí cuentan como viajeros', () => {
    const conBebe = ComposicionPasajeros.crear({ adultos: 2, infantes: 1 });
    expect(conBebe.queOcupanPlaza).toBe(2);
    expect(conBebe.total).toBe(3);
  });

  it('rechaza cantidades fraccionarias o negativas', () => {
    expect(() => ComposicionPasajeros.crear({ adultos: 2.5 })).toThrow(ComposicionInvalidaError);
    expect(() => ComposicionPasajeros.crear({ adultos: 2, ninos: -1 })).toThrow(
      ComposicionInvalidaError,
    );
  });
});

describe('distribuirEnHabitaciones', () => {
  it('cuatro personas en cuádruple caben en una habitación', () => {
    const familia = ComposicionPasajeros.crear({ adultos: 2, ninos: 2 });
    const r = distribuirEnHabitaciones(familia, 'CUADRUPLE');
    expect(r.habitaciones).toHaveLength(1);
    expect(r.plazasSinUsar).toBe(0);
  });

  it('las mismas cuatro personas en doble necesitan dos habitaciones', () => {
    const familia = ComposicionPasajeros.crear({ adultos: 2, ninos: 2 });
    const r = distribuirEnHabitaciones(familia, 'DOBLE');
    expect(r.habitaciones).toHaveLength(2);
    expect(r.plazasSinUsar).toBe(0);
  });

  it('avisa de la plaza vacía que el cliente paga igual', () => {
    // Tres personas en acomodación doble: dos habitaciones, una cama de más.
    // Es la pregunta que el viajero hace siempre; el asesor tiene que poder responderla.
    const tres = ComposicionPasajeros.crear({ adultos: 3 });
    const r = distribuirEnHabitaciones(tres, 'DOBLE');
    expect(r.habitaciones).toHaveLength(2);
    expect(r.habitaciones[0]?.ocupantes).toBe(2);
    expect(r.habitaciones[1]?.ocupantes).toBe(1);
    expect(r.plazasSinUsar).toBe(1);
  });

  it('el infante no añade habitación', () => {
    const pareja = ComposicionPasajeros.crear({ adultos: 2, infantes: 1 });
    const r = distribuirEnHabitaciones(pareja, 'DOBLE');
    expect(r.habitaciones).toHaveLength(1);
    expect(r.plazasSinUsar).toBe(0);
  });

  it('una persona sola en sencilla no deja plazas vacías', () => {
    const solo = ComposicionPasajeros.crear({ adultos: 1 });
    const r = distribuirEnHabitaciones(solo, 'SENCILLA');
    expect(r.habitaciones).toHaveLength(1);
    expect(r.plazasSinUsar).toBe(0);
  });

  it('cada acomodación declara cuántos caben por habitación', () => {
    expect(personasPorHabitacion('SENCILLA')).toBe(1);
    expect(personasPorHabitacion('DOBLE')).toBe(2);
    expect(personasPorHabitacion('TRIPLE')).toBe(3);
    expect(personasPorHabitacion('CUADRUPLE')).toBe(4);
  });
});

describe('acomodacionesExactas', () => {
  it('para cuatro personas: sencilla, doble y cuádruple encajan; triple no', () => {
    const familia = ComposicionPasajeros.crear({ adultos: 2, ninos: 2 });
    expect(acomodacionesExactas(familia)).toEqual(['SENCILLA', 'DOBLE', 'CUADRUPLE']);
  });

  it('para tres personas: sencilla y triple', () => {
    const tres = ComposicionPasajeros.crear({ adultos: 3 });
    expect(acomodacionesExactas(tres)).toEqual(['SENCILLA', 'TRIPLE']);
  });

  it('la sencilla siempre encaja, aunque casi nunca sea la más barata', () => {
    for (const adultos of [1, 2, 3, 4, 5, 7]) {
      expect(acomodacionesExactas(ComposicionPasajeros.crear({ adultos }))).toContain('SENCILLA');
    }
  });
});
