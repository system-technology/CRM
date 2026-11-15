import { describe, expect, it } from 'vitest';
import {
  clasificarErrorSistema,
  esErrorSinConexion,
  esErrorSesionExpirada,
  esErrorNoEncontrado,
  construirUrlRedireccionIngreso,
  sanitizarRutaRedireccion,
} from './errores-sistema';

describe('errores-sistema (T-109)', () => {
  describe('esErrorSinConexion', () => {
    it('detecta pérdida de conexión por TypeError Failed to fetch', () => {
      const err = new TypeError('Failed to fetch');
      expect(esErrorSinConexion(err)).toBe(true);
    });

    it('detecta pérdida de conexión por código ECONNREFUSED', () => {
      const err = { code: 'ECONNREFUSED' };
      expect(esErrorSinConexion(err)).toBe(true);
    });

    it('detecta pérdida de conexión si el mensaje incluye timeout o network', () => {
      expect(esErrorSinConexion(new Error('Network request failed'))).toBe(true);
      expect(esErrorSinConexion(new Error('Connection timeout reached'))).toBe(true);
    });

    it('devuelve false para errores de negocio comunes', () => {
      expect(esErrorSinConexion(new Error('Validación fallida'))).toBe(false);
      expect(esErrorSinConexion(null)).toBe(false);
    });
  });

  describe('esErrorSesionExpirada', () => {
    it('detecta sesión expirada por status 401', () => {
      expect(esErrorSesionExpirada(new Error('Error'), 401)).toBe(true);
      expect(esErrorSesionExpirada({ status: 401 })).toBe(true);
      expect(esErrorSesionExpirada({ statusCode: 401 })).toBe(true);
    });

    it('detecta sesión expirada por mensaje descriptivo', () => {
      expect(esErrorSesionExpirada(new Error('Sesión expirada por inactividad'))).toBe(true);
      expect(esErrorSesionExpirada(new Error('Unauthorized token expired'))).toBe(true);
      expect(esErrorSesionExpirada(new Error('jwt expired'))).toBe(true);
    });

    it('detecta sesión expirada por código de error', () => {
      expect(esErrorSesionExpirada({ codigo: 'NO_AUTENTICADO' })).toBe(true);
      expect(esErrorSesionExpirada({ code: 'SESION_EXPIRADA' })).toBe(true);
    });

    it('devuelve false para errores que no son de autenticación', () => {
      expect(esErrorSesionExpirada(new Error('Recurso no encontrado'), 404)).toBe(false);
    });
  });

  describe('esErrorNoEncontrado', () => {
    it('detecta 404 por status', () => {
      expect(esErrorNoEncontrado(null, 404)).toBe(true);
      expect(esErrorNoEncontrado({ status: 404 })).toBe(true);
    });

    it('detecta 404 por mensaje o código', () => {
      expect(esErrorNoEncontrado(new Error('Paquete turístico no encontrado'))).toBe(true);
      expect(esErrorNoEncontrado({ codigo: 'NO_ENCONTRADO' })).toBe(true);
    });
  });

  describe('construirUrlRedireccionIngreso & sanitizarRutaRedireccion (Seguridad)', () => {
    it('construye URL con parámetro redirigir para rutas relativas seguras', () => {
      const url = construirUrlRedireccionIngreso('/cotizaciones/123');
      expect(url).toBe('/ingresar?redirigir=%2Fcotizaciones%2F123&motivo=sesion_expirada');
    });

    it('bloquea intentos de open redirect con doble barra //evil.com', () => {
      const url = construirUrlRedireccionIngreso('//sitio-malicioso.com');
      expect(url).toBe('/ingresar?motivo=sesion_expirada');
    });

    it('bloquea intentos de open redirect con protocolo absoluto https://evil.com', () => {
      const url = construirUrlRedireccionIngreso('https://sitio-malicioso.com/phishing');
      expect(url).toBe('/ingresar?motivo=sesion_expirada');
    });

    it('evita redirigir cíclicamente a la misma pantalla de ingreso', () => {
      expect(construirUrlRedireccionIngreso('/ingresar')).toBe('/ingresar?motivo=sesion_expirada');
      expect(construirUrlRedireccionIngreso('/iniciar-sesion')).toBe(
        '/ingresar?motivo=sesion_expirada',
      );
    });

    it('sanitizarRutaRedireccion devuelve ruta segura o fallback', () => {
      expect(sanitizarRutaRedireccion('/pipeline')).toBe('/pipeline');
      expect(sanitizarRutaRedireccion('//malicioso.com', '/bandeja')).toBe('/bandeja');
      expect(sanitizarRutaRedireccion('javascript:alert(1)', '/bandeja')).toBe('/bandeja');
      expect(sanitizarRutaRedireccion(null, '/bandeja')).toBe('/bandeja');
    });

    // Vectores que el analizador de URL convierte en `//host` (auditoría del PR #256).
    const VECTORES_HOSTILES = [
      '/\\evil.com',
      '/\\/evil.com',
      '\\\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r/evil.com',
      ' //evil.com',
      '/%5Cevil.com'.replace('%5C', '\\'),
      'http:evil.com',
      '/.//evil.com',
      '/a/..//evil.com',
      '/%2e//evil.com',
      '/./\\evil.com',
    ];

    it.each(VECTORES_HOSTILES)('nunca sale del origen con %j', (vector) => {
      expect(sanitizarRutaRedireccion(vector, '/bandeja')).toBe('/bandeja');
      expect(construirUrlRedireccionIngreso(vector)).toBe('/ingresar?motivo=sesion_expirada');
    });

    it('todo destino aceptado resuelve al mismo origen', () => {
      const origen = 'https://app.viajapro.co';
      for (const v of [...VECTORES_HOSTILES, '/pipeline?x=1#a', '/cotizaciones/123']) {
        expect(new URL(sanitizarRutaRedireccion(v), origen).origin).toBe(origen);
      }
    });

    it('conserva consulta y fragmento de un destino legítimo', () => {
      expect(sanitizarRutaRedireccion('/pipeline?etapa=2#tarjeta')).toBe(
        '/pipeline?etapa=2#tarjeta',
      );
    });

    it('rechaza cualquier ruta de acceso como destino, con consulta o barra final', () => {
      for (const r of [
        '/login',
        '/login/',
        '/login?x=1',
        '/ingresar?motivo=y',
        '/iniciar-sesion#a',
      ]) {
        expect(sanitizarRutaRedireccion(r)).toBe('/bandeja');
        expect(construirUrlRedireccionIngreso(r)).toBe('/ingresar?motivo=sesion_expirada');
      }
      expect(sanitizarRutaRedireccion('/login-historial')).toBe('/login-historial');
    });
  });

  describe('clasificarErrorSistema', () => {
    it('clasifica error sin conexión con sugerencia de reintento', () => {
      const info = clasificarErrorSistema(new TypeError('Failed to fetch'));
      expect(info.tipo).toBe('SIN_CONEXION');
      expect(info.titulo).toBe('Sin conexión a internet');
      expect(info.puedeReintentar).toBe(true);
      expect(info.accionTexto).toBe('Reintentar conexión');
    });

    it('clasifica error 401 con enlace de redirección seguro a /ingresar', () => {
      const info = clasificarErrorSistema(new Error('Unauthorized'), 401, '/cotizador');
      expect(info.tipo).toBe('SESION_EXPIRADA');
      expect(info.titulo).toBe('Tu sesión ha expirado');
      expect(info.puedeReintentar).toBe(false);
      expect(info.redireccionSugerida).toBe(
        '/ingresar?redirigir=%2Fcotizador&motivo=sesion_expirada',
      );
      expect(info.accionTexto).toBe('Iniciar Sesión');
      expect(info.accionHref).toBe('/ingresar?redirigir=%2Fcotizador&motivo=sesion_expirada');
    });

    it('clasifica error 403 de acceso denegado', () => {
      const info = clasificarErrorSistema(new Error('Forbidden'), 403);
      expect(info.tipo).toBe('ACCESO_DENEGADO');
      expect(info.titulo).toBe('Acceso no autorizado');
      expect(info.accionHref).toBe('/bandeja');
    });

    it('clasifica error 404 de no encontrado', () => {
      const info = clasificarErrorSistema(new Error('Not found'), 404);
      expect(info.tipo).toBe('NO_ENCONTRADO');
      expect(info.titulo).toBe('Destino no encontrado');
      expect(info.accionHref).toBe('/bandeja');
    });

    it('clasifica error 500 de servidor con posibilidad de reintentar', () => {
      const info = clasificarErrorSistema(new Error('Internal error'), 500);
      expect(info.tipo).toBe('ERROR_SERVIDOR');
      expect(info.titulo).toBe('Fallo temporal en el servidor');
      expect(info.puedeReintentar).toBe(true);
    });

    it('clasifica fallos desconocidos sin crashear ni exponer trazas', () => {
      const info = clasificarErrorSistema('Un string inesperado');
      expect(info.tipo).toBe('ERROR_DESCONOCIDO');
      expect(info.titulo).toBe('Ocurrió un contratiempo inesperado');
      expect(info.puedeReintentar).toBe(true);
    });
  });
});
