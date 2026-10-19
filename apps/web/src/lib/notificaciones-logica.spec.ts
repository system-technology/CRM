import { describe, expect, it } from 'vitest';
import {
  generarAlertasOperativas,
  contarAlertasNoLeidas,
  marcarAlertaLeida,
} from './notificaciones-logica';

describe('Pruebas Unitarias del Centro de Notificaciones Operativas (notificaciones-logica.ts)', () => {
  const ahoraPrueba = new Date('2026-10-11T16:00:00Z');

  describe('generarAlertasOperativas', () => {
    it('detecta alertas de time limit críticas y saldos pendientes', () => {
      const alertas = generarAlertasOperativas(ahoraPrueba);
      expect(alertas.length).toBeGreaterThan(0);

      // Debe haber al menos una crítica (time limit < 24h o SLA)
      const criticas = alertas.filter((a) => a.severidad === 'critica');
      expect(criticas.length).toBeGreaterThan(0);

      // Las alertas críticas deben estar primero
      expect(alertas[0]?.severidad).toBe('critica');
    });

    it('incluye acciones directas y enlaces funcionales', () => {
      const alertas = generarAlertasOperativas(ahoraPrueba);
      for (const a of alertas) {
        expect(a.href).toMatch(/^\/(bandeja|viajes)/);
        expect(a.accionTexto.length).toBeGreaterThan(0);
        expect(a.leida).toBe(false);
      }
    });

    it('detecta alertas de documentación incompleta como informativas', () => {
      const alertas = generarAlertasOperativas(ahoraPrueba);
      const docs = alertas.find((a) => a.tipo === 'documentos_faltantes');
      expect(docs).toBeDefined();
      expect(docs?.severidad).toBe('informativa');
    });
  });

  describe('contarAlertasNoLeidas y marcarAlertaLeida', () => {
    it('cuenta alertas no leídas y actualiza inmutablemente', () => {
      const alertas = generarAlertasOperativas(ahoraPrueba);
      const totalInicial = contarAlertasNoLeidas(alertas);
      expect(totalInicial).toBe(alertas.length);

      const primeraId = alertas[0]?.id;
      expect(primeraId).toBeDefined();
      if (!primeraId) return;

      const actualizadas = marcarAlertaLeida(alertas, primeraId);

      expect(contarAlertasNoLeidas(actualizadas)).toBe(totalInicial - 1);
      expect(actualizadas.find((a) => a.id === primeraId)?.leida).toBe(true);
      expect(alertas[0]?.leida).toBe(false); // Inmutabilidad garantizada
    });
  });
});
