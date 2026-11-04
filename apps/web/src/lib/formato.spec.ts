import { describe, expect, it } from 'vitest';
import {
  formatearDinero,
  formatearCOP,
  formatearDineroCifra,
  formatearFecha,
  formatearFechaHora,
  formatearTelefono,
  enmascararTelefono,
  formatearTelefonoSegunRol,
  sanitizarPiiEnTexto,
  formatearCupo,
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

  describe('2. Formato de Fechas (R9: medianoche UTC vs zona de la agencia America/Bogota)', () => {
    it('string de fecha pura YYYY-MM-DD no se atrasa a la víspera (ej: 2026-10-03)', () => {
      const res = formatearFecha('2026-10-03');
      expect(res).toBe('sáb 3 oct 2026');
    });

    it('timestamp de madrugada UTC frente a la zona de la agencia (America/Bogota UTC-5)', () => {
      // 2026-10-04T02:00:00Z son las 21:00 (9:00 PM) del 3 de octubre en Bogotá
      const enBogota = formatearFecha('2026-10-04T02:00:00Z', { zona: 'America/Bogota' });
      expect(enBogota).toBe('sáb 3 oct 2026');

      // Si se formatea explícitamente en UTC, corresponde al 4 de octubre
      const enUtc = formatearFecha('2026-10-04T02:00:00Z', { zona: 'UTC' });
      expect(enUtc).toBe('dom 4 oct 2026');
    });

    it('timestamp de medianoche exacta UTC (00:00:00Z)', () => {
      // 2026-10-03T00:00:00Z son las 19:00 del 2 de octubre en Bogotá (UTC-5)
      const enBogota = formatearFecha('2026-10-03T00:00:00Z', { zona: 'America/Bogota' });
      expect(enBogota).toBe('vie 2 oct 2026');

      const enUtc = formatearFecha('2026-10-03T00:00:00Z', { zona: 'UTC' });
      expect(enUtc).toBe('sáb 3 oct 2026');
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
      expect(res).toContain('sáb 3 oct 2026');
      expect(res).toContain('2:30');
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
