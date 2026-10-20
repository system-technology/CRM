import { describe, it, expect } from 'vitest';
import {
  determinarEstadoPantalla,
  construirMensajeErrorAccionable,
  esMensajeErrorValido,
  clasificarError,
  formatearErrorAmigable,
  esTextoTecnico,
} from './estados-ui-logica';

describe('estados-ui-logica (Tareas 0c.25 y 0c.30)', () => {
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

  describe('clasificarError y formatearErrorAmigable (0c.30)', () => {
    it('clasifica TypeError: Failed to fetch como error de RED en español', () => {
      const errorRed = new TypeError('Failed to fetch');
      const clasificado = clasificarError(errorRed);

      expect(clasificado.categoria).toBe('RED');
      expect(clasificado.codigo).toBe('ERROR_RED');
      expect(clasificado.titulo).toBe('Sin conexión con el servidor');
      expect(clasificado.quePaso).toContain('interrupción');
      expect(clasificado.queHacer).toContain('Reintentar');
      expect(clasificado.quePaso).not.toContain('Failed to fetch');
      expect(clasificado.quePaso).not.toContain('TypeError');

      const textoInline = formatearErrorAmigable(errorRed);
      expect(textoInline).toContain('Sin conexión');
    });

    it('filtra errores 500 con trazas técnicas o de base de datos sin mostrarlas al usuario', () => {
      const errorTecnico = new Error(
        'Internal Server Error 500: Database connection pool exhausted at PostgresPool.acquire (/app/node_modules/pg/lib/pool.js:45:12)',
      );
      const clasificado = clasificarError(errorTecnico);

      expect(clasificado.categoria).toBe('DESCONOCIDO');
      expect(clasificado.codigo).toBe('ERROR_SERVIDOR');
      expect(clasificado.titulo).toContain('servidor');
      expect(clasificado.quePaso).not.toContain('PostgresPool');
      expect(clasificado.quePaso).not.toContain('/app/node_modules');
      expect(clasificado.quePaso).not.toContain('pool.js');

      const textoInline = formatearErrorAmigable(
        errorTecnico,
        'No se pudo conectar con el servicio.',
      );
      expect(textoInline).not.toContain('PostgresPool');
      expect(textoInline).not.toContain('pool.js');
    });

    it('conserva mensajes de error de dominio ya redactados para humanos', () => {
      const errorDominio = new Error(
        'La salida seleccionada para el Parque del Café no tiene cupos disponibles en acomodación doble.',
      );
      const clasificado = clasificarError(errorDominio);

      expect(clasificado.categoria).toBe('DESCONOCIDO');
      expect(clasificado.codigo).toBe('ERROR_DOMINIO');
      expect(clasificado.quePaso).toContain('Parque del Café');
      expect(clasificado.quePaso).toContain('no tiene cupos');

      const textoInline = formatearErrorAmigable(errorDominio);
      expect(textoInline).toBe(errorDominio.message);
    });

    it('clasifica errores de autorización o tenant expirado', () => {
      const errorAuth = new Error(
        'HTTP 401: Unauthorized. El token de sesión del tenant ha expirado',
      );
      const clasificado = clasificarError(errorAuth);

      expect(clasificado.categoria).toBe('SESION');
      expect(clasificado.codigo).toBe('ERROR_AUTORIZACION');
      expect(clasificado.queHacer).toContain('sesión');
    });

    it('clasifica errores de validación de contratos (400 / 409)', () => {
      const errorVal = new Error('HTTP 400: Error de validación Zod en campos de cotización');
      const clasificado = clasificarError(errorVal);

      expect(clasificado.categoria).toBe('VALIDACION');
      expect(clasificado.codigo).toBe('ERROR_VALIDACION');
      expect(clasificado.queHacer).toContain('formulario');
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
      expect(msg.quePaso).toContain('interrupción');
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
      expect(msg.titulo.toLowerCase()).toContain('sesión');
      expect(msg.queHacer).toContain('sesión');
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

  describe('esTextoTecnico y esMensajeErrorValido', () => {
    it('detecta texto técnico como stack traces y SQL', () => {
      expect(esTextoTecnico('at Object.run (/src/index.js:10:5)')).toBe(true);
      expect(esTextoTecnico('Error en SELECT * FROM cotizaciones')).toBe(true);
      expect(esTextoTecnico('TypeError: Failed to fetch')).toBe(true);
      expect(esTextoTecnico('No hay disponibilidad para el hotel seleccionado')).toBe(false);
    });

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
