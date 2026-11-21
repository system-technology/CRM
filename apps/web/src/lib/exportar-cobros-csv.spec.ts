import { describe, expect, it } from 'vitest';
import type { FilaDeCobro } from '@viajapro/contracts';
import { BOM_UTF8, escaparCeldaCSV, exportarCobrosCSV } from './exportar-csv';

/** Una fila del contrato. Los importes van en la unidad mínima: COP = pesos, USD = centavos (R8). */
function fila(parcial: Partial<FilaDeCobro> = {}): FilaDeCobro {
  return {
    archivoId: '00000000-0030-4000-8000-000000000001',
    numero: 1043,
    contactoId: '00000000-0020-4000-8000-000000000001',
    destino: 'Cancún',
    fechaSalida: '2026-12-10',
    total: { unidades: '6200000', moneda: 'COP' },
    pagado: { unidades: '3500000', moneda: 'COP' },
    saldo: { unidades: '2700000', moneda: 'COP' },
    situacion: 'PARCIAL',
    estadoDeCobro: 'POR_VENCER',
    fechaLimite: '2026-11-30',
    ...parcial,
  };
}

const lineas = (csv: string): string[] => csv.replace(BOM_UTF8, '').split('\r\n');
const celdas = (linea: string): string[] => linea.split(';');

describe('escaparCeldaCSV: un número no es una fórmula', () => {
  it('un saldo a favor (negativo) sale como número, no como texto con apóstrofo', () => {
    expect(escaparCeldaCSV(-500000)).toBe('-500000');
    expect(escaparCeldaCSV(-12n)).toBe('-12');
  });

  it('un texto que parece fórmula SÍ se neutraliza', () => {
    expect(escaparCeldaCSV('-2+3*cmd')).toBe("'-2+3*cmd");
    expect(escaparCeldaCSV('=1+1')).toBe("'=1+1");
  });
});

describe('exportarCobrosCSV (T-335)', () => {
  it('trae lo que el usuario ve: una línea por fila, en el mismo orden, con BOM y ";"', () => {
    const csv = exportarCobrosCSV([
      fila({ numero: 1043 }),
      fila({ numero: 1044, destino: 'Madrid' }),
    ]);
    expect(csv.startsWith(BOM_UTF8)).toBe(true);
    const l = lineas(csv);
    expect(l).toHaveLength(3);
    expect(celdas(l[1]!)[0]).toBe('1043');
    expect(celdas(l[2]!)[0]).toBe('1044');
  });

  it('COP: el importe es el peso entero; USD: dólares con coma decimal, no centavos (R8)', () => {
    const cop = lineas(exportarCobrosCSV([fila()]))[1]!;
    expect(cop).toContain(';COP;6200000;3500000;2700000;');
    const usd = lineas(
      exportarCobrosCSV([
        fila({
          total: { unidades: '61200', moneda: 'USD' },
          pagado: { unidades: '20000', moneda: 'USD' },
          saldo: { unidades: '41200', moneda: 'USD' },
        }),
      ]),
    )[1]!;
    expect(usd).toContain(';USD;612,00;200,00;412,00;');
  });

  it('saldo a favor: queda negativo y numérico', () => {
    const l = lineas(
      exportarCobrosCSV([
        fila({ saldo: { unidades: '-500000', moneda: 'COP' }, situacion: 'SALDO_A_FAVOR' }),
      ]),
    )[1]!;
    expect(l).toContain(';-500000;');
    expect(l).not.toContain("'-500000");
  });

  it.each(['=HYPERLINK("http://x")', '+57300', '-cmd|calc', '@SUM(1)'])(
    'neutraliza el destino que empieza por %s',
    (destino) => {
      const csv = exportarCobrosCSV([fila({ destino })]);
      const celda = lineas(csv)[1]!.slice(lineas(csv)[1]!.indexOf(';') + 1);
      expect(celda.startsWith("'") || celda.startsWith(`"'`)).toBe(true);
    },
  );

  it('no tiene columnas de neto ni de margen: el cobro solo conoce la venta', () => {
    const cabecera = lineas(exportarCobrosCSV([fila()]))[0]!.toLowerCase();
    expect(cabecera).not.toContain('neto');
    expect(cabecera).not.toContain('margen');
  });

  it('sin filas, solo la cabecera', () => {
    expect(lineas(exportarCobrosCSV([]))).toHaveLength(1);
  });
});
