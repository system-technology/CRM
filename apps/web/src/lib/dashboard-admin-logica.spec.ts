import { describe, expect, it } from 'vitest';
import type { FilaDeCobro, ResumenDeUnAsesor, VentasDeUnaMoneda } from '@viajapro/contracts';
import {
  barrasDelEmbudo,
  cobrosPorMoneda,
  compararVentasPorMoneda,
  destinosVendidos,
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

describe('filasDeAsesores (T-531, T-555: las cifras vienen en porAsesor)', () => {
  const ASESOR = (
    asesorId: string,
    aceptadas: number,
    enviadas: number,
    extra: Partial<ResumenDeUnAsesor> = {},
  ): ResumenDeUnAsesor => ({
    asesorId,
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
    },
    respuesta: {
      conversacionesNuevas: enviadas,
      conversacionesRespondidas: enviadas,
      promedioMinutos: 5,
      medianaMinutos: 4,
    },
    ...extra,
  });
  const miembro = (id: string, nombre: string, activo = true) => ({ id, nombre, activo });

  it('ordena por ventas cerradas (un número, no dinero)', () => {
    const filas = filasDeAsesores(
      [ASESOR('2', 2, 8), ASESOR('3', 5, 9)],
      [miembro('2', 'Ana'), miembro('3', 'Valentina')],
    );
    expect(filas.map((f) => f.nombre)).toEqual(['Valentina', 'Ana']);
  });

  it('completa con el equipo a quien porAsesor no trae: «sin actividad», no ausente', () => {
    const filas = filasDeAsesores(
      [ASESOR('2', 2, 8)],
      [miembro('2', 'Ana'), miembro('9', 'Luz'), miembro('8', 'Inactivo', false)],
    );
    expect(filas.map((f) => f.nombre)).toEqual(['Ana', 'Luz']);
    expect(filas.find((f) => f.id === '9')?.sinActividad).toBe(true);
    // El que ya no está activo y no tuvo nada no se lista.
    expect(filas.find((f) => f.id === '8')).toBeUndefined();
  });

  it('quien ya no está activo pero tuvo actividad sigue en la comparación', () => {
    const filas = filasDeAsesores([ASESOR('8', 3, 4)], [miembro('8', 'Inactivo', false)]);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.nombre).toBe('Inactivo');
    expect(filas[0]?.ventasCerradas).toBe(3);
  });

  it('un asesor de porAsesor que el equipo no conoce no se pierde ni se queda sin nombre', () => {
    const [f] = filasDeAsesores([ASESOR('77', 1, 1)], []);
    expect(f?.nombre).toBe('Asesor que ya no está en el equipo');
    expect(f?.ventasCerradas).toBe(1);
  });

  it('no recorta la lista: 15 asesores salen los 15 (ya no hay tope de 12)', () => {
    const ids = Array.from({ length: 15 }, (_, i) => String(i + 1));
    const filas = filasDeAsesores(
      ids.map((id) => ASESOR(id, 1, 2)),
      ids.map((id) => miembro(id, `Asesor ${id}`)),
    );
    expect(filas).toHaveLength(15);
  });

  it('la aceptación de un asesor con 8 enviadas es una fracción, no un porcentaje', () => {
    const [fila] = filasDeAsesores([ASESOR('1', 2, 8)], [miembro('1', 'Ana')]);
    expect(fila?.aceptacion.texto).toBe('2 de 8');
  });

  it('el dinero queda por moneda: una entrada por moneda, sin sumar', () => {
    const [fila] = filasDeAsesores(
      [
        ASESOR('1', 3, 4, {
          ventasPorMoneda: [
            { moneda: 'USD', cotizacionesAceptadas: 1, ventas: usd(250_000) },
            { moneda: 'COP', cotizacionesAceptadas: 2, ventas: cop(9_000_000) },
          ],
        }),
      ],
      [miembro('1', 'Ana')],
    );
    expect(fila?.ventas).toEqual([cop(9_000_000), usd(250_000)]);
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

  it('destinosVendidos: una fila por destino y moneda, agrupadas por destino y sin sumar monedas (R8)', () => {
    const d = destinosVendidos([
      { destino: 'Madrid', moneda: 'USD', cotizacionesAceptadas: 1, ventas: usd(600_000) },
      { destino: 'Cancún', moneda: 'USD', cotizacionesAceptadas: 1, ventas: usd(400_000) },
      { destino: 'Cancún', moneda: 'COP', cotizacionesAceptadas: 2, ventas: cop(18_000_000) },
    ]);
    // Ranking por cotizaciones aceptadas (un conteo): Cancún 3, Madrid 1.
    expect(d.map((x) => x.destino)).toEqual(['Cancún', 'Madrid']);
    expect(d[0]?.aceptadas).toBe(3);
    // Cada moneda en su fila, sin mezclar COP con USD.
    expect(d[0]?.monedas.map((m) => m.ventas)).toEqual([cop(18_000_000), usd(400_000)]);
    expect(d[1]?.monedas.map((m) => m.ventas)).toEqual([usd(600_000)]);
  });

  it('hoyEnZona usa la zona de la agencia (R9): las 02:00 UTC siguen siendo «ayer» en Bogotá', () => {
    expect(hoyEnZona(new Date('2026-11-22T02:00:00Z'), 'America/Bogota')).toBe('2026-11-21');
    expect(hoyEnZona(new Date('2026-11-22T02:00:00Z'), 'UTC')).toBe('2026-11-22');
  });
});
