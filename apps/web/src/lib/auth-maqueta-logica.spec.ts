import { describe, expect, it } from 'vitest';
import {
  estaAuthMaquetaHabilitada,
  validarCredencialesLocales,
  simularInicioSesion,
} from './auth-maqueta-logica';

describe('Lógica de Maqueta de Inicio de Sesión (0c.23)', () => {
  describe('estaAuthMaquetaHabilitada', () => {
    it('está apagada por defecto cuando la variable es undefined o vacía', () => {
      expect(estaAuthMaquetaHabilitada(undefined)).toBe(false);
      expect(estaAuthMaquetaHabilitada('')).toBe(false);
      expect(estaAuthMaquetaHabilitada('false')).toBe(false);
      expect(estaAuthMaquetaHabilitada('0')).toBe(false);
    });

    it('está encendida solo cuando es "true" o "1"', () => {
      expect(estaAuthMaquetaHabilitada('true')).toBe(true);
      expect(estaAuthMaquetaHabilitada('1')).toBe(true);
    });
  });

  describe('Validación de Credenciales (Esquema local mínimo)', () => {
    it('acepta correo válido y contraseña de 6 o más caracteres', () => {
      const entrada = {
        correo: 'asesor@agencia.com',
        contrasena: 'secreto123',
      };
      const resultado = validarCredencialesLocales(entrada);
      expect(resultado.valido).toBe(true);
      expect(resultado.datos?.correo).toBe('asesor@agencia.com');
      expect(resultado.datos?.contrasena).toBe('secreto123');
    });

    it('rechaza correo inválido o vacío con mensaje claro', () => {
      const resultado1 = validarCredencialesLocales({
        correo: 'no-es-un-correo',
        contrasena: 'secreto123',
      });
      expect(resultado1.valido).toBe(false);
      expect(resultado1.errores?.['correo']).toContain('correo electrónico válido');

      const resultado2 = validarCredencialesLocales({
        correo: '',
        contrasena: 'secreto123',
      });
      expect(resultado2.valido).toBe(false);
    });

    it('rechaza contraseña con menos de 6 caracteres', () => {
      const resultado = validarCredencialesLocales({
        correo: 'asesor@agencia.com',
        contrasena: '12345',
      });
      expect(resultado.valido).toBe(false);
      expect(resultado.errores?.['contrasena']).toContain('al menos 6 caracteres');
    });
  });

  describe('Simulación de Inicio de Sesión', () => {
    it('simula éxito para credenciales válidas ordinarias', async () => {
      const resultado = await simularInicioSesion(
        { correo: 'asesor@viajesdemo.com', contrasena: 'secreto123' },
        0,
      );
      expect(resultado.exito).toBe(true);
      expect(resultado.mensaje).toBeUndefined();
    });

    it('simula error claro cuando el correo o contraseña son de prueba de error', async () => {
      const resultado1 = await simularInicioSesion(
        { correo: 'error@viajesdemo.com', contrasena: 'secreto123' },
        0,
      );
      expect(resultado1.exito).toBe(false);
      expect(resultado1.mensaje).toContain('Credenciales no reconocidas');

      const resultado2 = await simularInicioSesion(
        { correo: 'asesor@viajesdemo.com', contrasena: 'incorrecta' },
        0,
      );
      expect(resultado2.exito).toBe(false);
      expect(resultado2.mensaje).toContain('Credenciales no reconocidas');
    });
  });
});
