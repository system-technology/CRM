import { describe, expect, it } from 'vitest';
import type { TableroPipeline, PaginaDeCotizaciones, ContadoresBandeja } from '@viajapro/contracts';
import {
  obtenerSaludoSegunHora,
  obtenerMensajeBienvenida,
  calcularResumenTrabajo,
  calcularMetricasSeguimientos,
  clasificarUrgenciaSeguimiento,
  calcularRetrasoSeguimiento,
  formatearHoraSeguimiento,
} from './inicio-logica';
import type { PendientesDelDia } from '@viajapro/contracts';

describe('Inicio Lógica (T-037) - Saludo temporal y agregación de métricas de turismo', () => {
  it('1. obtenerSaludoSegunHora retorna saludo adecuado según la franja horaria en Colombia', () => {
    // Mañana: 05:00 a 11:59
    expect(obtenerSaludoSegunHora(5)).toBe('¡Buenos días');
    expect(obtenerSaludoSegunHora(9)).toBe('¡Buenos días');
    expect(obtenerSaludoSegunHora(11)).toBe('¡Buenos días');

    // Tarde: 12:00 a 17:59
    expect(obtenerSaludoSegunHora(12)).toBe('¡Buenas tardes');
    expect(obtenerSaludoSegunHora(15)).toBe('¡Buenas tardes');
    expect(obtenerSaludoSegunHora(17)).toBe('¡Buenas tardes');

    // Noche: 18:00 a 04:59
    expect(obtenerSaludoSegunHora(18)).toBe('¡Buenas noches');
    expect(obtenerSaludoSegunHora(23)).toBe('¡Buenas noches');
    expect(obtenerSaludoSegunHora(2)).toBe('¡Buenas noches');
  });

  it('2. obtenerMensajeBienvenida personaliza con el nombre del asesor si está presente', () => {
    expect(obtenerMensajeBienvenida('Laura Gómez', 9)).toBe('¡Buenos días, Laura Gómez!');
    expect(obtenerMensajeBienvenida('Carlos Ruiz', 15)).toBe('¡Buenas tardes, Carlos Ruiz!');
    expect(obtenerMensajeBienvenida(null, 9)).toBe('¡Buenos días!');
    expect(obtenerMensajeBienvenida('', 20)).toBe('¡Buenas noches!');
  });

  it('3. calcularResumenTrabajo detecta estado vacío cuando no hay actividad', () => {
    const resumen = calcularResumenTrabajo(null, null, null);
    expect(resumen.estaVacio).toBe(true);
    expect(resumen.conversacionesPendientes).toBe(0);
    expect(resumen.oportunidadesActivas).toBe(0);
    expect(resumen.cotizacionesPorVencer).toBe(0);
    expect(resumen.totalVentasEstimadasCop).toBe('0');
  });

  it('4. calcularResumenTrabajo agrega contadores de WhatsApp, pipeline y cotizaciones correctamente', () => {
    const contadoresInbox: ContadoresBandeja = {
      todas: 10,
      mias: 6,
      sinAsignar: 4,
      conversacionesSinLeer: 2,
      mensajesSinLeer: 5,
    };

    const etapaLead = {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
      clave: 'NUEVO_LEAD' as const,
      nombre: 'Nuevo lead',
      esGanada: false,
      esPerdida: false,
      orden: 0,
      probabilidad: 10,
    };
    const etapaCotiz = {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
      clave: 'EN_COTIZACION' as const,
      nombre: 'En cotización',
      esGanada: false,
      esPerdida: false,
      orden: 1,
      probabilidad: 30,
    };
    const etapaGanada = {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a03',
      clave: 'GANADA' as const,
      nombre: 'Ganada',
      esGanada: true,
      esPerdida: false,
      orden: 2,
      probabilidad: 100,
    };

    const tablero: TableroPipeline = {
      columnas: [
        {
          etapa: etapaLead,
          total: 1,
          valorTotal: { unidades: '3000000', moneda: 'COP' },
          oportunidades: [
            {
              id: '00000000-0010-4000-8000-000000000001',
              contactoId: '00000000-0002-4000-8000-000000000001',
              contactoNombre: 'Laura Gómez',
              titulo: 'Excursión Barú',
              destino: 'Cartagena',
              paqueteId: null,
              fechaSalida: null,
              ultimoContactoEn: null,
              etapa: etapaLead,
              valorEstimado: { unidades: '3000000', moneda: 'COP' },
              probabilidad: 10,
              asesorId: null,
              asesorNombre: null,
              proximaTarea: null,
              motivoPerdida: null,
              notaPerdida: null,
              creadaEn: '2026-10-20T10:00:00Z',
            },
          ],
        },
        {
          etapa: etapaCotiz,
          total: 1,
          valorTotal: { unidades: '5000000', moneda: 'COP' },
          oportunidades: [
            {
              id: '00000000-0010-4000-8000-000000000002',
              contactoId: '00000000-0002-4000-8000-000000000002',
              contactoNombre: 'Andrés Cepeda',
              titulo: 'Tour Islas del Rosario VIP',
              destino: 'Cartagena',
              paqueteId: null,
              fechaSalida: null,
              ultimoContactoEn: null,
              etapa: etapaCotiz,
              valorEstimado: { unidades: '5000000', moneda: 'COP' },
              probabilidad: 30,
              asesorId: null,
              asesorNombre: null,
              proximaTarea: null,
              motivoPerdida: null,
              notaPerdida: null,
              creadaEn: '2026-10-21T10:00:00Z',
            },
          ],
        },
        {
          etapa: etapaGanada,
          total: 1,
          valorTotal: { unidades: '8000000', moneda: 'COP' },
          oportunidades: [
            {
              id: '00000000-0010-4000-8000-000000000003',
              contactoId: '00000000-0002-4000-8000-000000000003',
              contactoNombre: 'Mariana Duque',
              titulo: 'Plan San Andrés',
              destino: 'San Andrés',
              paqueteId: null,
              fechaSalida: null,
              ultimoContactoEn: null,
              etapa: etapaGanada,
              valorEstimado: { unidades: '8000000', moneda: 'COP' },
              probabilidad: 100,
              asesorId: null,
              asesorNombre: null,
              proximaTarea: null,
              motivoPerdida: null,
              notaPerdida: null,
              creadaEn: '2026-10-22T10:00:00Z',
            },
          ],
        },
      ],
    };

    const cotizacionesMock: PaginaDeCotizaciones = {
      datos: [
        {
          id: '00000000-0030-4000-8000-000000000001',
          contactoId: '00000000-0002-4000-8000-000000000001',
          oportunidadId: null,
          titulo: 'Cotización Barú VIP',
          estado: 'ENVIADA',
          versionEnviada: 1,
          enviadaEn: '2026-10-20T12:00:00Z',
          creadaEn: '2026-10-20T10:00:00Z',
          ultimaVersionEn: '2026-10-20T10:00:00Z',
          numeroDeVersiones: 1,
          paqueteNombre: 'Excursión Barú',
          fechaSalida: '2026-11-20',
          venta: { unidades: '3000000', moneda: 'COP' },
        },
        {
          id: '00000000-0030-4000-8000-000000000002',
          contactoId: '00000000-0002-4000-8000-000000000002',
          oportunidadId: null,
          titulo: 'Cotización San Andrés',
          estado: 'ACEPTADA',
          versionEnviada: 2,
          enviadaEn: '2026-10-21T12:00:00Z',
          creadaEn: '2026-10-21T10:00:00Z',
          ultimaVersionEn: '2026-10-21T10:00:00Z',
          numeroDeVersiones: 2,
          paqueteNombre: 'Plan San Andrés',
          fechaSalida: '2026-11-25',
          venta: { unidades: '5000000', moneda: 'COP' },
        },
      ],
      pageInfo: { nextCursor: null, hasMore: false },
    };

    const resumen = calcularResumenTrabajo(contadoresInbox, tablero, cotizacionesMock);

    expect(resumen.estaVacio).toBe(false);
    expect(resumen.conversacionesSinAsignar).toBe(4);
    expect(resumen.conversacionesPendientes).toBe(6); // 4 sin asignar + 2 sin leer

    // Oportunidades activas: 1 lead + 1 cotiz = 2 (ganada no es activa)
    expect(resumen.oportunidadesActivas).toBe(2);
    expect(resumen.oportunidadesPorEtapa.nuevoLead).toBe(1);
    expect(resumen.oportunidadesPorEtapa.enCotizacion).toBe(1);
    expect(resumen.oportunidadesPorEtapa.ganadas).toBe(1);

    // Cotizaciones por vencer/enviadas: 1
    expect(resumen.cotizacionesPorVencer).toBe(1);

    // Suma estimada: 3M + 5M + 8M = 16.000.000 COP
    expect(resumen.totalVentasEstimadasCop).toBe('16000000');
  });
});

describe('Inicio Lógica (T-020) - Seguimientos pendientes del día', () => {
  const ahora = new Date('2026-10-27T15:00:00.000Z');

  const pendientesMock: PendientesDelDia = {
    fecha: '2026-10-27',
    vencidos: [
      {
        id: '01932000-0000-7000-8000-000000000071',
        descripcion: 'Confirmar pago de anticipo',
        venceEn: '2026-10-26T15:00:00.000Z',
        completadoEn: null,
        asesorId: '01932000-0000-7000-8000-000000000011',
        asesorNombre: 'Laura Gómez',
        contactoId: '01932000-0000-7000-8000-000000000021',
        contactoNombre: 'Laura Restrepo',
        oportunidadId: '01932000-0000-7000-8000-000000000031',
        oportunidadTitulo: 'Paquete San Andrés',
        conversacionId: null,
      },
    ],
    deHoy: [
      {
        id: '01932000-0000-7000-8000-000000000072',
        descripcion: 'Enviar cotización formal Bora Bora',
        venceEn: '2026-10-27T16:00:00.000Z',
        completadoEn: null,
        asesorId: '01932000-0000-7000-8000-000000000011',
        asesorNombre: 'Laura Gómez',
        contactoId: '01932000-0000-7000-8000-000000000022',
        contactoNombre: 'Sofía Henao',
        oportunidadId: null,
        oportunidadTitulo: null,
        conversacionId: '01932000-0000-7000-8000-000000000042',
      },
      {
        id: '01932000-0000-7000-8000-000000000073',
        descripcion: 'Llamar a cliente por vuelos',
        venceEn: '2026-10-27T18:00:00.000Z',
        completadoEn: null,
        asesorId: '01932000-0000-7000-8000-000000000011',
        asesorNombre: 'Laura Gómez',
        contactoId: '01932000-0000-7000-8000-000000000023',
        contactoNombre: 'Carlos Mario',
        oportunidadId: null,
        oportunidadTitulo: null,
        conversacionId: null,
      },
    ],
  };

  it('1. calcularMetricasSeguimientos resume vencidos, de hoy y estado al día', () => {
    const metricas = calcularMetricasSeguimientos(pendientesMock);
    expect(metricas.totalVencidos).toBe(1);
    expect(metricas.totalHoy).toBe(2);
    expect(metricas.totalPendientes).toBe(3);
    expect(metricas.tieneVencidos).toBe(true);
    expect(metricas.estaAlDia).toBe(false);

    const vacio = calcularMetricasSeguimientos({ fecha: '2026-10-27', vencidos: [], deHoy: [] });
    expect(vacio.totalPendientes).toBe(0);
    expect(vacio.estaAlDia).toBe(true);
    expect(vacio.tieneVencidos).toBe(false);

    const nulo = calcularMetricasSeguimientos(null);
    expect(nulo.totalPendientes).toBe(0);
    expect(nulo.estaAlDia).toBe(true);
  });

  it('2. clasificarUrgenciaSeguimiento distingue entre vencido, urgente y programado', () => {
    // Vencido
    expect(clasificarUrgenciaSeguimiento('2026-10-27T14:00:00.000Z', ahora)).toBe('VENCIDO');

    // Hoy urgente (< 2 horas)
    expect(clasificarUrgenciaSeguimiento('2026-10-27T16:00:00.000Z', ahora)).toBe('HOY_URGENTE');

    // Hoy programado (> 2 horas)
    expect(clasificarUrgenciaSeguimiento('2026-10-27T18:00:00.000Z', ahora)).toBe('HOY_PROGRAMADO');
  });

  it('3. calcularRetrasoSeguimiento formatea el tiempo transcurrido o restante', () => {
    // Vencido hace 35 min
    const hace35m = new Date(ahora.getTime() - 35 * 60 * 1000).toISOString();
    expect(calcularRetrasoSeguimiento(hace35m, ahora)).toBe('Vencido hace 35 min');

    // Vencido hace 3 horas
    const hace3h = new Date(ahora.getTime() - 3 * 3600 * 1000).toISOString();
    expect(calcularRetrasoSeguimiento(hace3h, ahora)).toBe('Vencido hace 3 h');

    // Vencido hace 2 días
    const hace2d = new Date(ahora.getTime() - 48 * 3600 * 1000).toISOString();
    expect(calcularRetrasoSeguimiento(hace2d, ahora)).toBe('Vencido hace 2 d');

    // En 45 min
    const en45m = new Date(ahora.getTime() + 45 * 60 * 1000).toISOString();
    expect(calcularRetrasoSeguimiento(en45m, ahora)).toBe('En 45 min');
  });

  it('4. formatearHoraSeguimiento devuelve formato legible de hora colombiana', () => {
    const hora = formatearHoraSeguimiento('2026-10-27T19:30:00.000Z');
    expect(hora).toBeTruthy();
    expect(hora.length).toBeGreaterThan(3);
  });
});
