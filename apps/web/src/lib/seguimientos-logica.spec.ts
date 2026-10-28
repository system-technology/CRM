import { describe, it, expect } from 'vitest';
import type { Seguimiento } from '@viajapro/contracts';
import {
  clasificarSeguimiento,
  calcularMetricasSeguimientos,
  filtrarYOrdenarSeguimientos,
  formatearDetalleVencimiento,
} from './seguimientos-logica';

describe('seguimientos-logica (T-101)', () => {
  const FECHA_BASE = new Date('2026-10-28T12:00:00.000Z');

  const mockSeguimientos: Seguimiento[] = [
    {
      id: '01932000-0000-7000-8000-000000000001',
      descripcion: 'Llamar a cliente para confirmar pasaportes',
      venceEn: '2026-10-26T10:00:00.000Z', // 2 días atrás (Vencido)
      completadoEn: null,
      asesorId: 'asesor-1',
      asesorNombre: 'Laura Gómez',
      contactoId: 'contacto-1',
      contactoNombre: 'Laura Restrepo',
      oportunidadId: 'op-1',
      oportunidadTitulo: 'Viaje San Andrés Decameron',
      conversacionId: 'conv-1',
    },
    {
      id: '01932000-0000-7000-8000-000000000002',
      descripcion: 'Enviar itinerario actualizado Barú',
      venceEn: '2026-10-28T14:00:00.000Z', // Mismo día (Hoy, 2 horas después)
      completadoEn: null,
      asesorId: 'asesor-1',
      asesorNombre: 'Laura Gómez',
      contactoId: 'contacto-2',
      contactoNombre: 'Carlos Valencia',
      oportunidadId: null,
      oportunidadTitulo: null,
      conversacionId: 'conv-2',
    },
    {
      id: '01932000-0000-7000-8000-000000000003',
      descripcion: 'Reunión virtual para cierre de paquete Europa',
      venceEn: '2026-10-30T10:00:00.000Z', // 2 días después (Próximo)
      completadoEn: null,
      asesorId: 'asesor-2',
      asesorNombre: 'Pedro Martínez',
      contactoId: 'contacto-3',
      contactoNombre: 'Andrés Cepeda',
      oportunidadId: 'op-3',
      oportunidadTitulo: 'Eurotrip 15 Días',
      conversacionId: null,
    },
    {
      id: '01932000-0000-7000-8000-000000000004',
      descripcion: 'Confirmar recepción de voucher hotelero',
      venceEn: '2026-10-27T09:00:00.000Z',
      completadoEn: '2026-10-27T09:30:00.000Z', // Completado
      asesorId: 'asesor-1',
      asesorNombre: 'Laura Gómez',
      contactoId: 'contacto-1',
      contactoNombre: 'Laura Restrepo',
      oportunidadId: null,
      oportunidadTitulo: null,
      conversacionId: 'conv-1',
    },
  ];

  describe('clasificarSeguimiento', () => {
    it('clasifica como COMPLETADO si tiene completadoEn establecido', () => {
      const res = clasificarSeguimiento(mockSeguimientos[3]!, FECHA_BASE);
      expect(res).toBe('COMPLETADO');
    });

    it('clasifica como VENCIDO si la fecha de vencimiento es previa al día actual', () => {
      const res = clasificarSeguimiento(mockSeguimientos[0]!, FECHA_BASE);
      expect(res).toBe('VENCIDO');
    });

    it('clasifica como HOY si la fecha de vencimiento está dentro del día actual', () => {
      const res = clasificarSeguimiento(mockSeguimientos[1]!, FECHA_BASE);
      expect(res).toBe('HOY');
    });

    it('clasifica como PROXIMO si la fecha de vencimiento es posterior a hoy', () => {
      const res = clasificarSeguimiento(mockSeguimientos[2]!, FECHA_BASE);
      expect(res).toBe('PROXIMO');
    });
  });

  describe('calcularMetricasSeguimientos', () => {
    it('calcula los totales consolidados por categoría', () => {
      const metricas = calcularMetricasSeguimientos(mockSeguimientos, FECHA_BASE);

      expect(metricas.total).toBe(4);
      expect(metricas.pendientes).toBe(3);
      expect(metricas.vencidos).toBe(1);
      expect(metricas.deHoy).toBe(1);
      expect(metricas.proximos).toBe(1);
      expect(metricas.completados).toBe(1);
    });

    it('retorna ceros cuando la lista está vacía', () => {
      const metricas = calcularMetricasSeguimientos([], FECHA_BASE);
      expect(metricas.total).toBe(0);
      expect(metricas.pendientes).toBe(0);
      expect(metricas.vencidos).toBe(0);
      expect(metricas.deHoy).toBe(0);
      expect(metricas.proximos).toBe(0);
      expect(metricas.completados).toBe(0);
    });
  });

  describe('filtrarYOrdenarSeguimientos', () => {
    it('filtra correctamente por pestaña VENCIDOS', () => {
      const res = filtrarYOrdenarSeguimientos({
        seguimientos: mockSeguimientos,
        categoria: 'VENCIDOS',
        ahora: FECHA_BASE,
      });

      expect(res).toHaveLength(1);
      expect(res[0]?.id).toBe('01932000-0000-7000-8000-000000000001');
    });

    it('filtra correctamente por pestaña HOY', () => {
      const res = filtrarYOrdenarSeguimientos({
        seguimientos: mockSeguimientos,
        categoria: 'HOY',
        ahora: FECHA_BASE,
      });

      expect(res).toHaveLength(1);
      expect(res[0]?.id).toBe('01932000-0000-7000-8000-000000000002');
    });

    it('filtra correctamente por búsqueda en texto (contacto u oportunidad)', () => {
      const res = filtrarYOrdenarSeguimientos({
        seguimientos: mockSeguimientos,
        categoria: 'TODOS',
        busqueda: 'San Andrés',
        ahora: FECHA_BASE,
      });

      expect(res).toHaveLength(1);
      expect(res[0]?.oportunidadTitulo).toContain('San Andrés');
    });

    it('filtra por asesor específico', () => {
      const res = filtrarYOrdenarSeguimientos({
        seguimientos: mockSeguimientos,
        categoria: 'TODOS',
        asesorId: 'asesor-2',
        ahora: FECHA_BASE,
      });

      expect(res).toHaveLength(1);
      expect(res[0]?.asesorNombre).toBe('Pedro Martínez');
    });

    it('ordena vencidos primero en la vista general TODOS', () => {
      const res = filtrarYOrdenarSeguimientos({
        seguimientos: mockSeguimientos,
        categoria: 'TODOS',
        ahora: FECHA_BASE,
      });

      expect(res[0]?.id).toBe('01932000-0000-7000-8000-000000000001'); // Vencido
      expect(res[1]?.id).toBe('01932000-0000-7000-8000-000000000002'); // Hoy
      expect(res[2]?.id).toBe('01932000-0000-7000-8000-000000000003'); // Próximo
    });
  });

  describe('formatearDetalleVencimiento', () => {
    it('retorna etiqueta Completado con estilo verde si está finalizado', () => {
      const detalle = formatearDetalleVencimiento(
        '2026-10-27T09:00:00.000Z',
        '2026-10-27T09:30:00.000Z',
        FECHA_BASE,
      );

      expect(detalle.etiqueta).toBe('Completado');
      expect(detalle.esVencido).toBe(false);
      expect(detalle.badgeClase).toContain('emerald');
    });

    it('retorna etiqueta Vencido con estilo rosa/rojo si la fecha ya pasó', () => {
      const detalle = formatearDetalleVencimiento('2026-10-26T10:00:00.000Z', null, FECHA_BASE);

      expect(detalle.etiqueta).toBe('Vencido');
      expect(detalle.esVencido).toBe(true);
      expect(detalle.esUrgente).toBe(true);
      expect(detalle.badgeClase).toContain('rose');
    });

    it('retorna Para hoy con hora si es del mismo día', () => {
      const detalle = formatearDetalleVencimiento('2026-10-28T14:00:00.000Z', null, FECHA_BASE);

      expect(detalle.etiqueta).toBe('Para hoy');
      expect(detalle.esVencido).toBe(false);
      expect(detalle.retrasoTexto).toContain('Hoy');
    });
  });
});
