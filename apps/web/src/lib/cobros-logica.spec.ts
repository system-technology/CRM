import { describe, expect, it } from 'vitest';
import {
  CLASE_TONO,
  ETIQUETA_ESTADO_DE_COBRO,
  ETIQUETA_MEDIO_DE_PAGO,
  TONO_ESTADO_DE_COBRO,
  aUnidadesMinimas,
  admiteCentavos,
  decimalesDe,
  esSobrepagoSinConfirmar,
  fraseDeSaldo,
  hoyEnLaAgencia,
  mensajeDeErrorDeCobro,
  saldoEnPantalla,
  sinSigno,
} from './cobros-logica';
import { formatearDinero } from './formato';

/**
 * El grueso de estas pruebas es R8: en COP la unidad mínima es **el peso**. Un `× 100` de más
 * convierte 1.250.000 pesos en 125 millones, y eso ya llegó una vez a pantalla.
 */
describe('aUnidadesMinimas — la cifra que escribe la asesora', () => {
  describe('COP: el peso es la unidad, no el centavo', () => {
    it('1.250.000 pesos son 1250000 unidades, no 125000000', () => {
      expect(aUnidadesMinimas('1.250.000', 'COP')).toEqual({ ok: true, unidades: '1250000' });
    });

    it('acepta la cifra sin separadores', () => {
      expect(aUnidadesMinimas('1250000', 'COP')).toEqual({ ok: true, unidades: '1250000' });
    });

    it('tolera espacios y el signo de pesos que se pegan de otra pantalla', () => {
      expect(aUnidadesMinimas(' $ 2.000.000 ', 'COP')).toEqual({ ok: true, unidades: '2000000' });
    });

    it('rechaza centavos en pesos en vez de redondear en silencio', () => {
      const r = aUnidadesMinimas('1.250,50', 'COP');
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motivo).toContain('no se usan centavos');
    });

    it('lo que entra y lo que se pinta son la misma cifra (ida y vuelta)', () => {
      const r = aUnidadesMinimas('6.200.000', 'COP');
      expect(r.ok).toBe(true);
      const texto = formatearDinero({ unidades: r.ok ? r.unidades : '0', moneda: 'COP' });
      expect(texto.replace(/[^\d.]/g, '')).toBe('6.200.000');
    });
  });

  describe('USD: ahí sí hay centavos', () => {
    it('1.250,50 dólares son 125050 centavos', () => {
      expect(aUnidadesMinimas('1.250,50', 'USD')).toEqual({ ok: true, unidades: '125050' });
    });

    it('un dólar entero son 100 centavos', () => {
      expect(aUnidadesMinimas('1', 'USD')).toEqual({ ok: true, unidades: '100' });
    });

    it('rellena el decimal escrito a medias: 12,5 son 1250 centavos', () => {
      expect(aUnidadesMinimas('12,5', 'USD')).toEqual({ ok: true, unidades: '1250' });
    });

    it('rechaza tres decimales en vez de redondear por su cuenta', () => {
      const r = aUnidadesMinimas('12,345', 'USD');
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motivo).toContain('dos decimales');
    });
  });

  describe('lo que no se interpreta a medias', () => {
    it('rechaza el punto como decimal, que sería ambiguo (1.500: mil quinientos o uno con medio)', () => {
      const r = aUnidadesMinimas('1.50', 'USD');
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motivo).toContain('punto para los miles');
    });

    it('rechaza una agrupación de miles que no es de tres', () => {
      expect(aUnidadesMinimas('1.25.000', 'COP').ok).toBe(false);
    });

    it('rechaza el vacío con un mensaje que dice qué escribir', () => {
      const r = aUnidadesMinimas('   ', 'COP');
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motivo).toContain('cuánto pagó');
    });

    it('rechaza el cero: un pago de cero no es un pago', () => {
      expect(aUnidadesMinimas('0', 'COP').ok).toBe(false);
      expect(aUnidadesMinimas('0,00', 'USD').ok).toBe(false);
    });

    it('rechaza un negativo y explica que para devolver hay otro movimiento', () => {
      const r = aUnidadesMinimas('-50.000', 'COP');
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motivo).toContain('devolución');
    });

    it('rechaza letras', () => {
      expect(aUnidadesMinimas('un millón', 'COP').ok).toBe(false);
      expect(aUnidadesMinimas('1e6', 'COP').ok).toBe(false);
    });

    it('rechaza lo que pasa del tope por movimiento del contrato', () => {
      expect(aUnidadesMinimas('999999999999999', 'COP').ok).toBe(true);
      expect(aUnidadesMinimas('1000000000000000', 'COP').ok).toBe(false);
    });

    it('no pierde precisión en cifras grandes (pasa por bigint, no por float)', () => {
      expect(aUnidadesMinimas('999.999.999.999.999', 'COP')).toEqual({
        ok: true,
        unidades: '999999999999999',
      });
    });
  });
});

describe('el saldo llega con signo y en pantalla se dice con palabras', () => {
  it('saldo a favor: importe en positivo y etiqueta que explica de quién es el dinero', () => {
    const r = saldoEnPantalla({
      situacion: 'SALDO_A_FAVOR',
      saldo: { unidades: '-100000', moneda: 'COP' },
    });
    expect(r.etiqueta).toBe('Saldo a favor');
    expect(r.dinero.unidades).toBe('100000');
    expect(formatearDinero(r.dinero)).not.toContain('-');
  });

  it('deuda normal: el importe se deja tal cual', () => {
    const r = saldoEnPantalla({
      situacion: 'PARCIAL',
      saldo: { unidades: '2700000', moneda: 'COP' },
    });
    expect(r.etiqueta).toBe('Falta por cobrar');
    expect(r.dinero.unidades).toBe('2700000');
  });

  it('sinSigno no toca lo positivo ni pasa por coma flotante', () => {
    expect(sinSigno({ unidades: '999999999999999', moneda: 'COP' }).unidades).toBe(
      '999999999999999',
    );
    expect(sinSigno({ unidades: '-999999999999999', moneda: 'COP' }).unidades).toBe(
      '999999999999999',
    );
  });

  describe('la frase que cierra la confirmación', () => {
    it('nunca dice «Falta por cobrar» un importe negativo', () => {
      const frase = fraseDeSaldo({
        situacion: 'SALDO_A_FAVOR',
        saldo: { unidades: '-100000', moneda: 'COP' },
      });
      expect(frase).toContain('saldo a favor');
      expect(frase).toContain('$ 100.000');
      expect(frase).not.toContain('Falta por cobrar');
      expect(frase).not.toMatch(/[-−]\s*\$/);
    });

    it('un archivo saldado lo dice, en vez de «Falta por cobrar $ 0»', () => {
      const frase = fraseDeSaldo({ situacion: 'PAGADO', saldo: { unidades: '0', moneda: 'COP' } });
      expect(frase).toBe('El archivo queda pagado.');
    });

    it('con saldo pendiente dice cuánto falta', () => {
      expect(
        fraseDeSaldo({ situacion: 'PARCIAL', saldo: { unidades: '2700000', moneda: 'COP' } }),
      ).toBe('Falta por cobrar $ 2.700.000.');
    });
  });
});

describe('decimales por moneda', () => {
  it('sale de la tabla del dominio, no de una copia local', () => {
    expect(decimalesDe('COP')).toBe(0);
    expect(decimalesDe('USD')).toBe(2);
    expect(admiteCentavos('COP')).toBe(false);
    expect(admiteCentavos('USD')).toBe(true);
  });
});

describe('hoyEnLaAgencia', () => {
  it('da el día de la agencia, no el del navegador', () => {
    // 2026-11-21T03:00Z es todavía el 20 en Bogotá (UTC-5) y ya el 21 en Madrid.
    const instante = new Date('2026-11-21T03:00:00.000Z');
    expect(hoyEnLaAgencia('America/Bogota', instante)).toBe('2026-11-20');
    expect(hoyEnLaAgencia('Europe/Madrid', instante)).toBe('2026-11-21');
  });

  it('con una zona que no existe no se cae', () => {
    expect(hoyEnLaAgencia('Marte/Olympus', new Date('2026-11-21T12:00:00.000Z'))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe('mensajeDeErrorDeCobro', () => {
  it('traduce el sobrepago a algo que la asesora puede resolver', () => {
    const e = { code: 'SOBREPAGO_SIN_CONFIRMAR' };
    expect(mensajeDeErrorDeCobro(e)).toContain('saldo a favor');
    expect(esSobrepagoSinConfirmar(e)).toBe(true);
    expect(esSobrepagoSinConfirmar({ code: 'FECHA_DE_PAGO_FUTURA' })).toBe(false);
  });

  it('un 403 explica el permiso que falta, no un código', () => {
    const mensaje = mensajeDeErrorDeCobro({ status: 403 });
    expect(mensaje).toContain('Registrar pagos');
    expect(mensaje).not.toMatch(/403|PERMISO_DENEGADO/);
  });

  it('nunca devuelve el texto crudo del servidor', () => {
    expect(
      mensajeDeErrorDeCobro({ message: 'constraint pagos_monto_por_tipo violated' }),
    ).not.toContain('constraint');
  });

  it('un archivo cancelado se explica en lenguaje de agencia', () => {
    expect(
      mensajeDeErrorDeCobro({ code: 'TIPO_NO_PERMITIDO_PARA_EL_ESTADO_DEL_ARCHIVO' }),
    ).toContain('cancelado');
  });
});

describe('etiquetas y color con significado', () => {
  it('ningún medio de pago se queda sin nombre en español', () => {
    for (const etiqueta of Object.values(ETIQUETA_MEDIO_DE_PAGO)) {
      expect(etiqueta.length).toBeGreaterThan(1);
    }
  });

  it('solo lo vencido va en rojo y lo próximo en ámbar', () => {
    expect(TONO_ESTADO_DE_COBRO.VENCIDO).toBe('alerta');
    expect(TONO_ESTADO_DE_COBRO.POR_VENCER).toBe('aviso');
    expect(TONO_ESTADO_DE_COBRO.AL_DIA).toBe('ok');
    // Un archivo cancelado no se pinta de «todo bien».
    expect(TONO_ESTADO_DE_COBRO.CANCELADO).toBe('neutro');
    expect(CLASE_TONO[TONO_ESTADO_DE_COBRO.CANCELADO]).not.toContain('ok-');
  });

  it('no se cuela jerga técnica en las etiquetas de estado', () => {
    for (const etiqueta of Object.values(ETIQUETA_ESTADO_DE_COBRO)) {
      expect(etiqueta).not.toMatch(/_|tenant|RLS|T-\d/);
    }
  });
});
