import { SUMAS_EN_CERO, type SumasDeCobro } from '@viajapro/domain';
import { describe, expect, it } from 'vitest';
import {
  AjusteDejaTotalNegativoError,
  DevolucionExcedeLoPagadoError,
  FechaDePagoFuturaError,
  MonedaDistintaDelArchivoError,
  MontoInvalidoParaElTipoError,
  MovimientoYaReversadoError,
  PenalidadExcedeLoPagadoError,
  ReversoDeReversoError,
  ReversoDejaPagadoNegativoError,
  SobrepagoSinConfirmarError,
  TipoNoPermitidoParaElEstadoError,
} from './errors.js';
import {
  type ArchivoParaValidar,
  type EntradaDeMovimiento,
  TOPE_DE_MONTO,
  validarMovimiento,
  validarReverso,
} from './reglas-de-registro.js';

const HOY = '2027-01-10';
const abierto: ArchivoParaValidar = {
  estado: 'ABIERTO',
  ventaUnidades: 1_000_000n,
  monedaIso: 'COP',
};
const cancelado: ArchivoParaValidar = { ...abierto, estado: 'CANCELADO' };
const sumas = (parcial: Partial<SumasDeCobro>): SumasDeCobro => ({ ...SUMAS_EN_CERO, ...parcial });

const entrada = (p: Partial<EntradaDeMovimiento> = {}): EntradaDeMovimiento => ({
  tipo: 'PAGO',
  montoUnidades: 100_000n,
  monedaDelMonto: 'COP',
  pagadoEl: HOY,
  confirmarSobrepago: false,
  ...p,
});

describe('validarMovimiento', () => {
  describe('tipo según el estado del archivo', () => {
    it('PAGO y AJUSTE solo con el archivo ABIERTO', () => {
      expect(() => validarMovimiento(entrada(), abierto, SUMAS_EN_CERO, HOY)).not.toThrow();
      expect(() => validarMovimiento(entrada(), cancelado, SUMAS_EN_CERO, HOY)).toThrow(
        TipoNoPermitidoParaElEstadoError,
      );
      const ajuste = entrada({ tipo: 'AJUSTE', pagadoEl: null });
      expect(() => validarMovimiento(ajuste, abierto, SUMAS_EN_CERO, HOY)).not.toThrow();
      expect(() => validarMovimiento(ajuste, cancelado, SUMAS_EN_CERO, HOY)).toThrow(
        TipoNoPermitidoParaElEstadoError,
      );
    });

    it('PENALIDAD solo con el archivo CANCELADO', () => {
      const p = entrada({ tipo: 'PENALIDAD', pagadoEl: null, montoUnidades: 100n });
      const pagado = sumas({ pagos: 500n });
      expect(() => validarMovimiento(p, cancelado, pagado, HOY)).not.toThrow();
      expect(() => validarMovimiento(p, abierto, pagado, HOY)).toThrow(
        TipoNoPermitidoParaElEstadoError,
      );
    });

    it('DEVOLUCION en cualquier estado', () => {
      const d = entrada({ tipo: 'DEVOLUCION', montoUnidades: 50n });
      const pagado = sumas({ pagos: 100n });
      expect(() => validarMovimiento(d, abierto, pagado, HOY)).not.toThrow();
      expect(() => validarMovimiento(d, cancelado, pagado, HOY)).not.toThrow();
    });
  });

  describe('monto y moneda', () => {
    it('rechaza cero, negativos fuera de AJUSTE y lo que pasa del tope', () => {
      for (const montoUnidades of [0n, -1n, TOPE_DE_MONTO + 1n]) {
        expect(() =>
          validarMovimiento(entrada({ montoUnidades }), abierto, SUMAS_EN_CERO, HOY),
        ).toThrow(MontoInvalidoParaElTipoError);
      }
      const ajuste = (montoUnidades: bigint) =>
        entrada({ tipo: 'AJUSTE', pagadoEl: null, montoUnidades });
      expect(() => validarMovimiento(ajuste(0n), abierto, SUMAS_EN_CERO, HOY)).toThrow(
        MontoInvalidoParaElTipoError,
      );
      expect(() =>
        validarMovimiento(ajuste(-TOPE_DE_MONTO - 1n), abierto, SUMAS_EN_CERO, HOY),
      ).toThrow(MontoInvalidoParaElTipoError);
      expect(() => validarMovimiento(ajuste(-10n), abierto, SUMAS_EN_CERO, HOY)).not.toThrow();
    });

    it('acepta exactamente el tope con confirmación de sobrepago', () => {
      expect(() =>
        validarMovimiento(
          entrada({ montoUnidades: TOPE_DE_MONTO, confirmarSobrepago: true }),
          abierto,
          SUMAS_EN_CERO,
          HOY,
        ),
      ).not.toThrow();
    });

    it('rechaza otra moneda que la del archivo', () => {
      expect(() =>
        validarMovimiento(entrada({ monedaDelMonto: 'USD' }), abierto, SUMAS_EN_CERO, HOY),
      ).toThrow(MonedaDistintaDelArchivoError);
    });
  });

  describe('pagado_el no futuro (en la zona de la agencia)', () => {
    it('hoy sí, mañana no', () => {
      expect(() =>
        validarMovimiento(entrada({ pagadoEl: HOY }), abierto, SUMAS_EN_CERO, HOY),
      ).not.toThrow();
      expect(() =>
        validarMovimiento(entrada({ pagadoEl: '2027-01-11' }), abierto, SUMAS_EN_CERO, HOY),
      ).toThrow(FechaDePagoFuturaError);
    });
    it('una fecha pasada vale', () => {
      expect(() =>
        validarMovimiento(entrada({ pagadoEl: '2026-12-31' }), abierto, SUMAS_EN_CERO, HOY),
      ).not.toThrow();
    });
  });

  describe('sobrepago', () => {
    it('pagar exactamente el saldo no es sobrepago', () => {
      expect(() =>
        validarMovimiento(entrada({ montoUnidades: 1_000_000n }), abierto, SUMAS_EN_CERO, HOY),
      ).not.toThrow();
    });
    it('un peso de más exige confirmar', () => {
      const e = entrada({ montoUnidades: 1_000_001n });
      expect(() => validarMovimiento(e, abierto, SUMAS_EN_CERO, HOY)).toThrow(
        SobrepagoSinConfirmarError,
      );
      expect(() =>
        validarMovimiento({ ...e, confirmarSobrepago: true }, abierto, SUMAS_EN_CERO, HOY),
      ).not.toThrow();
    });
    it('cuenta lo ya pagado y los ajustes', () => {
      const s = sumas({ pagos: 900_000n, ajustes: -100_000n }); // total 900.000: ya está pagado
      expect(() => validarMovimiento(entrada({ montoUnidades: 1n }), abierto, s, HOY)).toThrow(
        SobrepagoSinConfirmarError,
      );
    });
  });

  describe('devolución sin dejar lo pagado en negativo', () => {
    const d = (montoUnidades: bigint) => entrada({ tipo: 'DEVOLUCION', montoUnidades });
    it('devolver todo lo pagado sí; un peso más no', () => {
      const s = sumas({ pagos: 500n });
      expect(() => validarMovimiento(d(500n), abierto, s, HOY)).not.toThrow();
      expect(() => validarMovimiento(d(501n), abierto, s, HOY)).toThrow(
        DevolucionExcedeLoPagadoError,
      );
    });
    it('cuenta lo ya devuelto', () => {
      const s = sumas({ pagos: 500n, devoluciones: 300n });
      expect(() => validarMovimiento(d(201n), cancelado, s, HOY)).toThrow(
        DevolucionExcedeLoPagadoError,
      );
      expect(() => validarMovimiento(d(200n), cancelado, s, HOY)).not.toThrow();
    });
  });

  describe('ajuste sin dejar el total negativo', () => {
    const a = (montoUnidades: bigint) => entrada({ tipo: 'AJUSTE', pagadoEl: null, montoUnidades });
    it('un descuento igual al total deja cero; uno más, negativo', () => {
      expect(() => validarMovimiento(a(-1_000_000n), abierto, SUMAS_EN_CERO, HOY)).not.toThrow();
      expect(() => validarMovimiento(a(-1_000_001n), abierto, SUMAS_EN_CERO, HOY)).toThrow(
        AjusteDejaTotalNegativoError,
      );
    });
    it('cuenta los ajustes anteriores', () => {
      expect(() =>
        validarMovimiento(a(-1n), abierto, sumas({ ajustes: -1_000_000n }), HOY),
      ).toThrow(AjusteDejaTotalNegativoError);
    });
  });

  describe('la penalidad no supera lo pagado', () => {
    const p = (montoUnidades: bigint) =>
      entrada({ tipo: 'PENALIDAD', pagadoEl: null, montoUnidades });
    it('igual a lo pagado sí; un peso más no', () => {
      const s = sumas({ pagos: 300n });
      expect(() => validarMovimiento(p(300n), cancelado, s, HOY)).not.toThrow();
      expect(() => validarMovimiento(p(301n), cancelado, s, HOY)).toThrow(
        PenalidadExcedeLoPagadoError,
      );
    });
    it('es acumulada y descuenta lo devuelto', () => {
      expect(() =>
        validarMovimiento(p(101n), cancelado, sumas({ pagos: 300n, penalidades: 200n }), HOY),
      ).toThrow(PenalidadExcedeLoPagadoError);
      expect(() =>
        validarMovimiento(p(201n), cancelado, sumas({ pagos: 300n, devoluciones: 100n }), HOY),
      ).toThrow(PenalidadExcedeLoPagadoError);
    });
    it('sin nada pagado, ninguna penalidad', () => {
      expect(() => validarMovimiento(p(1n), cancelado, SUMAS_EN_CERO, HOY)).toThrow(
        PenalidadExcedeLoPagadoError,
      );
    });
  });
});

describe('validarReverso', () => {
  const orig = (tipo: 'PAGO' | 'DEVOLUCION' | 'AJUSTE' | 'PENALIDAD' | 'REVERSO', m: bigint) => ({
    id: 'x',
    tipo,
    montoUnidades: m,
  });

  it('no se reversa un reverso ni dos veces el mismo movimiento', () => {
    expect(() => validarReverso(orig('REVERSO', 5n), false, abierto, SUMAS_EN_CERO)).toThrow(
      ReversoDeReversoError,
    );
    expect(() => validarReverso(orig('PAGO', 5n), true, abierto, sumas({ pagos: 5n }))).toThrow(
      MovimientoYaReversadoError,
    );
  });

  it('el reverso de un PAGO no deja lo pagado en negativo', () => {
    // Se pagaron 500, se devolvieron 300: reversar el pago de 500 dejaría -300.
    const s = sumas({ pagos: 500n, devoluciones: 300n });
    expect(() => validarReverso(orig('PAGO', 500n), false, abierto, s)).toThrow(
      ReversoDejaPagadoNegativoError,
    );
    // Reversar un pago de 200 de dos (500 total pagado) deja 300 - 300 = 0: vale.
    expect(() =>
      validarReverso(
        orig('PAGO', 200n),
        false,
        abierto,
        sumas({ pagos: 500n, devoluciones: 300n }),
      ),
    ).not.toThrow();
    expect(() =>
      validarReverso(
        orig('PAGO', 201n),
        false,
        abierto,
        sumas({ pagos: 500n, devoluciones: 300n }),
      ),
    ).toThrow(ReversoDejaPagadoNegativoError);
  });

  it('reversar una devolución, una penalidad o un descuento siempre se puede', () => {
    const s = sumas({ pagos: 500n, devoluciones: 300n, penalidades: 100n });
    expect(() => validarReverso(orig('DEVOLUCION', 300n), false, cancelado, s)).not.toThrow();
    expect(() => validarReverso(orig('PENALIDAD', 100n), false, cancelado, s)).not.toThrow();
    expect(() =>
      validarReverso(orig('AJUSTE', -100n), false, abierto, sumas({ ajustes: -100n })),
    ).not.toThrow();
  });

  it('reversar un cargo que deja el total negativo se rechaza', () => {
    // venta 1.000.000, descuento -1.000.000 y cargo +500.000: total 500.000; reversar el cargo → 0 (vale).
    const s = sumas({ ajustes: -500_000n });
    expect(() => validarReverso(orig('AJUSTE', 500_000n), false, abierto, s)).not.toThrow();
    // Descuento de -1.000.000 y cargo de 100.000: total 100.000; reversar el cargo de 200.000 imposible.
    expect(() =>
      validarReverso(orig('AJUSTE', 200_000n), false, abierto, sumas({ ajustes: -900_000n })),
    ).toThrow(AjusteDejaTotalNegativoError);
  });
});
