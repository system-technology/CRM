import { describe, expect, it } from 'vitest';
import {
  componerViaje,
  cotizacionVigente,
  describirSalida,
  describirVencimiento,
  diaEnZona,
  enlaceParaCotizar,
  enteroDeUrl,
  fechaDeSalidaTexto,
  lineaDeViaje,
  mesDeSalida,
  nombreCortoDeDestino,
  paquetePorDestino,
  pasajerosCorto,
  pasajerosEnLetras,
  plazoMasProximo,
} from './viaje-solicitado-logica';

// 20 nov 2026, 12:00 en Bogotá (UTC-5).
const AHORA = Date.parse('2026-11-20T17:00:00.000Z');

describe('nombreCortoDeDestino', () => {
  it('«ciudad, país» se queda con la ciudad', () => {
    expect(nombreCortoDeDestino('Cancún, México')).toBe('Cancún');
    expect(nombreCortoDeDestino('San Andrés Islas, Colombia')).toBe('San Andrés Islas');
  });
  it('una lista de ciudades se deja entera', () => {
    expect(nombreCortoDeDestino('Madrid, París, Roma')).toBe('Madrid, París, Roma');
  });
  it('vacío o nulo es null', () => {
    expect(nombreCortoDeDestino('  ')).toBeNull();
    expect(nombreCortoDeDestino(null)).toBeNull();
  });
});

describe('mesDeSalida y fechaDeSalidaTexto', () => {
  it('el año en curso va sin año; otro año lo lleva', () => {
    expect(mesDeSalida('2026-12-15', AHORA)).toBe('dic');
    expect(mesDeSalida('2027-01-10', AHORA)).toBe('ene 2027');
  });
  it('no inventa un mes con una fecha inválida', () => {
    expect(mesDeSalida('2026-13-01', AHORA)).toBeNull();
    expect(mesDeSalida(null, AHORA)).toBeNull();
  });
  it('la fecha completa lleva siempre el año', () => {
    expect(fechaDeSalidaTexto('2026-12-05')).toBe('5 dic 2026');
  });
});

describe('pasajeros', () => {
  it('forma corta: ADT+CHD+INF, con infantes solo si hay', () => {
    expect(pasajerosCorto({ adultos: 2, ninos: 2, infantes: 0 })).toBe('2+2');
    expect(pasajerosCorto({ adultos: 2, ninos: 1, infantes: 1 })).toBe('2+1+1');
    expect(pasajerosCorto({ adultos: 2, ninos: 0, infantes: 1 })).toBe('2+0+1');
    expect(pasajerosCorto({ adultos: 3, ninos: 0, infantes: 0 })).toBe('3');
    expect(pasajerosCorto({ adultos: 0, ninos: 0, infantes: 0 })).toBeNull();
    expect(pasajerosCorto(null)).toBeNull();
  });
  it('en letras: plurales correctos y sin grupos en cero', () => {
    expect(pasajerosEnLetras({ adultos: 1, ninos: 1, infantes: 1 })).toBe(
      '1 adulto · 1 niño · 1 infante',
    );
    expect(pasajerosEnLetras({ adultos: 2, ninos: 2, infantes: 0 })).toBe('2 adultos · 2 niños');
    expect(pasajerosEnLetras({ adultos: 2, ninos: 0, infantes: 2 })).toBe('2 adultos · 2 infantes');
  });
});

describe('lineaDeViaje', () => {
  it('compone «destino · mes · pasajeros»', () => {
    expect(
      lineaDeViaje(
        {
          destino: 'Cancún, México',
          fechaSalida: '2026-12-15',
          pasajeros: { adultos: 2, ninos: 2, infantes: 0 },
        },
        AHORA,
      ),
    ).toBe('Cancún · dic · 2+2');
  });
  it('omite lo que no se sabe y devuelve null si no se sabe nada', () => {
    expect(lineaDeViaje({ destino: 'Cartagena', fechaSalida: null, pasajeros: null }, AHORA)).toBe(
      'Cartagena',
    );
    expect(lineaDeViaje({ destino: null, fechaSalida: '2027-01-15', pasajeros: null }, AHORA)).toBe(
      'ene 2027',
    );
    expect(lineaDeViaje({ destino: null, fechaSalida: null, pasajeros: null }, AHORA)).toBeNull();
  });
});

describe('plazos', () => {
  it('cuenta días de calendario en la zona de la agencia, no en UTC', () => {
    // 21 nov 02:00 UTC es todavía 20 nov 21:00 en Bogotá: el plazo es «hoy».
    expect(diaEnZona(Date.parse('2026-11-21T02:00:00.000Z'))).toBe('2026-11-20');
    expect(describirVencimiento('2026-11-21T02:00:00.000Z', AHORA)).toMatchObject({
      cuando: 'hoy',
      nivel: 'hoy',
    });
  });
  it('niveles: vencido y hoy en rojo, 1 a 3 días en ámbar, el resto neutro', () => {
    expect(describirVencimiento('2026-11-19', AHORA)).toMatchObject({
      cuando: 'ayer',
      nivel: 'vencido',
    });
    expect(describirVencimiento('2026-11-17', AHORA)).toMatchObject({
      cuando: 'hace 3 días',
      nivel: 'vencido',
    });
    expect(describirVencimiento('2026-11-21', AHORA)).toMatchObject({
      cuando: 'mañana',
      nivel: 'proximo',
    });
    expect(describirVencimiento('2026-11-23', AHORA)).toMatchObject({
      cuando: 'en 3 días',
      nivel: 'proximo',
    });
    expect(describirVencimiento('2026-11-25', AHORA)).toMatchObject({
      cuando: 'en 5 días',
      nivel: 'normal',
    });
  });
  it('elige el plazo que vence primero y lo vencido va antes que lo futuro', () => {
    const p = plazoMasProximo(
      [
        { etiqueta: 'Cotización vence', cuando: '2026-11-24' },
        { etiqueta: 'Time limit', cuando: '2026-11-21T14:00:00.000Z' },
        { etiqueta: 'Otro', cuando: null },
      ],
      AHORA,
    );
    expect(p).toEqual({ etiqueta: 'Time limit', cuando: 'mañana', nivel: 'proximo' });
    expect(
      plazoMasProximo(
        [
          { etiqueta: 'Time limit', cuando: '2026-12-01' },
          { etiqueta: 'Cotización vence', cuando: '2026-11-18' },
        ],
        AHORA,
      )?.etiqueta,
    ).toBe('Cotización vence');
  });
  it('sin candidatos, no hay plazo', () => {
    expect(plazoMasProximo([], AHORA)).toBeNull();
    expect(plazoMasProximo([{ etiqueta: 'x', cuando: 'no-es-fecha' }], AHORA)).toBeNull();
  });
});

describe('componerViaje', () => {
  const oportunidad = {
    id: 'op-1',
    destino: 'Cancún, México',
    fechaSalida: '2026-12-15',
    paqueteId: null,
  };
  const cotizacion = {
    id: 'cot-1',
    titulo: 'Cancún 5 noches',
    version: 2,
    venta: { unidades: '12500000', moneda: 'COP' as const },
    vigenteHasta: '2026-11-23',
    estado: 'ENVIADA' as const,
    pasajeros: { adultos: 2, ninos: 2, infantes: 0 },
  };

  it('oportunidad + cotización: destino y fecha de la oportunidad, pasajeros y plazo de la cotización', () => {
    const v = componerViaje({ oportunidad, cotizacion, ahora: AHORA });
    expect(v.destino).toBe('Cancún, México');
    expect(v.fechaSalida).toBe('2026-12-15');
    expect(v.pasajeros).toEqual({ adultos: 2, ninos: 2, infantes: 0 });
    expect(v.plazo).toEqual({
      etiqueta: 'Cotización vence',
      cuando: 'en 3 días',
      nivel: 'proximo',
    });
    expect(v.cotizacion?.version).toBe(2);
    expect(v.archivo).toBeNull();
    expect(v.oportunidadId).toBe('op-1');
  });

  it('con archivo, manda el archivo: destino, fecha, pasajeros y time limit', () => {
    const v = componerViaje({
      oportunidad,
      cotizacion,
      archivo: {
        id: 'ar-1',
        numero: 1043,
        oportunidadId: null,
        destino: 'San Andrés Islas, Colombia',
        fechaSalida: '2026-12-20',
        adultos: 2,
        ninos: 1,
        infantes: 0,
        proximoPlazo: '2026-11-20T22:00:00.000Z',
      },
      ahora: AHORA,
    });
    expect(v.destino).toBe('San Andrés Islas, Colombia');
    expect(v.fechaSalida).toBe('2026-12-20');
    expect(v.pasajeros).toEqual({ adultos: 2, ninos: 1, infantes: 0 });
    expect(v.plazo).toEqual({ etiqueta: 'Time limit', cuando: 'hoy', nivel: 'hoy' });
    expect(v.archivo).toEqual({ id: 'ar-1', numero: 1043 });
  });

  it('una cotización aceptada o vencida no aporta plazo', () => {
    expect(
      componerViaje({
        oportunidad,
        cotizacion: { ...cotizacion, estado: 'ACEPTADA' },
        ahora: AHORA,
      }).plazo,
    ).toBeNull();
  });

  it('sin nada, todo es null (no inventa datos)', () => {
    expect(componerViaje({ ahora: AHORA })).toEqual({
      destino: null,
      fechaSalida: null,
      pasajeros: null,
      plazo: null,
      cotizacion: null,
      archivo: null,
      oportunidadId: null,
      paqueteId: null,
    });
  });

  it('la cotización vigente es la más reciente que no está rechazada ni vencida', () => {
    const filas = [
      { id: 'a', estado: 'VENCIDA' as const },
      { id: 'b', estado: 'ENVIADA' as const },
      { id: 'c', estado: 'BORRADOR' as const },
    ];
    expect(cotizacionVigente(filas)?.id).toBe('b');
    expect(cotizacionVigente([{ id: 'x', estado: 'RECHAZADA' as const }])).toBeNull();
  });
});

describe('describirSalida (pipeline)', () => {
  it('sin fecha dice «sin fecha»', () => {
    expect(describirSalida(null, true, AHORA)).toMatchObject({
      texto: 'sin fecha',
      nivel: 'sin-fecha',
    });
  });
  it('abierta: pasada en rojo, hoy en rojo, 7 días o menos en ámbar, lo demás neutro', () => {
    expect(describirSalida('2026-11-10', true, AHORA).nivel).toBe('vencido');
    expect(describirSalida('2026-11-20', true, AHORA).nivel).toBe('hoy');
    expect(describirSalida('2026-11-27', true, AHORA).nivel).toBe('proximo');
    expect(describirSalida('2026-12-15', true, AHORA)).toMatchObject({
      texto: '15 dic 2026',
      nivel: 'normal',
    });
  });
  it('una oportunidad cerrada nunca se pinta como vencida', () => {
    expect(describirSalida('2026-11-10', false, AHORA).nivel).toBe('normal');
  });
});

describe('enlaceParaCotizar', () => {
  it('lleva contacto, conversación, oportunidad, destino, fecha y pasajeros', () => {
    const href = enlaceParaCotizar({
      contactoId: 'c1',
      conversacionId: 'v1',
      oportunidadId: 'o1',
      destino: 'Cancún, México',
      fechaSalida: '2026-12-15',
      pasajeros: { adultos: 2, ninos: 2, infantes: 0 },
    });
    const url = new URL(href, 'http://x');
    expect(url.pathname).toBe('/cotizador');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      contactoId: 'c1',
      conversacion: 'v1',
      oportunidadId: 'o1',
      destino: 'Cancún, México',
      fecha: '2026-12-15',
      adultos: '2',
      ninos: '2',
    });
  });
  it('con paquete elegido manda el paquete y no el destino', () => {
    const url = new URL(
      enlaceParaCotizar({ contactoId: 'c1', paqueteId: 'p1', destino: 'Cancún' }),
      'http://x',
    );
    expect(url.searchParams.get('paqueteId')).toBe('p1');
    expect(url.searchParams.has('destino')).toBe(false);
  });
  it('sin datos del viaje, solo el contacto', () => {
    expect(enlaceParaCotizar({ contactoId: 'c1' })).toBe('/cotizador?contactoId=c1');
  });
});

describe('lectura de parámetros del cotizador', () => {
  it('enteroDeUrl acepta solo enteros dentro del rango', () => {
    expect(enteroDeUrl('2', 1, 200)).toBe(2);
    expect(enteroDeUrl('0', 1, 200)).toBeNull();
    expect(enteroDeUrl('-1', 0, 200)).toBeNull();
    expect(enteroDeUrl('2.5', 0, 200)).toBeNull();
    expect(enteroDeUrl('abc', 0, 200)).toBeNull();
    expect(enteroDeUrl('999', 0, 200)).toBeNull();
    expect(enteroDeUrl(null, 0, 200)).toBeNull();
  });
  it('paquetePorDestino ignora tildes, mayúsculas y el país', () => {
    const paquetes = [
      { id: 'sa', destino: 'San Andrés' },
      { id: 'cn', destino: 'Cancún' },
    ];
    expect(paquetePorDestino(paquetes, 'CANCUN, México')?.id).toBe('cn');
    expect(paquetePorDestino(paquetes, 'San Andrés Islas, Colombia')?.id).toBe('sa');
    expect(paquetePorDestino(paquetes, 'Curazao')).toBeNull();
    expect(paquetePorDestino(paquetes, null)).toBeNull();
  });
});
