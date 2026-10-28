import { describe, expect, it } from 'vitest';
import {
  validarFormularioCrearPaquete,
  validarFormularioEditarPaquete,
  filtrarPaquetesGestion,
  construirResumenMockGestion,
  type FormularioPaqueteValores,
} from './catalogo-gestion-logica';
import { MOCK_PAQUETES_CATALOGO } from './mock-catalogo';

describe('catalogo-gestion-logica (T-031)', () => {
  describe('validarFormularioCrearPaquete', () => {
    it('1. Valida correctamente un paquete completo de vacaciones (4D / 3N)', () => {
      const valores: FormularioPaqueteValores = {
        nombre: 'San Andrés Todo Incluido',
        destino: 'San Andrés',
        dias: 4,
        noches: 3,
        planAlimentacion: 'TODO_INCLUIDO',
        codigo: 'PKG-ADZ-001',
        formato: 'Vuelo + Hotel',
        inclusiones: 'Tiquetes aéreos\nHotel 3 noches\nTarjeta OCCRE',
        exclusiones: 'Gastos personales',
      };

      const resultado = validarFormularioCrearPaquete(valores);
      expect(resultado.exito).toBe(true);
      if (resultado.exito) {
        expect(resultado.datos.nombre).toBe('San Andrés Todo Incluido');
        expect(resultado.datos.destino).toBe('San Andrés');
        expect(resultado.datos.dias).toBe(4);
        expect(resultado.datos.noches).toBe(3);
        expect(resultado.datos.codigo).toBe('PKG-ADZ-001');
        expect(resultado.datos.inclusiones).toEqual([
          'Tiquetes aéreos',
          'Hotel 3 noches',
          'Tarjeta OCCRE',
        ]);
        expect(resultado.datos.exclusiones).toEqual(['Gastos personales']);
      }
    });

    it('2. Valida correctamente una excursión de 1 día (pasadía 1D / 0N con plan null)', () => {
      const valores: FormularioPaqueteValores = {
        nombre: 'Pasadía Islas del Rosario VIP',
        destino: 'Cartagena',
        dias: '1',
        noches: '0',
        planAlimentacion: 'SIN_DECLARAR',
      };

      const resultado = validarFormularioCrearPaquete(valores);
      expect(resultado.exito).toBe(true);
      if (resultado.exito) {
        expect(resultado.datos.dias).toBe(1);
        expect(resultado.datos.noches).toBe(0);
        expect(resultado.datos.planAlimentacion).toBeNull();
      }
    });

    it('3. Rechaza incoherencia de noches con mensaje de error en español', () => {
      const valoresIncoherentes: FormularioPaqueteValores = {
        nombre: 'Paquete Incoherente',
        destino: 'Santa Marta',
        dias: 3,
        noches: 5, // Más noches que días
      };

      const resultado = validarFormularioCrearPaquete(valoresIncoherentes);
      expect(resultado.exito).toBe(false);
      if (!resultado.exito) {
        expect(resultado.errores.noches).toBeDefined();
        expect(resultado.errores.noches).toContain('noches');
      }
    });

    it('4. Reporta errores por campos obligatorios faltantes', () => {
      const valoresVacios: FormularioPaqueteValores = {
        nombre: '',
        destino: '   ',
        dias: 0,
        noches: -1,
      };

      const resultado = validarFormularioCrearPaquete(valoresVacios);
      expect(resultado.exito).toBe(false);
      if (!resultado.exito) {
        expect(resultado.errores.nombre).toBeDefined();
        expect(resultado.errores.destino).toBeDefined();
        expect(resultado.errores.dias).toBeDefined();
      }
    });
  });

  describe('validarFormularioEditarPaquete', () => {
    it('5. Valida edición parcial de campos', () => {
      const edicion = {
        nombre: 'Nuevo Nombre de Excursión',
        dias: 2,
        noches: 1,
      };

      const resultado = validarFormularioEditarPaquete(edicion);
      expect(resultado.exito).toBe(true);
      if (resultado.exito) {
        expect(resultado.datos.nombre).toBe('Nuevo Nombre de Excursión');
        expect(resultado.datos.dias).toBe(2);
        expect(resultado.datos.noches).toBe(1);
      }
    });

    it('6. Rechaza objeto de edición vacío', () => {
      const resultado = validarFormularioEditarPaquete({});
      expect(resultado.exito).toBe(false);
      if (!resultado.exito) {
        expect(resultado.errores.general).toContain('no hay nada que cambiar');
      }
    });
  });

  describe('filtrarPaquetesGestion', () => {
    const listaMock = construirResumenMockGestion(MOCK_PAQUETES_CATALOGO, true);

    it('7. Filtra por estado activo / inactivo', () => {
      const activos = filtrarPaquetesGestion(listaMock, { estado: 'ACTIVOS' });
      expect(activos.every((p) => p.activo)).toBe(true);

      const inactivos = filtrarPaquetesGestion(listaMock, { estado: 'INACTIVOS' });
      expect(inactivos.every((p) => !p.activo)).toBe(true);
    });

    it('8. Filtra por término de búsqueda en nombre, destino o código', () => {
      const resultados = filtrarPaquetesGestion(listaMock, { busqueda: 'Cartagena' });
      expect(resultados.length).toBeGreaterThan(0);
      expect(
        resultados.every(
          (p) =>
            p.nombre.toLowerCase().includes('cartagena') ||
            p.destino.toLowerCase().includes('cartagena'),
        ),
      ).toBe(true);
    });
  });
});
