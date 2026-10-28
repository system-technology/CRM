import { describe, it, expect, beforeEach } from 'vitest';
import {
  interpolarVariables,
  detectarDisparadorSlash,
  reemplazarComandoSlash,
  filtrarRespuestasRapidas,
  validarRespuestaRapida,
  obtenerRespuestasRapidas,
  guardarRespuestasRapidas,
  restablecerRespuestasRapidasPorDefecto,
  RESPUESTAS_RAPIDAS_POR_DEFECTO,
  type RespuestaRapida,
} from './respuestas-rapidas-logica';

describe('respuestas-rapidas-logica — Lógica de Respuestas Rápidas (T-104)', () => {
  describe('interpolarVariables', () => {
    it('interpola correctamente todas las variables contextuales', () => {
      const plantilla =
        'Hola {nombre}, te atiende {asesor} de {agencia}. Tu viaje a {destino} está confirmado.';
      const resultado = interpolarVariables(plantilla, {
        nombreCliente: 'María Gómez',
        nombreAsesor: 'Carlos Asesor',
        nombreAgencia: 'JD Tours Cartagena',
        destino: 'San Andrés',
      });

      expect(resultado).toBe(
        'Hola María Gómez, te atiende Carlos Asesor de JD Tours Cartagena. Tu viaje a San Andrés está confirmado.',
      );
    });

    it('soporta variables con mayúsculas y minúsculas indistintamente', () => {
      const plantilla = '¡Hola {NOMBRE}! De parte de {Asesor} en {AGENCIA}.';
      const resultado = interpolarVariables(plantilla, {
        nombreCliente: 'Juan',
        nombreAsesor: 'Ana',
        nombreAgencia: 'ViajaPro Demo',
      });

      expect(resultado).toBe('¡Hola Juan! De parte de Ana en ViajaPro Demo.');
    });

    it('utiliza valores de respaldo seguros cuando los valores están vacíos o son nulos', () => {
      const plantilla = 'Hola {nombre}, soy {asesor} de {agencia}. ¿Tienes dudas sobre {destino}?';
      const resultado = interpolarVariables(plantilla, {
        nombreCliente: null,
        nombreAsesor: '',
        nombreAgencia: undefined,
        destino: '   ',
      });

      expect(resultado).toBe(
        'Hola estimado/a viajero/a, soy tu asesor de viajes de nuestra agencia. ¿Tienes dudas sobre tu destino?',
      );
    });
  });

  describe('detectarDisparadorSlash', () => {
    it('detecta slash al inicio del texto sin query previa', () => {
      const texto = '/';
      const disparador = detectarDisparadorSlash(texto, 1);

      expect(disparador).toEqual({
        activo: true,
        query: '',
        indiceInicio: 0,
        longitudComando: 1,
      });
    });

    it('detecta slash al inicio con texto de atajo parcial', () => {
      const texto = '/salu';
      const disparador = detectarDisparadorSlash(texto, 5);

      expect(disparador).toEqual({
        activo: true,
        query: 'salu',
        indiceInicio: 0,
        longitudComando: 5,
      });
    });

    it('detecta slash precedido por un espacio en medio de la redacción', () => {
      const texto = 'Hola, para pagar /cuen';
      const disparador = detectarDisparadorSlash(texto, texto.length);

      expect(disparador).toEqual({
        activo: true,
        query: 'cuen',
        indiceInicio: 17,
        longitudComando: 5,
      });
    });

    it('detecta slash precedido por un salto de línea', () => {
      const texto = 'Hola mundo\n/horario';
      const disparador = detectarDisparadorSlash(texto, texto.length);

      expect(disparador).toEqual({
        activo: true,
        query: 'horario',
        indiceInicio: 11,
        longitudComando: 8,
      });
    });

    it('ignora slash dentro de una URL o palabra continua sin espacio previo', () => {
      const texto = 'Mira el enlace https://viajapro.com/demo';
      const disparador = detectarDisparadorSlash(texto, texto.length);

      expect(disparador).toBeNull();
    });

    it('ignora slash cuando el usuario ya escribió un espacio después del atajo', () => {
      const texto = '/saludo cordial a todos';
      const disparador = detectarDisparadorSlash(texto, texto.length);

      expect(disparador).toBeNull();
    });

    it('retorna null si la posición del cursor es 0 o inválida', () => {
      expect(detectarDisparadorSlash('test', 0)).toBeNull();
      expect(detectarDisparadorSlash('test', 10)).toBeNull();
    });
  });

  describe('reemplazarComandoSlash', () => {
    it('reemplaza comando al inicio del texto y posiciona el cursor', () => {
      const texto = '/saludo';
      const textoInsertar = '¡Hola Juan! Bienvenido.';
      const res = reemplazarComandoSlash(texto, 0, 7, textoInsertar);

      expect(res.nuevoTexto).toBe('¡Hola Juan! Bienvenido.');
      expect(res.nuevaPosCursor).toBe(textoInsertar.length);
    });

    it('reemplaza comando en medio del texto preservando lo anterior y lo posterior', () => {
      const texto = 'Estimado cliente, /cuenta por favor.';
      // '/cuenta' empieza en 18 y mide 7 caracteres
      const textoInsertar = 'los datos bancarios son: Bancolombia Ahorros';
      const res = reemplazarComandoSlash(texto, 18, 7, textoInsertar);

      expect(res.nuevoTexto).toBe(
        'Estimado cliente, los datos bancarios son: Bancolombia Ahorros por favor.',
      );
      expect(res.nuevaPosCursor).toBe(18 + textoInsertar.length);
    });
  });

  describe('filtrarRespuestasRapidas', () => {
    it('retorna todas las respuestas ordenadas por atajo cuando la consulta está vacía', () => {
      const lista = filtrarRespuestasRapidas(RESPUESTAS_RAPIDAS_POR_DEFECTO, '');
      expect(lista.length).toBe(RESPUESTAS_RAPIDAS_POR_DEFECTO.length);
      expect(lista[0]!.atajo).toBe('cuenta');
    });

    it('elimina el slash inicial de la consulta de búsqueda', () => {
      const lista = filtrarRespuestasRapidas(RESPUESTAS_RAPIDAS_POR_DEFECTO, '/sal');
      expect(lista.length).toBeGreaterThan(0);
      expect(lista[0]!.atajo).toBe('saludo');
    });

    it('prioriza coincidencias exactas en el atajo sobre coincidencias parciales', () => {
      const mock: RespuestaRapida[] = [
        {
          id: '1',
          atajo: 'info_cuenta',
          titulo: 'Info de cuenta',
          contenido: '...',
          categoria: 'pagos',
        },
        {
          id: '2',
          atajo: 'cuenta',
          titulo: 'Cuenta Bancaria',
          contenido: '...',
          categoria: 'pagos',
        },
      ];

      const resultado = filtrarRespuestasRapidas(mock, 'cuenta');
      expect(resultado[0]!.atajo).toBe('cuenta');
    });

    it('filtra por categoría cuando se especifica', () => {
      const pagos = filtrarRespuestasRapidas(RESPUESTAS_RAPIDAS_POR_DEFECTO, '', 'pagos');
      expect(pagos.length).toBeGreaterThan(0);
      expect(pagos.every((p) => p.categoria === 'pagos')).toBe(true);
    });
  });

  describe('validarRespuestaRapida', () => {
    it('valida exitosamente una respuesta rápida completa', () => {
      const res = validarRespuestaRapida({
        atajo: 'promo-verano',
        titulo: 'Promoción de Temporada',
        contenido: 'Aprovecha nuestra promo con tarifas especiales en {destino}.',
        categoria: 'cotizaciones',
      });

      expect(res.valido).toBe(true);
      expect(Object.keys(res.errores).length).toBe(0);
    });

    it('detecta atajos con caracteres inválidos o espacios', () => {
      const res = validarRespuestaRapida({
        atajo: 'promo verano!',
        titulo: 'Título válido',
        contenido: 'Contenido largo y válido para pruebas.',
        categoria: 'general',
      });

      expect(res.valido).toBe(false);
      expect(res.errores.atajo).toBeDefined();
    });

    it('detecta títulos o contenidos vacíos', () => {
      const res = validarRespuestaRapida({
        atajo: 'test',
        titulo: '',
        contenido: '',
        categoria: 'general',
      });

      expect(res.valido).toBe(false);
      expect(res.errores.titulo).toBeDefined();
      expect(res.errores.contenido).toBeDefined();
    });
  });

  describe('Almacenamiento Local por Agencia (Tenant Scoped)', () => {
    beforeEach(() => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
    });

    it('obtiene respuestas por defecto si no hay nada guardado', () => {
      const respuestas = obtenerRespuestasRapidas('tenant-1');
      expect(respuestas.length).toBe(RESPUESTAS_RAPIDAS_POR_DEFECTO.length);
    });

    it('guarda y recupera respuestas específicas para un tenant', () => {
      const personalizadas: RespuestaRapida[] = [
        {
          id: 'custom-1',
          atajo: 'promo-cartagena',
          titulo: 'Promo Islas del Rosario',
          contenido: 'Disfruta el sol caribeño.',
          categoria: 'cotizaciones',
        },
      ];

      guardarRespuestasRapidas(personalizadas, 'agencia-cartagena');
      const recuperadas = obtenerRespuestasRapidas('agencia-cartagena');
      expect(recuperadas.length).toBe(1);
      expect(recuperadas[0]!.atajo).toBe('promo-cartagena');

      // Otro tenant sigue recibiendo por defecto
      const otroTenant = obtenerRespuestasRapidas('agencia-medellin');
      expect(otroTenant.length).toBe(RESPUESTAS_RAPIDAS_POR_DEFECTO.length);
    });

    it('restablece las respuestas por defecto', () => {
      guardarRespuestasRapidas([], 'agencia-test');
      const reset = restablecerRespuestasRapidasPorDefecto('agencia-test');
      expect(reset.length).toBe(RESPUESTAS_RAPIDAS_POR_DEFECTO.length);
    });
  });
});
