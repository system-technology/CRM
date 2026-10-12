import { describe, expect, it } from 'vitest';
import {
  extraerDatosViajeDeMensajes,
  generarResumenConversacion,
  sugerirRespuestaComercial,
  calificarLead,
} from './asistente-ia-logica';

describe('Pruebas Unitarias del Asistente Copilot IA (asistente-ia-logica.ts)', () => {
  describe('extraerDatosViajeDeMensajes', () => {
    it('extrae destino, fechas, pasajeros y presupuesto correctamente', () => {
      const mensajes = [
        'Hola buenas tardes',
        'Quisiera cotizar un viaje a Cancún para 2 adultos y 1 niño en diciembre',
        'Tenemos un presupuesto de unos 8 millones todo incluido',
      ];

      const datos = extraerDatosViajeDeMensajes(mensajes);
      expect(datos.destino).toBe('Cancún');
      expect(datos.adultos).toBe(2);
      expect(datos.ninos).toBe(1);
      expect(datos.fechasTentativas).toBe('Diciembre');
      expect(datos.presupuestoEstimadoCop).toBe(8_000_000); // R8: COP entero
      expect(datos.interesEspecifico).toBe('Plan Todo Incluido');
      expect(datos.confianza).toBe('ALTA');
    });

    it('maneja consultas sin destino ni presupuesto definido', () => {
      const mensajes = ['Buenas noches, qué promociones tienen vigentes?'];
      const datos = extraerDatosViajeDeMensajes(mensajes);

      expect(datos.destino).toBeNull();
      expect(datos.presupuestoEstimadoCop).toBeNull();
      expect(datos.confianza).toBe('BAJA');
    });
  });

  describe('generarResumenConversacion', () => {
    it('genera 3 puntos clave estructurados para el asesor', () => {
      const mensajes = [
        'Hola, buscamos plan a San Andrés para viajar mi pareja y yo en semana santa',
      ];
      const resumen = generarResumenConversacion(mensajes, 'Camila');

      expect(resumen.puntosClave).toHaveLength(3);
      expect(resumen.puntosClave[0]).toContain('San Andrés');
      expect(resumen.intencionPrincipal).toContain('San Andrés');
      expect(resumen.proximaAccionSugerida.length).toBeGreaterThan(10);
    });
  });

  describe('sugerirRespuestaComercial', () => {
    it('genera mensaje personalizado con destino, pax y llamado a cotización', () => {
      const datos = {
        destino: 'Punta Cana',
        adultos: 2,
        ninos: 0,
        fechasTentativas: 'Noviembre',
        presupuestoEstimadoCop: 6_000_000,
        interesEspecifico: 'Plan Todo Incluido',
        confianza: 'ALTA' as const,
      };

      const respuesta = sugerirRespuestaComercial(datos, 'Santiago Castro');
      expect(respuesta).toContain('Santiago');
      expect(respuesta).toContain('Punta Cana');
      expect(respuesta).toContain('2 personas');
      expect(respuesta).toContain('prepare una cotización');
    });
  });

  describe('calificarLead', () => {
    it('califica como ALTO un lead con destino, fechas y presupuesto', () => {
      const datos = {
        destino: 'Cancún',
        adultos: 2,
        ninos: 0,
        fechasTentativas: 'Diciembre',
        presupuestoEstimadoCop: 9_000_000,
        interesEspecifico: null,
        confianza: 'ALTA' as const,
      };

      const calificacion = calificarLead(datos);
      expect(calificacion.nivel).toBe('ALTO');
      expect(calificacion.puntuacion).toBeGreaterThanOrEqual(70);
      expect(calificacion.justificacion).toContain('Destino definido');
    });

    it('califica como BAJO un lead sin parámetros', () => {
      const datos = {
        destino: null,
        adultos: 2,
        ninos: 0,
        fechasTentativas: null,
        presupuestoEstimadoCop: null,
        interesEspecifico: null,
        confianza: 'BAJA' as const,
      };

      const calificacion = calificarLead(datos);
      expect(calificacion.nivel).toBe('BAJO');
      expect(calificacion.puntuacion).toBeLessThan(50);
    });
  });
});
