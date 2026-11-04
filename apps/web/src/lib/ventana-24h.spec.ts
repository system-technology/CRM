import { describe, it, expect } from 'vitest';
import {
  calcularCuentaRegresivaVentana24h,
  calcularExpiracionDesdeUltimoMensaje,
  evaluarReaperturaConPlantilla,
  formatearHorasYMinutosRestantes,
} from './ventana-24h';

describe('ventana-24h — Lógica pura de cuenta regresiva con reloj inyectable (T-113)', () => {
  const AHORA_FIJO_MS = new Date('2026-10-29T12:00:00.000Z').getTime();
  const relojFijo = () => AHORA_FIJO_MS;

  describe('calcularExpiracionDesdeUltimoMensaje', () => {
    it('suma exactamente 24 horas al timestamp del último mensaje del cliente', () => {
      const ultimo = '2026-10-28T15:30:00.000Z';
      expect(calcularExpiracionDesdeUltimoMensaje(ultimo)).toBe('2026-10-29T15:30:00.000Z');
    });

    it('devuelve null ante valores vacíos o fechas inválidas', () => {
      expect(calcularExpiracionDesdeUltimoMensaje(null)).toBeNull();
      expect(calcularExpiracionDesdeUltimoMensaje('')).toBeNull();
      expect(calcularExpiracionDesdeUltimoMensaje('fecha-invalida')).toBeNull();
    });
  });

  describe('formatearHorasYMinutosRestantes', () => {
    it('muestra horas y minutos cuando queda al menos 1 hora, y solo minutos bajo 1 hora', () => {
      expect(formatearHorasYMinutosRestantes(14, 25)).toBe('14 h 25 min');
      expect(formatearHorasYMinutosRestantes(1, 0)).toBe('1 h 0 min');
      expect(formatearHorasYMinutosRestantes(0, 45)).toBe('45 min');
    });
  });

  describe('calcularCuentaRegresivaVentana24h', () => {
    it('calcula horas y minutos en estado abierta cuando restan más de 2 horas desde el último mensaje del cliente', () => {
      // Último mensaje hace 10 horas -> quedan 14 horas y 0 minutos
      const ultimoMensajeClienteEn = new Date(AHORA_FIJO_MS - 10 * 3600_000).toISOString();

      const estado = calcularCuentaRegresivaVentana24h({ ultimoMensajeClienteEn }, relojFijo);

      expect(estado.nivel).toBe('abierta');
      expect(estado.abierta).toBe(true);
      expect(estado.cerrada).toBe(false);
      expect(estado.esAmbar).toBe(false);
      expect(estado.horasRestantes).toBe(14);
      expect(estado.minutosRestantes).toBe(0);
      expect(estado.minutosTotalesRestantes).toBe(840);
      expect(estado.etiquetaTiempo).toBe('14 h 0 min');
    });

    it('cambia a aviso ámbar cuando restan 2 horas o menos (<= 120 min)', () => {
      // Expira en 1 hora y 35 minutos (95 min)
      const expiraEn = new Date(AHORA_FIJO_MS + 95 * 60_000).toISOString();

      const estado = calcularCuentaRegresivaVentana24h({ expiraEn }, relojFijo);

      expect(estado.nivel).toBe('ambar');
      expect(estado.abierta).toBe(true);
      expect(estado.cerrada).toBe(false);
      expect(estado.esAmbar).toBe(true);
      expect(estado.horasRestantes).toBe(1);
      expect(estado.minutosRestantes).toBe(35);
      expect(estado.etiquetaTiempo).toBe('1 h 35 min');
      expect(estado.explicacion).toContain('1 h 35 min');
    });

    it('marca exactamente 2 h 0 min (120 min) como umbral ámbar y 2 h 1 min (121 min) como abierta', () => {
      const en120Min = new Date(AHORA_FIJO_MS + 120 * 60_000).toISOString();
      const en121Min = new Date(AHORA_FIJO_MS + 121 * 60_000).toISOString();

      expect(calcularCuentaRegresivaVentana24h({ expiraEn: en120Min }, relojFijo).nivel).toBe(
        'ambar',
      );
      expect(calcularCuentaRegresivaVentana24h({ expiraEn: en121Min }, relojFijo).nivel).toBe(
        'abierta',
      );
    });

    it('pasa a estado cerrada con explicación cuando el reloj alcanza o supera expiraEn', () => {
      const expiraEn = new Date(AHORA_FIJO_MS - 1_000).toISOString();

      const estado = calcularCuentaRegresivaVentana24h({ expiraEn }, relojFijo);

      expect(estado.nivel).toBe('cerrada');
      expect(estado.abierta).toBe(false);
      expect(estado.cerrada).toBe(true);
      expect(estado.esAmbar).toBe(false);
      expect(estado.horasRestantes).toBe(0);
      expect(estado.minutosRestantes).toBe(0);
      expect(estado.etiquetaTiempo).toBe('Cerrada');
      expect(estado.explicacion).toContain('más de 24 horas');
      expect(estado.explicacion).toContain('plantilla aprobada');
    });

    it('respeta abiertaServidor === false aunque expiraEn esté en el futuro', () => {
      const expiraEn = new Date(AHORA_FIJO_MS + 5 * 3600_000).toISOString();

      const estado = calcularCuentaRegresivaVentana24h(
        { expiraEn, abiertaServidor: false },
        relojFijo,
      );

      expect(estado.nivel).toBe('cerrada');
      expect(estado.cerrada).toBe(true);
    });
  });

  describe('evaluarReaperturaConPlantilla', () => {
    it('habilita la reapertura cuando existe al menos una plantilla APROBADA', () => {
      const res = evaluarReaperturaConPlantilla([
        { id: 'p-1', nombre: 'promo_rechazada', estado: 'RECHAZADA' },
        { id: 'p-2', nombre: 'seguimiento_cotizacion_v1', estado: 'APROBADA' },
      ]);

      expect(res.habilitada).toBe(true);
      expect(res.cantidadAprobadas).toBe(1);
      expect(res.plantillaSugerida?.id).toBe('p-2');
      expect(res.motivoDeshabilitada).toBeNull();
    });

    it('deshabilita la reapertura y explica el motivo si no hay ninguna plantilla APROBADA', () => {
      const res = evaluarReaperturaConPlantilla([
        { id: 'p-1', nombre: 'pausada_v1', estado: 'PAUSADA' },
        { id: 'p-2', nombre: 'rechazada_v1', estado: 'RECHAZADA' },
      ]);

      expect(res.habilitada).toBe(false);
      expect(res.cantidadAprobadas).toBe(0);
      expect(res.plantillaSugerida).toBeNull();
      expect(res.motivoDeshabilitada).toContain('APROBADA');
    });
  });
});
