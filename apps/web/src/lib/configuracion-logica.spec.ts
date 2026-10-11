import { describe, expect, it } from 'vitest';
import {
  validarSla,
  validarReglaDuenoActivo,
  verificarSaludConexion,
  validarFormatoNit,
  calcularProbabilidadPromedio,
} from './configuracion-logica';
import {
  MOCK_MIEMBROS_EQUIPO,
  MOCK_CONFIGURACION_WABA,
  MOCK_ETAPAS_CONFIGURADAS,
  type MiembroEquipo,
  type ConfiguracionWaba,
} from './mock-configuracion';

describe('Pruebas Unitarias de Configuración y Gobierno (/configuracion)', () => {
  describe('validarSla', () => {
    it('acepta configuración válida (15 min máx, 5 min alerta)', () => {
      const res = validarSla(15, 5);
      expect(res.valido).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rechaza tiempo máximo menor o igual a cero', () => {
      const res = validarSla(0, 5);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('mayor a 0 minutos');
    });

    it('rechaza tiempo máximo superior a 24 horas (1440 min)', () => {
      const res = validarSla(1500, 10);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('1440 min');
    });

    it('rechaza cuando la alerta preventiva es mayor o igual al tiempo máximo', () => {
      const res = validarSla(10, 10);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('menor al tiempo máximo');
    });
  });

  describe('validarReglaDuenoActivo', () => {
    it('acepta la lista inicial que tiene a Alejandro Morales como DUENO ACTIVO', () => {
      const res = validarReglaDuenoActivo(MOCK_MIEMBROS_EQUIPO);
      expect(res.valido).toBe(true);
      expect(res.cantidadDuenos).toBeGreaterThanOrEqual(1);
    });

    it('rechaza si no hay ningún usuario con rol DUENO en estado ACTIVO', () => {
      const sinDueno: MiembroEquipo[] = [
        {
          id: '01932000-0000-7000-8000-0000000000c1',
          nombre: 'Asesor 1',
          email: 'asesor1@viajes.com',
          telefono: '+573001234501',
          rol: 'ASESOR',
          estado: 'ACTIVO',
          fechaIngreso: '2025-01-01',
          avatarIniciales: 'A1',
        },
      ];
      const res = validarReglaDuenoActivo(sinDueno);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('Debe existir al menos un usuario activo con rol DUEÑO');
    });
  });

  describe('verificarSaludConexion', () => {
    it('retorna OPTIMO cuando está conectado, verde y con webhook activo', () => {
      const res = verificarSaludConexion(MOCK_CONFIGURACION_WABA);
      expect(res.estado).toBe('OPTIMO');
    });

    it('retorna CRITICO si el webhook está inactivo o el canal desconectado', () => {
      const desconectado: ConfiguracionWaba = {
        ...MOCK_CONFIGURACION_WABA,
        webhookActivo: false,
      };
      const res = verificarSaludConexion(desconectado);
      expect(res.estado).toBe('CRITICO');
    });

    it('retorna ATENCION si la calidad del número en Meta es YELLOW o RED', () => {
      const riesgo: ConfiguracionWaba = {
        ...MOCK_CONFIGURACION_WABA,
        calidad: 'RED',
      };
      const res = verificarSaludConexion(riesgo);
      expect(res.estado).toBe('ATENCION');
    });
  });

  describe('validarFormatoNit', () => {
    it('valida formato tradicional con puntos y guion', () => {
      expect(validarFormatoNit('901.482.910-3')).toBe(true);
    });

    it('valida formato numérico con guion y dígito de verificación', () => {
      expect(validarFormatoNit('901482910-3')).toBe(true);
    });

    it('rechaza cadenas inválidas', () => {
      expect(validarFormatoNit('viajes-sas')).toBe(false);
      expect(validarFormatoNit('123')).toBe(false);
    });
  });

  describe('calcularProbabilidadPromedio', () => {
    it('calcula correctamente el promedio de probabilidades configuradas', () => {
      // 10 + 30 + 60 + 100 + 0 = 200 / 5 = 40%
      const promedio = calcularProbabilidadPromedio(MOCK_ETAPAS_CONFIGURADAS);
      expect(promedio).toBe(40);
    });
  });
});
