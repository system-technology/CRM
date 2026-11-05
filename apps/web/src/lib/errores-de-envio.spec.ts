import { describe, it, expect } from 'vitest';
import {
  interpretarErrorDeEnvio,
  extraerCodigoError,
  MAPA_ERRORES_ENVIO,
} from './errores-de-envio';

describe('errores-de-envio (T-117)', () => {
  describe('Mapeo de códigos de error de la API', () => {
    it('traduce VENTANA_CERRADA a mensaje claro con acción sugerida y tipo usar_plantilla', () => {
      const error = { code: 'VENTANA_CERRADA' };
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.codigo).toBe('VENTANA_CERRADA');
      expect(detalle.titulo).toBe('Ventana de 24 horas cerrada');
      expect(detalle.mensaje).toContain('La ventana de servicio de 24 horas está cerrada');
      expect(detalle.accionSugerida).toContain('plantilla aprobada');
      expect(detalle.tipoAccion).toBe('usar_plantilla');
      expect(detalle.reintentable).toBe(false);
      expect(detalle.textoParaMostrar).not.toContain('VENTANA_CERRADA');
    });

    it('traduce WHATSAPP_FUERA_DE_VENTANA de forma equivalente a VENTANA_CERRADA', () => {
      const error = new Error('WHATSAPP_FUERA_DE_VENTANA: meta rejected');
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.codigo).toBe('WHATSAPP_FUERA_DE_VENTANA');
      expect(detalle.titulo).toBe('Ventana de 24 horas cerrada');
      expect(detalle.tipoAccion).toBe('usar_plantilla');
      expect(detalle.reintentable).toBe(false);
      expect(detalle.textoParaMostrar).not.toContain('WHATSAPP_FUERA_DE_VENTANA');
    });

    it('traduce CONSENTIMIENTO_REVOCADO orientando al asesor sobre Habeas Data (Ley 1581)', () => {
      const error = { code: 'CONSENTIMIENTO_REVOCADO' };
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.codigo).toBe('CONSENTIMIENTO_REVOCADO');
      expect(detalle.titulo).toBe('Autorización de datos revocada');
      expect(detalle.mensaje).toContain('Ley 1581');
      expect(detalle.accionSugerida).toContain('ficha de contacto');
      expect(detalle.tipoAccion).toBe('ver_consentimiento');
      expect(detalle.reintentable).toBe(false);
      expect(detalle.textoParaMostrar).not.toContain('CONSENTIMIENTO_REVOCADO');
    });

    it('traduce COTIZACION_DE_OTRO_CONTACTO indicando que pertenece a otro viajero', () => {
      const error = { error: { code: 'COTIZACION_DE_OTRO_CONTACTO' } };
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.codigo).toBe('COTIZACION_DE_OTRO_CONTACTO');
      expect(detalle.titulo).toBe('Cotización de otro contacto');
      expect(detalle.mensaje).toContain('otro viajero');
      expect(detalle.accionSugerida).toContain('Selecciona o elabora una cotización');
      expect(detalle.tipoAccion).toBe('cambiar_cotizacion');
      expect(detalle.reintentable).toBe(false);
      expect(detalle.textoParaMostrar).not.toContain('COTIZACION_DE_OTRO_CONTACTO');
    });

    it('traduce COTIZACION_PARA_ENVIO_NO_ENCONTRADA y COTIZACION_NO_ENCONTRADA al cotizador', () => {
      const detalle1 = interpretarErrorDeEnvio({ code: 'COTIZACION_PARA_ENVIO_NO_ENCONTRADA' });
      expect(detalle1.titulo).toBe('Cotización no encontrada');
      expect(detalle1.tipoAccion).toBe('abrir_cotizador');

      const detalle2 = interpretarErrorDeEnvio('COTIZACION_NO_ENCONTRADA');
      expect(detalle2.titulo).toBe('Cotización no encontrada');
      expect(detalle2.tipoAccion).toBe('abrir_cotizador');
    });

    it('traduce CONVERSACION_NO_ENCONTRADA sugiriendo actualizar la bandeja', () => {
      const error = new Error('CONVERSACION_NO_ENCONTRADA');
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.codigo).toBe('CONVERSACION_NO_ENCONTRADA');
      expect(detalle.titulo).toBe('Conversación no disponible');
      expect(detalle.accionSugerida).toContain('Actualiza la bandeja');
      expect(detalle.tipoAccion).toBe('recargar_bandeja');
    });

    it('traduce CONVERSACION_MODIFICADA indicando concurrencia y permitiendo reintentar', () => {
      const error = { code: 'CONVERSACION_MODIFICADA' };
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.titulo).toBe('Conversación actualizada');
      expect(detalle.reintentable).toBe(true);
      expect(detalle.tipoAccion).toBe('recargar');
    });

    it('traduce CLAVE_DE_IDEMPOTENCIA_EN_USO explicando la protección de duplicados', () => {
      const error = { code: 'CLAVE_DE_IDEMPOTENCIA_EN_USO' };
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.titulo).toBe('Envío ya procesado');
      expect(detalle.mensaje).toContain('evitar enviar mensajes duplicados');
      expect(detalle.reintentable).toBe(false);
      expect(detalle.tipoAccion).toBe('recargar');
    });

    it('traduce USUARIO_NO_ASIGNABLE sugiriendo reasignar a un asesor activo', () => {
      const error = { code: 'USUARIO_NO_ASIGNABLE' };
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.titulo).toBe('Asesor no disponible');
      expect(detalle.tipoAccion).toBe('reasignar');
    });

    it('traduce WHATSAPP_DESTINATARIO_NO_DISPONIBLE recomendando validar número', () => {
      const error = { code: 'WHATSAPP_DESTINATARIO_NO_DISPONIBLE' };
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.titulo).toBe('Número sin WhatsApp activo');
      expect(detalle.tipoAccion).toBe('verificar_telefono');
    });

    it('traduce WHATSAPP_LIMITE_DE_TASA como reintentable tras breve espera', () => {
      const error = { code: 'WHATSAPP_LIMITE_DE_TASA' };
      const detalle = interpretarErrorDeEnvio(error);

      expect(detalle.titulo).toBe('Límite de envíos alcanzado');
      expect(detalle.reintentable).toBe(true);
      expect(detalle.accionSugerida).toContain('minutos');
    });

    it('traduce WHATSAPP_CREDENCIAL_INVALIDA y CANAL_NO_ACTIVO remitiendo al administrador', () => {
      const d1 = interpretarErrorDeEnvio({ code: 'WHATSAPP_CREDENCIAL_INVALIDA' });
      expect(d1.tipoAccion).toBe('contactar_admin');

      const d2 = interpretarErrorDeEnvio({ code: 'CANAL_NO_ACTIVO' });
      expect(d2.tipoAccion).toBe('contactar_admin');
    });

    it('traduce WHATSAPP_FALLO_TRANSITORIO y WHATSAPP_INALCANZABLE como reintentables', () => {
      const d1 = interpretarErrorDeEnvio({ code: 'WHATSAPP_FALLO_TRANSITORIO' });
      expect(d1.reintentable).toBe(true);

      const d2 = interpretarErrorDeEnvio({ code: 'WHATSAPP_INALCANZABLE' });
      expect(d2.reintentable).toBe(true);
    });

    it('traduce SIN_USUARIO y SIN_SESION orientando a iniciar sesión', () => {
      const d1 = interpretarErrorDeEnvio({ code: 'SIN_USUARIO' });
      expect(d1.tipoAccion).toBe('iniciar_sesion');

      const d2 = interpretarErrorDeEnvio({ code: 'SIN_SESION' });
      expect(d2.tipoAccion).toBe('iniciar_sesion');
    });
  });

  describe('Extracción de código desde diversas estructuras', () => {
    it('extrae de un objeto con propiedad code', () => {
      expect(extraerCodigoError({ code: 'VENTANA_CERRADA' })).toBe('VENTANA_CERRADA');
    });

    it('extrae de un objeto con propiedad codigo', () => {
      expect(extraerCodigoError({ codigo: 'CONSENTIMIENTO_REVOCADO' })).toBe(
        'CONSENTIMIENTO_REVOCADO',
      );
    });

    it('extrae de un objeto anidado estilo ErrorApi { error: { code } }', () => {
      expect(extraerCodigoError({ error: { code: 'COTIZACION_DE_OTRO_CONTACTO' } })).toBe(
        'COTIZACION_DE_OTRO_CONTACTO',
      );
    });

    it('extrae de un Error cuyo mensaje contiene el código', () => {
      const err = new Error('VENTANA_CERRADA: La ventana de 24h está cerrada');
      expect(extraerCodigoError(err)).toBe('VENTANA_CERRADA');
    });

    it('extrae código en mayúsculas de string directo', () => {
      expect(extraerCodigoError('WHATSAPP_LIMITE_DE_TASA')).toBe('WHATSAPP_LIMITE_DE_TASA');
    });

    it('devuelve null ante valores nulos o indefinidos', () => {
      expect(extraerCodigoError(null)).toBeNull();
      expect(extraerCodigoError(undefined)).toBeNull();
    });
  });

  describe('Manejo de códigos desconocidos y fallbacks', () => {
    it('maneja un código totalmente desconocido sin exponerlo al asesor', () => {
      const errorDesconocido = { code: 'CODIGO_INVENTADO_NO_EXISTENTE_999' };
      const detalle = interpretarErrorDeEnvio(errorDesconocido);

      // Conserva el código en la propiedad de control interno
      expect(detalle.codigo).toBe('CODIGO_INVENTADO_NO_EXISTENTE_999');

      // Título y mensajes en es-CO amigables
      expect(detalle.titulo).toBe('Inconveniente al enviar el mensaje');
      expect(detalle.mensaje).toBe('Ocurrió un contratiempo al procesar el envío del mensaje.');
      expect(detalle.accionSugerida).toBe('Espera unos segundos y vuelve a intentar el envío.');
      expect(detalle.reintentable).toBe(true);
      expect(detalle.tipoAccion).toBe('reintentar');

      // NUNCA expone el código crudo en textos visibles
      expect(detalle.titulo).not.toContain('CODIGO_INVENTADO_NO_EXISTENTE_999');
      expect(detalle.mensaje).not.toContain('CODIGO_INVENTADO_NO_EXISTENTE_999');
      expect(detalle.accionSugerida).not.toContain('CODIGO_INVENTADO_NO_EXISTENTE_999');
      expect(detalle.textoParaMostrar).not.toContain('CODIGO_INVENTADO_NO_EXISTENTE_999');
    });

    it('maneja errores genéricos de JavaScript sin código', () => {
      const err = new Error('Failed to fetch resource');
      const detalle = interpretarErrorDeEnvio(err);

      expect(detalle.codigo).toBe('DESCONOCIDO');
      expect(detalle.titulo).toBe('Inconveniente al enviar el mensaje');
      expect(detalle.textoParaMostrar).toContain('vuelve a intentar');
    });

    it('maneja valores no-objeto (string no código, null, números)', () => {
      const detalleNull = interpretarErrorDeEnvio(null);
      expect(detalleNull.codigo).toBe('DESCONOCIDO');

      const detalleNum = interpretarErrorDeEnvio(500);
      expect(detalleNum.codigo).toBe('DESCONOCIDO');
    });
  });

  describe('Garantía de que ningún código crudo se expone al asesor', () => {
    it('comprueba que ninguna definición del mapa contiene su propio código crudo en sus textos de cara al usuario', () => {
      for (const [codigo, def] of Object.entries(MAPA_ERRORES_ENVIO)) {
        expect(def.titulo).not.toContain(codigo);
        expect(def.mensaje).not.toContain(codigo);
        expect(def.accionSugerida).not.toContain(codigo);

        const detalle = interpretarErrorDeEnvio({ code: codigo });
        expect(detalle.textoParaMostrar).not.toContain(codigo);
      }
    });
  });
});
