import { describe, expect, it } from 'vitest';
import {
  FechaInvalidaError,
  SinVigenciaError,
  VigenciasEmpatadasError,
  cubre,
  esSalidaProgramada,
  longitudEnDias,
  resolverVigencia,
} from './resolucion-de-tarifa.js';

/** Una ventana con nombre, para que el fallo de una prueba diga cuál ganó. */
const v = (nombre: string, desde: string, hasta: string, publicada = false) => ({
  nombre,
  desde,
  hasta,
  publicada,
});

/** Una salida publicada: la ventana de un solo día. */
const salida = (nombre: string, fecha: string) => v(nombre, fecha, fecha, true);

describe('Las dos formas de vender pasan por la misma función', () => {
  it('resuelve una salida publicada, como la agencia que publica fechas', () => {
    const vigencias = [salida('sábado 3', '2026-10-03'), salida('sábado 10', '2026-10-10')];
    expect(resolverVigencia(vigencias, '2026-10-10').nombre).toBe('sábado 10');
  });

  it('resuelve un rango, como la agencia que cotiza contra fecha elegida', () => {
    const vigencias = [v('temporada baja', '2026-02-01', '2026-05-31')];
    expect(resolverVigencia(vigencias, '2026-03-15').nombre).toBe('temporada baja');
  });

  it('y resuelve a la misma agencia haciendo las dos cosas a la vez', () => {
    // Este es el caso que obligó a unificar: la salida de la semana de receso convive con la
    // vigencia general del semestre. Antes habrían sido dos modelos.
    const vigencias = [
      v('segundo semestre', '2026-07-01', '2026-12-31'),
      salida('semana de receso', '2026-10-10'),
    ];
    expect(resolverVigencia(vigencias, '2026-10-10').nombre).toBe('semana de receso');
    expect(resolverVigencia(vigencias, '2026-10-11').nombre).toBe('segundo semestre');
  });
});

describe('Lo más específico gana', () => {
  it('la salida publicada vence al rango que la contiene', () => {
    const vigencias = [v('anual', '2026-01-01', '2026-12-31'), salida('puente', '2026-10-12')];
    expect(resolverVigencia(vigencias, '2026-10-12').nombre).toBe('puente');
  });

  it('entre dos rangos solapados gana el más corto', () => {
    const vigencias = [
      v('temporada alta', '2026-12-01', '2027-01-15'),
      v('promo fin de año', '2026-12-26', '2026-12-31'),
    ];
    expect(resolverVigencia(vigencias, '2026-12-28').nombre).toBe('promo fin de año');
    expect(resolverVigencia(vigencias, '2026-12-20').nombre).toBe('temporada alta');
  });

  it('una ventana SIN publicar de un día no gana por ser corta: gana por serlo', () => {
    // Que no esté publicada no la hace menos específica; solo significa que el cliente no la ve
    // como fecha ofrecida. Sigue siendo un día frente a un mes.
    const vigencias = [
      v('octubre', '2026-10-01', '2026-10-31'),
      v('ajuste', '2026-10-09', '2026-10-09'),
    ];
    expect(resolverVigencia(vigencias, '2026-10-09').nombre).toBe('ajuste');
  });

  it('no se deja engañar por el orden en que llegan', () => {
    const corta = v('corta', '2026-10-05', '2026-10-06');
    const larga = v('larga', '2026-10-01', '2026-10-31');
    expect(resolverVigencia([corta, larga], '2026-10-05').nombre).toBe('corta');
    expect(resolverVigencia([larga, corta], '2026-10-05').nombre).toBe('corta');
  });
});

describe('Cuando el tarifario está mal cargado, se dice', () => {
  it('dos rangos igual de largos sobre la misma fecha son un ERROR, no una elección', () => {
    // Lo barato habría sido quedarse con el primero. Eso haría que el precio dependiera del orden
    // de inserción en la base, que es la clase de defecto que nadie encuentra nunca.
    const vigencias = [
      v('promo A', '2026-10-05', '2026-10-09'),
      v('promo B', '2026-10-07', '2026-10-11'),
    ];
    expect(() => resolverVigencia(vigencias, '2026-10-08')).toThrow(VigenciasEmpatadasError);
  });

  it('el error nombra las ventanas empatadas para poder arreglarlo', () => {
    const vigencias = [
      v('promo A', '2026-10-05', '2026-10-09'),
      v('promo B', '2026-10-07', '2026-10-11'),
    ];
    expect(() => resolverVigencia(vigencias, '2026-10-08')).toThrow(/2026-10-05\.\.2026-10-09/);
  });

  it('pero si una de las dos es salida publicada, no hay empate', () => {
    const vigencias = [v('promo', '2026-10-08', '2026-10-08'), salida('oficial', '2026-10-08')];
    expect(resolverVigencia(vigencias, '2026-10-08').nombre).toBe('oficial');
  });

  it('una fecha sin cobertura se dice, no se inventa el precio más cercano', () => {
    const vigencias = [salida('sábado 3', '2026-10-03')];
    expect(() => resolverVigencia(vigencias, '2026-10-04')).toThrow(SinVigenciaError);
  });

  it('un catálogo vacío tampoco cotiza', () => {
    expect(() => resolverVigencia([], '2026-10-04')).toThrow(SinVigenciaError);
  });
});

describe('Las fechas', () => {
  it('cubre ambos extremos', () => {
    const ventana = v('x', '2026-10-05', '2026-10-09');
    expect(cubre(ventana, '2026-10-05')).toBe(true);
    expect(cubre(ventana, '2026-10-09')).toBe(true);
    expect(cubre(ventana, '2026-10-04')).toBe(false);
    expect(cubre(ventana, '2026-10-10')).toBe(false);
  });

  it('un solo día mide 1, no 0', () => {
    expect(longitudEnDias(v('x', '2026-10-05', '2026-10-05'))).toBe(1);
    expect(longitudEnDias(v('x', '2026-10-05', '2026-10-06'))).toBe(2);
  });

  it('cuenta bien a través de un cambio de mes y de año', () => {
    expect(longitudEnDias(v('x', '2026-12-26', '2027-01-15'))).toBe(21);
  });

  it('rechaza un día que no existe en vez de correrlo al mes siguiente', () => {
    // `Date.UTC` acepta el 31 de febrero y lo mueve a marzo sin avisar. Un tarifario con esa
    // fecha tiene un error de captura y vale más devolverlo que cotizar contra otro día.
    expect(() => resolverVigencia([v('x', '2026-02-01', '2026-02-28')], '2026-02-31')).toThrow(
      FechaInvalidaError,
    );
  });

  it('rechaza algo que no tiene forma de fecha', () => {
    expect(() => resolverVigencia([], 'mañana')).toThrow(FechaInvalidaError);
  });

  it('reconoce la salida programada por lo que es', () => {
    expect(esSalidaProgramada(salida('s', '2026-10-03'))).toBe(true);
    expect(esSalidaProgramada(v('un día sin publicar', '2026-10-03', '2026-10-03'))).toBe(false);
    expect(esSalidaProgramada(v('rango', '2026-10-03', '2026-10-04', true))).toBe(false);
  });
});
