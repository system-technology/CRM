import { describe, expect, it } from 'vitest';
import {
  type CondicionDeCobro,
  type Composicion,
  aplicaAlGrupo,
  esSuplemento,
  exigeComposicion,
  motivoNoAplica,
  totalDePasajeros,
  vecesQueSeCobra,
} from './seleccion-de-tarifas.js';

/** Un grupo homogéneo de adultos, que es el caso de casi todo el tarifario real. */
const soloAdultos = (n: number): Composicion => ({ adultos: n, ninos: 0, infantes: 0 });

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
    expect(vecesQueSeCobra(base, soloAdultos(1))).toBe(1);
    expect(vecesQueSeCobra(base, soloAdultos(4))).toBe(4);
  });

  it('no cobra nada a un grupo de cero', () => {
    expect(vecesQueSeCobra(base, soloAdultos(0))).toBeNull();
  });
});

describe('La tarifa de grupo', () => {
  it('aplica a dos personas y se cobra UNA vez', () => {
    expect(vecesQueSeCobra(promoPareja, soloAdultos(2))).toBe(1);
  });

  it('a cuatro personas se cobra dos veces', () => {
    expect(vecesQueSeCobra(promoPareja, soloAdultos(4))).toBe(2);
  });

  it('NO aplica a tres personas', () => {
    // Lo barato habría sido cobrar 1,5 o redondear a 2. Lo primero inventa un precio que la
    // agencia no publicó; lo segundo le cobra de más a alguien que no viaja. Se dice que no.
    expect(vecesQueSeCobra(promoPareja, soloAdultos(3))).toBeNull();
  });

  it('tampoco a una sola persona', () => {
    expect(vecesQueSeCobra(promoPareja, soloAdultos(1))).toBeNull();
  });

  it('un precio de grupo de 10 aplica a 20 y no a 15', () => {
    const grupo = con({ unidad: 'POR_GRUPO', cubrePasajeros: 10 });
    expect(vecesQueSeCobra(grupo, soloAdultos(20))).toBe(2);
    expect(vecesQueSeCobra(grupo, soloAdultos(15))).toBeNull();
  });

  it('una tarifa de grupo con cobertura inválida no se cobra, no revienta', () => {
    expect(
      vecesQueSeCobra(con({ unidad: 'POR_GRUPO', cubrePasajeros: 0 }), soloAdultos(4)),
    ).toBeNull();
  });
});

describe('El rango de pasajeros', () => {
  it('respeta el mínimo', () => {
    const desdeSeis = con({ pasajerosMinimo: 6 });
    expect(aplicaAlGrupo(desdeSeis, soloAdultos(5))).toBe(false);
    expect(aplicaAlGrupo(desdeSeis, soloAdultos(6))).toBe(true);
  });

  it('respeta el máximo', () => {
    const hastaCuatro = con({ pasajerosMaximo: 4 });
    expect(aplicaAlGrupo(hastaCuatro, soloAdultos(4))).toBe(true);
    expect(aplicaAlGrupo(hastaCuatro, soloAdultos(5))).toBe(false);
  });

  it('el rango manda también sobre la tarifa de grupo', () => {
    // Un múltiplo exacto que se sale del rango sigue sin aplicar: las dos condiciones se
    // comprueban, no una.
    const parejaHastaDos = { ...promoPareja, pasajerosMaximo: 2 };
    expect(vecesQueSeCobra(parejaHastaDos, soloAdultos(2))).toBe(1);
    expect(vecesQueSeCobra(parejaHastaDos, soloAdultos(4))).toBeNull();
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

// =============================================================================
// Lo que el dictamen de `experto-turismo` destapó el 2026-10-13
//
// La versión anterior preguntaba la composición de pasajeros y después la IGNORABA: para una
// tarifa `POR_PERSONA` devolvía el total del grupo, cualquiera que fuera su `tipoPasajero`.
// =============================================================================

const familia = { adultos: 2, ninos: 1, infantes: 0 };

describe('A quién se le cobra cada tarifa', () => {
  it('una tarifa de MENOR se cobra solo a los niños, no a toda la familia', () => {
    // Este es el defecto. Antes devolvía 3 —la familia entera— y como además era la más barata
    // salía marcada como recomendada: $280.000 x 3 = $840.000 cuando lo correcto son $1.058.000.
    // Con el margen del 20 % del ADR-0009, eso es vender por debajo del costo.
    expect(vecesQueSeCobra(con({ tipoPasajero: 'CHD' }), familia)).toBe(1);
  });

  it('una tarifa de ADULTO se cobra solo a los adultos', () => {
    expect(vecesQueSeCobra(con({ tipoPasajero: 'ADT' }), familia)).toBe(2);
  });

  it('una tarifa SIN tipo de pasajero se cobra a todos', () => {
    expect(vecesQueSeCobra(base, familia)).toBe(3);
  });

  it('una tarifa de infante no se cobra si no viaja ninguno', () => {
    // Devolver 0 habría metido una línea de cero pesos en la cotización; devolver el total del
    // grupo habría cobrado la tarifa de infante a los adultos.
    expect(vecesQueSeCobra(con({ tipoPasajero: 'INF' }), familia)).toBeNull();
  });

  it('la suma de las tres líneas cubre al grupo exactamente, ni de más ni de menos', () => {
    const grupo = { adultos: 2, ninos: 3, infantes: 1 };
    const adt = vecesQueSeCobra(con({ tipoPasajero: 'ADT' }), grupo) ?? 0;
    const chd = vecesQueSeCobra(con({ tipoPasajero: 'CHD' }), grupo) ?? 0;
    const inf = vecesQueSeCobra(con({ tipoPasajero: 'INF' }), grupo) ?? 0;
    expect(adt + chd + inf).toBe(totalDePasajeros(grupo));
  });
});

describe('Por qué NO aplica, dicho en voz alta', () => {
  // Coherencia con el propio ADR-0009: cuando dos vigencias empatan no se elige en silencio, se
  // devuelve el motivo. Una promo que desaparece sin explicación acaba aplicándose con la
  // calculadora del celular, y entonces el informe de margen nunca cuadra.
  it('la promo de pareja con tres personas dice que sobra una', () => {
    expect(motivoNoAplica(promoPareja, { adultos: 3, ninos: 0, infantes: 0 })).toMatch(/sobra 1/);
  });

  it('con cinco en promo de pareja sobra UNA, no dos', () => {
    // Me equivoqué al escribir esta prueba la primera vez: 5 entre 2 deja un resto de 1, no de 2.
    // La aritmética del plural también importa cuando el texto lo lee un asesor.
    expect(motivoNoAplica(promoPareja, { adultos: 5, ninos: 0, infantes: 0 })).toMatch(/sobra 1/);
  });

  it('el plural sale bien cuando sobran dos', () => {
    const trio = con({ unidad: 'POR_GRUPO', cubrePasajeros: 3 });
    expect(motivoNoAplica(trio, { adultos: 5, ninos: 0, infantes: 0 })).toMatch(/sobran 2/);
  });

  it('con una sola persona dice que aplica a grupos de 2', () => {
    expect(motivoNoAplica(promoPareja, { adultos: 1, ninos: 0, infantes: 0 })).toMatch(
      /grupos de 2/,
    );
  });

  it('un mínimo de pasajeros sin cumplir se explica con los dos números', () => {
    const motivo = motivoNoAplica(con({ pasajerosMinimo: 10 }), familia);
    expect(motivo).toMatch(/desde 10/);
    expect(motivo).toMatch(/van 3/);
  });

  it('cuando SÍ aplica no hay motivo', () => {
    expect(motivoNoAplica(base, familia)).toBeNull();
    expect(motivoNoAplica(promoPareja, { adultos: 2, ninos: 0, infantes: 0 })).toBeNull();
  });
});
