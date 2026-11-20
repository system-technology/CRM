import { describe, expect, it } from 'vitest';
import {
  agruparInclusiones,
  construirItinerario,
  descripcionSinDias,
  diasDelViaje,
  etiquetaDeTramo,
  grupoDeInclusion,
  leerDiasDeLaDescripcion,
  referenciaDePropuesta,
  sumarDias,
  textoDuracion,
  textoViajeros,
} from './propuesta-viajero-logica';

describe('propuesta al viajero — lógica de presentación', () => {
  it('suma días sin moverse de fecha por la zona horaria, también al cambiar de año', () => {
    expect(sumarDias('2026-12-29', 3)).toBe('2027-01-01');
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01');
    expect(sumarDias('2026-12-24', 0)).toBe('2026-12-24');
  });

  it('usa los días del producto y, sin producto, noches + 1', () => {
    expect(diasDelViaje(3, { dias: 4 })).toBe(4);
    expect(diasDelViaje(3, { dias: 3 })).toBe(3); // vuelo nocturno: 3 días / 3 noches
    expect(diasDelViaje(3, null)).toBe(4);
  });

  it('escribe viajeros y duración con plurales correctos', () => {
    expect(textoViajeros(2, 0, 0)).toBe('2 adultos');
    expect(textoViajeros(1, 1, 0)).toBe('1 adulto y 1 niño');
    expect(textoViajeros(2, 2, 1)).toBe('2 adultos, 2 niños y 1 infante');
    expect(textoDuracion(1, 0)).toBe('1 día y 0 noches');
    expect(textoDuracion(4, 3)).toBe('4 días y 3 noches');
  });

  it('agrupa las inclusiones por lo que el viajero busca, sin perder ninguna', () => {
    const inclusiones = [
      'Tiquetes aéreos Bogotá — San Andrés — Bogotá',
      'Traslados aeropuerto — hotel — aeropuerto',
      'Alojamiento 3 noches con todo incluido',
      'Tarjeta de turismo OCCRE',
      'Seguro de asistencia médica',
      '  ',
    ];
    const grupos = agruparInclusiones(inclusiones);
    expect(grupos.map((g) => g.grupo)).toEqual([
      'VUELOS',
      'ALOJAMIENTO',
      'TRASLADOS',
      'ASISTENCIA',
      'OTROS',
    ]);
    expect(grupos.flatMap((g) => g.items)).toHaveLength(5);
    expect(grupoDeInclusion('Traslado aeropuerto - hotel')).toBe('TRASLADOS');
    expect(grupoDeInclusion('Vuelo Avianca')).toBe('VUELOS');
  });

  it('lee las líneas «Día N» de la descripción y las quita del texto de introducción', () => {
    const descripcion =
      'Un viaje al Caribe.\nDía 1: Llegada y cóctel\ndia 2 - Tour a Johnny Cay\nDía 3. Regreso';
    const dias = leerDiasDeLaDescripcion(descripcion);
    expect([...dias.entries()]).toEqual([
      [1, 'Llegada y cóctel'],
      [2, 'Tour a Johnny Cay'],
      [3, 'Regreso'],
    ]);
    expect(descripcionSinDias(descripcion)).toBe('Un viaje al Caribe.');
    expect(leerDiasDeLaDescripcion(null).size).toBe(0);
  });

  it('sin días en la descripción, arma salida, estadía y regreso con fechas reales', () => {
    const it = construirItinerario({
      fechaSalida: '2026-12-24',
      dias: 4,
      destino: 'San Andrés',
      planAlimentacion: 'TODO_INCLUIDO',
      inclusiones: ['Tiquetes aéreos'],
      descripcion: 'Sin días.',
      opcionDeSalida: {
        etiqueta: 'Mañana',
        horaSalida: '06:00',
        horaRegreso: '18:30',
        puntoDeEncuentro: 'Aeropuerto El Dorado',
      },
    });
    expect(it.map((d) => [d.desde, d.hasta, d.fecha, d.tipo])).toEqual([
      [1, 1, '2026-12-24', 'SALIDA'],
      [2, 3, '2026-12-25', 'ESTADIA'],
      [4, 4, '2026-12-27', 'REGRESO'],
    ]);
    expect(it[0]?.titulo).toBe('Vuelo y llegada a San Andrés');
    expect(it[0]?.detalle).toEqual([
      'Salida a las 06:00',
      'Punto de encuentro: Aeropuerto El Dorado',
    ]);
    expect(it[1]?.detalle).toEqual(['Plan todo incluido']);
    expect(it[1]?.fechaHasta).toBe('2026-12-26');
    expect(it[2]?.titulo).toBe('Vuelo de regreso');
    expect(it[2]?.detalle).toEqual(['Regreso a las 18:30']);
    expect(etiquetaDeTramo(it[1]!)).toBe('Días 2 a 3');
  });

  it('sin vuelo incluido no promete vuelo; un pasadía es un solo tramo', () => {
    const dos = construirItinerario({
      fechaSalida: '2026-12-24',
      dias: 2,
      destino: 'Villa de Leyva',
    });
    expect(dos.map((d) => d.titulo)).toEqual(['Llegada a Villa de Leyva', 'Regreso']);
    const uno = construirItinerario({ fechaSalida: '2026-12-24', dias: 1, destino: 'Isla Palma' });
    expect(uno).toHaveLength(1);
    expect(uno[0]?.titulo).toBe('Día en Isla Palma');
  });

  it('con días en la descripción, un tramo por día y los que faltan como día libre', () => {
    const it = construirItinerario({
      fechaSalida: '2026-12-24',
      dias: 3,
      destino: 'Cartagena',
      descripcion: 'Día 1: City tour',
    });
    expect(it.map((d) => d.titulo)).toEqual(['City tour', 'Día libre', 'Regreso']);
  });

  it('la referencia es corta y lleva la versión', () => {
    expect(referenciaDePropuesta('01932000-0000-7000-8000-000000000077', 2)).toBe('000077-v2');
  });
});
