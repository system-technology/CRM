import { describe, it, expect } from 'vitest';
import {
  calcularEstadoVentana24h,
  interpretarCalidadMeta,
  interpretarTierMensajeria,
  validarIdentificadoresPublicos,
  PLANTILLAS_OFICIALES_AGENCIA,
  DATOS_WHATSAPP_CONECTADO_DEFAULT,
} from './whatsapp-conexion-logica';

describe('whatsapp-conexion-logica — Lógica de WhatsApp Cloud API y Ventana 24h (T-106)', () => {
  it('1. calcularEstadoVentana24h calcula correctamente ventana abierta para mensaje reciente', () => {
    const ahora = new Date('2026-10-28T12:00:00.000Z');
    // Mensaje hace 4 horas
    const ultimoMensaje = new Date('2026-10-28T08:00:00.000Z');

    const res = calcularEstadoVentana24h(ultimoMensaje, ahora);

    expect(res.abierta).toBe(true);
    expect(res.minutosRestantes).toBe(20 * 60);
    expect(res.horasRestantes).toBe(20);
    expect(res.tipoMensajePermitido).toBe('LIBRE_ASESOR');
    expect(res.etiquetaEstado).toContain('20h 0m restantes');
    expect(res.explicacionAgencia).toContain('Puedes responder con texto libre');
  });

  it('2. calcularEstadoVentana24h calcula ventana cerrada cuando transcurrieron más de 24 horas', () => {
    const ahora = new Date('2026-10-28T12:00:00.000Z');
    // Mensaje hace 25 horas
    const ultimoMensaje = new Date('2026-10-27T11:00:00.000Z');

    const res = calcularEstadoVentana24h(ultimoMensaje, ahora);

    expect(res.abierta).toBe(false);
    expect(res.minutosRestantes).toBe(0);
    expect(res.horasRestantes).toBe(0);
    expect(res.porcentajeTranscurrido).toBe(100);
    expect(res.tipoMensajePermitido).toBe('SOLO_PLANTILLA_HSM');
    expect(res.etiquetaEstado).toContain('Ventana Cerrada');
    expect(res.explicacionAgencia).toContain('debes enviar una plantilla pre-aprobada');
  });

  it('3. interpretarCalidadMeta traduce los ratings de Meta a lenguaje claro de agencia', () => {
    const verde = interpretarCalidadMeta('GREEN');
    expect(verde.etiqueta).toContain('Calidad Alta');
    expect(verde.descripcionAgencia).toContain('excelente reputación');

    const amarillo = interpretarCalidadMeta('YELLOW');
    expect(amarillo.etiqueta).toContain('Advertencia');
    expect(amarillo.descripcionAgencia).toContain('bloquearon el número');

    const rojo = interpretarCalidadMeta('RED');
    expect(rojo.etiqueta).toContain('Riesgo Crítico');
    expect(rojo.accionRecomendada).toContain('Detén de inmediato campañas');
  });

  it('4. interpretarTierMensajeria detalla la capacidad diaria de clientes únicos', () => {
    const tier1k = interpretarTierMensajeria('TIER_1K');
    expect(tier1k.limiteDiario).toContain('1.000 clientes');

    const tier10k = interpretarTierMensajeria('TIER_10K');
    expect(tier10k.limiteDiario).toContain('10.000 clientes');

    const tierIlimitado = interpretarTierMensajeria('TIER_UNLIMITED');
    expect(tierIlimitado.limiteDiario).toBe('Ilimitado');
  });

  it('5. validarIdentificadoresPublicos exige IDs numéricos y bloquea secretos (Regla R6)', () => {
    // Vacío
    expect(validarIdentificadoresPublicos('', '123456789012').valido).toBe(false);
    expect(validarIdentificadoresPublicos('123456789012', '').valido).toBe(false);

    // Tokens secretos bloqueados
    const intentoSecreto = validarIdentificadoresPublicos(
      'EAAB1234567890abcdef',
      '109283746589012',
    );
    expect(intentoSecreto.valido).toBe(false);
    expect(intentoSecreto.error).toContain('Regla R6');

    // No numérico
    const noNumerico = validarIdentificadoresPublicos('id-con-letras-invalido', '109283746589012');
    expect(noNumerico.valido).toBe(false);
    expect(noNumerico.error).toContain('dígitos numéricos');

    // Válido
    const valido = validarIdentificadoresPublicos('109283746589012', '384729105829103');
    expect(valido.valido).toBe(true);
    expect(valido.error).toBeUndefined();
  });

  it('6. PLANTILLAS_OFICIALES_AGENCIA contiene plantillas de utilidad para cotización y salidas', () => {
    expect(PLANTILLAS_OFICIALES_AGENCIA.length).toBeGreaterThanOrEqual(4);
    expect(PLANTILLAS_OFICIALES_AGENCIA.some((p) => p.nombreVisible.includes('Cotización'))).toBe(
      true,
    );
    expect(
      PLANTILLAS_OFICIALES_AGENCIA.some((p) => p.nombreVisible.includes('Punto de Encuentro')),
    ).toBe(true);
  });

  it('7. DATOS_WHATSAPP_CONECTADO_DEFAULT provee datos coherentes para agencia activa', () => {
    expect(DATOS_WHATSAPP_CONECTADO_DEFAULT.conectado).toBe(true);
    expect(DATOS_WHATSAPP_CONECTADO_DEFAULT.numeroE164).toBe('+57 300 987 6543');
    expect(DATOS_WHATSAPP_CONECTADO_DEFAULT.webhookUrl).toContain('/inbox/webhook/meta');
  });
});
