import { describe, expect, it } from 'vitest';
import type { FilaDeCobro, ResumenDeAgencia, VentasDeUnaMoneda } from '@viajapro/contracts';
import {
  barrasDelEmbudo,
  cobrosPorMoneda,
  compararVentasPorMoneda,
  destinosDeArchivosAbiertos,
  filasDeAsesores,
  hoyEnZona,
  presentarP90,
  presentarTasa,
  salidasProximas,
  textoDeDiasParaSalir,
  textoDeVariacion,
} from './dashboard-admin-logica';

const cop = (n: number) => ({ moneda: 'COP' as const, unidades: String(n) });
const usd = (n: number) => ({ moneda: 'USD' as const, unidades: String(n) });

describe('presentarTasa (ADR-0035 §5: el porcentaje solo con n ≥ 20)', () => {
  it('con 19 casos muestra la fracción, no el porcentaje', () => {
    const t = presentarTasa(7, 19, 36.8);
    expect(t.texto).toBe('7 de 19');
    expect(t.esPorcentaje).toBe(false);
  });
  it('con 20 casos muestra el porcentaje y conserva la fracción aparte', () => {
    const t = presentarTasa(7, 20, 35);
    expect(t.texto).toBe('35 %');
    expect(t.fraccion).toBe('7 de 20');
    expect(t.esPorcentaje).toBe(true);
  });
  it('sin casos no inventa 0 %', () => {
    expect(presentarTasa(0, 0, null).texto).toBe('Sin casos');
  });
  it('con 1 ganada y 0 perdidas no dice 100 %', () => {
    expect(presentarTasa(1, 1, 100).texto).toBe('1 de 1');
  });
});

describe('presentarP90', () => {
  it('no lo muestra con pocas respuestas', () => {
    expect(presentarP90(26, 12)).toContain('pocas');
    expect(presentarP90(26.5, 40)).toBe('26,5 min');
    expect(presentarP90(null, 40)).toBe('—');
  });
});

describe('compararVentasPorMoneda (R8: nunca mezcla monedas)', () => {
  const v = (moneda: 'COP' | 'USD', n: number, aceptadas = 1): VentasDeUnaMoneda => ({
    moneda,
    cotizacionesAceptadas: aceptadas,
    ventas: { moneda, unidades: String(n) },
  });

  it('una fila por moneda, con variación contra la misma moneda del periodo anterior', () => {
    const filas = compararVentasPorMoneda(
      [v('COP', 11_000_000, 3), v('USD', 500_000)],
      [v('COP', 10_000_000), v('USD', 1_000_000)],
    );
    const copFila = filas.find((f) => f.moneda === 'COP');
    const usdFila = filas.find((f) => f.moneda === 'USD');
    expect(copFila?.variacion).toBe(10);
    expect(usdFila?.variacion).toBe(-50);
    expect(filas.map((f) => f.moneda)).toEqual(['COP', 'USD']);
  });

  it('una moneda que vendió solo antes aparece en cero, no desaparece', () => {
    const filas = compararVentasPorMoneda(
      [v('COP', 5_000_000)],
      [v('COP', 5_000_000), v('USD', 100_000)],
    );
    const usdFila = filas.find((f) => f.moneda === 'USD');
    expect(usdFila?.ventas.unidades).toBe('0');
    expect(usdFila?.variacion).toBe(-100);
  });

  it('sin base (anterior en cero o sin periodo anterior) la variación es null, no infinito', () => {
    expect(compararVentasPorMoneda([v('COP', 5)], [v('COP', 0)])[0]?.variacion).toBeNull();
    expect(compararVentasPorMoneda([v('COP', 5)], null)[0]?.variacion).toBeNull();
    expect(textoDeVariacion(null)).toBe('Sin base para comparar');
  });

  it('el margen existe solo si la API envió la clave (no se deduce de un permiso)', () => {
    const sinClave = compararVentasPorMoneda([v('COP', 5)], null)[0];
    expect(sinClave?.tieneMargen).toBe(false);
    const conClave = compararVentasPorMoneda(
      [
        {
          ...v('COP', 5),
          neto: cop(3),
          margen: cop(2),
          margenPorcentaje: 40,
          cotizacionesSinNeto: 1,
        },
      ],
      null,
    )[0];
    expect(conClave?.tieneMargen).toBe(true);
    expect(conClave?.margen?.unidades).toBe('2');
    // `margen: null` con la clave presente = permiso sí, sin neto conocido (no es cero).
    const nulo = compararVentasPorMoneda([{ ...v('COP', 5), margen: null }], null)[0];
    expect(nulo?.tieneMargen).toBe(true);
    expect(nulo?.margen).toBeNull();
  });

  it('formatea la variación con signo y coma decimal', () => {
    expect(textoDeVariacion(12.5)).toBe('+12,5 %');
    expect(textoDeVariacion(-4.2)).toBe('−4,2 %');
    expect(textoDeVariacion(0)).toBe('Sin cambio');
  });
});

describe('barrasDelEmbudo', () => {
  it('ordena por etapa y escala contra la más poblada; una etapa vacía no dibuja barra', () => {
    const barras = barrasDelEmbudo([
      {
        etapaId: 'b',
        nombre: 'Cotizando',
        orden: 2,
        esGanada: false,
        esPerdida: false,
        cantidad: 5,
      },
      { etapaId: 'a', nombre: 'Nuevo', orden: 1, esGanada: false, esPerdida: false, cantidad: 10 },
      { etapaId: 'c', nombre: 'Ganada', orden: 3, esGanada: true, esPerdida: false, cantidad: 0 },
    ]);
    expect(barras.map((b) => b.nombre)).toEqual(['Nuevo', 'Cotizando', 'Ganada']);
    expect(barras.map((b) => b.anchoPorciento)).toEqual([100, 50, 0]);
  });
});

describe('filasDeAsesores', () => {
  const resumen = (
    aceptadas: number,
    enviadas: number,
    extra: Partial<ResumenDeAgencia> = {},
  ): ResumenDeAgencia => ({
    // T-513 dejó el contrato como unión discriminada: hay que elegir rama. Cada resumen por
    // asesor llega con alcance AGENCIA y `asesorId` = el filtro aplicado (ADR-0035 §4).
    alcance: 'AGENCIA',
    asesorId: null,
    periodo: { desde: '2026-11-01T05:00:00.000Z', hasta: '2026-11-21T05:00:00.000Z' },
    cotizaciones: {
      creadas: enviadas,
      enviadas,
      aceptadas,
      tasaAceptacion: enviadas ? (aceptadas / enviadas) * 100 : null,
    },
    ventasPorMoneda: [],
    oportunidades: {
      creadas: enviadas,
      ganadas: aceptadas,
      perdidas: 0,
      abiertas: 0,
      tasaConversion: null,
      porEtapa: [],
    },
    respuesta: {
      conversacionesNuevas: enviadas,
      conversacionesRespondidas: enviadas,
      promedioMinutos: 5,
      medianaMinutos: 4,
    },
    ...extra,
  });

  it('ordena por ventas cerradas (un número), deja al final al que no se pudo leer', () => {
    const filas = filasDeAsesores([
      { miembro: { id: '1', nombre: 'Beto' }, resumen: null },
      { miembro: { id: '2', nombre: 'Ana' }, resumen: resumen(2, 8) },
      { miembro: { id: '3', nombre: 'Valentina' }, resumen: resumen(5, 9) },
    ]);
    expect(filas.map((f) => f.nombre)).toEqual(['Valentina', 'Ana', 'Beto']);
    expect(filas[2]?.noDisponible).toBe(true);
  });

  it('distingue «sin actividad» de «No disponible»', () => {
    const [fila] = filasDeAsesores([
      { miembro: { id: '1', nombre: 'Luz' }, resumen: resumen(0, 0) },
    ]);
    expect(fila?.sinActividad).toBe(true);
    expect(fila?.noDisponible).toBe(false);
  });

  it('la aceptación de un asesor con 8 enviadas es una fracción, no un porcentaje', () => {
    const [fila] = filasDeAsesores([
      { miembro: { id: '1', nombre: 'Ana' }, resumen: resumen(2, 8) },
    ]);
    expect(fila?.aceptacion.texto).toBe('2 de 8');
  });
});

function fila(over: Partial<FilaDeCobro> & Pick<FilaDeCobro, 'numero' | 'destino'>): FilaDeCobro {
  return {
    archivoId: `01932000-0000-7000-8000-${String(over.numero).padStart(12, '0')}`,
    contactoId: '01932000-0000-7000-8000-000000000999',
    fechaSalida: '2026-12-05',
    total: cop(10_000_000),
    pagado: cop(4_000_000),
    saldo: cop(6_000_000),
    situacion: 'PARCIAL',
    estadoDeCobro: 'SALDO_PENDIENTE',
    fechaLimite: '2026-12-01',
    ...over,
  };
}

describe('cobros, salidas y destinos', () => {
  const datos: FilaDeCobro[] = [
    fila({ numero: 1, destino: 'Cancún', fechaSalida: '2026-11-26', estadoDeCobro: 'VENCIDO' }),
    fila({
      numero: 2,
      destino: 'cancún ',
      fechaSalida: '2026-12-30',
      total: cop(8_000_000),
      pagado: cop(8_000_000),
      saldo: cop(0),
      situacion: 'PAGADO',
      estadoDeCobro: 'AL_DIA',
    }),
    fila({
      numero: 3,
      destino: 'Madrid',
      fechaSalida: '2026-12-10',
      total: usd(600_000),
      pagado: usd(100_000),
      saldo: usd(500_000),
      estadoDeCobro: 'POR_VENCER',
    }),
    fila({ numero: 4, destino: 'Miami', fechaSalida: '2026-11-18' }),
  ];

  it('cobrosPorMoneda no mezcla COP con USD y separa lo vencido y lo por vencer', () => {
    const r = cobrosPorMoneda(datos);
    const c = r.find((m) => m.moneda === 'COP');
    const u = r.find((m) => m.moneda === 'USD');
    expect(c?.porCobrar.unidades).toBe('12000000');
    expect(c?.vencido.unidades).toBe('6000000');
    expect(c?.archivosVencidos).toBe(1);
    expect(u?.porCobrar.unidades).toBe('500000');
    expect(u?.porVencer.unidades).toBe('500000');
  });

  it('un saldo a favor no compensa deudas: no resta', () => {
    const r = cobrosPorMoneda([
      fila({ numero: 1, destino: 'X', saldo: cop(5), estadoDeCobro: 'SALDO_PENDIENTE' }),
      fila({ numero: 2, destino: 'X', saldo: cop(-3), situacion: 'SALDO_A_FAVOR' }),
    ]);
    expect(r[0]?.porCobrar.unidades).toBe('5');
  });

  it('salidasProximas: ventana de 30 días desde hoy, sin pasadas, la más cercana primero', () => {
    const s = salidasProximas(datos, '2026-11-21');
    expect(s.map((x) => x.numero)).toEqual([1, 3]);
    expect(s[0]?.diasParaSalir).toBe(5);
    expect(s[0]?.urgente).toBe(true); // con saldo y a ≤ 15 días
    expect(s[1]?.urgente).toBe(false); // 19 días: con saldo, pero aún no urgente
  });

  it('urgente solo con saldo y a 15 días o menos', () => {
    const s = salidasProximas(
      [
        fila({ numero: 5, destino: 'A', fechaSalida: '2026-12-06' }), // 15 días, con saldo
        fila({ numero: 6, destino: 'B', fechaSalida: '2026-12-07' }), // 16 días, con saldo
        fila({
          numero: 7,
          destino: 'C',
          fechaSalida: '2026-11-23',
          saldo: cop(0),
          pagado: cop(10_000_000),
        }),
      ],
      '2026-11-21',
    );
    expect(s.map((x) => [x.numero, x.urgente])).toEqual([
      [7, false],
      [5, true],
      [6, false],
    ]);
  });

  it('el día de salida cuenta como hoy, y el día 30 ya queda fuera', () => {
    const s = salidasProximas(
      [
        fila({ numero: 1, destino: 'A', fechaSalida: '2026-11-21' }),
        fila({ numero: 2, destino: 'B', fechaSalida: '2026-12-20' }),
        fila({ numero: 3, destino: 'C', fechaSalida: '2026-12-21' }),
      ],
      '2026-11-21',
    );
    expect(s.map((x) => x.numero)).toEqual([1, 2]);
    expect(textoDeDiasParaSalir(0)).toBe('Sale hoy');
    expect(textoDeDiasParaSalir(1)).toBe('Sale mañana');
    expect(textoDeDiasParaSalir(9)).toBe('Sale en 9 días');
  });

  it('destinos: agrupa sin distinguir mayúsculas ni espacios y separa monedas', () => {
    const d = destinosDeArchivosAbiertos(datos);
    expect(d[0]?.destino).toBe('Cancún');
    expect(d[0]?.archivos).toBe(2);
    expect(d[0]?.vendido).toEqual([cop(18_000_000)]);
    const madrid = d.find((x) => x.destino === 'Madrid');
    expect(madrid?.vendido).toEqual([usd(600_000)]);
  });

  it('hoyEnZona usa la zona de la agencia (R9): las 02:00 UTC siguen siendo «ayer» en Bogotá', () => {
    expect(hoyEnZona(new Date('2026-11-22T02:00:00Z'), 'America/Bogota')).toBe('2026-11-21');
    expect(hoyEnZona(new Date('2026-11-22T02:00:00Z'), 'UTC')).toBe('2026-11-22');
  });
});
