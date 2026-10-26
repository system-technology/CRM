import { describe, expect, it } from 'vitest';
import type {
  ConversacionResumen,
  ContadoresBandeja,
  TableroPipeline,
  FilaDeCotizacion,
  EtapaDefinida,
} from '@viajapro/contracts';
import {
  agregarMetricasConversaciones,
  agregarMetricasPipeline,
  agregarMetricasCotizaciones,
} from './inicio-logica';

describe('inicio-logica — Agregación de Métricas Operativas (T-020)', () => {
  describe('agregarMetricasConversaciones', () => {
    it('calcula pendientes, sin responder y ventana crítica correctamente', () => {
      const ahora = Date.now();
      const expiraEn2Horas = new Date(ahora + 2 * 60 * 60 * 1000).toISOString();
      const expiraEn10Horas = new Date(ahora + 10 * 60 * 60 * 1000).toISOString();

      const conversaciones: ConversacionResumen[] = [
        {
          id: 'c1',
          contactoId: 'ct1',
          contactoNombre: 'Ana Maria',
          contactoTelefono: '3001234567',
          estado: 'ABIERTA',
          ventana: { abierta: true, expiraEn: expiraEn2Horas, minutosRestantes: 120 },
          asignadoAId: null,
          asignadoANombre: null,
          ultimoMensajeTexto: 'Hola, precio de Guatapé?',
          ultimoMensajeEn: new Date().toISOString(),
          ultimoMensajeDireccion: 'ENTRANTE',
          mensajesSinLeer: 2,
          slaVenceEn: null,
          etiquetas: ['excursion'],
        },
        {
          id: 'c2',
          contactoId: 'ct2',
          contactoNombre: 'Juan Perez',
          contactoTelefono: '3109876543',
          estado: 'ABIERTA',
          ventana: { abierta: true, expiraEn: expiraEn10Horas, minutosRestantes: 600 },
          asignadoAId: 'user-1',
          asignadoANombre: 'Asesor 1',
          ultimoMensajeTexto: 'Gracias por la cotización',
          ultimoMensajeEn: new Date().toISOString(),
          ultimoMensajeDireccion: 'SALIENTE',
          mensajesSinLeer: 0,
          slaVenceEn: null,
          etiquetas: [],
        },
      ];

      const contadores: ContadoresBandeja = {
        todas: 2,
        conversacionesSinLeer: 1,
        sinAsignar: 1,
        mensajesSinLeer: 2,
        mias: 0,
      };

      const metricas = agregarMetricasConversaciones(conversaciones, contadores);

      expect(metricas.totalPendientes).toBe(2);
      expect(metricas.sinResponder).toBe(1);
      expect(metricas.ventanaCritica).toBe(1);
      expect(metricas.sinAsignar).toBe(1);
      expect(metricas.itemsUrgentes.length).toBe(1);
      expect(metricas.itemsUrgentes[0]?.contactoNombre).toBe('Ana Maria');
      expect(metricas.itemsUrgentes[0]?.esUrgente).toBe(true);
    });

    it('devuelve métricas en cero si la lista está vacía', () => {
      const metricas = agregarMetricasConversaciones([]);
      expect(metricas.totalPendientes).toBe(0);
      expect(metricas.sinResponder).toBe(0);
      expect(metricas.ventanaCritica).toBe(0);
      expect(metricas.itemsUrgentes).toEqual([]);
    });
  });

  describe('agregarMetricasPipeline', () => {
    it('agrega oportunidades por etapa y calcula valor total en COP', () => {
      const etapa1: EtapaDefinida = {
        id: 'et1',
        clave: 'NUEVO_LEAD',
        nombre: 'Nuevo lead',
        orden: 1,
        probabilidad: 10,
        esGanada: false,
        esPerdida: false,
      };

      const etapa2: EtapaDefinida = {
        id: 'et2',
        clave: 'EN_COTIZACION',
        nombre: 'En cotización',
        orden: 2,
        probabilidad: 30,
        esGanada: false,
        esPerdida: false,
      };

      const tablero: TableroPipeline = {
        columnas: [
          {
            etapa: etapa1,
            total: 2,
            valorTotal: { unidades: '10000000', moneda: 'COP' },
            oportunidades: [
              {
                id: 'op1',
                contactoId: 'ct1',
                contactoNombre: 'Camila',
                titulo: 'Viaje a Cartagena',
                destino: 'Cartagena',
                paqueteId: 'pkg1',
                fechaSalida: '2026-11-20',
                etapa: etapa1,
                valorEstimado: { unidades: '4000000', moneda: 'COP' },
                probabilidad: 10,
                asesorId: 'user1',
                asesorNombre: 'Asesor',
                proximaTarea: null,
                motivoPerdida: null,
                notaPerdida: null,
                creadaEn: '2026-10-20T00:00:00Z',
                ultimoContactoEn: '2026-10-21T00:00:00Z',
              },
              {
                id: 'op2',
                contactoId: 'ct2',
                contactoNombre: 'Esteban',
                titulo: 'Tour Eje Cafetero',
                destino: 'Armenia',
                paqueteId: 'pkg2',
                fechaSalida: '2026-11-25',
                etapa: etapa1,
                valorEstimado: { unidades: '6000000', moneda: 'COP' },
                probabilidad: 10,
                asesorId: 'user1',
                asesorNombre: 'Asesor',
                proximaTarea: null,
                motivoPerdida: null,
                notaPerdida: null,
                creadaEn: '2026-10-20T00:00:00Z',
                ultimoContactoEn: '2026-10-21T00:00:00Z',
              },
            ],
          },
          {
            etapa: etapa2,
            total: 1,
            valorTotal: { unidades: '15000000', moneda: 'COP' },
            oportunidades: [
              {
                id: 'op3',
                contactoId: 'ct3',
                contactoNombre: 'Diana',
                titulo: 'Grupo San Andrés',
                destino: 'San Andrés',
                paqueteId: 'pkg3',
                fechaSalida: '2026-12-10',
                etapa: etapa2,
                valorEstimado: { unidades: '15000000', moneda: 'COP' },
                probabilidad: 30,
                asesorId: 'user1',
                asesorNombre: 'Asesor',
                proximaTarea: null,
                motivoPerdida: null,
                notaPerdida: null,
                creadaEn: '2026-10-20T00:00:00Z',
                ultimoContactoEn: '2026-10-21T00:00:00Z',
              },
            ],
          },
        ],
      };

      const metricas = agregarMetricasPipeline(tablero);

      expect(metricas.totalOportunidades).toBe(3);
      expect(metricas.valorTotalCop).toBe(25000000);
      expect(metricas.etapas.length).toBe(2);
      expect(metricas.etapas[0]?.cantidad).toBe(2);
      expect(metricas.etapas[0]?.valorCop).toBe(10000000);
      expect(metricas.oportunidadesDestacadas[0]?.contactoNombre).toBe('Diana');
      expect(metricas.oportunidadesDestacadas[0]?.valorCop).toBe(15000000);
    });

    it('devuelve total en 0 si no hay columnas en el tablero', () => {
      const metricas = agregarMetricasPipeline({ columnas: [] });
      expect(metricas.totalOportunidades).toBe(0);
      expect(metricas.valorTotalCop).toBe(0);
      expect(metricas.etapas).toEqual([]);
    });
  });

  describe('agregarMetricasCotizaciones', () => {
    it('detecta cotizaciones por vencer y críticas según fecha de salida', () => {
      const fechaBase = new Date('2026-10-26T12:00:00.000Z');

      const cotizaciones: FilaDeCotizacion[] = [
        {
          id: 'cot1',
          contactoId: 'ct1',
          oportunidadId: null,
          titulo: 'Cotización Santa Marta',
          estado: 'ENVIADA',
          versionEnviada: 1,
          enviadaEn: '2026-10-25T00:00:00Z',
          creadaEn: '2026-10-25T00:00:00Z',
          ultimaVersionEn: '2026-10-25T00:00:00Z',
          numeroDeVersiones: 1,
          paqueteNombre: 'Playas Santa Marta',
          fechaSalida: '2026-10-28T00:00:00Z', // Vence en 2 días (crítica)
          venta: { unidades: '3500000', moneda: 'COP' },
        },
        {
          id: 'cot2',
          contactoId: 'ct2',
          oportunidadId: null,
          titulo: 'Cotización Medellín',
          estado: 'ENVIADA',
          versionEnviada: 1,
          enviadaEn: '2026-10-20T00:00:00Z',
          creadaEn: '2026-10-20T00:00:00Z',
          ultimaVersionEn: '2026-10-20T00:00:00Z',
          numeroDeVersiones: 1,
          paqueteNombre: 'Ciudad de la Eterna Primavera',
          fechaSalida: '2026-11-20T00:00:00Z', // Vence después de 7 días pero estado ENVIADA
          venta: { unidades: '2200000', moneda: 'COP' },
        },
      ];

      const metricas = agregarMetricasCotizaciones(cotizaciones, fechaBase);

      expect(metricas.enviadas).toBe(2);
      expect(metricas.totalPorVencer).toBeGreaterThanOrEqual(1);
      expect(metricas.proximas[0]?.esCritica).toBe(true);
      expect(metricas.proximas[0]?.titulo).toBe('Cotización Santa Marta');
      expect(metricas.proximas[0]?.totalCop).toBe(3500000);
    });

    it('devuelve métricas vacías si no hay cotizaciones', () => {
      const metricas = agregarMetricasCotizaciones([]);
      expect(metricas.totalPorVencer).toBe(0);
      expect(metricas.enviadas).toBe(0);
      expect(metricas.proximas).toEqual([]);
    });
  });
});
