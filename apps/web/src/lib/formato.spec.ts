import { describe, expect, it } from 'vitest';
import { MONEDAS, Money, type CodigoMoneda } from '@viajapro/domain';
import {
  decimalesDeMoneda,
  formatearDinero,
  formatearCOP,
  formatearDineroCifra,
  formatearFecha,
  formatearFechaHora,
  fijarZonaAgencia,
  formatearTelefono,
  enmascararTelefono,
  formatearTelefonoSegunRol,
  sanitizarPiiEnTexto,
  formatearCupo,
  pluralizar,
  fechaIsoADiaMesAnio,
  diaMesAnioAFechaIso,
} from './formato';

describe('Módulo único de formato es-CO (T-022)', () => {
  describe('1. Formato de Dinero (R8: Enteros COP sin decimales, punto de miles)', () => {
    it('formatea cero correctamente', () => {
      expect(formatearDinero(0)).toContain('0');
      expect(formatearDinero({ unidades: '0', moneda: 'COP' })).toContain('$ 0');
      expect(formatearCOP(0)).toContain('$ 0');
    });

    it('formatea valores en COP sin decimales y con punto de miles', () => {
      const res350k = formatearDinero(350000);
      expect(res350k).toContain('$ 350.000');
      expect(res350k).not.toContain(',00');
    });

    it('soporta casos límite de millones y miles de millones', () => {
      const doceMillones = formatearDinero(12500000);
      expect(doceMillones).toContain('$ 12.500.000');

      const milMillones = formatearDinero(1000000000);
      expect(milMillones).toContain('$ 1.000.000.000');
    });

    it('soporta objetos de contratos Zod { unidades, moneda }', () => {
      const res = formatearDinero({ unidades: '250000', moneda: 'COP' });
      expect(res).toContain('$ 250.000');
    });

    it('soporta objetos con campo { monto, moneda }', () => {
      const res = formatearDinero({ monto: 450000, moneda: 'COP' });
      expect(res).toContain('$ 450.000');
    });

    it('soporta bigints sin romper precisión', () => {
      const res = formatearDinero(BigInt(890000));
      expect(res).toContain('$ 890.000');
    });

    it('maneja monedas extranjeras con 2 decimales según estándar internacional', () => {
      const usd = formatearDinero({ unidades: '125050', moneda: 'USD' });
      expect(usd).toContain('1.250,50');
    });

    it('formatearDineroCifra mantiene equivalencia compacta para tablas', () => {
      expect(formatearDineroCifra({ unidades: '500000', moneda: 'COP' })).toContain('$ 500.000');
    });
  });

  /**
   * T-520. Los decimales de cada moneda viven en `MONEDAS` (`@viajapro/domain`) y en ningún otro
   * sitio: antes `formato.ts` tenía su propio `moneda === 'COP' ? 0 : 2`, una segunda tabla que
   * coincidía hoy y se rompía el día que entrara una moneda de 3 decimales (KWD, JOD…).
   *
   * Recorre `MONEDAS` entera, así que añadir una moneda al dominio entra sola en la prueba. Y la
   * compara contra una derivación independiente (`Money.aDecimal`, que el dominio calcula por su
   * cuenta), no contra una lista copiada aquí.
   */
  describe('1b. Decimales de cada moneda: una sola tabla (T-520)', () => {
    const codigos = Object.keys(MONEDAS) as CodigoMoneda[];
    // 123456789 unidades mínimas: tiene dígitos de sobra para ver dónde cae la coma.
    const UNIDADES = 123456789n;

    it('MONEDAS no está vacía (si lo estuviera, las demás pruebas de esta sección no probarían nada)', () => {
      expect(codigos.length).toBeGreaterThan(0);
    });

    it.each(codigos)('%s: decimalesDeMoneda dice lo que dice MONEDAS', (moneda) => {
      expect(decimalesDeMoneda(moneda)).toBe(MONEDAS[moneda].decimales);
      expect(decimalesDeMoneda(moneda.toLowerCase())).toBe(MONEDAS[moneda].decimales);
    });

    it.each(codigos)('%s: formatearDinero pinta lo mismo que el dominio calcula', (moneda) => {
      const decimales = MONEDAS[moneda].decimales;
      const texto = formatearDinero({ unidades: UNIDADES.toString(), moneda });
      const esperado = Money.desdeUnidades(UNIDADES, moneda).aDecimal(); // «1234567.89» / «123456789»

      const [enteros = '', fraccion = ''] = esperado.split('.');
      // La parte entera, con punto de miles (es-CO), y exactamente `decimales` dígitos tras la coma.
      const numero = /[\d.]+(?:,\d+)?/.exec(texto)?.[0] ?? '';
      const [pintadoEnteros = '', pintadoFraccion = ''] = numero.split(',');
      expect(pintadoEnteros.replace(/\./g, ''), `${moneda}: ${texto}`).toBe(enteros);
      expect(pintadoFraccion, `${moneda}: ${texto}`).toBe(fraccion);
      expect(pintadoFraccion).toHaveLength(decimales);
    });

    it('una moneda nueva en MONEDAS se formatea con sus decimales sin tocar formato.ts', () => {
      // Es lo que protege el día de KWD: si `formato.ts` volviera a tener su propia tabla, esta
      // moneda saldría con 2 decimales. Se añade a la tabla del dominio solo durante la prueba.
      const tabla = MONEDAS as unknown as Record<string, { decimales: number }>;
      tabla['KWD'] = { decimales: 3 };
      try {
        expect(decimalesDeMoneda('KWD')).toBe(3);
        const texto = formatearDinero({ unidades: '1234567', moneda: 'KWD' });
        expect(texto).toContain('1.234,567');
      } finally {
        delete tabla['KWD'];
      }
      // Y al retirarla, deja de ser una moneda conocida: vuelve al valor por defecto de `Intl`.
      expect(decimalesDeMoneda('KWD')).toBe(2);
    });
  });

  describe('2. Formato de Fechas (R9: medianoche UTC vs zona de la agencia America/Bogota)', () => {
    it('string de fecha pura YYYY-MM-DD no se atrasa a la víspera (ej: 2026-10-03)', () => {
      const res = formatearFecha('2026-10-03');
      expect(res).toBe('3 oct 2026');
    });

    it('timestamp de madrugada UTC frente a la zona de la agencia (America/Bogota UTC-5)', () => {
      // 2026-10-04T02:00:00Z son las 21:00 (9:00 PM) del 3 de octubre en Bogotá
      const enBogota = formatearFecha('2026-10-04T02:00:00Z', { zona: 'America/Bogota' });
      expect(enBogota).toBe('3 oct 2026');

      // Si se formatea explícitamente en UTC, corresponde al 4 de octubre
      const enUtc = formatearFecha('2026-10-04T02:00:00Z', { zona: 'UTC' });
      expect(enUtc).toBe('4 oct 2026');
    });

    it('timestamp de medianoche exacta UTC (00:00:00Z)', () => {
      // 2026-10-03T00:00:00Z son las 19:00 del 2 de octubre en Bogotá (UTC-5)
      const enBogota = formatearFecha('2026-10-03T00:00:00Z', { zona: 'America/Bogota' });
      expect(enBogota).toBe('2 oct 2026');

      const enUtc = formatearFecha('2026-10-03T00:00:00Z', { zona: 'UTC' });
      expect(enUtc).toBe('3 oct 2026');
    });

    it('formatea fechas completas y día-mes', () => {
      const diaMes = formatearFecha('2026-10-03', { estilo: 'dia-mes' });
      expect(diaMes).toBe('3 oct');

      const completa = formatearFecha('2026-10-03', { estilo: 'completa' });
      expect(completa.toLowerCase()).toContain('sábado');
      expect(completa.toLowerCase()).toContain('octubre');
    });

    it('formatearFechaHora incluye hora local legible', () => {
      const res = formatearFechaHora('2026-10-03T19:30:00Z', { zona: 'America/Bogota' });
      // 19:30 UTC = 14:30 en Bogotá (2:30 p. m.)
      expect(res).toContain('3 oct 2026');
      expect(res).toContain('2:30');
    });

    it('fecha con hora en el formato único de la interfaz', () => {
      expect(formatearFecha('2026-11-20T15:30:00Z', { conHora: true })).toBe(
        '20 nov 2026, 10:30 a. m.',
      );
      expect(formatearFecha('2026-11-20', { conHora: true })).toBe('20 nov 2026');
    });

    it('usa la zona de la agencia fijada y deja imponer otra por llamada', () => {
      fijarZonaAgencia('America/Mexico_City');
      expect(formatearFecha('2026-11-20T04:00:00Z')).toBe('19 nov 2026');
      expect(formatearFecha('2026-11-20T04:00:00Z', { zona: 'UTC' })).toBe('20 nov 2026');
      fijarZonaAgencia(null);
      expect(formatearFecha('2026-11-20T04:00:00Z')).toBe('19 nov 2026');
    });

    it('devuelve cadena vacía ante valores nulos o inválidos', () => {
      expect(formatearFecha(null)).toBe('');
      expect(formatearFecha(undefined)).toBe('');
      expect(formatearFecha('invalida')).toBe('');
    });
  });

  describe('3. Formato de Teléfonos Colombianos', () => {
    it('formatea móviles de 10 dígitos con código de país +57', () => {
      expect(formatearTelefono('3001234567')).toBe('+57 300 123 4567');
      expect(formatearTelefono('+573001234567')).toBe('+57 300 123 4567');
      expect(formatearTelefono('573001234567')).toBe('+57 300 123 4567');
    });

    it('limpia caracteres no numéricos y signos extraños', () => {
      expect(formatearTelefono('+57 (310) 987-6543')).toBe('+57 310 987 6543');
      expect(formatearTelefono('315.456.7890')).toBe('+57 315 456 7890');
    });

    it('permite excluir el código de país si se requiere formato local', () => {
      expect(formatearTelefono('3001234567', { incluirCodigoPais: false })).toBe('300 123 4567');
    });

    it('formatea teléfonos fijos nacionales con indicativo (ej: 601)', () => {
      expect(formatearTelefono('6012345678')).toBe('+57 (601) 234 5678');
      expect(formatearTelefono('6012345678', { incluirCodigoPais: false })).toBe('(601) 234 5678');
    });

    it('maneja valores vacíos o nulos sin lanzar errores', () => {
      expect(formatearTelefono(null)).toBe('');
      expect(formatearTelefono(undefined)).toBe('');
      expect(formatearTelefono('')).toBe('');
    });
  });

  describe('4. Formato de Cupos de Excursiones y Salidas', () => {
    it('devuelve "Agotado" cuando no hay cupos disponibles', () => {
      expect(formatearCupo(0)).toBe('Agotado');
      expect(formatearCupo(-1)).toBe('Agotado');
    });

    it('formatea singular y plural correctamente', () => {
      expect(formatearCupo(1)).toBe('1 cupo disponible');
      expect(formatearCupo(8)).toBe('8 cupos disponibles');
    });

    it('formatea proporción sobre el cupo total si se especifica', () => {
      expect(formatearCupo(12, 20)).toBe('12 de 20 cupos');
      expect(formatearCupo(1, 15)).toBe('1 de 15 cupos');
    });

    it('indica "Cupos libres" cuando no hay restricción de cupo', () => {
      expect(formatearCupo(null)).toBe('Cupos libres');
      expect(formatearCupo(undefined)).toBe('Cupos libres');
    });
  });

  describe('5. Enmascarado de Teléfono y Sanitización de PII (T-099 / R10)', () => {
    it('enmascara móviles colombianos e internacionales ocultando dígitos centrales', () => {
      expect(enmascararTelefono('+573001234567')).toBe('+57 300 *** 4567');
      expect(enmascararTelefono('3109876543')).toBe('+57 310 *** 6543');
      expect(enmascararTelefono('+13051234567')).toBe('+13 *** 4567');
    });

    it('enmascara el teléfono cuando el rol es OPERACIONES o SOLO_LECTURA y lo muestra completo a ASESOR o DUENO', () => {
      expect(formatearTelefonoSegunRol('+573001234567', 'ASESOR')).toBe('+57 300 123 4567');
      expect(formatearTelefonoSegunRol('+573001234567', 'DUENO')).toBe('+57 300 123 4567');
      expect(formatearTelefonoSegunRol('+573001234567', 'OPERACIONES')).toBe('+57 300 *** 4567');
      expect(formatearTelefonoSegunRol('+573001234567', 'SOLO_LECTURA')).toBe('+57 300 *** 4567');
    });

    it('sanitiza teléfonos y pasaportes en mensajes de error o diagnóstico', () => {
      const textoCrudo =
        'Fallo al sincronizar contacto +573001234567 con pasaporte PA9876543 en la agencia.';
      const limpio = sanitizarPiiEnTexto(textoCrudo);
      expect(limpio).not.toContain('3001234567');
      expect(limpio).not.toContain('PA9876543');
      expect(limpio).toContain('+***4567');
      expect(limpio).toContain('PA***43');
    });
  });
});

describe('pluralizar', () => {
  it('concuerda el número: 1 niño, 0 y 2 niños', () => {
    expect(pluralizar(1, 'niño', 'niños')).toBe('1 niño');
    expect(pluralizar(0, 'niño', 'niños')).toBe('0 niños');
    expect(pluralizar(2, 'niño', 'niños')).toBe('2 niños');
  });
});

describe('fecha día/mes/año', () => {
  it('convierte entre ISO y dd/mm/aaaa', () => {
    expect(fechaIsoADiaMesAnio('2026-12-15')).toBe('15/12/2026');
    expect(fechaIsoADiaMesAnio('')).toBe('');
    expect(diaMesAnioAFechaIso('15/12/2026')).toBe('2026-12-15');
  });

  it('rechaza fechas que no existen y formatos incompletos', () => {
    expect(diaMesAnioAFechaIso('31/02/2026')).toBeNull();
    expect(diaMesAnioAFechaIso('12/15/2026')).toBeNull();
    expect(diaMesAnioAFechaIso('15/12')).toBeNull();
  });
});
