import { describe, expect, it } from 'vitest';
import {
  calcularEstadoEnsayoJornada,
  contarCotizacionesEnviadas,
  contarSeguimientosFechados,
  META_CONVERSACIONES_ATENDIDAS_FASE_1,
  META_COTIZACIONES_ENVIADAS_FASE_1,
} from './ensayo-logica';

describe('calcularEstadoEnsayoJornada (T-115)', () => {
  it('marca el criterio de Fase 1 como cumplido cuando se alcanzan las 3 metas en modo real', () => {
    const resultado = calcularEstadoEnsayoJornada({
      conversacionesAtendidas: 22,
      cotizacionesEnviadas: 6,
      seguimientosFechados: 8,
      conversacionesSinCerrar: 7,
      modoDemo: false,
      origenDatosEsDemo: false,
    });

    expect(resultado.conversacionesCumplido).toBe(true);
    expect(resultado.cotizacionesCumplido).toBe(true);
    expect(resultado.seguimientosCumplido).toBe(true);
    expect(resultado.metasContadoresCumplidas).toBe(true);
    expect(resultado.criterioFase1Cumplido).toBe(true);
    expect(resultado.datosDemoDescartadosEnModoReal).toBe(false);
    expect(resultado.indicadores[0].porcentaje).toBe(100);
    expect(resultado.indicadores[1].porcentaje).toBe(100);
    expect(resultado.indicadores[2].porcentaje).toBe(100);
  });

  it('mantiene pendiente el criterio de Fase 1 si falta alguna de las metas (20 conv / 5 cotiz / seguimientos)', () => {
    const resultado = calcularEstadoEnsayoJornada({
      conversacionesAtendidas: 14,
      cotizacionesEnviadas: 5,
      seguimientosFechados: 3,
      conversacionesSinCerrar: 3,
      modoDemo: false,
      origenDatosEsDemo: false,
    });

    expect(resultado.conversacionesAtendidas).toBe(14);
    expect(resultado.metaConversaciones).toBe(META_CONVERSACIONES_ATENDIDAS_FASE_1);
    expect(resultado.metaCotizaciones).toBe(META_COTIZACIONES_ENVIADAS_FASE_1);
    expect(resultado.conversacionesCumplido).toBe(false);
    expect(resultado.cotizacionesCumplido).toBe(true);
    expect(resultado.seguimientosCumplido).toBe(true);
    expect(resultado.criterioFase1Cumplido).toBe(false);
  });

  it('exige tantos seguimientos fechados como conversaciones abiertas sin cerrar existan', () => {
    const incompleto = calcularEstadoEnsayoJornada({
      conversacionesAtendidas: 20,
      cotizacionesEnviadas: 5,
      seguimientosFechados: 3,
      conversacionesSinCerrar: 5,
      modoDemo: false,
    });

    expect(incompleto.metaSeguimientos).toBe(5);
    expect(incompleto.seguimientosCumplido).toBe(false);
    expect(incompleto.criterioFase1Cumplido).toBe(false);
  });

  it('descarta estrictamente datos de demostración cuando se ejecuta en modo real', () => {
    const resultado = calcularEstadoEnsayoJornada({
      conversacionesAtendidas: 25,
      cotizacionesEnviadas: 10,
      seguimientosFechados: 12,
      conversacionesSinCerrar: 4,
      modoDemo: false,
      origenDatosEsDemo: true,
    });

    expect(resultado.datosDemoDescartadosEnModoReal).toBe(true);
    expect(resultado.conversacionesAtendidas).toBe(0);
    expect(resultado.cotizacionesEnviadas).toBe(0);
    expect(resultado.seguimientosFechados).toBe(0);
    expect(resultado.metasContadoresCumplidas).toBe(false);
    expect(resultado.criterioFase1Cumplido).toBe(false);
  });

  it('no otorga la marca verde de salida de Fase 1 si la aplicación está en modo demostración', () => {
    const resultado = calcularEstadoEnsayoJornada({
      conversacionesAtendidas: 25,
      cotizacionesEnviadas: 8,
      seguimientosFechados: 10,
      conversacionesSinCerrar: 5,
      modoDemo: true,
      origenDatosEsDemo: true,
    });

    expect(resultado.metasContadoresCumplidas).toBe(true);
    expect(resultado.criterioFase1Cumplido).toBe(false);
  });

  it('filtra correctamente cotizaciones enviadas y seguimientos con fecha programada válida', () => {
    const enviadas = contarCotizacionesEnviadas([
      { estado: 'BORRADOR', enviadaEn: null },
      { estado: 'ENVIADA', enviadaEn: '2026-10-29T10:00:00.000Z' },
      { estado: 'ACEPTADA', enviadaEn: '2026-10-28T15:00:00.000Z' },
      { estado: 'VENCIDA', enviadaEn: '2026-10-20T12:00:00.000Z' },
      { estado: 'BORRADOR' },
    ]);

    const fechados = contarSeguimientosFechados([
      { programadoPara: '2026-10-30T14:00:00.000Z' },
      { programadoPara: '' },
      { programadoPara: null },
      { programadoPara: 'fecha-invalida' },
      { programadoPara: '2026-10-31T09:30:00.000Z' },
    ]);

    expect(enviadas).toBe(3);
    expect(fechados).toBe(2);
  });
});
