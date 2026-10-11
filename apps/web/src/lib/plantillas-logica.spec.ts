import { describe, expect, it } from 'vitest';
import {
  interpolarPlantilla,
  calcularEstadoVentana,
  validarEnvioPlantilla,
  generarClaveIdempotencia,
} from './plantillas-logica';
import { obtenerMockPlantillasDisponibles } from './mock-plantillas';

describe('Pruebas Automáticas de Plantillas Meta HSM y Ventana 24h (/bandeja) — Tarea 6', () => {
  // 1. Interpolación de variables {{1}}, {{2}}
  it('1. interpolarPlantilla reemplaza correctamente los marcadores {{1}} y {{2}} en el cuerpo', () => {
    const cuerpo = 'Hola {{1}}, tu cotización a {{2}} está lista. ¿Deseas revisarla?';
    const valores = ['Juan Pérez', 'Cancún'];

    const resultado = interpolarPlantilla(cuerpo, valores);
    expect(resultado).toBe(
      'Hola Juan Pérez, tu cotización a Cancún está lista. ¿Deseas revisarla?',
    );
  });

  // 2. Regla de Contrato Zod: variables vacías o en blanco son rechazadas
  it('2. validarEnvioPlantilla rechaza el envío si algún valor de variable está vacío o en blanco (superRefine)', () => {
    const intentoConHuecoVacio = {
      conversacionId: '00000000-0001-4000-8000-000000000001',
      plantillaId: '00000000-0020-4000-8000-000000000001',
      idioma: 'es_CO',
      valores: ['Juan Pérez', '   '], // Segundo hueco en blanco
      claveIdempotencia: generarClaveIdempotencia(),
    };

    const resultado = validarEnvioPlantilla(intentoConHuecoVacio);
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error?.issues[0]?.message).toContain('Falta el valor de {{2}}');
    }
  });

  // 3. Regla de Contrato Zod: envío válido con valores completos y clave UUID pasa con éxito
  it('3. validarEnvioPlantilla valida con éxito cuando todos los huecos están llenos y lleva UUID de idempotencia (R5)', () => {
    const intentoValido = {
      conversacionId: '00000000-0001-4000-8000-000000000001',
      plantillaId: '00000000-0020-4000-8000-000000000001',
      idioma: 'es_CO',
      valores: ['Juan Pérez', 'Cancún'],
      claveIdempotencia: generarClaveIdempotencia(),
    };

    const resultado = validarEnvioPlantilla(intentoValido);
    expect(resultado.success).toBe(true);
  });

  // 4. Detección de ventana urgente (<2h)
  it('4. calcularEstadoVentana marca esUrgente = true cuando faltan menos de 120 minutos (2 horas)', () => {
    const dentroDe90Min = new Date(Date.now() + 90 * 60000).toISOString();
    const estado = calcularEstadoVentana(dentroDe90Min);

    expect(estado.cerrada).toBe(false);
    expect(estado.esUrgente).toBe(true);
    expect(estado.horasRestantes).toBe(1);
    expect(estado.minutosRestantes).toBeGreaterThanOrEqual(89);
  });

  // 5. Detección de ventana cerrada
  it('5. calcularEstadoVentana marca cerrada = true cuando la fecha expiraEn está en el pasado', () => {
    const haceUnaHora = new Date(Date.now() - 3600000).toISOString();
    const estado = calcularEstadoVentana(haceUnaHora);

    expect(estado.cerrada).toBe(true);
    expect(estado.esUrgente).toBe(false);
    expect(estado.minutosRestantes).toBe(0);
    expect(estado.texto).toBe('Ventana cerrada');
  });

  // 6. Validación de catálogo simulado de plantillas
  it('6. obtenerMockPlantillasDisponibles contiene plantillas aprobadas y pausadas con sus motivos', () => {
    const catalogo = obtenerMockPlantillasDisponibles();
    expect(catalogo.aprobadas).toBeGreaterThanOrEqual(3);
    expect(catalogo.plantillas.some((p) => p.estado === 'PAUSADA')).toBe(true);
    expect(catalogo.plantillas.some((p) => p.estado === 'RECHAZADA')).toBe(true);

    const pausada = catalogo.plantillas.find((p) => p.estado === 'PAUSADA');
    expect(pausada?.motivoEstado).toContain('Pausada automáticamente por Meta');
  });
});
