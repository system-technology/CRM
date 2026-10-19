import { describe, it, expect } from 'vitest';
import {
  determinarEstadoPantalla,
  construirMensajeErrorAccionable,
  esMensajeErrorValido,
} from './estados-ui-logica';

describe('estados-ui-logica (Tarea 0c.25)', () => {
  describe('determinarEstadoPantalla', () => {
    it('prioriza el estado CARGA si cargando es true', () => {
      const res = determinarEstadoPantalla({
        cargando: true,
        error: new Error('Fallo previo'),
        totalElementos: 0,
      });
      expect(res).toBe('CARGA');
    });

    it('devuelve ERROR si hay error y no está cargando', () => {
      const res = determinarEstadoPantalla({
        cargando: false,
        error: 'Conexión rechazada',
        totalElementos: 5,
      });
      expect(res).toBe('ERROR');
    });

    it('devuelve VACIO si no carga, no hay error y totalElementos es 0', () => {
      const res = determinarEstadoPantalla({
        cargando: false,
        error: null,
        totalElementos: 0,
      });
      expect(res).toBe('VACIO');
    });

    it('devuelve DATOS si no carga, no hay error y hay al menos 1 elemento', () => {
      const res = determinarEstadoPantalla({
        cargando: false,
        error: null,
        totalElementos: 12,
      });
      expect(res).toBe('DATOS');
    });
  });

  describe('construirMensajeErrorAccionable', () => {
    it('genera mensajes para errores de red en cualquier módulo', () => {
      const msg = construirMensajeErrorAccionable(
        new Error('Failed to fetch from backend'),
        'CATALOGO_SALIDAS',
      );
      expect(msg.codigo).toBe('ERROR_RED');
      expect(msg.titulo).toBe('Sin conexión con el servidor');
      expect(msg.quePaso).toContain('Catálogo de Salidas');
      expect(msg.queHacer).toContain('Reintentar');
      expect(msg.esReintentable).toBe(true);
      expect(esMensajeErrorValido(msg)).toBe(true);
    });

    it('genera mensajes para problemas de tenant/sesión', () => {
      const msg = construirMensajeErrorAccionable(
        'Tenant no configurado en entorno',
        'PIPELINE_TABLERO',
      );
      expect(msg.codigo).toBe('ERROR_AUTORIZACION');
      expect(msg.titulo).toContain('sesión');
      expect(msg.queHacer).toContain('.env');
      expect(esMensajeErrorValido(msg)).toBe(true);
    });

    it('genera mensaje específico para conversación de bandeja no encontrada', () => {
      const msg = construirMensajeErrorAccionable(
        'Conversación no encontrada',
        'BANDEJA_CONVERSACION',
      );
      expect(msg.codigo).toBe('ERROR_CONVERSACION');
      expect(msg.quePaso).toContain('no existe o fue archivado');
      expect(msg.queHacer).toContain('Regresa a la lista');
      expect(esMensajeErrorValido(msg)).toBe(true);
    });

    it('genera mensaje específico para directorio de contactos', () => {
      const msg = construirMensajeErrorAccionable(
        'Error 500 al consultar base de datos',
        'CONTACTOS_LISTA',
      );
      expect(msg.codigo).toBe('ERROR_CONTACTOS');
      expect(msg.quePaso).toContain('listado de viajeros');
      expect(msg.queHacer).toContain('reintenta');
      expect(esMensajeErrorValido(msg)).toBe(true);
    });

    it('genera mensaje específico para expedientes operativos de viaje', () => {
      const msg = construirMensajeErrorAccionable('Localizador no encontrado', 'EXPEDIENTES_VIAJE');
      expect(msg.codigo).toBe('ERROR_EXPEDIENTE');
      expect(msg.queHacer).toContain('buscador');
      expect(esMensajeErrorValido(msg)).toBe(true);
    });

    it('genera mensaje específico para métricas y reportes', () => {
      const msg = construirMensajeErrorAccionable('División por cero en KPI', 'REPORTES_VENTAS');
      expect(msg.codigo).toBe('ERROR_REPORTES');
      expect(msg.queHacer).toContain('rango de fechas');
      expect(esMensajeErrorValido(msg)).toBe(true);
    });
  });

  describe('esMensajeErrorValido', () => {
    it('rechaza títulos genéricos vacíos o sin instrucciones claras', () => {
      expect(
        esMensajeErrorValido({
          titulo: 'Error',
          quePaso: 'Falló algo',
          queHacer: 'Reintenta',
          esReintentable: true,
        }),
      ).toBe(false);

      expect(
        esMensajeErrorValido({
          titulo: 'Ocurrió un error',
          quePaso: 'Falló',
          queHacer: 'Hacer algo',
          esReintentable: true,
        }),
      ).toBe(false);
    });

    it('acepta mensajes explicativos y accionables', () => {
      expect(
        esMensajeErrorValido({
          titulo: 'No se pudo sincronizar el tablero',
          quePaso: 'La conexión con el CRM se interrumpió temporalmente.',
          queHacer: 'Verifica tu conexión y presiona el botón Reintentar.',
          esReintentable: true,
        }),
      ).toBe(true);
    });
  });
});
