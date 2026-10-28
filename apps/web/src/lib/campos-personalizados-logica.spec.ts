import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizarClaveCampo,
  validarValorCampoPersonalizado,
  obtenerCamposDefinidosStorage,
  guardarCamposDefinidosStorage,
  CAMPOS_PREDEFINIDOS_TURISMO,
  type DefinicionCampoPersonalizado,
} from './campos-personalizados-logica';

describe('campos-personalizados-logica', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('normalizarClaveCampo', () => {
    it('normaliza acentos y espacios a snake_case', () => {
      expect(normalizarClaveCampo('Número de Pasaporte')).toBe('numero_de_pasaporte');
      expect(normalizarClaveCampo('Fecha de Nacimiento!')).toBe('fecha_de_nacimiento');
      expect(normalizarClaveCampo('  País de Origen  ')).toBe('pais_de_origen');
    });
  });

  describe('validarValorCampoPersonalizado', () => {
    const campoTexto: DefinicionCampoPersonalizado = {
      id: '1',
      clave: 'alergias',
      nombre: 'Alergias o Restricciones',
      tipo: 'texto',
      entidad: 'contacto',
      requerido: true,
    };

    const campoNumero: DefinicionCampoPersonalizado = {
      id: '2',
      clave: 'presupuesto_maximo',
      nombre: 'Presupuesto Máximo',
      tipo: 'numero',
      entidad: 'oportunidad',
      requerido: true,
    };

    const campoFecha: DefinicionCampoPersonalizado = {
      id: '3',
      clave: 'fecha_nacimiento',
      nombre: 'Fecha de Nacimiento',
      tipo: 'fecha',
      entidad: 'contacto',
      requerido: false,
    };

    const campoLista: DefinicionCampoPersonalizado = {
      id: '4',
      clave: 'tipo_asistencia',
      nombre: 'Tipo de Asistencia Médica',
      tipo: 'lista',
      entidad: 'contacto',
      requerido: true,
      opciones: ['Básica', 'Total', 'VIP'],
    };

    it('valida campo de texto obligatorio', () => {
      expect(validarValorCampoPersonalizado(campoTexto, '').valido).toBe(false);
      expect(validarValorCampoPersonalizado(campoTexto, '   ').valido).toBe(false);
      expect(validarValorCampoPersonalizado(campoTexto, 'Sin mariscos').valido).toBe(true);
    });

    it('valida campo numérico', () => {
      expect(validarValorCampoPersonalizado(campoNumero, '').valido).toBe(false);
      expect(validarValorCampoPersonalizado(campoNumero, 'abc').valido).toBe(false);
      expect(validarValorCampoPersonalizado(campoNumero, '1500000').valido).toBe(true);
      expect(validarValorCampoPersonalizado(campoNumero, 0).valido).toBe(true);
    });

    it('valida campo de fecha', () => {
      // No obligatorio y vacío => válido
      expect(validarValorCampoPersonalizado(campoFecha, '').valido).toBe(true);
      expect(validarValorCampoPersonalizado(campoFecha, 'invalido').valido).toBe(false);
      expect(validarValorCampoPersonalizado(campoFecha, '1990-05-15').valido).toBe(true);
    });

    it('valida campo de lista de opciones', () => {
      expect(validarValorCampoPersonalizado(campoLista, '').valido).toBe(false);
      expect(validarValorCampoPersonalizado(campoLista, 'Desconocida').valido).toBe(false);
      expect(validarValorCampoPersonalizado(campoLista, 'VIP').valido).toBe(true);
    });
  });

  describe('persistencia en storage', () => {
    it('retorna campos predefinidos si no hay nada guardado', () => {
      const campos = obtenerCamposDefinidosStorage();
      expect(campos.length).toBe(CAMPOS_PREDEFINIDOS_TURISMO.length);
      expect(campos.some((c) => c.clave === 'numero_pasaporte')).toBe(true);
    });

    it('guarda y recupera campos definidos personalizados', () => {
      const personalizados: DefinicionCampoPersonalizado[] = [
        {
          id: 'test-1',
          clave: 'hotel_favorito',
          nombre: 'Hotel Favorito',
          tipo: 'texto',
          entidad: 'contacto',
          requerido: false,
        },
      ];

      guardarCamposDefinidosStorage(personalizados);
      const recuperados = obtenerCamposDefinidosStorage();
      expect(recuperados.length).toBe(1);
      expect(recuperados[0]?.clave).toBe('hotel_favorito');
    });
  });
});
