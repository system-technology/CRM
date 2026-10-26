import { describe, expect, it } from 'vitest';
import { aE164, contenidoDelCambio, instanteDeMeta } from './contenido-del-cambio.js';

/** Un `value` de campo `messages` con la forma que manda Meta de verdad. */
const valorConTexto = {
  messaging_product: 'whatsapp',
  metadata: { display_phone_number: '573001234000', phone_number_id: '100000000000001' },
  contacts: [{ profile: { name: 'Sofía Gómez' }, wa_id: '573001234567' }],
  messages: [
    {
      from: '573001234567',
      id: 'wamid.HBgMNTczMDAxMjM0NTY3',
      timestamp: '1792000000',
      type: 'text',
      text: { body: '¿Cuánto vale el pasadía a Piangüita el 10 de octubre?' },
    },
  ],
};

describe('El instante de Meta', () => {
  it('viene en SEGUNDOS, no en milisegundos', () => {
    // Tratarlo como milisegundos pone el mensaje en enero de 1970 y la ventana de 24 horas sale
    // cerrada siempre. Es el error que más caro sale de toda esta integración.
    const d = instanteDeMeta('1792000000');
    expect(d?.toISOString()).toBe('2026-10-14T17:46:40.000Z');
  });

  it('acepta el número además de la cadena, que Meta manda las dos', () => {
    expect(instanteDeMeta(1792000000)?.getTime()).toBe(1792000000000);
  });

  it('devuelve null en vez de una fecha inválida', () => {
    for (const malo of ['', 'ayer', '0', '-5', null, undefined, {}]) {
      expect(instanteDeMeta(malo)).toBeNull();
    }
  });
});

describe('El teléfono', () => {
  it('Meta lo manda SIN el «+» y hay que ponérselo', () => {
    // Sin esto, el mismo viajero es dos contactos distintos según por dónde entre.
    expect(aE164('573001234567')).toBe('+573001234567');
  });

  it('si ya viene con «+» no lo duplica', () => {
    expect(aE164('+573001234567')).toBe('+573001234567');
  });

  it('rechaza lo que no es un teléfono internacional', () => {
    for (const malo of ['', '0300123', 'abc', '0573001234567', null, 12]) {
      expect(aE164(malo)).toBeNull();
    }
  });
});

describe('Un mensaje de texto', () => {
  const { mensajes, estados } = contenidoDelCambio(valorConTexto);

  it('sale con su wamid, su teléfono y su instante', () => {
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]?.wamid).toBe('wamid.HBgMNTczMDAxMjM0NTY3');
    expect(mensajes[0]?.deTelefono).toBe('+573001234567');
    expect(mensajes[0]?.instante.getTime()).toBe(1792000000000);
  });

  it('recoge el nombre del perfil, que viaja APARTE de los mensajes', () => {
    // Meta lo manda en `contacts[]`, emparejado por `wa_id`. Buscarlo dentro del mensaje no
    // devuelve nada y el contacto se crearía sin nombre.
    expect(mensajes[0]?.nombrePerfil).toBe('Sofía Gómez');
  });

  it('no trae estados', () => {
    expect(estados).toHaveLength(0);
  });
});

describe('Los otros tipos que llegan de verdad', () => {
  const unMensaje = (m: Record<string, unknown>) =>
    contenidoDelCambio({
      messages: [{ from: '573001234567', id: 'wamid.X', timestamp: '1792000000', ...m }],
    }).mensajes[0];

  it('una imagen con pie de foto conserva el PIE, que es donde va la pregunta', () => {
    // «¿cuánto vale este?» debajo de una foto del folleto. Perderlo deja la conversación sin
    // sentido y al asesor mirando una imagen sin contexto.
    const m = unMensaje({
      type: 'image',
      image: { id: '1234567890', mime_type: 'image/jpeg', caption: '¿Cuánto vale este?' },
    });
    expect(m?.tipo).toBe('IMAGEN');
    expect(m?.texto).toBe('¿Cuánto vale este?');
    expect(m?.medioId).toBe('1234567890');
    expect(m?.mimeType).toBe('image/jpeg');
  });

  it('un documento conserva el nombre del archivo', () => {
    const m = unMensaje({
      type: 'document',
      document: { id: '99', filename: 'pasaporte.pdf', mime_type: 'application/pdf' },
    });
    expect(m?.tipo).toBe('DOCUMENTO');
    expect(m?.nombreArchivo).toBe('pasaporte.pdf');
  });

  it('una nota de voz es audio', () => {
    const m = unMensaje({ type: 'audio', audio: { id: '7', voice: true } });
    expect(m?.tipo).toBe('AUDIO');
  });

  it('un sticker es una imagen: no merece un tipo propio', () => {
    expect(unMensaje({ type: 'sticker', sticker: { id: '3' } })?.tipo).toBe('IMAGEN');
  });

  it('la respuesta a un botón trae su título como texto', () => {
    const m = unMensaje({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'si', title: 'Sí, me interesa' } },
    });
    expect(m?.tipo).toBe('INTERACTIVO');
    expect(m?.texto).toBe('Sí, me interesa');
  });

  it('una reacción trae el emoji y a qué mensaje reacciona', () => {
    const m = unMensaje({
      type: 'reaction',
      reaction: { message_id: 'wamid.ANTERIOR', emoji: '👍' },
    });
    expect(m?.tipo).toBe('REACCION');
    expect(m?.texto).toBe('👍');
    expect(m?.reaccionaA).toBe('wamid.ANTERIOR');
  });

  it('una reacción RETIRADA llega sin emoji, y sigue siendo un evento', () => {
    const m = unMensaje({ type: 'reaction', reaction: { message_id: 'wamid.ANTERIOR' } });
    expect(m?.tipo).toBe('REACCION');
    expect(m?.texto).toBeNull();
    expect(m?.reaccionaA).toBe('wamid.ANTERIOR');
  });

  it('una respuesta citada dice a qué mensaje responde', () => {
    const m = unMensaje({
      type: 'text',
      text: { body: 'Ese mismo' },
      context: { from: '573001234000', id: 'wamid.NUESTRO' },
    });
    expect(m?.respondeA).toBe('wamid.NUESTRO');
  });

  it('un tipo que Meta invente mañana se guarda como NO_SOPORTADO, no se descarta', () => {
    // Descartarlo haría desaparecer un mensaje que el viajero SÍ mandó, y el asesor vería un
    // hueco en la conversación sin ninguna explicación.
    const m = unMensaje({ type: 'holograma', holograma: { id: '1' } });
    expect(m?.tipo).toBe('NO_SOPORTADO');
    expect(m?.wamid).toBe('wamid.X');
  });
});

describe('Los acuses de entrega', () => {
  it('traducen los cuatro estados de Meta', () => {
    const porEstado = (s: string) =>
      contenidoDelCambio({
        statuses: [
          { id: 'wamid.N', status: s, timestamp: '1792000000', recipient_id: '573001234567' },
        ],
      }).estados[0]?.estado;

    expect(porEstado('sent')).toBe('ENVIADO');
    expect(porEstado('delivered')).toBe('ENTREGADO');
    expect(porEstado('read')).toBe('LEIDO');
    expect(porEstado('failed')).toBe('FALLIDO');
  });

  it('un estado que no conocemos se omite en vez de inventarse uno', () => {
    // `warning` existe en la API de Meta y NO es un estado de entrega.
    const r = contenidoDelCambio({
      statuses: [{ id: 'wamid.N', status: 'warning', timestamp: '1792000000' }],
    });
    expect(r.estados).toHaveLength(0);
  });

  it('un fallo trae el código de error de Meta', () => {
    const r = contenidoDelCambio({
      statuses: [
        {
          id: 'wamid.N',
          status: 'failed',
          timestamp: '1792000000',
          recipient_id: '573001234567',
          errors: [{ code: 131047, title: 'Re-engagement message' }],
        },
      ],
    });
    expect(r.estados[0]?.codigoError).toBe(131047);
    expect(r.estados[0]?.mensajeError).toBe('Re-engagement message');
  });

  it('`played` (nota de voz reproducida, desde 2025-11-03) es REPRODUCIDO', () => {
    const r = contenidoDelCambio({
      statuses: [{ id: 'wamid.N', status: 'played', timestamp: '1792000000' }],
    });
    expect(r.estados[0]?.estado).toBe('REPRODUCIDO');
  });

  it('biz_opaque_callback_data vuelve como referencia solo si es un UUID nuestro', () => {
    const conReferencia = (dato: unknown) =>
      contenidoDelCambio({
        statuses: [
          {
            id: 'wamid.N',
            status: 'sent',
            timestamp: '1792000000',
            biz_opaque_callback_data: dato,
          },
        ],
      }).estados[0]?.referencia;

    expect(conReferencia('0193A000-0000-7000-8000-0000000000EE')).toBe(
      '0193a000-0000-7000-8000-0000000000ee',
    );
    expect(conReferencia('campaña-de-otro-sistema')).toBeNull();
    expect(conReferencia(42)).toBeNull();
    expect(conReferencia(undefined)).toBeNull();
  });
});

describe('Un mismo change puede traer las dos cosas', () => {
  it('mensajes Y estados en el mismo value', () => {
    // Quedarse con lo primero que aparezca pierde acuses de entrega en silencio.
    const r = contenidoDelCambio({
      ...valorConTexto,
      statuses: [{ id: 'wamid.NUESTRO', status: 'read', timestamp: '1792000100' }],
    });
    expect(r.mensajes).toHaveLength(1);
    expect(r.estados).toHaveLength(1);
  });
});

describe('Lo que no se entiende no tumba el trabajador', () => {
  // Si esto lanzara, Meta reintentaría el lote entero y volvería a tumbarlo: un webhook mal
  // formado se convertiría en una caída que se repite sola.
  it('no lanza con basura', () => {
    for (const basura of [null, undefined, 42, 'texto', [], { messages: 'no es lista' }]) {
      expect(() => contenidoDelCambio(basura)).not.toThrow();
      expect(contenidoDelCambio(basura).mensajes).toHaveLength(0);
    }
  });

  it('omite el mensaje sin wamid, sin remitente o sin instante', () => {
    const r = contenidoDelCambio({
      messages: [
        { from: '573001234567', timestamp: '1792000000', type: 'text' },
        { id: 'wamid.A', timestamp: '1792000000', type: 'text' },
        { id: 'wamid.B', from: '573001234567', type: 'text' },
      ],
    });
    expect(r.mensajes).toHaveLength(0);
  });

  it('un mensaje malo no se lleva por delante al bueno que va al lado', () => {
    const r = contenidoDelCambio({
      messages: [
        { id: 'wamid.MALO', type: 'text' },
        { from: '573001234567', id: 'wamid.BUENO', timestamp: '1792000000', type: 'text' },
      ],
    });
    expect(r.mensajes).toHaveLength(1);
    expect(r.mensajes[0]?.wamid).toBe('wamid.BUENO');
  });
});
