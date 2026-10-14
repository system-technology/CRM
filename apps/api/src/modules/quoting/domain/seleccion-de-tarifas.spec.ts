import { describe, expect, it } from 'vitest';
import {
  type CondicionDeCobro,
  aplicaAlGrupo,
  esSuplemento,
  exigeComposicion,
  vecesQueSeCobra,
} from './seleccion-de-tarifas.js';

/** Una tarifa sin condiciones: lo que lleva casi toda línea de un tarifario real. */
const base: CondicionDeCobro = {
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  aditiva: false,
  acomodacion: null,
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  pasajerosMinimo: null,
  pasajerosMaximo: null,
  ocupaSilla: null,
};

const con = (cambios: Partial<CondicionDeCobro>): CondicionDeCobro => ({ ...base, ...cambios });

/** La promo de pareja real de la hoja: «Parque Consotá, 11 de octubre, $280.000 la pareja». */
const promoPareja = con({ unidad: 'POR_GRUPO', cubrePasajeros: 2 });

describe('La tarifa por persona', () => {
  it('se cobra una vez por viajero', () => {
    expect(vecesQueSeCobra(base, 1)).toBe(1);
    expect(vecesQueSeCobra(base, 4)).toBe(4);
  });

  it('no cobra nada a un grupo de cero', () => {
    expect(vecesQueSeCobra(base, 0)).toBeNull();
  });
});

describe('La tarifa de grupo', () => {
  it('aplica a dos personas y se cobra UNA vez', () => {
    expect(vecesQueSeCobra(promoPareja, 2)).toBe(1);
  });

  it('a cuatro personas se cobra dos veces', () => {
    expect(vecesQueSeCobra(promoPareja, 4)).toBe(2);
  });

  it('NO aplica a tres personas', () => {
    // Lo barato habría sido cobrar 1,5 o redondear a 2. Lo primero inventa un precio que la
    // agencia no publicó; lo segundo le cobra de más a alguien que no viaja. Se dice que no.
    expect(vecesQueSeCobra(promoPareja, 3)).toBeNull();
  });

  it('tampoco a una sola persona', () => {
    expect(vecesQueSeCobra(promoPareja, 1)).toBeNull();
  });

  it('un precio de grupo de 10 aplica a 20 y no a 15', () => {
    const grupo = con({ unidad: 'POR_GRUPO', cubrePasajeros: 10 });
    expect(vecesQueSeCobra(grupo, 20)).toBe(2);
    expect(vecesQueSeCobra(grupo, 15)).toBeNull();
  });

  it('una tarifa de grupo con cobertura inválida no se cobra, no revienta', () => {
    expect(vecesQueSeCobra(con({ unidad: 'POR_GRUPO', cubrePasajeros: 0 }), 4)).toBeNull();
  });
});

describe('El rango de pasajeros', () => {
  it('respeta el mínimo', () => {
    const desdeSeis = con({ pasajerosMinimo: 6 });
    expect(aplicaAlGrupo(desdeSeis, 5)).toBe(false);
    expect(aplicaAlGrupo(desdeSeis, 6)).toBe(true);
  });

  it('respeta el máximo', () => {
    const hastaCuatro = con({ pasajerosMaximo: 4 });
    expect(aplicaAlGrupo(hastaCuatro, 4)).toBe(true);
    expect(aplicaAlGrupo(hastaCuatro, 5)).toBe(false);
  });

  it('el rango manda también sobre la tarifa de grupo', () => {
    // Un múltiplo exacto que se sale del rango sigue sin aplicar: las dos condiciones se
    // comprueban, no una.
    const parejaHastaDos = { ...promoPareja, pasajerosMaximo: 2 };
    expect(vecesQueSeCobra(parejaHastaDos, 2)).toBe(1);
    expect(vecesQueSeCobra(parejaHastaDos, 4)).toBeNull();
  });
});

describe('Qué pregunta el cotizador', () => {
  it('una tarifa sin condiciones NO pide la composición', () => {
    // Es el caso de la agencia de pasadías: 26 de los 47 productos de la hoja real no tienen
    // noche, así que no hay acomodación que preguntar.
    expect(exigeComposicion(base)).toBe(false);
  });

  it('la pide si hay acomodación', () => {
    expect(exigeComposicion(con({ acomodacion: 'DOBLE' }))).toBe(true);
  });

  it('la pide si hay tipo de pasajero o rango de edad', () => {
    expect(exigeComposicion(con({ tipoPasajero: 'CHD' }))).toBe(true);
    expect(exigeComposicion(con({ edadMinima: 2, edadMaxima: 11 }))).toBe(true);
  });

  it('la pide si importa que el infante ocupe silla', () => {
    expect(exigeComposicion(con({ ocupaSilla: false }))).toBe(true);
  });

  it('NO la pide solo por un rango de pasajeros', () => {
    // Para saber cuántos van basta un número; desglosarlo en adultos, niños e infantes sería
    // preguntar de más. Esta es la línea que separa «cuántos» de «quiénes».
    expect(exigeComposicion(con({ pasajerosMinimo: 6, pasajerosMaximo: 20 }))).toBe(false);
  });
});

describe('Los suplementos', () => {
  it('se reconocen por ser aditivos', () => {
    expect(esSuplemento(con({ aditiva: true }))).toBe(true);
    expect(esSuplemento(base)).toBe(false);
  });
});
