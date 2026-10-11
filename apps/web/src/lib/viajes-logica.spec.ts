import { describe, expect, it } from 'vitest';
import {
  calcularSaldoPendiente,
  evaluarAlertaTimeLimit,
  enmascararDocumentoPii,
  verificarDocumentacionCompleta,
  calcularMargenOperativoExpediente,
} from './viajes-logica';
import { MOCK_ARCHIVOS_VIAJE } from './mock-viajes';

describe('Pruebas Unitarias de Archivo de Viaje (viajes-logica.ts)', () => {
  describe('calcularSaldoPendiente', () => {
    it('calcula saldo restante y porcentaje pagado correctamente', () => {
      // 6.200.000 COP venta, 3.500.000 COP pagado -> 2.700.000 COP saldo, 56% pagado
      const res = calcularSaldoPendiente(6200000, 3500000);
      expect(res.saldoCop).toBe(2700000);
      expect(res.porcentajePagado).toBe(56);
      expect(res.estaPagadoTotal).toBe(false);
    });

    it('identifica cuando el expediente está 100% saldado', () => {
      const res = calcularSaldoPendiente(12500000, 12500000);
      expect(res.saldoCop).toBe(0);
      expect(res.porcentajePagado).toBe(100);
      expect(res.estaPagadoTotal).toBe(true);
    });

    it('protege contra abonos superiores a la venta', () => {
      const res = calcularSaldoPendiente(5000000, 5200000);
      expect(res.saldoCop).toBe(0);
      expect(res.porcentajePagado).toBe(100);
    });
  });

  describe('evaluarAlertaTimeLimit', () => {
    const ahora = new Date('2026-10-11T12:00:00Z').getTime();

    it('identifica time limit vencido', () => {
      const vencido = '2026-10-10T12:00:00Z';
      const res = evaluarAlertaTimeLimit(vencido, ahora);
      expect(res.estado).toBe('VENCIDO');
      expect(res.horasRestantes).toBe(0);
    });

    it('identifica urgencia crítica cuando faltan menos de 24 horas', () => {
      const critico = '2026-10-12T06:00:00Z'; // 18 horas
      const res = evaluarAlertaTimeLimit(critico, ahora);
      expect(res.estado).toBe('CRITICO');
      expect(res.horasRestantes).toBe(18);
    });

    it('identifica urgencia próxima cuando faltan entre 24 y 72 horas', () => {
      const proximo = '2026-10-13T12:00:00Z'; // 48 horas
      const res = evaluarAlertaTimeLimit(proximo, ahora);
      expect(res.estado).toBe('PROXIMO');
    });

    it('marca seguro cuando faltan más de 72 horas', () => {
      const seguro = '2026-10-25T12:00:00Z';
      const res = evaluarAlertaTimeLimit(seguro, ahora);
      expect(res.estado).toBe('SEGURO');
    });
  });

  describe('enmascararDocumentoPii', () => {
    it('enmascara cédula colombiana protegiendo PII (R10)', () => {
      expect(enmascararDocumentoPii('1020304050', 'CC')).toBe('CC-***4050');
    });

    it('enmascara pasaporte protegiendo número completo', () => {
      expect(enmascararDocumentoPii('PA987654321', 'PAS')).toBe('PAS-***4321');
    });

    it('maneja documentos cortos con seguridad', () => {
      expect(enmascararDocumentoPii('1234', 'TI')).toBe('TI-***34');
    });
  });

  describe('verificarDocumentacionCompleta', () => {
    it('detecta documentación incompleta si algún pasajero está pendiente', () => {
      const exp1 = MOCK_ARCHIVOS_VIAJE[0]!;
      const res = verificarDocumentacionCompleta(exp1.pasajeros);
      expect(res.completa).toBe(false);
      expect(res.faltantes).toBe(1);
      expect(res.porcentajeListos).toBe(67);
    });

    it('valida como completa cuando todos los pasajeros tienen documentos verificados', () => {
      const exp2 = MOCK_ARCHIVOS_VIAJE[1]!;
      const res = verificarDocumentacionCompleta(exp2.pasajeros);
      expect(res.completa).toBe(true);
      expect(res.faltantes).toBe(0);
      expect(res.porcentajeListos).toBe(100);
    });
  });

  describe('calcularMargenOperativoExpediente', () => {
    it('calcula costos netos totales y margen de la agencia con precisión', () => {
      // Exp 1: Venta 6.200.000 COP, Costos: 3.2M + 1.8M + 0.25M = 5.25M. Margen = 950.000 COP (15%)
      const exp1 = MOCK_ARCHIVOS_VIAJE[0]!;
      const res = calcularMargenOperativoExpediente(exp1.totalVentaCop, exp1.reservas);
      expect(res.costoTotalNetoCop).toBe(5250000);
      expect(res.margenCop).toBe(950000);
      expect(res.porcentajeMargen).toBe(15);
    });
  });
});
